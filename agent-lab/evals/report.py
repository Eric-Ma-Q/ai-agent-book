"""评估报告：汇总统计、A/B 对比、Markdown 摘要与可复核的 manifest。"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Iterable, Sequence

from agent_lab.config import config_hash
from agent_lab.llm.pricing import REFERENCE_LABEL
from agent_lab.trace.store import RunStore

from .stats import cluster_bootstrap, mcnemar_exact, pass_hat_k, percentile, verdict, wilson

if TYPE_CHECKING:
    from .runner import Arm
    from .tasks import Task


@dataclass(frozen=True)
class TrialRecord:
    arm: str
    task_id: str
    kind: str
    tags: list[str]
    trial: int
    run_id: str | None
    passed: bool
    status: str
    verifiers: list[dict[str, Any]]
    cost: float | None
    reference_cost: float | None
    latency_ms: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "trial": self.trial, "run_id": self.run_id, "passed": self.passed, "status": self.status,
            "cost": self.cost, "reference_cost": self.reference_cost, "latency_ms": self.latency_ms,
            "verifiers": self.verifiers,
        }


def _per_task(records: Iterable[TrialRecord]) -> dict[str, list[bool]]:
    grouped: dict[str, list[bool]] = {}
    for r in sorted(records, key=lambda r: (r.task_id, r.trial)):
        grouped.setdefault(r.task_id, []).append(r.passed)
    return grouped


def _per_success(values: list[float | None], passed: int) -> float | None:
    if not passed or any(v is None for v in values):
        return None
    return sum(v for v in values if v is not None) / passed


def summarize(records: Sequence[TrialRecord], trials: int) -> dict[str, Any]:
    done = [r for r in records if r.status != "skipped"]
    passed = sum(r.passed for r in done)
    grouped = _per_task(done)
    by_kind: dict[str, dict[str, int]] = {}
    statuses: dict[str, int] = {}
    for r in records:
        statuses[r.status] = statuses.get(r.status, 0) + 1
        if r.status != "skipped":
            entry = by_kind.setdefault(r.kind, {"passed": 0, "trials": 0})
            entry["passed"] += r.passed
            entry["trials"] += 1
    latencies = [r.latency_ms for r in done if r.latency_ms is not None]
    regressions = sorted({r.task_id for r in done if "regression" in r.tags and not r.passed})
    return {
        "trials": len(done),
        "skipped": statuses.get("skipped", 0),
        "passed": passed,
        "pass_rate": passed / len(done) if done else None,
        "wilson": list(wilson(passed, len(done))),
        "bootstrap": list(cluster_bootstrap(grouped)),
        "pass_hat_k": {str(k): pass_hat_k(grouped, k) for k in range(1, trials + 1)},
        "cost_per_success": _per_success([r.cost for r in done], passed),
        "reference_cost_per_success": _per_success([r.reference_cost for r in done], passed),
        "latency_p50_ms": percentile(latencies, 50),
        "latency_p95_ms": percentile(latencies, 95),
        "statuses": statuses,
        "by_kind": by_kind,
        "regressions_failed": regressions,
    }


def compare(a: Sequence[TrialRecord], b: Sequence[TrialRecord]) -> dict[str, Any]:
    left = {(r.task_id, r.trial): r.passed for r in a if r.status != "skipped"}
    right = {(r.task_id, r.trial): r.passed for r in b if r.status != "skipped"}
    keys = sorted(left.keys() & right.keys())
    a_only = sum(1 for k in keys if left[k] and not right[k])
    b_only = sum(1 for k in keys if right[k] and not left[k])
    delta = (sum(right[k] for k in keys) - sum(left[k] for k in keys)) / len(keys) if keys else None
    return {
        "pairs": len(keys), "a_only": a_only, "b_only": b_only, "p_value": mcnemar_exact(b_only, a_only),
        "delta_pass_rate": delta, "verdict": verdict(b_only=b_only, a_only=a_only),
    }


def build_report(meta: dict[str, Any], arms: Sequence["Arm"], tasks: Sequence["Task"], records: Sequence[TrialRecord], total_jobs: int) -> dict[str, Any]:
    arm_reports = []
    for arm in arms:
        mine = [r for r in records if r.arm == arm.name]
        task_entries = []
        for task in tasks:
            trials = sorted((r for r in mine if r.task_id == task.id), key=lambda r: r.trial)
            task_entries.append({"task_id": task.id, "kind": task.kind, "tags": task.tags, "input": task.input, "trials": [t.to_dict() for t in trials]})
        arm_reports.append({
            "name": arm.name, "config": arm.config.model_dump(mode="json"), "config_hash": config_hash(arm.config),
            "summary": summarize(mine, meta["trials"]), "tasks": task_entries,
        })
    by_arm = {arm.name: [r for r in records if r.arm == arm.name] for arm in arms}
    comparison = compare(by_arm[arms[0].name], by_arm[arms[1].name]) if len(arms) == 2 else None
    return {
        **meta, "progress": {"done": len(records), "total": total_jobs}, "arms": arm_reports,
        "comparison": comparison, "reference_price": REFERENCE_LABEL,
    }


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value:.0%}"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [f"# 评估报告 {report['eval_id']}", "", f"- 任务集：{report['suite']}（{report['label'] or '无标签'}）",
             f"- 状态：{report['status']}，进度 {report['progress']['done']}/{report['progress']['total']}", ""]
    lines += ["| 臂 | 模型 | 通过率 | Wilson 95% | bootstrap 95% | pass^k | 每次成功参考成本 | P95 延迟 |", "|---|---|---|---|---|---|---|---|"]
    for arm in report["arms"]:
        s = arm["summary"]
        hat = " / ".join(f"{k}:{_pct(v)}" for k, v in s["pass_hat_k"].items())
        ref = "—" if s["reference_cost_per_success"] is None else f"${s['reference_cost_per_success']:.4f}"
        p95 = "—" if s["latency_p95_ms"] is None else f"{s['latency_p95_ms'] / 1000:.1f}s"
        lines.append(
            f"| {arm['name']} | {arm['config']['model']} | {s['passed']}/{s['trials']} = {_pct(s['pass_rate'])} | "
            f"{_pct(s['wilson'][0])}–{_pct(s['wilson'][1])} | {_pct(s['bootstrap'][0])}–{_pct(s['bootstrap'][1])} | {hat} | {ref} | {p95} |"
        )
        if s["regressions_failed"]:
            lines.append(f"\n**回归失败**（{arm['name']}）：{', '.join(s['regressions_failed'])}\n")
    if report.get("comparison"):
        c = report["comparison"]
        words = {"better": "B 显著更好", "worse": "B 显著更差", "inconclusive": "无法区分"}
        lines += ["", f"**A/B 结论：{words[c['verdict']]}**（配对 {c['pairs']} 次，只有 A 通过 {c['a_only']}，只有 B 通过 {c['b_only']}，McNemar p = {c['p_value']:.3f}）"]
    lines += ["", f"成本按{report['reference_price']}计算。"]
    return "\n".join(lines) + "\n"


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_outputs(out_dir: Path, report: dict[str, Any], store: RunStore, final: bool) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"
    tmp = report_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf8")
    tmp.replace(report_path)
    if not final:
        return
    (out_dir / "report.md").write_text(render_markdown(report), "utf8")
    traces = []
    for arm in report["arms"]:
        for task in arm["tasks"]:
            for trial in task["trials"]:
                if trial["run_id"] and store.exists(trial["run_id"]):
                    traces.append({"run_id": trial["run_id"], "sha256": _sha256(store.path(trial["run_id"]))})
    manifest = {
        "eval_id": report["eval_id"], "created_at": report["created_at"], "finished_at": report.get("finished_at"),
        "suite": report["suite"], "tasks_hash": report["tasks_hash"], "task_files": report["task_files"],
        "arms": [{"name": a["name"], "config_hash": a["config_hash"], "model": a["config"]["model"]} for a in report["arms"]],
        "report_sha256": _sha256(report_path), "traces": traces,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf8")


def verify_manifest(out_dir: Path, store: RunStore) -> list[str]:
    """重新计算哈希，返回发现的问题；空列表表示全部一致。"""
    manifest = json.loads((out_dir / "manifest.json").read_text("utf8"))
    problems = []
    if _sha256(out_dir / "report.json") != manifest["report_sha256"]:
        problems.append("report.json 与 manifest 记录的哈希不一致")
    for trace in manifest["traces"]:
        if not store.exists(trace["run_id"]):
            problems.append(f"轨迹缺失：{trace['run_id']}")
        elif _sha256(store.path(trace["run_id"])) != trace["sha256"]:
            problems.append(f"轨迹被修改：{trace['run_id']}")
    return problems
