"""随页问答接口（需求 016）。

客户端把页面快照、截图和问题发过来；本模块校验、落盘截图，然后用现有 ReAct
循环跑一个页面助手。轨迹和 SSE 复用 /runs 的实现，不另起服务。
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import re
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .page import PageContext, PageError, page_config_overrides
from .prompts import page_prompt
from .trace.schema import Info, LlmRequest, LlmResponse, RunEnd, RunStart, ToolCall
from .trace.store import new_run_id

log = logging.getLogger(__name__)
MAX_QUESTION = 4000
MAX_SCREENSHOT_CHARS = 4_000_000
MAX_SCREENSHOT_BYTES = 2_500_000
MAX_SESSION_RUNS = 60
RUN_ID = re.compile(r"^[a-z0-9-]{8,40}$")
SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{6,80}$")
PROFILE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,39}$")
IMAGE = re.compile(r"^data:(image/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$", re.IGNORECASE)


class FocusBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    blockIndex: int = Field(ge=1)
    role: Literal["figure", "table"]
    caption: str = Field(default="", max_length=300)


class PageRunBody(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION)
    page: dict[str, Any]
    screenshot: str | None = Field(default=None, max_length=MAX_SCREENSHOT_CHARS)
    modelProfile: str = Field(default="", max_length=40)
    reasoningLevel: str = Field(default="", max_length=40)
    sessionId: str | None = Field(default=None, max_length=80)
    sendScreenshot: bool = True
    mode: Literal["ask", "check", "map"] = "ask"
    focus: FocusBody | None = None

    @field_validator("question")
    @classmethod
    def _question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("问题不能为空")
        return value

    @field_validator("modelProfile")
    @classmethod
    def _profile(cls, value: str) -> str:
        value = value.strip()
        if value and not PROFILE_ID.match(value):
            raise ValueError("modelProfile 不合法")
        return value

    @field_validator("reasoningLevel")
    @classmethod
    def _reasoning(cls, value: str) -> str:
        return value.strip()

    @field_validator("sessionId")
    @classmethod
    def _session(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if not SESSION_ID.match(value):
            raise ValueError("sessionId 不合法")
        return value


def _decode_screenshot(raw: str | None) -> tuple[str, bytes] | None:
    if not raw:
        return None
    match = IMAGE.match(raw.strip())
    if not match:
        raise ValueError("截图必须是 data:image/jpeg、png 或 webp 的 base64")
    mime = match.group(1).lower().replace("jpg", "jpeg")
    try:
        data = base64.b64decode(match.group(2), validate=False)
    except (binascii.Error, ValueError) as error:
        raise ValueError("截图的 base64 无法解码") from error
    if not data:
        raise ValueError("截图内容为空")
    if len(data) > MAX_SCREENSHOT_BYTES:
        raise ValueError(f"截图超过 {MAX_SCREENSHOT_BYTES} 字节")
    return mime, data


def _image_size(data: bytes, mime: str) -> tuple[int, int]:
    if mime == "image/png" and data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if mime != "image/jpeg" or not data.startswith(b"\xff\xd8"):
        return 0, 0
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if index + 2 > len(data):
            break
        length = int.from_bytes(data[index : index + 2], "big")
        if length < 2:
            break
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            if index + 7 <= len(data):
                height = int.from_bytes(data[index + 3 : index + 5], "big")
                width = int.from_bytes(data[index + 5 : index + 7], "big")
                return width, height
            break
        index += length
    return 0, 0


def _extension(mime: str) -> str:
    return {"image/png": "png", "image/webp": "webp"}.get(mime, "jpg")


def _safe_error(error: Exception) -> str:
    message = str(error).replace("\n", " ").strip()
    message = re.sub(r"sk-[A-Za-z0-9_-]{6,}", "***", message)
    return message[:400] or type(error).__name__


def _page_meta(start: RunStart) -> dict[str, Any]:
    meta = start.meta if isinstance(start.meta, dict) else {}
    page = meta.get("page") if isinstance(meta.get("page"), dict) else {}
    section = page.get("section") if isinstance(page.get("section"), dict) else {}
    try:
        percent = float(page.get("scroll_ratio") or 0)
    except (TypeError, ValueError):
        percent = 0.0
    url = str(page.get("url") or "")
    try:
        path = urlsplit(url).path if url else ""
    except ValueError:
        path = ""
    return {
        "title": str(page.get("title") or ""),
        "section": str(section.get("title") or ""),
        "percent": max(0.0, min(1.0, percent)),
        "path": path,
    }


def _session_runs(store, session_id: str, limit: int = MAX_SESSION_RUNS) -> list[dict[str, Any]]:
    """从服务端轨迹重建一次面板会话，供「继续对话」回看。

    只带问题、回答和运行元信息，不带工具轨迹与模型请求；正文仍以轨迹为准，
    面板不额外保存对话内容。
    """
    summaries = store.session_runs(session_id)[-max(1, limit) :]
    runs: list[dict[str, Any]] = []
    for summary in summaries:
        try:
            events = store.read(summary["run_id"])
        except (FileNotFoundError, ValueError):
            continue
        start = next((event for event in events if isinstance(event, RunStart)), None)
        end = next((event for event in events if isinstance(event, RunEnd)), None)
        if start is None:
            continue
        runs.append(
            {
                "runId": summary["run_id"],
                "question": start.question,
                "answer": (end.answer if end else "") or "",
                "status": end.status if end else "error",
                "error": (end.error if end else "") or "",
                "citations": list(end.citations) if end else [],
                "totals": dict(end.totals) if end else {},
                "startedAt": start.ts or "",
                "page": _page_meta(start),
            }
        )
    return runs


_BASE64 = re.compile(r"data:[^;\s]+;base64,[A-Za-z0-9+/=]+")
_SECRET = re.compile(r"sk-[A-Za-z0-9_-]{6,}")


def _clip(value: Any, limit: int) -> str:
    text = _BASE64.sub("[图片数据]", str(value or ""))
    text = _SECRET.sub("***", text)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}…（已截断，原 {len(text)} 字）"


def _tool_name(tool: Any) -> str:
    if not isinstance(tool, dict):
        return ""
    fn = tool.get("function")
    if isinstance(fn, dict) and fn.get("name"):
        return str(fn["name"])
    return str(tool.get("name") or "")


def _replay_payload(store, run_id: str) -> dict[str, Any]:
    """把一次随页问答轨迹投影成按轮次的摘要。

    只返回条数、工具名、用量与裁剪后的参数/结果；消息正文、页面正文和图片
    base64 都不出这个函数。
    """
    events = store.read(run_id)
    start = next((event for event in events if isinstance(event, RunStart)), None)
    if start is None:
        raise ValueError("找不到这次运行的起点")
    meta = start.meta if isinstance(start.meta, dict) else {}
    if meta.get("source") != "page-assistant":
        raise ValueError("这次运行不是随页问答")

    turns: dict[int, dict[str, Any]] = {}

    def slot(turn: int) -> dict[str, Any]:
        if turn not in turns:
            turns[turn] = {"turn": turn, "request": None, "response": None, "tools": [], "notes": []}
        return turns[turn]

    end: RunEnd | None = None
    for event in events:
        if isinstance(event, RunEnd):
            end = event
        elif isinstance(event, LlmRequest):
            current = slot(event.turn)
            current["request"] = {
                "messageCount": len(event.messages),
                "tools": [_tool_name(tool) for tool in (event.tools or [])],
                "segments": dict(event.segments or {}),
            }
        elif isinstance(event, LlmResponse):
            current = slot(event.turn)
            usage = {key: value for key, value in (event.usage or {}).items() if value is not None}
            current["response"] = {
                "latencyMs": int(event.latency_ms or 0),
                "usage": usage,
                "finishReason": event.finish_reason or "",
                "model": event.model or "",
                "error": _clip(event.error or "", 400),
                "retries": len(event.retries or []),
            }
        elif isinstance(event, ToolCall):
            current = slot(event.turn)
            current["tools"].append(
                {
                    "name": event.name,
                    "args": _clip(event.args or "", 600),
                    "result": _clip(event.result or "", 1200),
                    "durationMs": int(event.duration_ms or 0),
                    "error": _clip(event.error or "", 400),
                    "truncated": bool(event.truncated),
                }
            )
        elif isinstance(event, Info):
            current = slot(event.turn)
            current["notes"].append(
                {"kind": event.kind, "detail": _clip(json.dumps(event.detail or {}, ensure_ascii=False), 600)}
            )

    start_ts = start.ts or ""
    end_ts = end.ts if end and end.ts else ""
    duration = 0
    if start_ts and end_ts:
        try:
            duration = max(0, int((datetime.fromisoformat(end_ts) - datetime.fromisoformat(start_ts)).total_seconds() * 1000))
        except ValueError:
            duration = 0
    return {
        "runId": run_id,
        "question": _clip(start.question, 500),
        "model": str((start.config or {}).get("model") or ""),
        "status": end.status if end else "error",
        "startedAt": start_ts,
        "endedAt": end_ts,
        "durationMs": duration,
        "totals": dict(end.totals or {}) if end else {},
        "turns": [turns[key] for key in sorted(turns)][:40],
        "answer": _clip(end.answer or "", 2000) if end else "",
        "citations": list(end.citations or []) if end else [],
        "error": _clip(end.error or "", 400) if end else "这次运行没有正常结束",
    }


def page_routes(service) -> APIRouter:
    router = APIRouter()

    def _data_dir() -> Path:
        return Path(service.lab.settings.data_dir) / "page-assistant"

    def _start(body: PageRunBody) -> dict[str, Any]:
        from .server import ApiError

        focus_index = body.focus.blockIndex if body.focus is not None else None
        try:
            page = PageContext.from_snapshot(body.page, focus_index=focus_index)
        except PageError as error:
            raise ApiError(400, str(error)) from error

        if body.mode == "map":
            if page.snapshot.chapter.number is None:
                raise ApiError(400, "概念图只在章节页可用")
            if body.focus is not None:
                raise ApiError(400, "概念图不接受聚焦元素")
        focus_block = None
        if body.focus is not None:
            focus_block = page.blocks_by_index.get(body.focus.blockIndex)
            if focus_block is None:
                raise ApiError(400, "聚焦的块不在页面快照里，请重新采集页面")
            if focus_block.role != body.focus.role:
                raise ApiError(400, "聚焦类型与页面块不一致")

        model_profile = body.modelProfile
        try:
            config = service.config_from(page_config_overrides(model_profile, body.mode))
        except Exception as error:
            if hasattr(error, "status"):
                raise
            raise ApiError(400, f"模型配置不合法：{_safe_error(error)}") from error

        profile = service.lab.profile_for(config)
        vision = bool(profile and "image" in profile.input_types)
        level = body.reasoningLevel
        if level:
            if profile is None:
                raise ApiError(400, "当前模型没有思考强度配置，无法指定档位")
            if profile.reasoning.level(level) is None:
                raise ApiError(400, f"模型档案没有名为「{level}」的思考档位")
        reasoning: dict[str, Any] | None = None
        if profile is not None:
            extra = profile.reasoning.extra_for(level or None)
            reasoning = {
                "level": level or (profile.reasoning.default or ""),
                "parameter": profile.reasoning.parameter if extra else "",
                "value": extra.get(profile.reasoning.parameter) if extra else None,
                "source": "panel" if level else "profile",
            }
        try:
            screenshot = _decode_screenshot(body.screenshot) if (body.sendScreenshot and body.mode != "map") else None
        except ValueError as error:
            raise ApiError(400, f"截图不合法：{error}") from error
        screenshot_url = ""
        width = height = 0
        image: tuple[str, bytes] | None = None
        if screenshot is not None:
            mime, data = screenshot
            width, height = _image_size(data, mime)
            image = (mime, data)

        run_id = new_run_id()
        if image is not None:
            mime, data = image
            folder = _data_dir() / run_id
            folder.mkdir(parents=True, exist_ok=True)
            name = f"screenshot.{_extension(mime)}"
            (folder / name).write_bytes(data)
            screenshot_url = f"/__lab/page/screenshots/{run_id}"
            screenshot_path = folder / name
        else:
            screenshot_path = None

        page.screenshot_available = image is not None
        page.screenshot_url = screenshot_url
        page.screenshot_bytes = len(image[1]) if image else 0
        page.screenshot_width = width
        page.screenshot_height = height
        page.screenshot_kind = "element" if focus_block is not None else "viewport"
        page.vision = vision and image is not None

        if screenshot_path is not None:
            try:
                (screenshot_path.parent / "page.json").write_text(
                    json.dumps(
                        {
                            "question": body.question,
                            "mode": body.mode,
                            "focus": body.focus.model_dump() if body.focus is not None else None,
                            "page": page.meta(),
                            "stats": page.stats.__dict__,
                            "screenshot": {
                                "url": screenshot_url,
                                "bytes": page.screenshot_bytes,
                                "width": width,
                                "height": height,
                                "kind": page.screenshot_kind,
                                "vision": page.vision,
                            },
                            "model": config.model,
                            "reasoning": reasoning,
                        },
                        ensure_ascii=False,
                        indent=1,
                    ),
                    encoding="utf8",
                )
            except OSError as error:
                log.warning("page assistant: could not write page.json: %s", error)

        meta = {
            "source": "page-assistant",
            "mode": body.mode,
            "page": page.meta(),
            "screenshot": {
                "url": screenshot_url,
                "bytes": page.screenshot_bytes,
                "kind": page.screenshot_kind,
                "vision": page.vision,
            },
        }
        if body.focus is not None:
            meta["focus"] = body.focus.model_dump()
        if reasoning is not None:
            meta["reasoning"] = reasoning
        images = (
            [f"data:{image[0]};base64,{base64.b64encode(image[1]).decode('ascii')}"]
            if (body.mode != "map" and vision and body.sendScreenshot and image is not None)
            else []
        )
        cancel = threading.Event()
        started = threading.Event()
        service.cancels[run_id] = cancel

        def job() -> None:
            try:
                service.lab.run(
                    body.question,
                    config,
                    run_id=run_id,
                    session_id=body.sessionId,
                    meta=meta,
                    cancel=cancel,
                    page=page,
                    system_prompt=page_prompt(body.mode),
                    prelude=page.prelude(mode=body.mode, focus=focus_block),
                    images=images,
                    reasoning_level=level or None,
                    on_event=lambda _event: started.set(),
                )
            except Exception:  # noqa: BLE001 - 后台任务出错只能记日志，SSE 会读到已写入的事件
                log.exception("page assistant run %s crashed", run_id)
            finally:
                started.set()
                service.cancels.pop(run_id, None)

        service.executor.submit(job)
        started.wait(timeout=10)
        return {
            "run_id": run_id,
            "screenshot_url": screenshot_url,
            "vision": page.vision,
            "page": page.meta(),
            "mode": body.mode,
            "focus": body.focus.model_dump() if body.focus is not None else None,
            "model": config.model,
            "modelProfile": config.model_profile,
            "reasoningLevel": reasoning["level"] if reasoning else "",
        }

    @router.post("/page/runs")
    def create_page_run(body: PageRunBody) -> dict:
        return {"success": True, "data": _start(body), "error": None}

    @router.get("/page/screenshots/{run_id}")
    def get_screenshot(run_id: str):
        if not RUN_ID.match(run_id):
            raise HTTPException(status_code=404, detail="screenshot not found")
        folder = (_data_dir() / run_id).resolve()
        base = _data_dir().resolve()
        if not folder.is_relative_to(base):
            raise HTTPException(status_code=404, detail="screenshot not found")
        for name, media in (("screenshot.jpg", "image/jpeg"), ("screenshot.png", "image/png"), ("screenshot.webp", "image/webp")):
            path = folder / name
            if path.is_file():
                return FileResponse(path, media_type=media)
        raise HTTPException(status_code=404, detail="screenshot not found")

    @router.get("/page/sessions/{session_id}")
    def get_session(session_id: str) -> dict:
        """按会话重建面板问答，供读者选中历史对话后继续追问。"""
        from .server import ApiError

        if not SESSION_ID.match(session_id):
            raise ApiError(400, "sessionId 不合法")
        runs = _session_runs(service.lab.store, session_id)
        if not runs:
            raise ApiError(404, "找不到这次对话的记录，可能已在服务器上清理")
        return {"success": True, "data": {"sessionId": session_id, "runs": runs}, "error": None}

    @router.get("/page/runs/{run_id}/session")
    def get_run_session(run_id: str) -> dict:
        """旧版本机历史没有 sessionId，用 run_id 反查同一次对话。"""
        from .server import ApiError

        if not RUN_ID.match(run_id):
            raise ApiError(404, "找不到这次运行")
        try:
            events = service.lab.store.read(run_id)
        except FileNotFoundError as error:
            raise ApiError(404, "找不到这次运行，可能已在服务器上清理") from error
        except ValueError as error:
            raise ApiError(404, str(error)) from error
        start = next((event for event in events if isinstance(event, RunStart)), None)
        session_id = start.session_id if start else None
        if not session_id:
            raise ApiError(404, "这次运行没有会话信息，无法继续")
        runs = _session_runs(service.lab.store, session_id)
        if not runs:
            raise ApiError(404, "找不到这次对话的记录，可能已在服务器上清理")
        return {"success": True, "data": {"sessionId": session_id, "runs": runs}, "error": None}

    @router.get("/page/runs/{run_id}/replay")
    def get_replay(run_id: str) -> dict:
        """按轮次回放一次随页问答；只返回摘要，不返回消息正文。"""
        from .server import ApiError

        if not RUN_ID.match(run_id):
            raise ApiError(404, "找不到这次运行")
        try:
            data = _replay_payload(service.lab.store, run_id)
        except FileNotFoundError as error:
            raise ApiError(404, "这次运行的轨迹已清理，无法回放") from error
        except ValueError as error:
            raise ApiError(404, str(error)) from error
        return {"success": True, "data": data, "error": None}

    return router
