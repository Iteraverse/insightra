"""Read-only capability probe; prints counts/status, never credentials."""
import asyncio
from datetime import date, timedelta
from app.providers import query_tushare

async def main():
    today=date.today()
    cal=await query_tushare('trade_cal',{'exchange':'SSE','start_date':(today-timedelta(days=14)).strftime('%Y%m%d'),'end_date':today.strftime('%Y%m%d'),'is_open':'1'},'cal_date,is_open')
    dates=sorted([r['cal_date'] for r in cal['rows']],reverse=True)
    target=None
    for day in dates[:3]:
        result=await query_tushare('daily',{'trade_date':day,'limit':6000},'ts_code,trade_date,close,pct_chg,amount')
        print('daily',day,result['status'],len(result['rows']),flush=True)
        if result['ok'] and result['rows']:target=day;break
    if not target:return
    for name,params,fields in [
        ('stock_basic',{'list_status':'L','limit':6000},'ts_code,name,industry,market'),
        ('daily_basic',{'trade_date':target,'limit':6000},'ts_code,trade_date,total_mv'),
        ('index_daily',{'ts_code':'000001.SH','start_date':(today-timedelta(days=35)).strftime('%Y%m%d'),'end_date':target},'ts_code,trade_date,close,pct_chg,amount'),
    ]:
        result=await query_tushare(name,params,fields)
        print(name,result['status'],len(result['rows']),result['message'] if not result['ok'] else '',flush=True)

asyncio.run(main())
