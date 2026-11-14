"""确认动作、评估、学习规则的路由。"""

from __future__ import annotations

import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from .gate import GateError
from .trace.schema import Gate

if TYPE_CHECKING:
    from .server import LabService

log = logging.getLogger(__name__)
MAX_TRIALS = 10


class EvalBody(BaseModel):
    suite: str
    trials: int = Field(default=3, ge=1, le=MAX_TRIALS)
    config: dict[str, Any] = {}
    label: str | None = Field(default=None, max_length=100)


class AbBody(BaseModel):
    suite: str
    trials: int = Field(default=3, ge=1, le=MAX_TRIALS)
    configs: list[dict[str, Any]]
    label: str | None = Field(default=None, max_length=100)
    tasks: list[str] | None = Field(default=None, max_length=200)  # 只跑这些任务（同 eval --task）
    concurrency: int = Field(default=2, ge=1, le=4)  # 免费模型接口容易限流时调低


class PromoteBody(BaseModel):
    run_id: str


class ImproveBody(BaseModel):
    eval_id: str
    trials: int = Field(default=2, ge=1, le=5)


def _ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def _api_error(status: int, message: str):
    from .server import ApiError

    return ApiError(status, message)


def action_routes(service: "LabService") -> APIRouter:
    router = APIRouter()
    lab = service.lab

    def gate():
        store = lab.extras.get("gate")
        if store is None:
            raise _api_error(503, "确认门禁未启用")
        return store

    def handle(action_id: str, approve: bool) -> dict:
        try:
            action = gate().approve(action_id) if approve else gate().reject(action_id)
        except GateError as error:
            raise _api_error(409 if "状态" in str(error) else 404, str(error)) from error
        if lab.store.exists(action.run_id):
            lab.store.append(action.run_id, Gate(action_id=action.action_id, kind=action.kind, payload=action.payload, status=action.status, detail=action.detail))
        return _ok(action.model_dump())

    @router.get("/actions")
    def list_actions(status: str | None = None) -> dict:
        return _ok([a.model_dump() for a in gate().list(status)])

    @router.post("/actions/{action_id}/approve")
    def approve(action_id: str) -> dict:
        return handle(action_id, approve=True)

    @router.post("/actions/{action_id}/reject")
    def reject(action_id: str) -> dict:
        return handle(action_id, approve=False)

    return router


class EvalService:
    """后台串行执行评估（免费接口容易限流，评估之间不并行；评估内部并发 2）。"""

    def __init__(self, service: "LabService"):
        from evals.runner import EvalRunner

        self.lab = service.lab
        self.out_root = Path(self.lab.settings.data_dir) / "evals"
        self.runner = EvalRunner(self.lab, self.out_root)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="eval")
        self.config_from = service.config_from

    @property
    def regressions_dir(self) -> Path:
        from evals.tasks import REGRESSIONS_DIR

        return self.runner.regressions_dir or REGRESSIONS_DIR

    def submit(self, request) -> str:
        eval_id = self.runner.queue(request)  # 校验并写入 queued 报告，错误立即返回给调用方

        def job() -> None:
            try:
                self.runner.run(request, eval_id=eval_id)
            except Exception:  # noqa: BLE001
                log.exception("eval %s failed", eval_id)

        self.executor.submit(job)
        return eval_id

    def reports(self) -> list[dict[str, Any]]:
        if not self.out_root.exists():
            return []
        reports = []
        for path in sorted(self.out_root.glob("*/report.json"), reverse=True):
            try:
                reports.append(json.loads(path.read_text("utf8")))
            except ValueError:
                continue  # 正在写入
        return reports

    def report(self, eval_id: str) -> dict[str, Any]:
        path = self.out_root / eval_id / "report.json"
        if not eval_id.replace("-", "").isalnum() or not path.exists():
            raise _api_error(404, f"评估 {eval_id} 不存在")
        return json.loads(path.read_text("utf8"))


def _listing(report: dict[str, Any]) -> dict[str, Any]:
    arms = [{"name": a["name"], "pass_rate": a["summary"]["pass_rate"], "wilson": a["summary"]["wilson"]} for a in report["arms"]]
    keys = ("eval_id", "label", "suite", "created_at", "finished_at", "status", "progress", "comparison")
    return {**{k: report.get(k) for k in keys}, "arms": arms}


def _trend(reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    points = []
    for report in reports:
        if report.get("status") != "done":
            continue
        for arm in report["arms"]:
            s = arm["summary"]
            points.append({
                "eval_id": report["eval_id"], "created_at": report["created_at"], "label": report.get("label"),
                "arm": arm["name"], "model": arm["config"]["model"], "config_hash": arm["config_hash"],
                "pass_rate": s["pass_rate"], "wilson": s["wilson"], "cost_per_success": s["cost_per_success"],
                "reference_cost_per_success": s["reference_cost_per_success"], "latency_p95_ms": s["latency_p95_ms"],
            })
    return sorted(points, key=lambda p: p["created_at"])


def eval_routes(service: "LabService", evals: EvalService) -> APIRouter:
    from evals.promote import promote
    from evals.runner import Arm, EvalRequest
    from evals.tasks import list_suites

    router = APIRouter()

    def checked(request) -> str:
        try:
            return evals.submit(request)
        except ValueError as error:
            raise _api_error(400, str(error)) from error

    @router.get("/evals/suites")
    def suites() -> dict:
        return _ok(list_suites(evals.runner.tasks_root))

    @router.post("/evals")
    def start(body: EvalBody) -> dict:
        arm = Arm("A", evals.config_from(body.config))
        return _ok({"eval_id": checked(EvalRequest(suite=body.suite, arms=(arm,), trials=body.trials, label=body.label or ""))})

    @router.post("/evals/ab")
    def start_ab(body: AbBody) -> dict:
        if len(body.configs) != 2:
            raise _api_error(400, "A/B 评估需要恰好两套配置")
        arms = (Arm("A", evals.config_from(body.configs[0])), Arm("B", evals.config_from(body.configs[1])))
        request = EvalRequest(
            suite=body.suite, arms=arms, trials=body.trials, label=body.label or "",
            concurrency=body.concurrency, task_ids=tuple(body.tasks) if body.tasks else None,
        )
        return _ok({"eval_id": checked(request)})

    @router.get("/evals")
    def list_evals() -> dict:
        return _ok([_listing(r) for r in evals.reports()])

    @router.get("/evals/trend")
    def trend() -> dict:
        return _ok(_trend(evals.reports()))

    @router.post("/evals/promote")
    def promote_run(body: PromoteBody) -> dict:
        try:
            return _ok(promote(body.run_id, service.lab.store, regressions_dir=evals.regressions_dir, tasks_root=evals.runner.tasks_root))
        except FileNotFoundError as error:
            raise _api_error(404, str(error)) from error
        except ValueError as error:
            raise _api_error(400, str(error)) from error

    @router.post("/evals/{eval_id}/rescore")
    def rescore_eval(eval_id: str) -> dict:
        from evals.rescore import rescore

        source = evals.report(eval_id)
        if source.get("status") != "done":
            raise _api_error(400, "评估尚未完成")
        report = rescore(source, service.lab, evals.out_root, tasks_root=evals.runner.tasks_root)
        return _ok({"eval_id": report["eval_id"]})

    @router.get("/evals/{eval_id}")
    def get_eval(eval_id: str) -> dict:
        return _ok(evals.report(eval_id))

    return router


def rule_routes(service: "LabService", evals: EvalService) -> APIRouter:
    from evals.improve import Improver, adopt, list_candidates

    router = APIRouter()
    lab = service.lab
    candidates_dir = Path(lab.settings.data_dir) / "rules_candidates"

    def rules():
        store = lab.extras.get("rules")
        if store is None:
            raise _api_error(503, "学习规则未启用")
        return store

    @router.get("/rules")
    def get_rules() -> dict:
        return _ok(rules().state())

    @router.post("/rules/{version}/activate")
    def activate(version: int) -> dict:
        try:
            return _ok(rules().activate(version))
        except ValueError as error:
            raise _api_error(404, str(error)) from error

    @router.get("/rules/candidates")
    def candidates() -> dict:
        return _ok(list_candidates(candidates_dir))

    @router.post("/rules/candidates/{candidate_id}/adopt")
    def adopt_candidate(candidate_id: str) -> dict:
        try:
            return _ok(adopt(candidates_dir, candidate_id, rules()))
        except ValueError as error:
            raise _api_error(400, str(error)) from error

    @router.post("/rules/improve")
    def improve(body: ImproveBody) -> dict:
        report = evals.report(body.eval_id)
        if report.get("status") != "done":
            raise _api_error(400, "评估尚未完成")
        config = service.config_from(report["arms"][0]["config"])
        improver = Improver(evals.runner, rules(), lab.client, config.model, candidates_dir)

        def job() -> None:
            try:
                improver.run(report, config, trials=body.trials)
            except Exception:  # noqa: BLE001
                log.exception("improve from %s failed", body.eval_id)

        threading.Thread(target=job, name="improve", daemon=True).start()
        return _ok({"job": "started"})

    return router


def extra_routes(service: "LabService") -> list[APIRouter]:
    evals = EvalService(service)
    service.evals = evals  # type: ignore[attr-defined]
    return [action_routes(service), eval_routes(service, evals), rule_routes(service, evals)]
