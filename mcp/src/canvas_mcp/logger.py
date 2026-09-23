"""Debug-gated terminal logger mirroring ``web/server/utils/logger.ts``."""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from typing import Any

_SENSITIVE = re.compile(r"token|authorization|api.?key|dataurl", re.IGNORECASE)


def _sanitize(value: Any, key: str = "") -> Any:
    """Strip sensitive fields and inline data URLs from log details."""
    if key and _SENSITIVE.search(key):
        return "[REDACTED]"
    if isinstance(value, str) and value.startswith("data:"):
        return f"[DATA URL {len(value)} chars]"
    if isinstance(value, BaseException):
        return {"name": type(value).__name__, "message": str(value)}
    if isinstance(value, dict):
        return {str(field): _sanitize(item, str(field)) for field, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize(item, key) for item in value]
    return value


class Logger:
    """Timestamped logger whose ``debug`` output is gated by ``CANVAS_MCP_DEBUG``."""

    def __init__(self, enabled: bool = False) -> None:
        self.enabled = enabled

    def debug(self, message: str, details: Any = None) -> None:
        if self.enabled:
            self._write("DEBUG", message, details)

    def info(self, message: str, details: Any = None) -> None:
        self._write("INFO", message, details)

    def warn(self, message: str, details: Any = None) -> None:
        self._write("WARN", message, details)

    def error(self, message: str, details: Any = None) -> None:
        self._write("ERROR", message, details)

    def _write(self, level: str, message: str, details: Any = None) -> None:
        suffix = "" if details is None else f" {json.dumps(_sanitize(details), ensure_ascii=False, default=str)}"
        stamp = datetime.now(UTC).isoformat()
        print(f"{stamp} {level} {message}{suffix}", flush=True)


logger = Logger(os.environ.get("CANVAS_MCP_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"})
