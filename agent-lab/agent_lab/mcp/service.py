"""MCP 服务编排：认证、双代会话、工具分派、请求 id 去重与取消。"""

from __future__ import annotations

import hmac
import logging
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any

from .ask import AskService
from .collected import CollectedService
from .knowledge import KnowledgeService
from .models import McpCallContext
from .protocol import (
    LATEST_LEGACY,
    LATEST_MODERN,
    LEGACY_VERSIONS,
    MODERN_VERSIONS,
    SUPPORTED_VERSIONS,
    HttpReply,
    McpError,
    capabilities,
    client_info,
    error_reply,
    header_mismatch,
    instructions,
    invalid_params,
    invalid_request,
    method_not_found,
    modern_result,
    modern_version,
    server_info,
    unsupported_version,
)
from .toolset import Toolset

log = logging.getLogger(__name__)


class McpDisabled(Exception):
    pass


class McpUnauthorized(Exception):
    pass


@dataclass
class McpSession:
    id: str
    protocol_version: str
    created_at: float
    initialized: bool = False
    client_name: str = ""


class McpService:
    def __init__(self, service: Any, settings: Any):
        self.service = service
        self.lab = service.lab
        self.settings = settings
        self.token = (settings.mcp_token or "").strip()
        self.knowledge = KnowledgeService(self.lab, reader_url=settings.reader_url)
        self.collected = (getattr(self.lab, "extras", None) or {}).get("collected") or CollectedService(
            settings.harness_dir, reader_url=settings.reader_url
        )
        self.ask = AskService(service, settings)
        self.toolset = Toolset(self.knowledge, self.ask, self.collected)
        self._lock = threading.Lock()
        self._sessions: dict[str, McpSession] = {}
        self._inflight: dict[str, threading.Event] = {}
        if self.token and len(self.token) < 16:
            log.warning("LAB_MCP_TOKEN 少于 16 位，MCP 端点按未配置处理")

    # -- 认证 -------------------------------------------------------------

    @property
    def enabled(self) -> bool:
        return bool(self.token) and len(self.token) >= 16

    def check_token(self, authorization: str | None, x_token: str | None) -> None:
        if not self.enabled:
            raise McpDisabled("MCP 未启用：在 agent-lab/.env 设置至少 16 位的 LAB_MCP_TOKEN 后重启")
        provided = ""
        if authorization:
            value = authorization.strip()
            if value.lower().startswith("bearer "):
                provided = value[7:].strip()
            else:
                provided = value
        elif x_token:
            provided = x_token.strip()
        if not provided or not hmac.compare_digest(provided, self.token):
            raise McpUnauthorized("未授权：缺少或错误的 Bearer token")

    # -- 请求入口 ---------------------------------------------------------

    def handle(
        self,
        payload: Any,
        *,
        session_id: str | None,
        protocol_header: str | None,
        client_cancel: threading.Event | None = None,
    ) -> HttpReply:
        request_id: Any = None
        try:
            request_id, method, params, is_notification = _validate(payload)
            if is_notification:
                try:
                    self._notification(method, params, session_id)
                except Exception:  # noqa: BLE001 - 通知不返回响应，失败只记日志
                    log.exception("mcp notification failed: %s", method)
                return HttpReply(202, None, {"Cache-Control": "no-store"})
            cancel = client_cancel or threading.Event()
            modern, version, session = self._negotiate(method, params, session_id, protocol_header)
            ctx = McpCallContext(
                request_id=str(request_id),
                session_id=session_id,
                modern=modern,
                protocol_version=version,
                client_name=client_info(params).get("name", "") or (session.client_name if session else ""),
                cancel=cancel,
            )
            key = self._inflight_key(session_id, request_id)
            self._begin(key)
            try:
                result, extra_headers = self._dispatch(method, params, ctx, session, modern)
            finally:
                self._end(key)
            body = {"jsonrpc": "2.0", "id": request_id, "result": result}
            headers = {"Cache-Control": "no-store", **extra_headers}
            if protocol_header:
                headers["MCP-Protocol-Version"] = version
            return HttpReply(200, body, headers)
        except McpError as error:
            reply = error_reply(request_id, error)
            reply.headers = {"Cache-Control": "no-store"}
            return reply
        except Exception as error:  # noqa: BLE001 - 内部错误也要回 JSON-RPC，而不是裸 500
            log.exception("mcp request failed")
            return HttpReply(
                500,
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32603, "message": f"服务内部错误：{type(error).__name__}"},
                },
                {"Cache-Control": "no-store"},
            )

    # -- 协议协商 ---------------------------------------------------------

    def _negotiate(
        self,
        method: str,
        params: dict[str, Any],
        session_id: str | None,
        protocol_header: str | None,
    ) -> tuple[bool, str, McpSession | None]:
        header = (protocol_header or "").strip()
        if method == "initialize":
            # initialize 是旧式握手；即使带 _meta 也按旧式建会话，避免双代客户端误判。
            return False, self._legacy_version(params), None
        version = modern_version(params)
        modern = method == "server/discover" or version is not None or header in MODERN_VERSIONS
        if modern:
            if version is None:
                if method == "server/discover":
                    version = LATEST_MODERN
                else:
                    raise invalid_params(
                        "新式 MCP 请求缺少 _meta.io.modelcontextprotocol/protocolVersion",
                        status=400,
                    )
            if version not in SUPPORTED_VERSIONS:
                raise unsupported_version(version)
            if version not in MODERN_VERSIONS:
                raise unsupported_version(version)
            if header and header != version:
                raise header_mismatch(header, version)
            return True, version, None
        # 旧式：除 initialize 之外都必须有会话。
        session = self._session(session_id)
        if session is None:
            raise invalid_params(
                "缺少或过期的 Mcp-Session-Id，请先调用 initialize",
                status=404,
            )
        if header and header not in SUPPORTED_VERSIONS:
            raise unsupported_version(header)
        if header and header != session.protocol_version:
            raise invalid_params(
                f"MCP-Protocol-Version（{header}）与协商版本（{session.protocol_version}）不一致",
                status=400,
            )
        return False, session.protocol_version, session

    @staticmethod
    def _legacy_version(params: dict[str, Any]) -> str:
        requested = params.get("protocolVersion")
        return requested if isinstance(requested, str) and requested in LEGACY_VERSIONS else LATEST_LEGACY

    def _dispatch(
        self,
        method: str,
        params: dict[str, Any],
        ctx: McpCallContext,
        session: McpSession | None,
        modern: bool,
    ) -> tuple[dict[str, Any], dict[str, str]]:
        if method == "initialize":
            info = params.get("clientInfo") if isinstance(params.get("clientInfo"), dict) else {}
            name = info.get("name") if isinstance(info.get("name"), str) else ""
            session = self._create_session(self._legacy_version(params), name[:80])
            result = {
                "protocolVersion": session.protocol_version,
                "capabilities": capabilities(),
                "serverInfo": server_info(),
                "instructions": instructions(),
            }
            return result, {"Mcp-Session-Id": session.id}
        if method == "ping":
            return (modern_result({}) if modern else {}), {}
        if method == "server/discover":
            result = {
                "supportedVersions": list(SUPPORTED_VERSIONS),
                "capabilities": capabilities(),
                "instructions": instructions(),
            }
            return modern_result(result, cacheable=True), {}
        if method == "tools/list":
            result = {"tools": self.toolset.schemas()}
            return (modern_result(result, cacheable=True) if modern else result), {}
        if method == "tools/call":
            name = params.get("name")
            if not isinstance(name, str) or not name:
                raise invalid_params("tools/call 缺少 name")
            arguments = params.get("arguments", {})
            outcome = self.toolset.call(name, arguments, ctx)
            payload: dict[str, Any] = {
                "content": [{"type": "text", "text": outcome.text}],
                "isError": outcome.is_error,
            }
            if modern and outcome.structured is not None:
                payload["structuredContent"] = outcome.structured
            return (modern_result(payload) if modern else payload), {}
        raise method_not_found(method)

    # -- 会话 -------------------------------------------------------------

    def _create_session(self, version: str, client_name: str = "") -> McpSession:
        now = time.monotonic()
        session = McpSession(uuid.uuid4().hex, version, now, client_name=client_name)
        with self._lock:
            self._purge_sessions()
            self._sessions[session.id] = session
        return session

    def _session(self, session_id: str | None) -> McpSession | None:
        if not session_id:
            return None
        with self._lock:
            self._purge_sessions()
            session = self._sessions.get(session_id)
            if session is not None:
                session.created_at = time.monotonic()
            return session

    def _purge_sessions(self) -> None:
        cutoff = time.monotonic() - self.settings.mcp_session_ttl_s
        for key in [key for key, session in self._sessions.items() if session.created_at < cutoff]:
            self._sessions.pop(key, None)

    def end_session(self, session_id: str | None) -> bool:
        if not session_id:
            return False
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    # -- 通知与请求 id ----------------------------------------------------

    def _notification(self, method: str, params: dict[str, Any], session_id: str | None) -> None:
        if method == "notifications/initialized":
            session = self._session(session_id)
            if session is not None:
                session.initialized = True
            return
        if method == "notifications/cancelled":
            request_id = params.get("requestId")
            key = self._inflight_key(session_id, request_id)
            with self._lock:
                event = self._inflight.get(key)
            if event is not None:
                event.set()
            return
        # 其他通知按规范忽略。

    @staticmethod
    def _inflight_key(session_id: str | None, request_id: Any) -> str:
        return f"{session_id or 'modern'}:{request_id}"

    def _begin(self, key: str) -> None:
        with self._lock:
            if key in self._inflight:
                raise invalid_request(f"请求 id 正在处理中：{key.split(':', 1)[-1]}")
            self._inflight[key] = threading.Event()

    def _end(self, key: str) -> None:
        with self._lock:
            self._inflight.pop(key, None)


def _validate(payload: Any) -> tuple[Any, str, dict[str, Any], bool]:
    if not isinstance(payload, dict):
        raise invalid_request("请求必须是单个 JSON-RPC 对象，不支持批量")
    if payload.get("jsonrpc") != "2.0":
        raise invalid_request("jsonrpc 必须是 2.0")
    method = payload.get("method")
    if not isinstance(method, str) or not method:
        raise invalid_request("缺少 method")
    params = payload.get("params")
    if params is None:
        params = {}
    if not isinstance(params, dict):
        raise invalid_request("params 必须是对象")
    if "id" in payload:
        request_id = payload.get("id")
        if isinstance(request_id, bool) or not isinstance(request_id, (str, int)) or request_id == "":
            raise invalid_request("id 必须是字符串或整数，且不能为空")
        return request_id, method, params, False
    if method.startswith("notifications/"):
        return None, method, params, True
    raise invalid_request("请求缺少 id；通知方法必须以 notifications/ 开头")
