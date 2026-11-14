"""第 9 章自我改进闭环：失败试验 → 模型提出候选规则 → 门禁评估 → 通过后才能采用 → 可回滚。

提案与门禁分离：生成规则的模型不参与批准。门禁比较「当前规则」与「候选规则」在
失败任务、回归任务和一组原本通过的任务上的表现。
"""

from __future__ import annotations

import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agent_lab.config import AgentConfig, apply_overrides
from agent_lab.llm.client import ChatClient, ChatRequest
from agent_lab.stores import RulesStore
from agent_lab.trace.schema import RunEnd, ToolCall
from agent_lab.trace.store import RunStore

from .runner import Arm, EvalRequest, EvalRunner
from .tasks import load_suite

MAX_FAILURES = 8
MAX_NEW_RULES = 3
MAX_RULE_CHARS = 120
PASSING_SAMPLE = 5
PROPOSAL_ATTEMPTS = 2

PROPOSAL_PROMPT = """你在改进一个读书助教 Agent 的系统提示。下面是它在评估中失败的案例（问题、没通过的检查、它的回答片段、调用过的工具）。
请提出最多 {max_rules} 条新的行为规则，帮助它避免这类失败。要求：
- 每条规则一句话、可执行、针对失败的根因（例如引用格式、先读原文再引用、不要编造），不超过 {max_chars} 字；
- 不要重复已有规则；不要针对某一道题写死答案。
只输出 JSON 数组，例如 ["规则一", "规则二"]。

已有规则：
{current}"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def collect_failures(report: dict[str, Any], store: RunStore, arm: str = "A", limit: int = MAX_FAILURES) -> list[dict[str, Any]]:
    failures = []
    arm_report = next(a for a in report["arms"] if a["name"] == arm)
    for task in arm_report["tasks"]:
        for trial in task["trials"]:
            if trial["passed"] or not trial["run_id"] or trial["status"] == "skipped":
                continue
            events = store.read(trial["run_id"]) if store.exists(trial["run_id"]) else []
            end = next((e for e in events if isinstance(e, RunEnd)), None)
            failures.append({
                "task_id": task["task_id"],
                "question": task.get("input", ""),
                "failed_checks": [f"{v['type']}：{v['detail']}" for v in trial["verifiers"] if not v["passed"] and not v.get("informational")],
                "answer": ((end.answer if end else "") or "")[:600],
                "status": trial["status"],
                "tools": [e.name for e in events if isinstance(e, ToolCall)][:12],
            })
            break  # 每个任务取一次失败就够了
        if len(failures) >= limit:
            break
    return failures


def parse_rules(raw: str, existing: list[str]) -> list[str]:
    match = re.search(r"\[.*\]", raw or "", re.S)
    if not match:
        raise ValueError("模型没有返回 JSON 数组")
    items = json.loads(match.group(0))
    rules = [str(r).strip() for r in items if isinstance(r, str) and str(r).strip()]
    rules = [r[:MAX_RULE_CHARS] for r in rules if r not in existing]
    if not rules:
        raise ValueError("没有得到新的规则")
    return rules[:MAX_NEW_RULES]


@dataclass
class Improver:
    runner: EvalRunner
    rules: RulesStore
    proposer: ChatClient
    model: str
    out_dir: Path

    def propose(self, failures: list[dict[str, Any]], current: list[str]) -> dict[str, Any]:
        """解析失败时重试一次（推理模型偶尔会把输出预算耗在推理上、正文为空）。"""
        system = PROPOSAL_PROMPT.format(max_rules=MAX_NEW_RULES, max_chars=MAX_RULE_CHARS, current="\n".join(f"- {r}" for r in current) or "（无）")
        messages = [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(failures, ensure_ascii=False, indent=1)}]
        raws: list[str] = []
        for attempt in range(PROPOSAL_ATTEMPTS):
            response = self.proposer.complete(ChatRequest(model=self.model, messages=messages, temperature=0.3, max_tokens=1500 * (attempt + 1)))
            raw = response.message.get("content") or ""
            raws.append(raw)
            try:
                return {"raw": raw, "attempts": attempt + 1, "rules_added": parse_rules(raw, current)}
            except ValueError:
                messages = [*messages, {"role": "assistant", "content": raw}, {"role": "user", "content": "只输出一个 JSON 字符串数组，不要其他内容。"}]
        raise ValueError(f"提案 {PROPOSAL_ATTEMPTS} 次都没有得到有效的 JSON 数组；最后一次输出：{raws[-1][:200]!r}")

    def gate_tasks(self, suite: str, failures: list[dict[str, Any]]) -> list[str]:
        tasks = load_suite(suite, include_regressions=True, root=self.runner.tasks_root, regressions_dir=self.runner.regressions_dir)
        failed = {f["task_id"] for f in failures}
        regressions = [t.id for t in tasks if t.is_regression]
        passing = [t.id for t in tasks if t.id not in failed and not t.is_regression][:PASSING_SAMPLE]
        return list(dict.fromkeys([*sorted(failed), *regressions, *passing]))

    def decide(self, report: dict[str, Any]) -> dict[str, Any]:
        base, cand = (a["summary"] for a in report["arms"])
        reasons = []
        new_regressions = sorted(set(cand["regressions_failed"]) - set(base["regressions_failed"]))
        if new_regressions:
            reasons.append(f"候选让原本通过的回归任务失败：{new_regressions}")
        if report["comparison"]["verdict"] == "worse":
            reasons.append("A/B 检验显示候选显著更差")
        if cand["passed"] <= base["passed"]:
            reasons.append(f"候选通过 {cand['passed']} 次，没有超过当前规则的 {base['passed']} 次")
        return {
            "eval_id": report["eval_id"], "passed": not reasons, "reasons": reasons or ["全部门禁条件满足"],
            "baseline": {"passed": base["passed"], "trials": base["trials"]},
            "candidate": {"passed": cand["passed"], "trials": cand["trials"]},
            "comparison": report["comparison"],
        }

    def run(self, source_report: dict[str, Any], config: AgentConfig, trials: int = 2) -> dict[str, Any]:
        failures = collect_failures(source_report, self.runner.lab.store)
        if not failures:
            raise ValueError("这次评估没有失败的试验，不需要改进")
        current = self.rules.active()
        proposal = self.propose(failures, current)
        candidate_rules = [*current, *proposal["rules_added"]]
        cfg = apply_overrides(config, {"learned_rules": True})
        arms = (Arm("A", cfg, rules=tuple(current)), Arm("B", cfg, rules=tuple(candidate_rules)))
        request = EvalRequest(
            suite=source_report["suite"], arms=arms, trials=trials, label="自我改进门禁",
            task_ids=tuple(self.gate_tasks(source_report["suite"], failures)),
        )
        gate = self.decide(self.runner.run(request))
        candidate = {
            "candidate_id": secrets.token_hex(4), "created_at": _now(), "source_eval": source_report["eval_id"],
            "failures": [f["task_id"] for f in failures], "proposal": proposal, "rules": candidate_rules,
            "gate": gate, "status": "passed" if gate["passed"] else "rejected",
        }
        self._save(candidate)
        return candidate

    def _path(self, candidate_id: str) -> Path:
        if not candidate_id.isalnum():
            raise ValueError(f"非法的候选 id：{candidate_id!r}")
        return self.out_dir / f"{candidate_id}.json"

    def _save(self, candidate: dict[str, Any]) -> None:
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._path(candidate["candidate_id"]).write_text(json.dumps(candidate, ensure_ascii=False, indent=1), "utf8")


def list_candidates(out_dir: Path) -> list[dict[str, Any]]:
    if not out_dir.exists():
        return []
    items = [json.loads(p.read_text("utf8")) for p in out_dir.glob("*.json")]
    return sorted(items, key=lambda c: c["created_at"], reverse=True)


def adopt(out_dir: Path, candidate_id: str, rules: RulesStore) -> dict[str, Any]:
    """采用通过门禁的候选：成为新的规则版本并立即生效。"""
    path = out_dir / f"{candidate_id}.json"
    if not candidate_id.isalnum() or not path.exists():
        raise ValueError(f"候选 {candidate_id} 不存在")
    candidate = json.loads(path.read_text("utf8"))
    if candidate["status"] != "passed":
        raise ValueError(f"候选状态为 {candidate['status']}，只有通过门禁的候选才能采用")
    version = rules.add_version(candidate["rules"], source=f"自我改进候选 {candidate_id}", evidence={"source_eval": candidate["source_eval"], "gate_eval": candidate["gate"]["eval_id"]})
    path.write_text(json.dumps({**candidate, "status": "adopted", "version": version["version"]}, ensure_ascii=False, indent=1), "utf8")
    return version
