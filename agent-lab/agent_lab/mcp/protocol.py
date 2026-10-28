"""MCP 双代协议：版本、错误、结果包装与请求元数据。

旧式（2024-11-05 至 2025-11-25）用 initialize 握手与会话；新式（2026-07-28 起）
无状态，每请求在 params._meta 里自带版本，结果带 resultType。本模块只放纯函数。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SERVER_NAME = "ai-agent-book"
SERVER_TITLE = "AI Agent Book 知识服务"
SERVER_VERSION = "0.1.0"

MODERN_VERSIONS = ("2026-07-28",)
LEGACY_VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05")
SUPPORTED_VERSIONS = MODERN_VERSIONS + LEGACY_VERSIONS
LATEST_MODERN = MODERN_VERSIONS[0]
LATEST_LEGACY = LEGACY_VERSIONS[0]

META_VERSION = "io.modelcontextprotocol/protocolVersion"
META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo"
META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities"
META_SERVER_INFO = "io.modelcontextprotocol/serverInfo"

INSTRUCTIONS = (
    "这是《深入理解 AI Agent：设计原理与工程实践》的书稿知识服务。"
    "先用 list_chapters 看目录、search_book 定位，再用 read_section 读原文；"
    "需要书本助教综合回答时用 ask_book。所有知识工具只读，不会修改书稿或读者数据；"
    "问答只使用书稿与读者标注，不读文件、不跑命令、不联网。"
)


class McpError(Exception):
    """JSON-RPC 协议错误；http_status 由路由层使用。"""

    def __init__(self, code: int, message: str, data: Any = None, http_status: int = 200):
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data
        self.http_status = http_status

    def payload(self) -> dict[str, Any]:
        error: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.data is not None:
            error["data"] = self.data
        return error


@dataclass
class HttpReply:
    status: int = 200
    body: dict[str, Any] | None = None
    headers: dict[str, str] = field(default_factory=dict)


def server_info() -> dict[str, str]:
    return {"name": SERVER_NAME, "title": SERVER_TITLE, "version": SERVER_VERSION}


def capabilities() -> dict[str, Any]:
    return {"tools": {"listChanged": False}}


def instructions() -> str:
    return INSTRUCTIONS


def modern_meta(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(params, dict):
        return None
    meta = params.get("_meta")
    return meta if isinstance(meta, dict) else None


def modern_version(params: dict[str, Any] | None) -> str | None:
    meta = modern_meta(params)
    if meta is None:
        return None
    version = meta.get(META_VERSION)
    return version if isinstance(version, str) and version else None


def client_info(params: dict[str, Any] | None) -> dict[str, str]:
    meta = modern_meta(params)
    info = meta.get(META_CLIENT_INFO) if meta else None
    if not isinstance(info, dict):
        return {}
    name = info.get("name")
    version = info.get("version")
    return {
        "name": name[:80] if isinstance(name, str) else "",
        "version": version[:40] if isinstance(version, str) else "",
    }


def with_server_meta(result: dict[str, Any]) -> dict[str, Any]:
    payload = dict(result)
    meta = dict(payload.get("_meta") or {})
    meta[META_SERVER_INFO] = server_info()
    payload["_meta"] = meta
    return payload


def modern_result(result: dict[str, Any], *, cacheable: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {"resultType": "complete", **result}
    if cacheable:
        payload.setdefault("ttlMs", 60_000)
        payload.setdefault("cacheScope", "private")
    return with_server_meta(payload)


def legacy_result(result: dict[str, Any]) -> dict[str, Any]:
    return dict(result)


def error_reply(request_id: Any, error: McpError) -> HttpReply:
    return HttpReply(
        status=error.http_status,
        body={"jsonrpc": "2.0", "id": request_id, "error": error.payload()},
    )


def parse_error() -> HttpReply:
    return HttpReply(
        status=400,
        body={"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON 无法解析"}},
    )


def invalid_request(message: str = "请求不是合法的 JSON-RPC 2.0") -> McpError:
    return McpError(-32600, message, http_status=400)


def invalid_params(message: str, *, status: int = 200, data: Any = None) -> McpError:
    return McpError(-32602, message, data=data, http_status=status)


def method_not_found(method: str) -> McpError:
    return McpError(-32601, f"没有这个方法：{method}")


def unsupported_version(requested: str) -> McpError:
    return McpError(
        -32022,
        f"不支持 MCP 协议版本 {requested}",
        data={"supported": list(SUPPORTED_VERSIONS), "requested": requested},
        http_status=400,
    )


def header_mismatch(header: str, body_version: str) -> McpError:
    return McpError(
        -32020,
        f"MCP-Protocol-Version 头（{header}）与请求体版本（{body_version}）不一致",
        data={"header": header, "body": body_version},
        http_status=400,
    )
