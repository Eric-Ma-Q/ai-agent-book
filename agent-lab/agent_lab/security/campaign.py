"""提示注入 campaign 的编排、报告存储与取消。"""

from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..config import AgentConfig
from ..models import ModelError
from ..runtime import Lab, git_sha
from ..trace.store import RUN_ID, new_run_id
from .agent import SecurityAgent, SessionResult
from .catalog import (
    MAX_TOTAL_TRIALS,
    MAX_TRIALS_PER_CELL,
    PROTOCOL,
    AttackSpec,
    DefenseSpec,
    attack_by_id,
    catalog,
    defense_by_id,
)
from .judge import TrialTranscript, judge
from .tools import TrialWorkspace

CampaignStatus = Literal["queued", "running", "done", "cancelled", "failed", "interrupted"]
TrialStatus = Literal["done", "error", "budget_exceeded", "max_turns", "cancelled", "skipped"]


class SecurityError(Exception):
    status = 400


class NotFoundError(SecurityError):
    status = 404


class ConflictError(SecurityError):
    status = 409


class SecurityConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_profile: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=200)
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)


class CampaignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attacks: list[str] = Field(min_length=1, max_length=3)
    defenses: list[str] = Field(min_length=1, max_length=4)
    trials: int = Field(default=1, ge=1, le=MAX_TRIALS_PER_CELL)
    label: str = Field(default="", max_length=80)
    config: SecurityConfig = Field(default_factory=SecurityConfig)


class TrialResult(BaseModel):
    attack: str
    defense: str
    trial: int
    status: TrialStatus
    success: bool
    verdict: str
    reason: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    run_ids: list[str] = Field(default_factory=list)
    llm_calls: int = 0
    tokens: int = 0
    cost: float | None = None
    latency_ms: int = 0
    answer_excerpt: str = ""
    error: str | None = None


class CellResult(BaseModel):
    attack: str
    defense: str
    trials: int
    done: int = 0
    successes: int = 0
    errors: int = 0
    skipped: int = 0
    success_rate: float | None = None
    avg_cost: float | None = None
    avg_latency_ms: int | None = None
    results: list[TrialResult] = Field(default_factory=list)


class CampaignReport(BaseModel):
    version: int = 1
    protocol: str = PROTOCOL
    campaign_id: str
    status: CampaignStatus
    label: str = ""
    git_sha: str | None = None
    created_at: str
    finished_at: str | None = None
    model: dict[str, Any]
    selection: dict[str, Any]
    progress: dict[str, int]
    totals: dict[str, Any]
    cells: list[CellResult]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class SecurityStore:
    def __init__(self, data_dir: Path):
        self.root = Path(data_dir) / "security"
        self.campaigns = self.root / "campaigns"
        self.workspaces = self.root / "workspaces"

    def path(self, campaign_id: str) -> Path:
        if not RUN_ID.match(campaign_id):
            raise SecurityError(f"非法的 campaign_id：{campaign_id!r}")
        return self.campaigns / f"{campaign_id}.json"

    def write(self, report: CampaignReport) -> None:
        path = self.path(report.campaign_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(report.model_dump_json(indent=2) + "\n", encoding="utf8")
        temporary.replace(path)

    def read(self, campaign_id: str) -> CampaignReport:
        path = self.path(campaign_id)
        if not path.exists():
            raise NotFoundError(f"实验 {campaign_id} 不存在")
        try:
            return CampaignReport.model_validate(json.loads(path.read_text(encoding="utf8")))
        except (OSError, ValueError) as error:
            raise SecurityError(f"实验报告损坏：{error}") from error

    def list(self, limit: int = 20) -> list[dict[str, Any]]:
        if not self.campaigns.exists():
            return []
        reports: list[CampaignReport] = []
        for path in sorted(self.campaigns.glob("*.json"), reverse=True)[: max(1, min(limit, 50))]:
            try:
                reports.append(CampaignReport.model_validate(json.loads(path.read_text(encoding="utf8"))))
            except (OSError, ValueError):
                continue
        return [self.summary(report) for report in reports]

    @staticmethod
    def summary(report: CampaignReport) -> dict[str, Any]:
        results = [item for cell in report.cells for item in cell.results if item.status != "skipped"]
        successes = sum(1 for item in results if item.success)
        return {
            "campaign_id": report.campaign_id,
            "status": report.status,
            "label": report.label,
            "created_at": report.created_at,
            "finished_at": report.finished_at,
            "model": report.model,
            "trials": report.selection.get("trials", 0),
            "attacks": len(report.selection.get("attacks", [])),
            "defenses": len(report.selection.get("defenses", [])),
            "progress": report.progress,
            "overall_success_rate": (successes / len(results)) if results else None,
        }

    def recover(self) -> None:
        if not self.campaigns.exists():
            return
        for path in self.campaigns.glob("*.json"):
            try:
                report = CampaignReport.model_validate(json.loads(path.read_text(encoding="utf8")))
            except (OSError, ValueError):
                continue
            if report.status in ("queued", "running"):
                report.status = "interrupted"
                report.finished_at = _now()
                self.write(report)


class SecurityService:
    def __init__(self, lab: Lab, workers: int | None = None):
        self.lab = lab
        self.store = SecurityStore(lab.settings.data_dir)
        self.workers = max(1, min(int(workers or 2), 4))
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="security")
        self.cancels: dict[str, threading.Event] = {}
        self.lock = threading.RLock()
        self.store.recover()

    def catalog(self) -> dict[str, Any]:
        return catalog()

    def start(self, request: CampaignRequest) -> str:
        attacks = self._attacks(request.attacks)
        defenses = self._defenses(request.defenses)
        total = len(attacks) * len(defenses) * request.trials
        if total > MAX_TOTAL_TRIALS:
            raise SecurityError(f"一次实验最多 {MAX_TOTAL_TRIALS} 次试验，当前选择 {total} 次")
        with self.lock:
            if self.cancels:
                raise ConflictError("已有实验在运行，等它结束或取消后再开始")

            config, model = self._model_config(request.config)
            campaign_id = new_run_id()
            report = CampaignReport(
                campaign_id=campaign_id,
                status="queued",
                label=request.label.strip(),
                git_sha=git_sha(self.lab.settings.repo_root),
                created_at=_now(),
                model=model,
                selection={
                    "attacks": [item.id for item in attacks],
                    "defenses": [item.id for item in defenses],
                    "trials": request.trials,
                },
                progress={"done": 0, "total": total},
                totals={"runs": 0, "llm_calls": 0, "tokens": 0, "cost": 0.0},
                cells=[
                    CellResult(attack=attack.id, defense=defense.id, trials=request.trials)
                    for attack in attacks
                    for defense in defenses
                ],
            )
            self.store.write(report)
            cancel = threading.Event()
            self.cancels[campaign_id] = cancel
            self.executor.submit(self._run_campaign, report, attacks, defenses, config, model, cancel)
            return campaign_id

    def cancel(self, campaign_id: str) -> CampaignReport:
        report = self.store.read(campaign_id)
        event = self.cancels.get(campaign_id)
        if event is not None:
            event.set()
        return report

    def get(self, campaign_id: str) -> CampaignReport:
        return self.store.read(campaign_id)

    def list(self, limit: int = 20) -> list[dict[str, Any]]:
        return self.store.list(limit)

    def _attacks(self, values: list[str]) -> list[AttackSpec]:
        unique = list(dict.fromkeys(values))
        if not unique:
            raise SecurityError("至少选择一个攻击场景")
        try:
            return [attack_by_id(value) for value in unique]
        except ValueError as error:
            raise SecurityError(str(error)) from error

    def _defenses(self, values: list[str]) -> list[DefenseSpec]:
        unique = list(dict.fromkeys(values))
        if not unique:
            raise SecurityError("至少选择一个防御配置")
        try:
            return [defense_by_id(value) for value in unique]
        except ValueError as error:
            raise SecurityError(str(error)) from error

    def _model_config(self, request: SecurityConfig) -> tuple[AgentConfig, dict[str, Any]]:
        config = AgentConfig(
            model=request.model.strip() or self.lab.settings.model,
            model_profile=request.model_profile.strip(),
            max_output_tokens=self.lab.settings.max_output_tokens,
            temperature=request.temperature,
        )
        if request.model_profile.strip() and self.lab.profile_for(config) is None:
            raise SecurityError(f"模型档案不存在：{request.model_profile}")
        try:
            adapted = self.lab.adapt_config(config)
        except (ModelError, ValueError) as error:
            raise SecurityError(f"模型配置不可用：{error}") from error
        profile = self.lab.profile_for(adapted)
        return adapted, {
            "profile": adapted.model_profile,
            "model": adapted.model,
            "temperature": adapted.temperature,
            "name": profile.name if profile else None,
        }

    def _run_campaign(
        self,
        report: CampaignReport,
        attacks: list[AttackSpec],
        defenses: list[DefenseSpec],
        config: AgentConfig,
        model: dict[str, Any],
        cancel: threading.Event,
    ) -> None:
        with self.lock:
            report.status = "running"
            self.store.write(report)

        try:
            client = self.lab.client_for(config)
            price = self.lab.price_for(config)
            extra = self.lab.request_extra(config)
            sha = git_sha(self.lab.settings.repo_root)
            jobs = [(attack, defense, trial) for attack in attacks for defense in defenses for trial in range(1, report.selection["trials"] + 1)]

            results: list[TrialResult] = []
            with ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix="security-trial") as pool:
                futures = {
                    pool.submit(
                        self._run_trial,
                        report.campaign_id,
                        attack,
                        defense,
                        trial,
                        config,
                        client,
                        price,
                        extra,
                        sha,
                        cancel,
                    ): (attack, defense, trial)
                    for attack, defense, trial in jobs
                }
                for future in as_completed(futures):
                    attack, defense, trial = futures[future]
                    try:
                        result = future.result()
                    except Exception as error:  # noqa: BLE001 - 单个 trial 失败不能拖垮整场
                        result = TrialResult(
                            attack=attack.id,
                            defense=defense.id,
                            trial=trial,
                            status="error",
                            success=False,
                            verdict="error",
                            reason=f"试验执行出错：{type(error).__name__}",
                            error=f"{type(error).__name__}: {error}",
                        )
                    results.append(result)
                    with self.lock:
                        self._merge(report, result)
                        self.store.write(report)

            with self.lock:
                report.status = "cancelled" if cancel.is_set() else ("failed" if results and all(item.status == "error" for item in results) else "done")
                if not results:
                    report.status = "failed" if cancel.is_set() is False else "cancelled"
                report.finished_at = _now()
                report.totals = self._totals(report)
                self.store.write(report)
        except Exception:  # noqa: BLE001 - 后台任务的最后兜底
            with self.lock:
                report.status = "failed"
                report.finished_at = _now()
                self.store.write(report)
        finally:
            with self.lock:
                self.cancels.pop(report.campaign_id, None)

    def _run_trial(
        self,
        campaign_id: str,
        attack: AttackSpec,
        defense: DefenseSpec,
        trial: int,
        config: AgentConfig,
        client: Any,
        price: Any,
        extra: dict[str, Any],
        sha: str | None,
        cancel: threading.Event,
    ) -> TrialResult:
        if cancel.is_set():
            return TrialResult(attack=attack.id, defense=defense.id, trial=trial, status="skipped", success=False, verdict="skipped", reason="实验已取消")
        workspace = TrialWorkspace(self.store.workspaces / campaign_id / f"{attack.id}-{defense.id}-{trial}")
        sessions: list[SessionResult] = []
        run_ids: list[str] = []
        statuses: list[TrialStatus] = []
        if attack.id == "memory":
            first = self._session(client, config, attack, defense, workspace, campaign_id, trial, 1, price, extra, sha, cancel)
            sessions.append(first)
            run_ids.append(first.run_id)
            statuses.append(self._trial_status(first))
            if first.status not in ("ok", "max_turns", "budget_exceeded"):
                return self._trial_result(attack, defense, trial, sessions, run_ids, workspace, statuses, None)
            second = self._session(client, config, attack, defense, workspace, campaign_id, trial, 2, price, extra, sha, cancel)
            sessions.append(second)
            run_ids.append(second.run_id)
            statuses.append(self._trial_status(second))
        else:
            session = self._session(client, config, attack, defense, workspace, campaign_id, trial, 1, price, extra, sha, cancel)
            sessions.append(session)
            run_ids.append(session.run_id)
            statuses.append(self._trial_status(session))
        final_text = sessions[-1].final_text if sessions else ""
        return self._trial_result(attack, defense, trial, sessions, run_ids, workspace, statuses, final_text)

    def _session(
        self,
        client: Any,
        config: AgentConfig,
        attack: AttackSpec,
        defense: DefenseSpec,
        workspace: TrialWorkspace,
        campaign_id: str,
        trial: int,
        session: int,
        price: Any,
        extra: dict[str, Any],
        sha: str | None,
        cancel: threading.Event,
    ) -> SessionResult:
        agent = SecurityAgent(
            client=client,
            config=config,
            defense=defense,
            attack=attack,
            workspace=workspace,
            store=self.lab.store,
            campaign_id=campaign_id,
            trial=trial,
            session=session,
            protocol=PROTOCOL,
            price=price,
            request_extra=extra,
            git_sha=sha,
            cancel=cancel,
        )
        messages = [attack.user_messages[session - 1]] if len(attack.user_messages) > 1 else attack.user_messages
        return agent.run(list(messages))

    @staticmethod
    def _trial_status(session: SessionResult) -> TrialStatus:
        return "done" if session.status == "ok" else "error" if session.status in ("llm_error", "error") else session.status  # type: ignore[return-value]

    def _trial_result(
        self,
        attack: AttackSpec,
        defense: DefenseSpec,
        trial: int,
        sessions: list[SessionResult],
        run_ids: list[str],
        workspace: TrialWorkspace,
        statuses: list[TrialStatus],
        final_text: str | None,
    ) -> TrialResult:
        priority = {"done": 0, "max_turns": 1, "budget_exceeded": 2, "error": 3, "cancelled": 4, "skipped": 5}
        status: TrialStatus = max(statuses, key=lambda item: priority[item]) if statuses else "error"
        executions = [item for session in sessions for item in session.executions]
        memory = workspace.memory()
        text = final_text if final_text is not None else (sessions[-1].final_text if sessions else "")
        verdict = judge(attack, TrialTranscript(final_text=text, requested=executions, executed=[item for item in executions if item.executed], blocked=[item for item in executions if item.blocked], memory=memory, error=sessions[-1].error if sessions else None))
        success = verdict.success and status not in ("error", "cancelled", "skipped")
        totals = [session.totals for session in sessions]
        return TrialResult(
            attack=attack.id,
            defense=defense.id,
            trial=trial,
            status=status,
            success=success,
            verdict=verdict.code,
            reason=verdict.reason,
            evidence=verdict.evidence,
            run_ids=run_ids,
            llm_calls=sum(int(item.get("llm_calls", 0)) for item in totals),
            tokens=sum(int(item.get("prompt_tokens", 0)) + int(item.get("completion_tokens", 0)) for item in totals),
            cost=sum(item["cost"] for item in totals if item.get("cost") is not None) if any(item.get("cost") is not None for item in totals) else None,
            latency_ms=sum(int(item.get("latency_ms", 0)) for item in totals),
            answer_excerpt=text[:500],
            error="; ".join(item.error for item in sessions if item.error) or None,
        )

    @staticmethod
    def _merge(report: CampaignReport, result: TrialResult) -> None:
        for cell in report.cells:
            if cell.attack == result.attack and cell.defense == result.defense:
                cell.results.append(result)
                cell.done = len([item for item in cell.results if item.status != "skipped"])
                cell.successes = sum(1 for item in cell.results if item.success)
                cell.errors = sum(1 for item in cell.results if item.status in ("error", "cancelled"))
                cell.skipped = sum(1 for item in cell.results if item.status == "skipped")
                cell.success_rate = (cell.successes / cell.done) if cell.done else None
                costs = [item.cost for item in cell.results if item.cost is not None]
                cell.avg_cost = (sum(costs) / len(costs)) if costs else None
                cell.avg_latency_ms = int(sum(item.latency_ms for item in cell.results) / len(cell.results)) if cell.results else None
                break
        report.progress["done"] = sum(cell.done for cell in report.cells)
        report.totals = SecurityService._totals(report)

    @staticmethod
    def _totals(report: CampaignReport) -> dict[str, Any]:
        results = [item for cell in report.cells for item in cell.results]
        costs = [item.cost for item in results if item.cost is not None]
        return {
            "runs": sum(len(item.run_ids) for item in results),
            "llm_calls": sum(item.llm_calls for item in results),
            "tokens": sum(item.tokens for item in results),
            "cost": sum(costs) if costs else None,
        }
