import os
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app import main, settings, providers


class FeaturesTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.previous_db, self.previous_env = main.DATABASE, settings.ENV_FILE
        main.DATABASE = Path(self.directory.name) / "test.sqlite3"
        settings.ENV_FILE = Path(self.directory.name) / ".env"
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        self.env_patch.start()
        self.client = TestClient(main.app).__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        main.DATABASE, settings.ENV_FILE = self.previous_db, self.previous_env
        self.env_patch.stop()
        self.directory.cleanup()

    def test_secret_roundtrip_redaction_and_origin(self):
        secret = "synthetic_test_credential_123456"
        response = self.client.put("/api/settings", json={"values": {"TUSHARE_TOKEN": secret}})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn(secret, response.text)
        self.assertNotIn(secret, self.client.get("/api/settings").text)
        self.assertEqual(settings.credential("TUSHARE_TOKEN"), secret)
        bad = self.client.put("/api/settings", json={"values": {"TUSHARE_TOKEN": {"secret": secret}}})
        self.assertEqual(bad.status_code, 422)
        self.assertNotIn(secret, bad.text)
        self.assertEqual(self.client.put("/api/settings", json={"values":{"TUSHARE_TOKEN":"bad\nOTHER=value"}}).status_code, 400)
        self.assertEqual(self.client.put("/api/settings", json={"values":{"PATH":"override"}}).status_code, 400)
        self.assertEqual(self.client.put("/api/settings", headers={"Origin":"https://unrelated.example"}, json={"values":{}}).status_code, 403)
        self.assertEqual(self.client.get("/api/settings", headers={"Host":"unrelated.example"}).status_code, 400)

    def test_document_import_search_deduplication_and_delete(self):
        content = "产业研究与因子验证。" * 150
        body = {"name":"研究笔记.md", "content":content}
        response = self.client.post("/api/documents", json=body)
        self.assertEqual(response.status_code, 201)
        identifier = response.json()["id"]
        self.assertTrue(self.client.post("/api/documents", json=body).json()["duplicate"])
        detail = self.client.get(f"/api/documents/{identifier}").json()
        self.assertEqual(detail["content"], content)
        self.assertEqual(detail["chunks"][0]["content"][-100:], detail["chunks"][1]["content"][:100])
        self.assertEqual(len(self.client.get("/api/documents?q=因子").json()["documents"]), 1)
        self.assertEqual(len(self.client.get("/api/documents?q=%25").json()["documents"]), 0)
        self.assertEqual(self.client.delete(f"/api/documents/{identifier}").status_code, 200)
        self.assertEqual(self.client.get(f"/api/documents/{identifier}").status_code, 404)
        with closing(sqlite3.connect(main.DATABASE)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM document_chunks").fetchone()[0], 0)
        self.assertEqual(self.client.post("/api/documents", json={"name":"empty.md","content":" "}).status_code, 400)

    def test_endpoint_specific_checks_and_market_cache(self):
        success = {"ok":True,"status":"connected","message":"ok","latency_ms":15,"rows":[{"trade_date":"20260921","close":11.2},{"trade_date":"20260918","close":11.1}]}
        with patch.object(providers, "test_tushare", new=AsyncMock(return_value=success)):
            result = self.client.post("/api/connections/tushare/test?api_name=daily")
            self.assertTrue(result.json()["ok"])
        self.assertEqual(self.client.get("/api/connections").json()["checks"][0]["api_name"], "daily")
        with patch.object(providers, "query_tushare", new=AsyncMock(return_value=success)) as query:
            result = self.client.get("/api/market/daily").json()
            self.assertEqual(result["rows"][0]["trade_date"], "20260918")
            self.assertTrue(self.client.get("/api/market/daily").json()["cached"])
            self.assertEqual(query.await_count, 1)
        self.client.put("/api/settings", json={"values":{"TUSHARE_TOKEN":"changed-secret"}})
        self.assertEqual(self.client.get("/api/connections").json()["checks"], [])
        with closing(sqlite3.connect(main.DATABASE)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM market_cache").fetchone()[0], 0)
        self.assertEqual(self.client.get("/api/market/daily?ts_code=https://example.com").status_code, 422)

    def test_home_layout_geometry_and_persistence(self):
        layout={"rooms":[{"id":"room1","name":"客厅","x":1,"y":1,"width":5,"height":4}],"furniture":[{"id":"sofa1","roomId":"room1","kind":"sofa","x":.5,"y":1,"width":2,"height":.9,"rotation":0}]}
        self.assertIsNone(self.client.get('/api/home/layout').json()['layout'])
        self.assertEqual(self.client.put('/api/home/layout',json=layout).status_code,200)
        self.assertEqual(self.client.get('/api/home/layout').json()['layout'],layout)

    def test_solid_furniture_overlap_is_rejected_but_rugs_can_overlap(self):
        room={'id':'room','name':'房间','x':0,'y':0,'width':5,'height':5}
        chair={'id':'chair1','roomId':'room','kind':'chair','x':1,'y':1,'width':1,'height':1,'rotation':0}
        layout={'rooms':[room],'furniture':[chair,{**chair,'id':'chair2'}]}
        self.assertEqual(self.client.put('/api/home/layout',json=layout).status_code,422)
        layout['furniture'][1]['kind']='rug'
        self.assertEqual(self.client.put('/api/home/layout',json=layout).status_code,200)
        invalid={**layout,"rooms":[layout['rooms'][0],{**layout['rooms'][0],"id":"overlap"}]}
        self.assertEqual(self.client.put('/api/home/layout',json=invalid).status_code,422)
        invalid={**layout,"furniture":[{**layout['furniture'][0],"x":4.5}]}
        self.assertEqual(self.client.put('/api/home/layout',json=invalid).status_code,422)
        self.assertEqual(self.client.put('/api/home/layout',json={"rooms":[],"furniture":[]}).status_code,422)
        self.assertEqual(self.client.get('/api/home/layout').json()['layout'],layout)

    def test_research_project_lifecycle(self):
        result=self.client.post('/api/research/projects',json={"name":"研究测试","hypothesis":"验证范围"})
        self.assertEqual(result.status_code,201)
        identifier=result.json()['id']
        updated=self.client.put(f'/api/research/projects/{identifier}',json={"name":"更新名称","hypothesis":"更新假设"})
        self.assertEqual(updated.json()['hypothesis'],'更新假设')
        self.assertEqual(self.client.get('/api/research/projects').json()['projects'][0]['name'],'更新名称')
        self.assertEqual(self.client.delete(f'/api/research/projects/{identifier}').status_code,200)
        self.assertEqual(self.client.get('/api/research/projects').json()['projects'],[])

    def test_dataset_csv_roundtrip_and_revision_conflict(self):
        import csv, io
        response=self.client.post('/api/datasets',json={'name':'quoted.csv','format':'csv','text':'\ufeffcode,note\r\n001,"hello, world\nsecond line"\r\n002,"a""b"\r\n'})
        self.assertEqual(response.status_code,201)
        record=response.json();identifier=record['id']
        self.assertEqual(record['data'][0],{'code':'001','note':'hello, world\nsecond line'})
        changed=[{'code':'003','note':'中文内容'}]
        self.assertEqual(self.client.put(f'/api/datasets/{identifier}',json={'revision':1,'data':changed}).status_code,200)
        self.assertEqual(self.client.put(f'/api/datasets/{identifier}',json={'revision':1,'data':[]}).status_code,409)
        exported=self.client.get(f'/api/datasets/{identifier}/export?format=csv')
        self.assertEqual(list(csv.DictReader(io.StringIO(exported.text))),changed)
        self.assertEqual(self.client.delete(f'/api/datasets/{identifier}').status_code,200)
        self.assertEqual(self.client.get(f'/api/datasets/{identifier}').status_code,404)

    def test_json_types_and_industry_integrity(self):
        payload={'name':'nested.json','format':'json','text':'{"profile":{"active":true,"value":null},"rows":[{"n":1.5}]}'}
        response=self.client.post('/api/datasets',json=payload)
        self.assertEqual(response.status_code,201)
        self.assertIs(response.json()['data']['profile']['active'],True)
        self.assertEqual(self.client.post('/api/datasets',json={**payload,'text':'{"broken":'}).status_code,400)
        self.assertEqual(self.client.post('/api/datasets',json={**payload,'text':'{"value":NaN}'}).status_code,400)
        industry=self.client.get('/api/datasets/industry-chain').json()
        self.assertEqual(len(industry['data']['nodes']),258)
        self.assertEqual(len(industry['data']['edges']),685)
        industry['data']['edges'][0]['s']='missing-company'
        self.assertEqual(self.client.put('/api/datasets/industry-chain',json={'revision':1,'data':industry['data']}).status_code,400)
        self.assertEqual(self.client.get('/api/datasets/industry-chain').json()['revision'],1)
        self.assertEqual(self.client.delete('/api/datasets/industry-chain').status_code,409)


class ProviderTest(unittest.IsolatedAsyncioTestCase):
    async def test_permission_failure_and_redaction(self):
        import httpx
        secret = "test-secret"
        response = httpx.Response(200, json={"code":2002,"msg":f"denied {secret}"}, request=httpx.Request("POST", providers.TUSHARE_URL))
        with patch.object(providers, "credential", return_value=secret), patch("httpx.AsyncClient.post", new=AsyncMock(return_value=response)):
            result = await providers.test_tushare("daily")
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "permission_denied")
        self.assertNotIn(secret, result["message"])
