import json
import threading
from pathlib import Path

import pytest

from agent_lab.config import AgentConfig, Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.runtime import Lab
from evals.report import render_markdown, verify_manifest
from evals.runner import Arm, EvalRequest, EvalRunner
from evals.tasks import list_suites, load_suite
from tests.helpers import BOOK_MD, GOOD_ANSWER, text

TASKS = """
tasks:
  - id: kv-why
    kind: qa_citation
    chapter: 2
    input: 为什么前缀要稳定？
    verifiers:
      - type: status_ok
      - type: citations_verified
        min_count: 1
  - id: kv-sections
    kind: qa_citation
    input: 缓存讲在哪一节？
    verifiers:
      - type: cites_section
        any_of: ["kv-cache-的原理与约束"]
"""


@pytest.fixture
def setup(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir()
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    root = tmp_path / "tasks"
    (root / "mini").mkdir(parents=True)
    (root / "mini" / "a.yaml").write_text(TASKS, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    lab = Lab.create(settings, client=ScriptedClient([]))
    return lab, root, tmp_path / "evals"


def factory(answers_by_arm):
    def make(task, arm, trial):
        return ScriptedClient([text(answers_by_arm[arm.name], prompt=500, completion=100)])

    return make


def test_load_and_list_suites(setup):
    _, root, _ = setup
    assert [t.id for t in load_suite("mini", include_regressions=False, root=root)] == ["kv-why", "kv-sections"]
    assert list_suites(root) == [{"name": "mini", "task_count": 2, "kinds": {"qa_citation": 2}}]
    with pytest.raises(ValueError):
        load_suite("nope", root=root)


def test_single_arm_report_and_manifest(setup):
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    request = EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=2, include_regressions=False, concurrency=2)
    report = runner.run(request, eval_id="20261011-120000-aaaa")
    summary = report["arms"][0]["summary"]
    assert report["status"] == "done" and report["progress"] == {"done": 4, "total": 4}
    assert summary["passed"] == 4 and summary["pass_rate"] == 1.0
    assert summary["pass_hat_k"]["2"] == 1.0
    assert summary["cost_per_success"] == 0.0 and summary["reference_cost_per_success"] > 0
    assert summary["by_kind"] == {"qa_citation": {"passed": 4, "trials": 4}}
    task = report["arms"][0]["tasks"][0]
    assert [t["trial"] for t in task["trials"]] == [1, 2]
    out_dir = out / "20261011-120000-aaaa"
    assert (out_dir / "report.md").exists()
    assert verify_manifest(out_dir, lab.store) == []
    run_id = task["trials"][0]["run_id"]
    with lab.store.path(run_id).open("a") as handle:
        handle.write("\n")
    assert verify_manifest(out_dir, lab.store) == [f"轨迹被修改：{run_id}"]


def test_ab_comparison(setup):
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": "没有引用的回答", "B": GOOD_ANSWER}))
    arms = (Arm("A", AgentConfig()), Arm("B", AgentConfig(status_bar=True)))
    report = runner.run(EvalRequest(suite="mini", arms=arms, trials=3, include_regressions=False))
    c = report["comparison"]
    assert c["pairs"] == 6 and c["b_only"] == 6 and c["a_only"] == 0
    assert c["verdict"] == "better" and c["delta_pass_rate"] == 1.0
    assert "B 显著更好" in render_markdown(report)


def test_budget_skips_remaining_trials(setup):
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    request = EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=3, include_regressions=False, concurrency=1, max_total_tokens=1000)
    summary = runner.run(request)["arms"][0]["summary"]
    assert summary["trials"] == 2 and summary["skipped"] == 4


def test_cancel_skips_everything(setup):
    lab, root, out = setup
    cancel = threading.Event()
    cancel.set()
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    report = runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1, include_regressions=False), cancel=cancel)
    assert report["arms"][0]["summary"]["skipped"] == 2


def test_aborts_when_the_model_interface_keeps_failing(setup):
    # 2026-10-11：上游限流后连续数小时 502，三次评估跑完却全是 llm_error，报告看起来像正常结论。
    from agent_lab.llm.client import LLMError
    from evals.runner import MAX_CONSECUTIVE_LLM_ERRORS

    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=lambda task, arm, trial: ScriptedClient([LLMError("HTTP 502")]))
    request = EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=5, include_regressions=False, concurrency=1)
    report = runner.run(request)
    summary = report["arms"][0]["summary"]
    assert report["status"] == "aborted"
    assert "模型接口" in report["aborted_reason"]
    assert summary["statuses"] == {"llm_error": MAX_CONSECUTIVE_LLM_ERRORS, "skipped": 10 - MAX_CONSECUTIVE_LLM_ERRORS}
    assert summary["skipped"] == 10 - MAX_CONSECUTIVE_LLM_ERRORS


def test_isolated_llm_errors_do_not_abort(setup):
    from agent_lab.llm.client import LLMError

    lab, root, out = setup
    calls = {"n": 0}

    def make(task, arm, trial):
        calls["n"] += 1
        return ScriptedClient([LLMError("HTTP 502") if calls["n"] % 2 else text(GOOD_ANSWER)])

    runner = EvalRunner(lab, out, tasks_root=root, client_factory=make)
    report = runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=5, include_regressions=False, concurrency=1))
    assert report["status"] == "done" and "aborted_reason" not in report
    assert report["arms"][0]["summary"]["skipped"] == 0


def test_regression_failures_flagged(setup, monkeypatch):
    lab, root, out = setup
    reg_dir = root.parent / "regressions"
    reg_dir.mkdir()
    (reg_dir / "r.yaml").write_text(
        "tasks:\n  - id: reg-1\n    kind: qa_citation\n    input: q\n    tags: [regression]\n    verifiers:\n      - type: answer_mentions\n        all_of: [不会出现的词]\n",
        encoding="utf8",
    )
    monkeypatch.setattr("evals.tasks.REGRESSIONS_DIR", reg_dir)
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    report = runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1))
    assert report["arms"][0]["summary"]["regressions_failed"] == ["reg-1"]
    assert "r.yaml" in report["task_files"]


def test_task_filter_and_empty(setup):
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    report = runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1, include_regressions=False, task_ids=("kv-why",)))
    assert report["progress"]["total"] == 1
    with pytest.raises(ValueError):
        runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1, include_regressions=False, task_ids=("x",)))


def test_requires_tools_added_to_config():
    from evals.tasks import Task

    task = Task(id="t", kind="sandbox_calc", input="q", requires_tools=["run_python"], verifiers=[{"type": "status_ok"}])
    cfg = task.config_for(AgentConfig())
    assert cfg.tools[-1] == "run_python" and "search_book" in cfg.tools


def test_rescore_uses_current_verifiers(setup):
    from evals.rescore import rescore

    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=factory({"A": GOOD_ANSWER}))
    source = runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1, include_regressions=False))
    assert source["arms"][0]["summary"]["passed"] == 2
    stricter = TASKS.replace("        min_count: 1", "        min_count: 5")
    (root / "mini" / "a.yaml").write_text(stricter, encoding="utf8")
    report = rescore(source, lab, out, tasks_root=root)
    assert report["rescored_from"] == source["eval_id"] and "重新评分" in report["label"]
    assert report["arms"][0]["summary"]["passed"] == 1  # kv-why 现在要求 5 条引用
    assert report["kept_original_verdicts"] == []
    assert verify_manifest(out / report["eval_id"], lab.store) == []
