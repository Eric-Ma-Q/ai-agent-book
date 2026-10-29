"""批量评估：每个任务 × 每个臂 × N 次试验，限制并发，受总 token 预算约束。

每完成一次试验就重写一次报告（status=running），网页可以看到进度。
超出预算后剩余试验记为 skipped，不计入通过率，并在报告中如实列出。
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from agent_lab.config import AgentConfig
from agent_lab.llm.client import ChatClient
from agent_lab.runtime import Lab
from agent_lab.trace.store import new_run_id

from .judge import Judge
from .report import TrialRecord, build_report, write_outputs
from .tasks import TASKS_ROOT, Task, files_hash, load_suite, suite_files
from .verifiers import TrialView, run_verifier

ClientFactory = Callable[[Task, "Arm", int], ChatClient | None]


@dataclass(frozen=True)
class Arm:
    name: str
    config: AgentConfig
    rules: tuple[str, ...] | None = None  # 指定时用这组规则代替当前生效版本（自我改进的候选臂）


class StaticRules:
    def __init__(self, rules: tuple[str, ...]):
        self._rules = list(rules)

    def active(self) -> list[str]:
        return list(self._rules)


# 连续这么多次运行因模型接口出错而结束，就中止评估：接口挂了时继续跑只会产出一份看起来正常、其实没有意义的报告。
MAX_CONSECUTIVE_LLM_ERRORS = 5
ABORTED_REASON = f"连续 {MAX_CONSECUTIVE_LLM_ERRORS} 次运行因模型接口出错（llm_error）而失败，评估已中止；结果不能用于比较。"


@dataclass(frozen=True)
class EvalRequest:
    suite: str
    arms: tuple[Arm, ...]
    trials: int = 3
    label: str = ""
    include_regressions: bool = True
    concurrency: int = 2
    max_total_tokens: int | None = None
    task_ids: tuple[str, ...] | None = None


@dataclass
class _Progress:
    records: list[TrialRecord] = field(default_factory=list)
    tokens: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class EvalRunner:
    def __init__(
        self,
        lab: Lab,
        out_root: Path,
        tasks_root: Path = TASKS_ROOT,
        judge: Judge | None = None,
        client_factory: ClientFactory | None = None,
        regressions_dir: Path | None = None,
    ):
        self.lab, self.out_root, self.tasks_root = lab, Path(out_root), tasks_root
        self.judge, self.client_factory = judge, client_factory
        self.regressions_dir = regressions_dir

    def tasks_for(self, request: EvalRequest) -> tuple[list[Task], list[Path]]:
        files = suite_files(request.suite, request.include_regressions, self.tasks_root, self.regressions_dir)
        tasks = load_suite(request.suite, request.include_regressions, self.tasks_root, self.regressions_dir)
        if request.task_ids:
            tasks = [t for t in tasks if t.id in set(request.task_ids)]
        if not tasks:
            raise ValueError("没有可运行的任务")
        return tasks, files

    def _trial(self, task: Task, arm: Arm, trial: int, eval_id: str, progress: _Progress, request: EvalRequest) -> TrialRecord:
        with progress.lock:
            over = request.max_total_tokens is not None and progress.tokens >= request.max_total_tokens
        if over:
            return TrialRecord(arm.name, task.id, task.kind, task.tags, trial, None, False, "skipped", [], None, None, None)
        meta = {"source": "eval", "eval_id": eval_id, "task_id": task.id, "arm": arm.name, "trial": trial}
        client = self.client_factory(task, arm, trial) if self.client_factory else None
        services = {"rules": StaticRules(arm.rules)} if arm.rules is not None else None
        outcome = self.lab.run(task.input, task.config_for(arm.config), run_id=new_run_id(), meta=meta, client=client, services=services)
        view = TrialView.from_events(self.lab.store.read(outcome.run_id), self.lab.book)
        results = [run_verifier(spec.type, spec.params, view, judge=self.judge) for spec in task.verifiers]
        passed = all(r.passed for r in results if not r.informational)
        totals = outcome.totals
        with progress.lock:
            progress.tokens += int(totals.get("prompt_tokens") or 0) + int(totals.get("completion_tokens") or 0)
        return TrialRecord(
            arm.name, task.id, task.kind, task.tags, trial, outcome.run_id, passed, outcome.status,
            [r.to_dict() for r in results], totals.get("cost"), totals.get("reference_cost"), totals.get("latency_ms"),
        )

    def _meta(self, request: EvalRequest, eval_id: str, files: list[Path]) -> dict[str, Any]:
        return {
            "eval_id": eval_id, "label": request.label, "suite": request.suite, "created_at": now_iso(),
            "trials": request.trials, "tasks_hash": files_hash(files), "task_files": [p.name for p in files],
            "max_total_tokens": request.max_total_tokens,
        }

    def queue(self, request: EvalRequest) -> str:
        """校验请求并写一份 status=queued 的报告，返回 eval_id；之后再调用 run。"""
        eval_id = new_run_id()
        tasks, files = self.tasks_for(request)
        total = len(tasks) * len(request.arms) * request.trials
        report = build_report({**self._meta(request, eval_id, files), "status": "queued"}, request.arms, tasks, [], total_jobs=total)
        write_outputs(self.out_root / eval_id, report, self.lab.store, final=False)
        return eval_id

    def run(self, request: EvalRequest, eval_id: str | None = None, cancel: threading.Event | None = None) -> dict[str, Any]:
        eval_id = eval_id or new_run_id()
        tasks, files = self.tasks_for(request)
        meta = self._meta(request, eval_id, files)
        jobs = [(arm, task, trial) for task in tasks for arm in request.arms for trial in range(1, request.trials + 1)]
        progress = _Progress()
        out_dir = self.out_root / eval_id
        write_lock = threading.Lock()  # 报告文件同一时间只允许一个线程写
        abort = threading.Event()
        streak = [0]  # 连续 llm_error 的次数

        def publish(status: str) -> dict[str, Any]:
            with write_lock:
                with progress.lock:
                    records = list(progress.records)
                report = build_report({**meta, "status": status}, request.arms, tasks, records, total_jobs=len(jobs))
                if status == "aborted":
                    report["aborted_reason"] = ABORTED_REASON
                if status != "running":
                    report["finished_at"] = now_iso()
                write_outputs(out_dir, report, self.lab.store, final=status != "running")
                return report

        publish("running")

        def job(item: tuple[Arm, Task, int]) -> None:
            arm, task, trial = item
            if (cancel is not None and cancel.is_set()) or abort.is_set():
                record = TrialRecord(arm.name, task.id, task.kind, task.tags, trial, None, False, "skipped", [], None, None, None)
            else:
                record = self._trial(task, arm, trial, eval_id, progress, request)
            with progress.lock:
                progress.records.append(record)
                if record.status == "llm_error":
                    streak[0] += 1
                elif record.status != "skipped":
                    streak[0] = 0
                if streak[0] >= MAX_CONSECUTIVE_LLM_ERRORS:
                    abort.set()
            publish("running")

        try:
            with ThreadPoolExecutor(max_workers=max(1, request.concurrency)) as pool:
                list(pool.map(job, jobs))
        except Exception:
            publish("failed")
            raise
        return publish("aborted" if abort.is_set() else "done")
