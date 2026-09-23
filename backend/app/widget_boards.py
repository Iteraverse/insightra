"""Layer 2 widget contracts, and layer 3 persisted groups/boards."""
import json
import math
import uuid
from contextlib import closing
from typing import Literal
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,Field,ConfigDict
from .routes import connect
from .datasets import summary,timestamp,read_dataset

router=APIRouter(prefix='/api')
MARKET={'ts_code':'string','name':'string','industry':'string','trade_date':'string','pct_chg':'number','amount':'number'}
WIDGETS=[
 {'kind':'market-map','name':'A 股大盘云图','description':'行业分区中的个股涨跌，面积可选择总市值或成交额。','slot':'market','required_fields':MARKET,'optional_fields':{'total_mv':'number'},'default_size':'wide','schema':'ashare.snapshot.v1'},
 {'kind':'market-breadth','name':'市场温度','description':'上涨、下跌、平盘与涨跌幅分布，观察市场广度。','slot':'market','required_fields':MARKET,'optional_fields':{},'default_size':'small','schema':'ashare.snapshot.v1'},
 {'kind':'industry-board','name':'细分行业观察','description':'行业等权涨跌、成交额与上涨家数，展开查看行业成分。','slot':'market','required_fields':MARKET,'optional_fields':{},'default_size':'half','schema':'ashare.snapshot.v1'},
 {'kind':'index-board','name':'核心指数','description':'指数最新收盘、涨跌和历史走势，各自显示交易日期。','slot':'indices','required_fields':{'ts_code':'string','name':'string','trade_date':'string','close':'number','pct_chg':'number'},'optional_fields':{},'default_size':'half','schema':'index.daily.v1'},
]

def compatible(definition,record):
    if record.get('schema')!=definition['schema']:return False,f"需要标准数据口径 {definition['schema']}"
    rows=record.get('data')
    if not isinstance(rows,list) or not rows:return False,'需要非空的对象数组'
    for row in rows:
        if not isinstance(row,dict):return False,'记录必须是对象'
        for field,kind in definition['required_fields'].items():
            value=row.get(field)
            if value is None and field=='amount':continue
            if kind=='string' and not isinstance(value,str):return False,f'缺少字符串字段 {field}'
            if kind=='number' and (not isinstance(value,(int,float)) or isinstance(value,bool) or not math.isfinite(value)):return False,f'缺少数值字段 {field}'
    dates={r['trade_date'] for r in rows}
    if definition['schema']=='ashare.snapshot.v1':
        if len(dates)!=1:return False,'全市场快照必须来自同一交易日'
        if len({r['ts_code'] for r in rows})!=len(rows):return False,'快照中证券代码不能重复'
    return True,''

@router.get('/widgets/catalog')
def widget_catalog():
    with closing(connect()) as db:records=[json.loads(r['value']) for r in db.execute("SELECT value FROM app_metadata WHERE key LIKE 'dataset:%'").fetchall()]
    return {'widgets':[{**d,'datasets':[{**summary(record),'compatible':compatible(d,record)[0],'reason':compatible(d,record)[1]} for record in records]} for d in WIDGETS]}

class WidgetOptions(BaseModel):
    model_config=ConfigDict(extra='forbid')
    area:Literal['total_mv','amount']='total_mv'

class Widget(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=80)
    kind:Literal['market-map','market-breadth','industry-board','index-board']
    sources:dict[str,str]
    size:Literal['full','wide','half','small']='half'
    refresh_seconds:Literal[0,15,30,60,300,900,3600]=300
    options:WidgetOptions=Field(default_factory=WidgetOptions)

class Group(BaseModel):
    id:str=Field(min_length=1,max_length=80)
    title:str=Field(min_length=1,max_length=80)
    widgets:list[Widget]=Field(max_length=16)

class BoardInput(BaseModel):
    revision:int=Field(ge=0)
    groups:list[Group]=Field(max_length=20)

def validate_groups(groups,db):
    ids=[];cache={}
    for group in groups:
        if not group.title.strip():raise HTTPException(400,'编组名称不能为空。')
        ids.append(group.id)
        for widget in group.widgets:
            ids.append(widget.id);definition=next(w for w in WIDGETS if w['kind']==widget.kind)
            if set(widget.sources)!={definition['slot']}:raise HTTPException(400,f"{definition['name']} 需要绑定 {definition['slot']} 数据源。")
            identifier=widget.sources[definition['slot']]
            if identifier not in cache:cache[identifier]=read_dataset(identifier,db)
            ok,reason=compatible(definition,cache[identifier])
            if not ok:raise HTTPException(400,f"{definition['name']} 数据不兼容：{reason}")
    if len(ids)!=len(set(ids)):raise HTTPException(400,'编组与组件 ID 不能重复。')

@router.get('/boards/finance')
def get_board():
    with closing(connect()) as db:row=db.execute("SELECT value FROM app_metadata WHERE key='board:finance'").fetchone()
    return json.loads(row['value']) if row else {'revision':0,'groups':[],'updated_at':None}

@router.put('/boards/finance')
def save_board(body:BoardInput):
    with closing(connect()) as db,db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute("SELECT value FROM app_metadata WHERE key='board:finance'").fetchone()
        revision=json.loads(old['value'])['revision'] if old else 0
        if revision!=body.revision:raise HTTPException(409,'看板已被其他页面修改，请重新读取后合并。')
        validate_groups(body.groups,db)
        result={'revision':revision+1,'groups':[g.model_dump() for g in body.groups],'updated_at':timestamp()}
        db.execute("INSERT OR REPLACE INTO app_metadata VALUES ('board:finance',?)",(json.dumps(result,ensure_ascii=False),))
    return result

@router.get('/widget-groups')
def templates():
    with closing(connect()) as db:rows=db.execute("SELECT value FROM app_metadata WHERE key LIKE 'widget-template:%'").fetchall()
    return {'templates':[json.loads(r['value']) for r in rows]}

@router.post('/widget-groups',status_code=201)
def save_template(body:Group):
    with closing(connect()) as db,db:
        validate_groups([body],db)
        record={'id':str(uuid.uuid4()),'group':body.model_dump(),'created_at':timestamp()}
        db.execute('INSERT INTO app_metadata VALUES (?,?)',('widget-template:'+record['id'],json.dumps(record,ensure_ascii=False)))
    return record

@router.delete('/widget-groups/{identifier}')
def delete_template(identifier:str):
    with closing(connect()) as db,db:result=db.execute('DELETE FROM app_metadata WHERE key=?',('widget-template:'+identifier,))
    if not result.rowcount:raise HTTPException(404,'编组模板不存在。')
    return {'deleted':True}

@router.get('/widgets/resolve/{kind}/{identifier}')
def resolve_widget(kind:str,identifier:str):
    definition=next((w for w in WIDGETS if w['kind']==kind),None)
    if not definition:raise HTTPException(404,'组件不存在。')
    with closing(connect()) as db:record=read_dataset(identifier,db)
    ok,reason=compatible(definition,record)
    if not ok:raise HTTPException(400,reason)
    return record
