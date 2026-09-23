from contextlib import closing
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
import re
from typing import Literal
import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, SecretStr

from . import settings, providers

router = APIRouter(prefix="/api")


def connect():
    from .main import DATABASE
    import sqlite3
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def now():
    return datetime.now(timezone.utc).isoformat()


class ConfigUpdate(BaseModel):
    values: dict[str, SecretStr]


@router.get("/settings")
def read_settings():
    return {"variables": settings.summaries(), "storage": "local_env", "binance_status": "planned"}


@router.put("/settings")
def update_settings(body: ConfigUpdate):
    if any(key not in settings.KEYS for key in body.values):
        raise HTTPException(400, "仅支持页面列出的配置项。")
    values = {key: value.get_secret_value().strip() for key, value in body.values.items()}
    if any(key in os.environ for key in values):
        raise HTTPException(409, "配置由进程环境变量提供，请修改启动环境后重启。")
    if any(len(value) > 512 or (value and not re.fullmatch(r"[A-Za-z0-9_.\-]+", value)) for value in values.values()):
        raise HTTPException(400, "凭证格式无效；不能包含空格、换行或特殊字符。")
    settings.save_credentials(values)
    # Credential changes invalidate previous checks and cached market snapshots.
    if "TUSHARE_TOKEN" in values:
        with closing(connect()) as db, db:
            db.execute("DELETE FROM connection_checks WHERE provider='tushare'")
            db.execute("DELETE FROM market_cache")
    return read_settings()


@router.get("/connections")
def connection_history():
    with closing(connect()) as db:
        rows = db.execute("SELECT * FROM connection_checks ORDER BY checked_at DESC LIMIT 20").fetchall()
    return {"checks": [dict(row) for row in rows]}


@router.post("/connections/tushare/test")
async def check_tushare(api_name: Literal["trade_cal", "daily"] = "trade_cal"):
    result = await providers.test_tushare(api_name)
    checked_at = now()
    with closing(connect()) as db, db:
        db.execute("INSERT INTO connection_checks VALUES (?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), "tushare", api_name, result["status"], result["message"], result["latency_ms"], len(result["rows"]), checked_at))
    return {**result, "api_name": api_name, "checked_at": checked_at, "rows": result["rows"][:5]}


@router.get("/market/daily")
async def daily(ts_code: str = Query("000001.SZ", pattern=r"^\d{6}\.(SZ|SH|BJ)$"), days: int = Query(90, ge=7, le=365), refresh: bool = False):
    cache_key = f"{ts_code}:{days}"
    with closing(connect()) as db:
        row = db.execute("SELECT payload, fetched_at FROM market_cache WHERE cache_key=?", (cache_key,)).fetchone()
    if row and not refresh:
        payload = json.loads(row["payload"])
        age = (datetime.now(timezone.utc)-datetime.fromisoformat(row["fetched_at"])).total_seconds()
        return {**payload, "cached": True, "stale": age > 86400}
    today = date.today()
    result = await providers.query_tushare("daily", {"ts_code": ts_code, "start_date": (today-timedelta(days=days)).strftime("%Y%m%d"), "end_date": today.strftime("%Y%m%d")}, "ts_code,trade_date,open,high,low,close,pct_chg,vol,amount")
    result["rows"].sort(key=lambda item: item.get("trade_date", ""))
    payload = {**result, "symbol": ts_code, "source": "Tushare · daily", "adjustment": "未复权", "fetched_at": now(), "cached": False, "stale": False}
    if result["ok"]:
        with closing(connect()) as db, db:
            db.execute("INSERT OR REPLACE INTO market_cache VALUES (?,?,?)", (cache_key, json.dumps(payload, ensure_ascii=False), payload["fetched_at"]))
    return payload


class DocumentInput(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    content: str = Field(min_length=1, max_length=500_000)


@router.post("/documents", status_code=201)
def import_document(body: DocumentInput):
    name = body.name.strip()
    content = body.content.strip()
    if not name or not content:
        raise HTTPException(400, "文档名称和正文不能为空。")
    if not name.lower().endswith((".txt", ".md")):
        raise HTTPException(400, "当前支持 UTF-8 TXT 和 Markdown 文档。")
    digest = hashlib.sha256(content.encode()).hexdigest()
    with closing(connect()) as db, db:
        duplicate = db.execute("SELECT id FROM documents WHERE digest=?", (digest,)).fetchone()
        if duplicate:
            return {"id": duplicate["id"], "duplicate": True}
        identifier = str(uuid.uuid4())
        db.execute("INSERT INTO documents VALUES (?,?,?,?,?,?)", (identifier, name, content, digest, len(content), now()))
        # Deterministic overlapping character chunks; no external embedding calls.
        for index, start in enumerate(range(0, len(content), 600)):
            db.execute("INSERT INTO document_chunks(document_id, ordinal, content) VALUES (?,?,?)", (identifier, index, content[start:start+700]))
            if start+700 >= len(content):
                break
    return {"id": identifier, "duplicate": False}


@router.get("/documents")
def documents(q: str = Query("", max_length=200)):
    term = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    with closing(connect()) as db:
        rows = db.execute("SELECT d.id, d.name, d.characters, d.created_at, COUNT(c.id) AS chunks FROM documents d LEFT JOIN document_chunks c ON c.document_id=d.id WHERE d.name LIKE ? ESCAPE '\\' OR d.content LIKE ? ESCAPE '\\' GROUP BY d.id ORDER BY d.created_at DESC", (f"%{term}%", f"%{term}%")).fetchall()
    return {"documents": [dict(row) for row in rows], "embedding_status": "not_configured"}


@router.get("/documents/{identifier}")
def document_detail(identifier: str):
    with closing(connect()) as db:
        row = db.execute("SELECT id,name,content,characters,created_at FROM documents WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise HTTPException(404, "文档不存在。")
        chunks = db.execute("SELECT ordinal,content FROM document_chunks WHERE document_id=? ORDER BY ordinal", (identifier,)).fetchall()
    return {**dict(row), "chunks": [dict(chunk) for chunk in chunks]}


@router.delete("/documents/{identifier}")
def delete_document(identifier: str):
    with closing(connect()) as db, db:
        result = db.execute("DELETE FROM documents WHERE id=?", (identifier,))
        if not result.rowcount:
            raise HTTPException(404, "文档不存在。")
    return {"deleted": True}
