"""MCP HTTP 路由：Streamable HTTP 的 JSON 响应、认证、会话头与断开取消。"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from .protocol import parse_error
from .service import McpDisabled, McpService, McpUnauthorized

log = logging.getLogger(__name__)
MAX_BODY = 1_048_576
_JSON = "application/json"


def mcp_routes(mcp: McpService) -> APIRouter:
    router = APIRouter()

    def _auth(request: Request) -> Response | None:
        try:
            mcp.check_token(request.headers.get("authorization"), request.headers.get("x-mcp-token"))
        except McpDisabled as error:
            return JSONResponse(
                {"error": str(error)},
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        except McpUnauthorized as error:
            return JSONResponse(
                {"error": str(error)},
                status_code=401,
                headers={"WWW-Authenticate": 'Bearer realm="ai-agent-book"', "Cache-Control": "no-store"},
            )
        return None

    @router.post("/mcp")
    async def post(request: Request) -> Response:
        denied = _auth(request)
        if denied is not None:
            return denied
        content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
        if content_type != _JSON:
            return JSONResponse({"error": "Content-Type 必须是 application/json"}, status_code=415)
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY:
            return JSONResponse({"error": "请求体超过 1 MB"}, status_code=413)
        raw = await request.body()
        if len(raw) > MAX_BODY:
            return JSONResponse({"error": "请求体超过 1 MB"}, status_code=413)
        try:
            payload: Any = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            reply = parse_error()
            return JSONResponse(reply.body or {}, status_code=reply.status, headers=reply.headers)
        session_id = request.headers.get("mcp-session-id")
        protocol_header = request.headers.get("mcp-protocol-version")
        cancel = threading.Event()
        done = threading.Event()

        async def watch_disconnect() -> None:
            try:
                while not done.is_set():
                    if await request.is_disconnected():
                        log.debug("mcp client disconnected; cancelling request")
                        cancel.set()
                        return
                    await asyncio.sleep(0.4)
            except asyncio.CancelledError:
                return
            except Exception as error:  # noqa: BLE001 - 断线检测失败不能影响请求本身
                log.debug("mcp disconnect watcher stopped: %r", error)
                return

        watcher = asyncio.create_task(watch_disconnect())
        try:
            reply = await run_in_threadpool(
                mcp.handle,
                payload,
                session_id=session_id,
                protocol_header=protocol_header,
                client_cancel=cancel,
            )
        except asyncio.CancelledError:
            cancel.set()
            raise
        finally:
            done.set()
            watcher.cancel()
        if reply.body is None:
            return Response(status_code=reply.status, headers=reply.headers)
        return JSONResponse(reply.body, status_code=reply.status, headers=reply.headers)

    @router.get("/mcp")
    async def get() -> Response:
        return JSONResponse(
            {"error": "MCP 使用 POST JSON-RPC；本服务不提供 GET 服务器主动流"},
            status_code=405,
            headers={"Allow": "POST, DELETE"},
        )

    @router.delete("/mcp")
    async def delete(request: Request) -> Response:
        denied = _auth(request)
        if denied is not None:
            return denied
        mcp.end_session(request.headers.get("mcp-session-id"))
        return Response(status_code=204, headers={"Cache-Control": "no-store"})

    return router
