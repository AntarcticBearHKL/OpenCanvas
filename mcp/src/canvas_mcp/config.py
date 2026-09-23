"""Runtime configuration for the standalone Canvas MCP server.

Mirrors the TypeScript ``config.ts`` (agent instructions + version) and adds the
environment-driven settings the standalone server needs (host, port, origin
allowlist, token, debug logging).
"""

from __future__ import annotations

import os
import secrets
from pathlib import Path

VERSION = "0.1.0"

# Protocol version exchanged with the browser bridge (agent-runtime.tsx expects 6).
AGENT_PROTOCOL_VERSION = 6

_INSTRUCTIONS_PATH = Path(__file__).with_name("agent-instructions.md")


def _read_instructions() -> str:
    """Load the bundled agent instructions verbatim."""
    return _INSTRUCTIONS_PATH.read_text(encoding="utf-8")


INSTRUCTIONS = _read_instructions()


def _flag(name: str) -> bool:
    """Read a boolean environment flag (``1``/``true``/``yes``/``on``)."""
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    """Server settings resolved once at startup from the environment."""

    def __init__(self) -> None:
        self.host = os.environ.get("CANVAS_MCP_HOST", "127.0.0.1").strip() or "127.0.0.1"
        self.port = int(os.environ.get("CANVAS_MCP_PORT", "3210"))
        self.debug = _flag("CANVAS_MCP_DEBUG")
        self.origins = [item.strip() for item in os.environ.get("CANVAS_MCP_ORIGINS", "").split(",") if item.strip()]
        token = os.environ.get("CANVAS_MCP_TOKEN", "").strip()
        self.token_generated = not token
        self.token = token or secrets.token_urlsafe(32)
