"""Interval daily returns loaded through the data-source layer and persisted as datasets."""
import hashlib
from .market_sources import fetch_pages, finite, publish
from .routes import connect
from contextlib import closing
import json

async def interval_dataset(code, name, start, end):
    identifier='stock-history-'+hashlib.sha256(f'{code}:{start}:{end}'.encode()).hexdigest()[:20]
    with closing(connect()) as db:
        cached=db.execute('SELECT value FROM app_metadata WHERE key=?',('dataset:'+identifier,)).fetchone()
    if cached:return json.loads(cached['value'])
    rows=await fetch_pages('daily',{'ts_code':code,'start_date':start,'end_date':end},'ts_code,trade_date,close,pct_chg,vol,amount')
    clean=[]
    for row in rows:
        if row.get('ts_code')!=code or not start<=row.get('trade_date','')<=end:continue
        if not finite(row.get('pct_chg')) or not finite(row.get('close')):continue
        clean.append({**row,'name':name,'amount':row['amount']*1000 if finite(row.get('amount')) else None})
    clean.sort(key=lambda r:r['trade_date'])
    source={'id':'tushare-stock-history','dataset_id':identifier,'name':f'{name} · {start}—{end} 日线','schema':'stock.daily.v1','apis':['daily'],'units':{'pct_chg':'%','close':'元（未复权）','vol':'手','amount':'元'}}
    if not clean:raise ValueError(f'{name}在所选区间未返回有效日线。')
    return publish(source,clean,clean[-1]['trade_date'],{'records':len(clean)},['相关分析使用 daily.pct_chg；价格为未复权收盘，不按价格水平计算相关性。'])
