import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
from fastapi.testclient import TestClient
from app import main,market_sources,widget_boards
from app.routes import connect
from contextlib import closing

class MarketBoardTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=main.DATABASE;main.DATABASE=Path(self.temp.name)/'db.sqlite3'
        self.client=TestClient(main.app).__enter__()
        self.rows=[{'ts_code':'000001.SZ','name':'样本一','industry':'银行','trade_date':'20260922','close':10,'pct_chg':2,'amount':1000,'total_mv':10000},{'ts_code':'600000.SH','name':'样本二','industry':'银行','trade_date':'20260922','close':9,'pct_chg':-1,'amount':2000,'total_mv':15000}]
        self.market=market_sources.publish(market_sources.SOURCES[0],self.rows,'20260922',{'usable':2},[])
        self.index=market_sources.publish(market_sources.SOURCES[1],[{'ts_code':'000001.SH','name':'上证指数','trade_date':'20260922','close':3000,'pct_chg':.5,'amount':1000}],'20260922',{'indices':1},[])
    def tearDown(self):
        self.client.__exit__(None,None,None);main.DATABASE=self.old;market_sources.RUNNING.clear();self.temp.cleanup()
    def widget(self,kind='market-map',dataset='market-ashare',id='widget1'):
        return {'id':id,'kind':kind,'sources':{'indices' if kind=='index-board' else 'market':dataset},'size':'wide','refresh_seconds':300,'options':{'area':'total_mv'}}

    def test_refresh_interval_and_full_size_persist(self):
        widget=self.widget();widget.update(size='full',refresh_seconds=15)
        group={'id':'g-refresh','title':'刷新设置','widgets':[widget]}
        response=self.client.put('/api/boards/finance',json={'revision':0,'groups':[group]})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/api/boards/finance').json()['groups'][0]['widgets'][0]['refresh_seconds'],15)
        self.assertEqual(response.json()['groups'][0]['widgets'][0]['size'],'full')
        group['widgets'][0]['refresh_seconds']=1
        self.assertEqual(self.client.put('/api/boards/finance',json={'revision':1,'groups':[group]}).status_code,422)
    def test_dependency_schema_and_group_persistence(self):
        catalog=self.client.get('/api/widgets/catalog').json()['widgets']
        index=next(d for d in catalog if d['kind']=='index-board')
        self.assertFalse(next(d for d in index['datasets'] if d['id']=='market-ashare')['compatible'])
        group={'id':'group1','title':'测试编组','widgets':[self.widget(),self.widget('index-board','market-indices','widget2')]}
        saved=self.client.put('/api/boards/finance',json={'revision':0,'groups':[group]})
        self.assertEqual(saved.status_code,200);self.assertEqual(saved.json()['revision'],1)
        self.assertEqual(self.client.get('/api/boards/finance').json()['groups'],[group])
        self.assertEqual(self.client.put('/api/boards/finance',json={'revision':0,'groups':[]}).status_code,409)
        self.assertEqual(self.client.delete('/api/datasets/market-ashare').status_code,409)
        template=self.client.post('/api/widget-groups',json=group)
        self.assertEqual(template.status_code,201)
        self.assertEqual(self.client.get('/api/widget-groups').json()['templates'][0]['group'],group)
        self.assertEqual(self.client.delete('/api/widget-groups/'+template.json()['id']).status_code,200)
        wrong={'id':'bad','title':'错误绑定','widgets':[self.widget('index-board','market-ashare')]}
        self.assertEqual(self.client.put('/api/boards/finance',json={'revision':1,'groups':[wrong]}).status_code,400)
    def test_managed_data_readonly_copy_and_snapshot_contract(self):
        self.assertEqual(self.client.put('/api/datasets/market-ashare',json={'revision':1,'data':[]}).status_code,409)
        copy=self.client.post('/api/datasets',json={'name':'副本.json','format':'json','text':json.dumps(self.rows),'schema':'ashare.snapshot.v1','as_of':'20260922'})
        self.assertEqual(copy.status_code,201);record=copy.json();self.assertFalse(record.get('read_only',False))
        self.assertTrue(widget_boards.compatible(widget_boards.WIDGETS[0],record)[0])
        record['data'][1]['trade_date']='20260921'
        self.assertFalse(widget_boards.compatible(widget_boards.WIDGETS[0],record)[0])
        self.assertEqual(self.client.get('/api/widgets/resolve/index-board/market-ashare').status_code,400)
    def test_units_and_coverage(self):
        rows,coverage=market_sources.build_ashare([{'ts_code':'a','name':'A','industry':'银行'},{'ts_code':'b','name':'B','industry':'医药'}],[{'ts_code':'a','trade_date':'20260922','close':10,'pct_chg':1,'amount':3}],[{'ts_code':'a','total_mv':4}])
        self.assertEqual(rows[0]['amount'],3000);self.assertEqual(rows[0]['total_mv'],40000)
        self.assertEqual(coverage['missing_daily'],1)
    def test_failed_sync_keeps_previous_dataset(self):
        failure={'ok':False,'message':'测试接口权限不足','rows':[]}
        with patch.object(market_sources,'query_tushare',new=AsyncMock(return_value=failure)):
            response=self.client.post('/api/market-sources/tushare-ashare/sync')
        self.assertEqual(response.status_code,202)
        source=self.client.get('/api/market-sources').json()['sources'][0]
        self.assertEqual(source['state']['status'],'error');self.assertTrue(source['has_dataset'])
        self.assertEqual(self.client.get('/api/datasets/market-ashare').json()['revision'],1)
    def test_successful_source_sync_is_managed_and_deduplicated(self):
        async def query(name,params,fields):
            if name=='trade_cal':rows=[{'cal_date':'20260922','is_open':1}]
            elif name=='daily':rows=[{'ts_code':'000001.SZ','trade_date':'20260922','close':10,'pct_chg':1,'amount':3}]
            elif name=='stock_basic':rows=[{'ts_code':'000001.SZ','name':'样本','industry':'银行','market':'主板'}]
            else:rows=[{'ts_code':'000001.SZ','trade_date':'20260922','total_mv':4}]
            return {'ok':True,'rows':rows,'message':'ok'}
        with patch.object(market_sources,'query_tushare',side_effect=query):response=self.client.post('/api/market-sources/tushare-ashare/sync')
        self.assertEqual(response.status_code,202)
        saved=self.client.get('/api/datasets/market-ashare').json();self.assertEqual(saved['revision'],2);self.assertTrue(saved['read_only']);self.assertEqual(saved['data'][0]['total_mv'],40000)
