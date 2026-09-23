"""Read-only Tushare requests, fixed destination, bounded timeouts, redacted errors."""
from datetime import date, timedelta
import time
import httpx

from .settings import credential

TUSHARE_URL = "https://api.tushare.pro"


async def query_tushare(api_name: str, params: dict, fields: str) -> dict:
    token = credential("TUSHARE_TOKEN")
    if not token:
        return {"ok": False, "status": "not_configured", "message": "请先配置 TUSHARE_TOKEN。", "rows": [], "latency_ms": 0}
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.post(TUSHARE_URL, json={"api_name": api_name, "token": token, "params": params, "fields": fields})
            response.raise_for_status()
            payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Unexpected payload")
        code = payload.get("code")
        if code != 0:
            message = str(payload.get("msg") or "数据源拒绝了本次请求").replace(token, "[已隐藏]")[:300]
            return {"ok": False, "status": "permission_denied" if code == 2002 else "provider_error", "message": message, "rows": [], "provider_code": code, "latency_ms": round((time.perf_counter()-started)*1000)}
        data = payload.get("data") or {}
        columns, items = data.get("fields", []), data.get("items", [])
        if not isinstance(columns, list) or not isinstance(items, list):
            raise ValueError("Unexpected data")
        rows = [dict(zip(columns, row, strict=True)) for row in items]
        return {"ok": True, "status": "connected", "message": f"{api_name} 请求成功，返回 {len(rows)} 条记录。", "rows": rows, "latency_ms": round((time.perf_counter()-started)*1000)}
    except httpx.TimeoutException:
        message, status = "请求超时，请检查网络后重试。", "timeout"
    except httpx.HTTPStatusError as exc:
        message, status = f"数据源返回 HTTP {exc.response.status_code}。", "http_error"
    except httpx.RequestError:
        message, status = "无法建立安全连接，请检查网络、代理或数据源服务。", "network_error"
    except (ValueError, TypeError, AttributeError):
        message, status = "数据源返回了无法解析的响应。", "invalid_response"
    return {"ok": False, "status": status, "message": message, "rows": [], "latency_ms": round((time.perf_counter()-started)*1000)}


async def test_tushare(api_name: str) -> dict:
    today = date.today()
    if api_name == "trade_cal":
        return await query_tushare(api_name, {"exchange": "SSE", "start_date": (today-timedelta(days=7)).strftime("%Y%m%d"), "end_date": today.strftime("%Y%m%d")}, "exchange,cal_date,is_open")
    return await query_tushare("daily", {"ts_code": "000001.SZ", "start_date": (today-timedelta(days=14)).strftime("%Y%m%d"), "end_date": today.strftime("%Y%m%d")}, "ts_code,trade_date,close,pct_chg,vol")
