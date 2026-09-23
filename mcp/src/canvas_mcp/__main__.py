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
    if settings.token_generated:
        print(f"CANVAS_MCP_TOKEN={settings.token}")
        print("No CANVAS_MCP_TOKEN was set, so a random token was generated.")
        print("Paste it into the deployed frontend's settings page.")
    else:
        print("Using the token from the CANVAS_MCP_TOKEN environment variable.")
    if not settings.origins:
        print("CANVAS_MCP_ORIGINS is empty: browser requests with an Origin header will be rejected.")
    print("=" * 68)
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
