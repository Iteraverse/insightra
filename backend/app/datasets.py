"""Editable structured datasets. Parsing never evaluates JavaScript or formulas."""
import csv
import io
import json
from pathlib import Path
from contextlib import closing
from datetime import datetime, timezone
from typing import Any, Literal
import uuid
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from .routes import connect

router=APIRouter(prefix='/api/datasets')
INDUSTRY_ID='industry-chain'

def timestamp(): return datetime.now(timezone.utc).isoformat()

def validate_json(data):
    try: encoded=json.dumps(data,ensure_ascii=False,allow_nan=False)
    except (TypeError,ValueError,RecursionError): raise HTTPException(400,'数据必须是标准 JSON，不能包含 NaN 或 Infinity。')
    if len(encoded.encode('utf-8'))>3_000_000:raise HTTPException(413,'数据集超过 3 MB，请拆分后导入。')
    def walk(value,depth=0):
        if depth>30:raise HTTPException(400,'嵌套深度不能超过 30 层。')
        if isinstance(value,dict):
            if any(k in ('__proto__','constructor','prototype') for k in value):raise HTTPException(400,'字段名称包含保留名称。')
            for child in value.values():walk(child,depth+1)
        elif isinstance(value,list):
            for child in value:walk(child,depth+1)
    walk(data)

def validate_industry(data):
    try:
        for key in ('nodes','edges','segments','paths','sources'):
            if not isinstance(data[key],list):raise ValueError(f'{key} 必须是数组')
        if not isinstance(data['tags'],dict) or not isinstance(data['tagAxis'],dict) or not isinstance(data['meta'],dict):raise ValueError('meta、tags、tagAxis 必须是对象')
        if not data['nodes'] or not data['segments']:raise ValueError('必须保留公司与环节')
        nodes={n['id']:n for n in data['nodes']}; segments={s['id']:s for s in data['segments']}
        if len(nodes)!=len(data['nodes']) or len(segments)!=len(data['segments']):raise ValueError('公司或环节 ID 重复')
        for segment in segments.values():
            if not all(isinstance(segment[k],str) and segment[k] for k in ('id','name','short','stage')):raise ValueError('环节缺少名称或 ID')
            if segment['stage'] not in ('上游','中游','下游') or segment['slot'] not in range(1,9):raise ValueError('环节 stage 或 slot 无效')
        for node in nodes.values():
            if not all(isinstance(node[k],str) and node[k] for k in ('id','n','c','s')) or node['s'] not in segments:raise ValueError('公司名称/ID 或环节引用无效')
            if not isinstance(node['p'],list) or not all(isinstance(p,str) for p in node['p']):raise ValueError('公司产品 p 必须是字符串数组')
        links=set()
        for edge in data['edges']:
            if edge['s'] not in nodes or edge['t'] not in nodes or edge['s']==edge['t']:raise ValueError('关系指向不存在的公司或自身')
            if edge['w'] not in ('d','i') or not isinstance(edge['p'],str):raise ValueError('关系证据 w 必须为 d/i，产品 p 必须为字符串')
            links.add((edge['s'],edge['t']))
        for node_id,tags in data['tags'].items():
            if node_id not in nodes or not isinstance(tags,list) or len(set(tags))!=len(tags) or any(tag not in data['tagAxis'] for tag in tags):raise ValueError('公司标签存在重复、未登记标签或未知公司')
        for path in data['paths']:
            if not isinstance(path['ids'],list) or len(path['ids'])<2 or any((a,b) not in links for a,b in zip(path['ids'],path['ids'][1:])):raise ValueError('示范链条存在不连续或方向不符的关系')
        for source in data['sources']:
            if len(source)!=2 or not all(isinstance(s,str) for s in source) or not source[1].startswith(('http://','https://')):raise ValueError('来源必须包含标题与 HTTP(S) 链接')
    except (KeyError,TypeError,ValueError) as exc:
        raise HTTPException(400,f'产业数据校验失败：{str(exc)[:160]}。')

def summary(record):
    data=record['data']
    return {k:v for k,v in record.items() if k!='data'}|{'records':len(data) if isinstance(data,list) else len(data.get('nodes',data)) if isinstance(data,dict) else 1,'shape':'array' if isinstance(data,list) else 'object' if isinstance(data,dict) else 'value'}

def seed_industry():
    with closing(connect()) as db,db:
        if db.execute("SELECT 1 FROM app_metadata WHERE key=?",('dataset:'+INDUSTRY_ID,)).fetchone():return
        path=Path(__file__).resolve().parents[2]/'demo/data/chain-map.js'
        if not path.is_file():return
        text=path.read_text(encoding='utf-8-sig')
        data=json.loads(text[text.index('{'):text.rindex('}')+1])
        validate_json(data);validate_industry(data)
        record={'id':INDUSTRY_ID,'name':'产业网络 · 医药与新能源.json','format':'json','kind':'industry','revision':1,'updated_at':timestamp(),'source':'项目资料 demo/data/chain-map.js','data':data}
        db.execute('INSERT INTO app_metadata VALUES (?,?)',('dataset:'+INDUSTRY_ID,json.dumps(record,ensure_ascii=False)))

def read_dataset(identifier,db):
    row=db.execute('SELECT value FROM app_metadata WHERE key=?',('dataset:'+identifier,)).fetchone()
    if not row:raise HTTPException(404,'数据集不存在。')
    return json.loads(row['value'])

class ImportInput(BaseModel):
    name:str=Field(min_length=1,max_length=160)
    format:Literal['json','csv','tsv','jsonl']
    text:str=Field(max_length=3_000_000)
    data_schema:Literal['ashare.snapshot.v1','index.daily.v1']|None=Field(default=None,alias='schema')
    as_of:str|None=Field(default=None,pattern=r'^\d{8}$')

class UpdateInput(BaseModel):
    revision:int=Field(ge=1)
    data:Any

@router.get('')
def list_datasets():
    with closing(connect()) as db:
        rows=db.execute("SELECT value FROM app_metadata WHERE key LIKE 'dataset:%'").fetchall()
    return {'datasets':sorted([summary(json.loads(r['value'])) for r in rows],key=lambda d:d['updated_at'],reverse=True)}

@router.post('',status_code=201)
def import_dataset(body:ImportInput):
    if not body.name.strip():raise HTTPException(400,'请输入数据集名称。')
    text=body.text.lstrip('\ufeff')
    try:
        if body.format=='json':data=json.loads(text)
        elif body.format=='jsonl':data=[json.loads(line) for line in text.splitlines() if line.strip()]
        else:
            rows=list(csv.reader(io.StringIO(text,newline=''),delimiter='\t' if body.format=='tsv' else ',',strict=True))
            if not rows or not rows[0] or any(not h for h in rows[0]) or len(set(rows[0]))!=len(rows[0]):raise ValueError('表头不能为空或重复')
            if any(len(row)!=len(rows[0]) for row in rows[1:]):raise ValueError('行列数不一致')
            data=[dict(zip(rows[0],row)) for row in rows[1:]]
    except (ValueError,csv.Error) as exc:raise HTTPException(400,f'解析失败：{str(exc)[:160]}')
    validate_json(data)
    record={'id':str(uuid.uuid4()),'name':body.name.strip(),'format':body.format,'kind':'general','revision':1,'updated_at':timestamp(),'source':'本地导入','data':data,'columns':rows[0] if body.format in ('csv','tsv') else []}
    if body.data_schema:record.update(schema=body.data_schema,as_of=body.as_of,units={'amount':'元','total_mv':'元','pct_chg':'%'},warnings=['本地可编辑数据，非数据源原始同步快照。'])
    with closing(connect()) as db,db:db.execute('INSERT INTO app_metadata VALUES (?,?)',('dataset:'+record['id'],json.dumps(record,ensure_ascii=False)))
    return record

@router.get('/{identifier}')
def get_dataset(identifier:str):
    with closing(connect()) as db:return read_dataset(identifier,db)

@router.put('/{identifier}')
def update_dataset(identifier:str,body:UpdateInput):
    validate_json(body.data)
    with closing(connect()) as db,db:
        db.execute('BEGIN IMMEDIATE')
        record=read_dataset(identifier,db)
        if record.get('read_only'):raise HTTPException(409,'这是同步数据集，请复制为可编辑数据集；刷新通过数据源同步完成。')
        if body.revision!=record['revision']:raise HTTPException(409,'数据已被其他页面更新，请重新读取后合并修改。')
        if record['kind']=='industry':validate_industry(body.data)
        record.update(data=body.data,revision=record['revision']+1,updated_at=timestamp())
        if record.get('schema') and isinstance(body.data,list):
            dates=[r.get('trade_date') for r in body.data if isinstance(r,dict) and isinstance(r.get('trade_date'),str)]
            record['as_of']=max(dates) if dates else None
            record['warnings']=['本地编辑数据，非原始同步快照；请核对字段、单位与日期。']
        db.execute('UPDATE app_metadata SET value=? WHERE key=?',(json.dumps(record,ensure_ascii=False),'dataset:'+identifier))
    return record

@router.delete('/{identifier}')
def delete_dataset(identifier:str):
    if identifier==INDUSTRY_ID:raise HTTPException(409,'该数据集被产业网络引用，可编辑但不能删除。')
    with closing(connect()) as db,db:
        boards=db.execute("SELECT value FROM app_metadata WHERE key LIKE 'board:%'").fetchall()
        for board in boards:
            if any(identifier in widget.get('sources',{}).values() for group in json.loads(board['value']).get('groups',[]) for widget in group.get('widgets',[])):
                raise HTTPException(409,'该数据集被行情看板引用，请先删除或重新绑定相关组件。')
        read_dataset(identifier,db)
        db.execute('DELETE FROM app_metadata WHERE key=?',('dataset:'+identifier,))
    return {'deleted':True}

@router.get('/{identifier}/export')
def export_dataset(identifier:str,format:Literal['json','csv','tsv','jsonl']='json',table:str|None=None):
    with closing(connect()) as db:record=read_dataset(identifier,db)
    data=record['data']
    if table is not None:
        if not isinstance(data,dict) or table not in data:raise HTTPException(400,'所选表不存在。')
        data=data[table]
    if format=='json':text=json.dumps(data,ensure_ascii=False,indent=2);mime='application/json'
    elif format=='jsonl':
        if not isinstance(data,list):raise HTTPException(400,'JSONL 导出需要数组。')
        text='\n'.join(json.dumps(row,ensure_ascii=False) for row in data);mime='application/x-ndjson'
    else:
        if not isinstance(data,list) or not all(isinstance(row,dict) for row in data):raise HTTPException(400,'CSV/TSV 导出需要对象数组，请选择具体的表。')
        columns=list(dict.fromkeys(key for row in data for key in row)) or (record.get('columns',[]) if table is None else [])
        buf=io.StringIO(newline='');writer=csv.writer(buf,delimiter='\t' if format=='tsv' else ',');writer.writerow(columns)
        for row in data:
            writer.writerow([json.dumps(row[c],ensure_ascii=False) if isinstance(row.get(c),(dict,list)) else row.get(c,'') for c in columns])
        text=buf.getvalue();mime='text/tab-separated-values' if format=='tsv' else 'text/csv'
    return Response(content=text,media_type=mime,headers={'Content-Disposition':f'attachment; filename="dataset.{format}"'})
