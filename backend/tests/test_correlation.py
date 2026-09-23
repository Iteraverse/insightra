import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
from contextlib import closing
from app import main,research_sources
from app.correlation import calculate
from app.routes import connect

class CorrelationTest(unittest.TestCase):
    def test_alignment_sign_constant_and_small_sample(self):
        a={str(i):i/100 for i in range(7)}
        b={str(i):-i/100 for i in range(1,7)}
        c={str(i):.01 for i in range(7)}
        dates,m=calculate([a,b,c])
        self.assertEqual(len(dates),6)
        self.assertAlmostEqual(m[0][0],1)
        self.assertAlmostEqual(m[0][1],-1)
        self.assertEqual(m[0][1],m[1][0])
        self.assertIsNone(m[2][2])
        self.assertIsNone(calculate([{'a':1},{'a':2}])[1][0][0])

    def test_analysis_persists_sources_and_reuses_cache(self):
        previous=main.DATABASE
        with tempfile.TemporaryDirectory() as temp:
            main.DATABASE=Path(temp)/'test.sqlite3'
            try:
                with TestClient(main.app) as client:
                    records=[{'ts_code':'000001.SZ','name':'甲','industry':'银行'},{'ts_code':'600000.SH','name':'乙','industry':'银行'}]
                    with closing(connect()) as db,db:db.execute("INSERT OR REPLACE INTO app_metadata VALUES ('dataset:market-ashare',?)",(json.dumps({'data':records,'as_of':'20260922'}),))
                    calls=[]
                    async def fetch(name,params,fields):
                        calls.append(params)
                        return [{'ts_code':params['ts_code'],'trade_date':f'202609{10+i}','close':10+i,'pct_chg':i*(1 if params['ts_code']=='000001.SZ' else -1),'amount':1,'vol':5} for i in range(6)]
                    body={'symbols':['000001.SZ','600000.SH'],'start':'2026-09-01','end':'2026-09-22'}
                    with patch.object(research_sources,'fetch_pages',side_effect=fetch):
                        first=client.post('/api/research/correlation',json=body)
                        self.assertEqual(first.status_code,200,first.text)
                        self.assertEqual(first.json()['samples'],6)
                        self.assertAlmostEqual(first.json()['matrix'][0][1],-1)
                        self.assertEqual(client.post('/api/research/correlation',json=body).status_code,200)
                    self.assertEqual(len(calls),2)
                    ds=client.get('/api/datasets/'+first.json()['coverage'][0]['dataset_id']).json()
                    self.assertTrue(ds['read_only']);self.assertEqual(ds['data'][0]['amount'],1000)
                    self.assertEqual(client.post('/api/research/correlation',json={**body,'symbols':['000001.SZ','000001.SZ']}).status_code,422)
                    self.assertEqual(client.post('/api/research/correlation',json={**body,'start':'2026-09-23'}).status_code,422)
            finally:main.DATABASE=previous
