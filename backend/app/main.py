"""Local API foundation. Visual prototype fixtures live in the frontend."""
from contextlib import asynccontextmanager, closing
import os
from pathlib import Path
import sqlite3

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from .routes import router
from .workspaces import router as workspace_router
from .datasets import router as datasets_router, seed_industry
from .market_sources import router as market_sources_router, recover_sources
from .widget_boards import router as widget_boards_router

ROOT = Path(__file__).resolve().parents[2]
DATABASE = Path(os.environ.get("INSIGHTRA_DATABASE", str(ROOT / "data" / "insightra.sqlite3")))


def initialize_database() -> None:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DATABASE)) as connection, connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            connection.execute("CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("INSERT INTO app_metadata VALUES ('schema', '1')")
            connection.execute("PRAGMA user_version=1")
            version = 1
        if version == 1:
            connection.execute("CREATE TABLE connection_checks (id TEXT PRIMARY KEY, provider TEXT, api_name TEXT, status TEXT, message TEXT, latency_ms INTEGER, row_count INTEGER, checked_at TEXT)")
            connection.execute("CREATE TABLE market_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL)")
            connection.execute("CREATE TABLE documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, digest TEXT UNIQUE NOT NULL, characters INTEGER NOT NULL, created_at TEXT NOT NULL)")
            connection.execute("CREATE TABLE document_chunks (id INTEGER PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, content TEXT NOT NULL)")
            connection.execute("CREATE INDEX chunks_document ON document_chunks(document_id)")
            connection.execute("PRAGMA user_version=2")
        elif version != 2:
            raise RuntimeError(f"Unsupported database version: {version}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    seed_industry()
    recover_sources()
    yield


app = FastAPI(title="Insightra API", version="0.2.0", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.include_router(router)
app.include_router(workspace_router)
app.include_router(datasets_router)
app.include_router(market_sources_router)
app.include_router(widget_boards_router)


@app.middleware("http")
async def local_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    allowed = {"http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000", "http://127.0.0.1:4173"}
    if origin and origin not in allowed:
        return JSONResponse({"detail": "仅允许本地工作台请求。"}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # FastAPI's default error payload includes submitted input, possibly a secret.
    return JSONResponse({"detail": "请求参数无效，请检查字段和长度。"}, status_code=422)


@app.get("/api/health")
def health():
    with closing(sqlite3.connect(DATABASE)) as connection:
        connection.execute("SELECT 1").fetchone()
        version = connection.execute("PRAGMA user_version").fetchone()[0]
    return {"status": "ok", "database": "sqlite", "schema_version": version}
