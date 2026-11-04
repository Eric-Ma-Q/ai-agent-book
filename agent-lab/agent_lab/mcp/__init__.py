"""需求 024：MCP 知识服务。"""

from .protocol import SERVER_NAME, SERVER_VERSION
from .routes import mcp_routes
from .service import McpService

__all__ = ["McpService", "SERVER_NAME", "SERVER_VERSION", "mcp_routes"]
