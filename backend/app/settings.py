"""Allowlisted local credentials. Never serialize plaintext values to the client."""
import os
from pathlib import Path
import tempfile
from threading import RLock

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
KEYS = ("TUSHARE_TOKEN", "BINANCE_API_KEY", "BINANCE_API_SECRET")
LOCK = RLock()


def read_file() -> dict[str, str]:
    if not ENV_FILE.exists():
        return {}
    values = {}
    for line in ENV_FILE.read_text(encoding="utf-8-sig").splitlines():
        key, sep, value = line.partition("=")
        if sep and key.strip() in KEYS:
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def credential(key: str) -> str:
    return os.environ.get(key, read_file().get(key, ""))


def summaries() -> list[dict]:
    return [{"key": key, "configured": bool(credential(key)),
             "masked": "••••••••" if credential(key) else "",
             "source": "process" if key in os.environ else "local"} for key in KEYS]


def save_credentials(values: dict[str, str]) -> None:
    with LOCK:
        # Preserve unrelated settings and comments when editing the allowlisted keys.
        lines = ENV_FILE.read_text(encoding="utf-8-sig").splitlines() if ENV_FILE.exists() else []
        pending = dict(values)
        output = []
        for line in lines:
            key = line.partition("=")[0].strip()
            if key in values:
                if key in pending:
                    output.append(f"{key}={pending.pop(key)}")
            else:
                output.append(line)
        output.extend(f"{key}={value}" for key, value in pending.items())
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".env-", dir=ENV_FILE.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write("\n".join(output) + "\n")
            os.replace(name, ENV_FILE)
        finally:
            if os.path.exists(name):
                os.unlink(name)
