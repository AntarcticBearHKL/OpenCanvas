"""Entry point for ``uv run canvas-mcp``."""

from __future__ import annotations

import uvicorn

from canvas_mcp.config import Settings
from canvas_mcp.logger import logger
from canvas_mcp.server import create_app


def main() -> None:
    """Start the Canvas MCP server on the configured loopback address."""
    settings = Settings()
    logger.enabled = settings.debug
    app = create_app(settings)
    print("=" * 68)
    print(f"canvas-mcp listening on http://{settings.host}:{settings.port}")
    print("=" * 68)
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
