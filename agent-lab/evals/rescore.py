"""重新评分：用当前的任务定义与验证器重新判定已保存的轨迹，不再调用模型。

用于验证器校准之后：原报告保持不动，生成一份新报告（rescored_from 指向原报告），
两份都能复核，能看清「改的是尺子，不是 Agent」。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agent_lab.config import AgentConfig, apply_overrides
from agent_lab.runtime import Lab
from agent_lab.trace.store import new_run_id

from .judge import Judge
from .report import TrialRecord, build_report, write_outputs
from .runner import Arm, now_iso
from .tasks import TASKS_ROOT, files_hash, load_suite, suite_files
from .verifiers import TrialView, run_verifier


def _arm(arm_report: dict[str, Any]) -> Arm:
    return Arm(arm_report["name"], apply_overrides(AgentConfig(), arm_report["config"]))


def rescore(source: dict[str, Any], lab: Lab, out_root: Path, tasks_root: Path = TASKS_ROOT, judge: Judge | None = None) -> dict[str, Any]:
    files = suite_files(source["suite"], include_regressions=True, root=tasks_root)
    tasks = {t.id: t for t in load_suite(source["suite"], include_regressions=True, root=tasks_root)}
    arms = [_arm(a) for a in source["arms"]]
    records: list[TrialRecord] = []
    kept: list[str] = []
    for arm_report in source["arms"]:
        for entry in arm_report["tasks"]:
            task = tasks.get(entry["task_id"])
            for trial in entry["trials"]:
                run_id = trial["run_id"]
                if task is None or not run_id or not lab.store.exists(run_id):
                    kept.append(f"{entry['task_id']}#{trial['trial']}")
                    verifiers, passed = trial["verifiers"], trial["passed"]
                else:
                    view = TrialView.from_events(lab.store.read(run_id), lab.book)
                    results = [run_verifier(s.type, s.params, view, judge=judge) for s in task.verifiers]
                    verifiers = [r.to_dict() for r in results]
                    passed = all(r.passed for r in results if not r.informational)
                records.append(TrialRecord(
                    arm_report["name"], entry["task_id"], entry["kind"], entry["tags"], trial["trial"], run_id, passed,
                    trial["status"], verifiers, trial["cost"], trial["reference_cost"], trial["latency_ms"],
                ))
    task_list = [tasks[e["task_id"]] for e in source["arms"][0]["tasks"] if e["task_id"] in tasks]
    meta = {
        "eval_id": new_run_id(), "label": f"{source.get('label') or source['eval_id']}（重新评分）", "suite": source["suite"],
        "created_at": now_iso(), "trials": source["trials"], "tasks_hash": files_hash(files), "task_files": [p.name for p in files],
        "max_total_tokens": source.get("max_total_tokens"), "status": "done", "rescored_from": source["eval_id"],
        "kept_original_verdicts": kept,
    }
    report = build_report(meta, arms, task_list, records, total_jobs=len(records))
    report["finished_at"] = now_iso()
    write_outputs(Path(out_root) / meta["eval_id"], report, lab.store, final=True)
    return report
