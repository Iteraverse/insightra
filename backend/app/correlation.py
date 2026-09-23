"""Pair comparisons on one shared set of trading dates, no price-level correlations."""
import asyncio
import math
import json
from contextlib import closing
from datetime import date, datetime
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel,Field,field_validator,model_validator
from .routes import connect
from .research_sources import interval_dataset

router=APIRouter(prefix='/api/research/correlation')
class AnalysisInput(BaseModel):
    symbols:list[str]=Field(min_length=2,max_length=20)
    start:date
    end:date
    @field_validator('symbols')
    @classmethod
    def codes(cls,codes):
        import re
        if len(codes)!=len(set(codes)) or any(not re.fullmatch(r'\d{6}\.(SH|SZ|BJ)',code) for code in codes):raise ValueError('代码无效或重复')
        return codes
    @model_validator(mode='after')
    def dates(self):
        if self.start>=self.end or (self.end-self.start).days>730 or self.end>date.today():raise ValueError('日期区间无效，最多两年且不能包含未来日期')
        return self

def stock_catalog():
    with closing(connect()) as db:
        row=db.execute("SELECT value FROM app_metadata WHERE key='dataset:market-ashare'").fetchone()
    data=json.loads(row['value']) if row else {}
    return {'stocks':[{'code':r['ts_code'],'name':r['name'],'industry':r.get('industry','')} for r in data.get('data',[])], 'as_of':data.get('as_of')}

@router.get('/stocks')
def stocks():return stock_catalog()

def calculate(series):
    dates=sorted(set.intersection(*(set(s) for s in series)))
    n=len(dates)
    values=[[s[d] for d in dates] for s in series]
    def coefficient(a,b):
        if n<5:return None
        ma=math.fsum(a)/n;mb=math.fsum(b)/n
        da=[v-ma for v in a];db=[v-mb for v in b]
        aa=math.fsum(v*v for v in da);bb=math.fsum(v*v for v in db)
        if aa<1e-20 or bb<1e-20:return None
        return max(-1,min(1,math.fsum(x*y for x,y in zip(da,db))/math.sqrt(aa*bb)))
    return dates,[[coefficient(a,b) for b in values] for a in values]

@router.post('')
async def analyze(body:AnalysisInput):
    catalog={s['code']:s for s in stock_catalog()['stocks']}
    if any(code not in catalog for code in body.symbols):raise HTTPException(400,'请先在数据管理同步 A 股公司目录，再选择股票。')
    start=body.start.strftime('%Y%m%d');end=body.end.strftime('%Y%m%d')
    records=[]
    try:
        for code in body.symbols:
            records.append(await interval_dataset(code,catalog[code]['name'],start,end))
    except ValueError as exc:raise HTTPException(422,str(exc))
    series=[{r['trade_date']:r['pct_chg']/100 for r in d['data']} for d in records]
    dates,matrix=calculate(series)
    warnings=[]
    if len(dates)<5:warnings.append('共同有效交易日不足 5 天，无法计算相关系数。请扩大区间或减少股票。')
    elif any(matrix[i][i] is None for i in range(len(series))):warnings.append('部分股票区间收益率无变化，相关系数不可定义。')
    if any(len(s)>len(dates) for s in series):warnings.append('仅采用所有股票都有数据的共同交易日；停牌或缺失日期已剔除，不补零。')
    return {'symbols':[catalog[code] for code in body.symbols], 'start':start,'end':end,'dates':dates,'samples':len(dates),'matrix':matrix,'method':'Pearson','basis':'daily.pct_chg','warnings':warnings,'coverage':[{'code':code,'rows':len(s),'dataset_id':d['id'],'revision':d['revision']} for code,s,d in zip(body.symbols,series,records)]}
