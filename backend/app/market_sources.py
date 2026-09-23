"""Source adapters produce managed datasets; widgets never call upstream services."""
import asyncio
import json
import math
from contextlib import closing
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, HTTPException
from .providers import query_tushare
from .routes import connect
from .datasets import timestamp, validate_json

router=APIRouter(prefix='/api/market-sources')
SOURCES=[
    {'id':'tushare-ashare','name':'Tushare · A 股全市场快照','dataset_id':'market-ashare','schema':'ashare.snapshot.v1','description':'沪深北上市股票日线 + 公司行业 + 总市值，按最近完整交易日合并。','apis':['trade_cal','stock_basic','daily','daily_basic'],'fields':['ts_code','name','industry','trade_date','close','pct_chg','amount','total_mv'],'frequency':'收盘日线','units':{'amount':'元','total_mv':'元','pct_chg':'%'}},
    {'id':'tushare-indices','name':'Tushare · 核心指数日线','dataset_id':'market-indices','schema':'index.daily.v1','description':'上证指数、深证成指、创业板指、沪深300，最近 90 天历史日线。','apis':['index_daily'],'fields':['ts_code','name','trade_date','close','pct_chg','amount'],'frequency':'收盘日线','units':{'close':'点','pct_chg':'%','amount':'元'}},
]
RUNNING:set[str]=set()

def status_write(source_id,status,**extra):
    value={'status':status,'updated_at':timestamp(),**extra}
    with closing(connect()) as db,db:db.execute('INSERT OR REPLACE INTO app_metadata VALUES (?,?)',('source-status:'+source_id,json.dumps(value,ensure_ascii=False)))

def recover_sources():
    with closing(connect()) as db,db:
        rows=db.execute("SELECT key,value FROM app_metadata WHERE key LIKE 'source-status:%'").fetchall()
        for row in rows:
            data=json.loads(row['value'])
            if data['status']=='running':
                data.update(status='error',message='上次同步被中断，可重新同步；已保存数据仍然保留。')
                db.execute('UPDATE app_metadata SET value=? WHERE key=?',(json.dumps(data,ensure_ascii=False),row['key']))

def require_result(result):
    if not result['ok']:raise ValueError(result['message'])
    return result['rows']

async def fetch_pages(api_name,params,fields):
    result=[];seen=set()
    for page in range(10):
        rows=require_result(await query_tushare(api_name,{**params,'limit':5000,'offset':page*5000},fields))
        fresh=[]
        for row in rows:
            key=(row.get('ts_code'),row.get('trade_date'))
            if key not in seen:seen.add(key);fresh.append(row)
        if rows and not fresh:raise ValueError(f'{api_name} 返回重复分页，已停止同步以避免发布不完整数据。')
        result.extend(fresh)
        if len(rows)<5000:return result
    raise ValueError('数据超过分页上限，请缩小范围。')

def finite(value):return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def build_ashare(basic,daily,capital):
    names={r['ts_code']:r for r in basic};caps={r['ts_code']:r for r in capital};rows=[]
    for item in daily:
        if not finite(item.get('pct_chg')) or not finite(item.get('close')):continue
        info=names.get(item['ts_code'],{});cap=caps.get(item['ts_code'],{}).get('total_mv')
        amount=item.get('amount')
        rows.append({'ts_code':item['ts_code'],'name':info.get('name') or item['ts_code'],'industry':info.get('industry') or '未分类','market':info.get('market') or '未分类','trade_date':item['trade_date'],'close':item['close'],'pct_chg':item['pct_chg'],'amount':round(amount*1000,2) if finite(amount) else None,'total_mv':round(cap*10000,2) if finite(cap) else None})
    rows.sort(key=lambda r:r['ts_code'])
    return rows,{'listed':len(names),'returned_daily':len(daily),'usable':len(rows),'missing_daily':len(set(names)-{r['ts_code'] for r in daily}),'classified':sum(r['industry']!='未分类' for r in rows),'capital_available':sum(finite(r['total_mv']) and r['total_mv']>0 for r in rows)}

def publish(source,rows,as_of,coverage,warnings):
    if not rows:raise ValueError('未返回可用数据，保留上次成功的数据集。')
    validate_json(rows)
    with closing(connect()) as db,db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT value FROM app_metadata WHERE key=?',('dataset:'+source['dataset_id'],)).fetchone()
        revision=json.loads(old['value'])['revision']+1 if old else 1
        record={'id':source['dataset_id'],'name':source['name']+'.json','format':'json','kind':'market','read_only':True,'source_id':source['id'],'schema':source['schema'],'revision':revision,'updated_at':timestamp(),'source':'Tushare Pro · '+', '.join(source['apis']),'as_of':as_of,'coverage':coverage,'warnings':warnings,'units':source['units'],'data':rows}
        db.execute('INSERT OR REPLACE INTO app_metadata VALUES (?,?)',('dataset:'+source['dataset_id'],json.dumps(record,ensure_ascii=False)))
    return record

async def sync_source(source_id):
    source=next(s for s in SOURCES if s['id']==source_id)
    try:
        now=datetime.now(timezone(timedelta(hours=8)));today=now.date();warnings=[]
        if source_id=='tushare-ashare':
            status_write(source_id,'running',message='读取交易日历…',progress=10)
            cal=require_result(await query_tushare('trade_cal',{'exchange':'SSE','start_date':(today-timedelta(days=25)).strftime('%Y%m%d'),'end_date':today.strftime('%Y%m%d'),'is_open':'1'},'cal_date,is_open'))
            dates=sorted((r['cal_date'] for r in cal if r['cal_date']<today.strftime('%Y%m%d') or now.hour>=18),reverse=True)
            daily=[];as_of=''
            for target in dates[:5]:
                status_write(source_id,'running',message=f'读取 {target} 全市场日线…',progress=25)
                daily=await fetch_pages('daily',{'trade_date':target},'ts_code,trade_date,close,pct_chg,amount')
                if daily:as_of=target;break
            if not daily:raise ValueError('最近交易日没有可用日线。')
            status_write(source_id,'running',message='读取公司名称和行业分类…',progress=55)
            basic=await fetch_pages('stock_basic',{'list_status':'L'},'ts_code,name,industry,market')
            if not basic:raise ValueError('没有公司与行业元数据，停止发布以避免把缺失分类当成全市场。')
            status_write(source_id,'running',message='读取总市值并检查覆盖范围…',progress=80)
            try:capital=await fetch_pages('daily_basic',{'trade_date':as_of},'ts_code,trade_date,total_mv')
            except ValueError as exc:capital=[];warnings.append('市值数据不可用，云图可使用成交额面积。'+str(exc))
            if any(r.get('trade_date')!=as_of for r in daily+capital):raise ValueError('返回数据日期不一致，已停止发布。')
            rows,coverage=build_ashare(basic,daily,capital)
            if coverage['missing_daily']:warnings.append(f"{coverage['missing_daily']} 家当前上市公司未返回该日日线，可能停牌或尚无行情；未计入市场统计。")
            warnings.append('行业来自当前 stock_basic 分类；细分行业涨跌按有行情股票等权聚合，不是官方行业指数。')
        else:
            rows=[];coverage={'indices':0};latest=[]
            for i,(code,name) in enumerate([('000001.SH','上证指数'),('399001.SZ','深证成指'),('399006.SZ','创业板指'),('000300.SH','沪深300')]):
                status_write(source_id,'running',message=f'读取{name}日线…',progress=15+i*20)
                series=require_result(await query_tushare('index_daily',{'ts_code':code,'start_date':(today-timedelta(days=90)).strftime('%Y%m%d'),'end_date':(today if now.hour>=18 else today-timedelta(days=1)).strftime('%Y%m%d')},'ts_code,trade_date,close,pct_chg,amount'))
                usable=[r for r in series if finite(r.get('close')) and finite(r.get('pct_chg'))]
                if not usable:raise ValueError(f'{name}没有可用日线；保留上次完整指数数据。')
                latest.append(max(r['trade_date'] for r in usable));coverage['indices']+=1
                rows.extend({**r,'name':name,'amount':r['amount']*1000 if finite(r.get('amount')) else None} for r in usable)
            rows.sort(key=lambda r:(r['ts_code'],r['trade_date']));as_of=min(latest)
            if len(set(latest))>1:warnings.append('各指数最新日期不同，卡片分别标注日期。')
        record=publish(source,rows,as_of,coverage,warnings)
        status_write(source_id,'ready',message=f'已同步 {len(rows)} 条记录。',progress=100,as_of=as_of,records=len(rows),revision=record['revision'],warnings=warnings)
    except Exception as exc:
        message=str(exc) if isinstance(exc,ValueError) else '同步未完成，请检查本地服务后重试。'
        status_write(source_id,'error',message=message[:400],progress=0)
    finally:RUNNING.discard(source_id)

@router.get('')
def catalog():
    output=[]
    with closing(connect()) as db:
        for source in SOURCES:
            status=db.execute('SELECT value FROM app_metadata WHERE key=?',('source-status:'+source['id'],)).fetchone()
            dataset=db.execute('SELECT value FROM app_metadata WHERE key=?',('dataset:'+source['dataset_id'],)).fetchone()
            output.append({**source,'state':json.loads(status['value']) if status else {'status':'not_connected','message':'尚未接入'},'has_dataset':bool(dataset),'dataset_revision':json.loads(dataset['value'])['revision'] if dataset else None})
    return {'sources':output}

@router.post('/{source_id}/sync',status_code=202)
async def start_sync(source_id:str,tasks:BackgroundTasks):
    if source_id not in {s['id'] for s in SOURCES}:raise HTTPException(404,'数据源不存在。')
    if source_id in RUNNING:raise HTTPException(409,'该数据源正在同步，请等待本次完成。')
    RUNNING.add(source_id);status_write(source_id,'running',message='正在建立连接…',progress=1)
    tasks.add_task(sync_source,source_id)
    return {'source_id':source_id,'status':'running'}
