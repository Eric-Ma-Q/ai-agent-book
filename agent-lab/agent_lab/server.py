"""HTTP 服务：运行、SSE 事件流、对比、健康检查。返回统一的 {success, data, error}。"""

from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Iterator

from fastapi import APIRouter, FastAPI, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .config import AgentConfig, Settings, apply_overrides
from .knobs import knob_catalog
from .runtime import Lab
from .trace.store import new_run_id

log = logging.getLogger(__name__)
SSE_WAIT_S = 15.0
MAX_WORKERS = 4


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


class RunBody(BaseModel):
    question: str = Field(max_length=4000)
    config: dict[str, Any] = {}
    session_id: str | None = Field(default=None, max_length=64)


class CompareBody(BaseModel):
    question: str = Field(max_length=4000)
    configs: list[dict[str, Any]]


class LabService:
    """后台执行运行，并记录可取消的运行。"""

    def __init__(self, lab: Lab):
        self.lab = lab
        self.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="run")
        self.cancels: dict[str, threading.Event] = {}

    def active_runs(self) -> set[str]:
        """本进程还挂着的运行：会话恢复与追问上下文用它区分进行中与已中断。"""
        return set(self.cancels)

    def config_from(self, overrides: dict[str, Any]) -> AgentConfig:
        try:
            base = AgentConfig(
                model=self.lab.settings.model,
                max_output_tokens=self.lab.settings.max_output_tokens,
            )
            return self.lab.adapt_config(apply_overrides(base, overrides))
        except ValueError as error:
            raise ApiError(400, str(error)) from error

    def start(
        self,
        question: str,
        config: AgentConfig,
        session_id: str | None = None,
        meta: dict | None = None,
        prelude: str | None = None,
        system_prompt: str | None = None,
    ) -> str:
        if not question.strip():
            raise ApiError(400, "问题不能为空")
        run_id = new_run_id()
        cancel = threading.Event()
        started = threading.Event()
        self.cancels[run_id] = cancel

        def job() -> None:
            try:
                self.lab.run(
                    question.strip(), config, run_id=run_id, session_id=session_id, meta=meta, cancel=cancel,
                    on_event=lambda _event: started.set(), prelude=prelude, system_prompt=system_prompt,
                    active_runs=self.active_runs(),
                )
            except Exception:  # noqa: BLE001 - 后台任务出错只能记日志
                log.exception("run %s crashed", run_id)
            finally:
                started.set()
                self.cancels.pop(run_id, None)

        self.executor.submit(job)
        started.wait(timeout=10)  # 返回时 run_start 已写入，前端可以立即读取
        return run_id

    def validate_id(self, run_id: str) -> None:
        try:
            self.lab.store.path(run_id)
        except ValueError as error:
            raise ApiError(400, str(error)) from error

    def events(self, run_id: str) -> list[dict[str, Any]]:
        try:
            return [e.model_dump(mode="json") for e in self.lab.store.read(run_id)]
        except ValueError as error:
            raise ApiError(400, str(error)) from error
        except FileNotFoundError as error:
            raise ApiError(404, str(error)) from error

    def stream(self, run_id: str, after: int) -> Iterator[str]:
        while True:
            events = self.lab.store.wait(run_id, after, timeout=SSE_WAIT_S)
            if not events:
                yield ": keep-alive\n\n"
                continue
            for event in events:
                data = json.dumps(event.model_dump(mode="json"), ensure_ascii=False)
                yield f"id: {event.seq}\nevent: {event.type}\ndata: {data}\n\n"
                after = (event.seq or 0) + 1
                if event.type == "run_end":
                    return


def run_routes(service: LabService) -> APIRouter:
    router = APIRouter()
    lab = service.lab

    @router.get("/health")
    def health() -> dict:
        llm: dict[str, Any] = {"base_url": lab.settings.llm_base_url}
        try:
            config = lab.adapt_config(
                AgentConfig(model=lab.settings.model, max_output_tokens=lab.settings.max_output_tokens)
            )
            client = lab.client_for(config)
        except Exception as error:  # noqa: BLE001 - 档案损坏也要能打开模型页
            llm.update(ok=False, error=f"{type(error).__name__}: {error}")
            return ok({"llm": llm, "book_chapters": sorted(lab.book.chapters), "default_model": lab.settings.model})
        llm["base_url"] = getattr(client, "base_url", lab.settings.llm_base_url)
        llm["default_model"] = config.model
        list_models = getattr(client, "list_models", None)
        try:
            llm.update(ok=True, models=list_models() if callable(list_models) else None)
        except Exception as error:  # noqa: BLE001 - 健康检查要报告任何连接问题
            llm.update(ok=False, error=f"{type(error).__name__}: {error}")
        profiles: dict[str, Any] = {"default": None, "count": 0}
        if lab.models is not None:
            try:
                catalog = lab.models.catalog()
                profiles = {"default": catalog.default, "count": len(catalog.profiles)}
            except Exception:  # noqa: BLE001 - 损坏信息由 /models 给出
                profiles = {"default": None, "count": 0, "error": "模型档案文件无法读取"}
        return ok(
            {
                "llm": llm,
                "book_chapters": sorted(lab.book.chapters),
                "default_model": config.model,
                "model_profiles": profiles,
            }
        )

    @router.get("/knobs")
    def knobs() -> dict:
        return ok(knob_catalog(lab.registry.names()))

    @router.post("/runs")
    def create_run(body: RunBody) -> dict:
        run_id = service.start(body.question, service.config_from(body.config), session_id=body.session_id)
        return ok({"run_id": run_id})

    @router.get("/runs")
    def list_runs(limit: int = 50) -> dict:
        return ok(lab.store.list_runs(limit=min(max(limit, 1), 500)))

    @router.get("/runs/{run_id}")
    def get_run(run_id: str) -> dict:
        return ok({"run_id": run_id, "events": service.events(run_id)})

    @router.get("/runs/{run_id}/events")
    def stream(run_id: str, after: int = 0, last_event_id: str | None = Header(default=None)) -> StreamingResponse:
        service.validate_id(run_id)
        start = int(last_event_id) + 1 if last_event_id and last_event_id.isdigit() else after
        headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        return StreamingResponse(service.stream(run_id, start), media_type="text/event-stream", headers=headers)

    @router.post("/runs/{run_id}/cancel")
    def cancel(run_id: str) -> dict:
        event = service.cancels.get(run_id)
        if event is None:
            raise ApiError(404, "运行不存在或已经结束")
        event.set()
        return ok({"run_id": run_id})

    @router.post("/compare")
    def compare(body: CompareBody) -> dict:
        if len(body.configs) != 2:
            raise ApiError(400, "对比需要恰好两套配置")
        configs = [service.config_from(c) for c in body.configs]
        meta = {"source": "compare"}
        return ok({"run_ids": [service.start(body.question, cfg, meta=meta) for cfg in configs]})

    return router


def create_app(settings: Settings, lab: Lab | None = None) -> FastAPI:
    lab = lab or Lab.create(settings)
    service = LabService(lab)
    app = FastAPI(title="agent-lab", docs_url="/docs")
    app.state.service = service

    @app.exception_handler(ApiError)
    async def api_error(_request: Request, error: ApiError) -> JSONResponse:
        return JSONResponse({"success": False, "data": None, "error": str(error)}, status_code=error.status)

    app.include_router(run_routes(service))
    from .model_routes import model_routes
    from .interview_routes import interview_routes
    from .page_routes import page_routes
    from .server_extra import extra_routes
    from .security.campaign import SecurityService
    from .security.routes import install_error_handler, security_routes

    app.include_router(model_routes(service))
    app.include_router(interview_routes(service))
    app.include_router(page_routes(service))
    security = SecurityService(lab)
    app.state.security = security
    install_error_handler(app)
    app.include_router(security_routes(security))
    from .mcp.routes import mcp_routes
    from .mcp.service import McpService

    mcp = McpService(service, settings)
    app.state.mcp = mcp
    app.include_router(mcp_routes(mcp))
    for router in extra_routes(service):
        app.include_router(router)
    return app
