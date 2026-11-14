import pytest
import yaml

from agent_lab.config import AgentConfig
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.stores import RulesStore
from evals.improve import Improver, adopt, collect_failures, list_candidates, parse_rules
from evals.promote import promote
from evals.runner import Arm, EvalRequest, EvalRunner
from tests.helpers import GOOD_ANSWER, text
from tests.unit.test_eval_runner import setup  # noqa: F401  (pytest fixture)


def test_parse_rules():
    assert parse_rules('好的：["先读原文再引用", "已有"]', ["已有"]) == ["先读原文再引用"]
    with pytest.raises(ValueError):
        parse_rules("没有数组", [])
    with pytest.raises(ValueError):
        parse_rules('["已有"]', ["已有"])
    assert len(parse_rules('["a1","b2","c3","d4"]', [])) == 3


def rule_aware_factory(good_when_rule: str):
    """有候选规则时回答带有效引用，否则不带：模拟规则真的起作用。"""

    def make(task, arm, trial):
        answer = GOOD_ANSWER if arm.rules and good_when_rule in arm.rules else "没有引用的回答"
        return ScriptedClient([text(answer)])

    return make


def baseline_report(runner):
    return runner.run(EvalRequest(suite="mini", arms=(Arm("A", AgentConfig()),), trials=1, include_regressions=False))


def test_improve_passes_gate_and_adopts(setup, tmp_path):  # noqa: F811
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=rule_aware_factory("回答必须附原文引用"))
    report = baseline_report(runner)
    failures = collect_failures(report, lab.store)
    assert {f["task_id"] for f in failures} == {"kv-why", "kv-sections"}
    assert failures[0]["failed_checks"]

    rules = RulesStore(tmp_path / "rules")
    improver = Improver(runner, rules, ScriptedClient([text('["回答必须附原文引用"]')]), "m", tmp_path / "cands")
    candidate = improver.run(report, AgentConfig(), trials=1)
    assert candidate["status"] == "passed" and candidate["gate"]["passed"]
    assert candidate["rules"] == ["回答必须附原文引用"]
    assert list_candidates(tmp_path / "cands")[0]["candidate_id"] == candidate["candidate_id"]

    version = adopt(tmp_path / "cands", candidate["candidate_id"], rules)
    assert version["version"] == 1 and rules.active() == ["回答必须附原文引用"]
    with pytest.raises(ValueError):
        adopt(tmp_path / "cands", candidate["candidate_id"], rules)  # 已采用


def test_improve_rejects_useless_rule(setup, tmp_path):  # noqa: F811
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=rule_aware_factory("永远不会出现的规则"))
    report = baseline_report(runner)
    improver = Improver(runner, RulesStore(tmp_path), ScriptedClient([text('["无关规则"]')]), "m", tmp_path / "cands")
    candidate = improver.run(report, AgentConfig(), trials=1)
    assert candidate["status"] == "rejected"
    assert any("没有超过" in r for r in candidate["gate"]["reasons"])
    with pytest.raises(ValueError):
        adopt(tmp_path / "cands", candidate["candidate_id"], RulesStore(tmp_path))


def test_improve_needs_failures(setup, tmp_path):  # noqa: F811
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=lambda t, a, i: ScriptedClient([text(GOOD_ANSWER)]))
    report = baseline_report(runner)
    improver = Improver(runner, RulesStore(tmp_path), ScriptedClient([]), "m", tmp_path / "cands")
    with pytest.raises(ValueError):
        improver.run(report, AgentConfig())


def test_promote_eval_run_copies_verifiers(setup, tmp_path):  # noqa: F811
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root, client_factory=lambda t, a, i: ScriptedClient([text("坏回答")]))
    report = baseline_report(runner)
    run_id = report["arms"][0]["tasks"][1]["trials"][0]["run_id"]
    result = promote(run_id, lab.store, regressions_dir=tmp_path / "reg", tasks_root=root)
    data = yaml.safe_load(open(result["path"], encoding="utf8"))["tasks"][0]
    assert data["id"] == f"reg-{run_id}" and data["tags"] == ["regression", "from:kv-sections"]
    assert data["verifiers"][0]["type"] == "cites_section"
    assert "状态 ok" in data["note"]
    with pytest.raises(ValueError):
        promote(run_id, lab.store, regressions_dir=tmp_path / "reg", tasks_root=root)


def test_promote_plain_run_uses_generic_verifiers(setup, tmp_path):  # noqa: F811
    lab, root, _ = setup
    outcome = lab.run("随便问问", AgentConfig(), client=ScriptedClient([text("没有引用")]))
    result = promote(outcome.run_id, lab.store, regressions_dir=tmp_path / "reg", tasks_root=root)
    data = yaml.safe_load(open(result["path"], encoding="utf8"))["tasks"][0]
    assert [v["type"] for v in data["verifiers"]] == ["status_ok", "citations_verified"]


def test_proposal_retries_once_then_reports_raw(setup, tmp_path):  # noqa: F811
    lab, root, out = setup
    runner = EvalRunner(lab, out, tasks_root=root)
    retry_ok = Improver(runner, RulesStore(tmp_path), ScriptedClient([text(""), text('["先读原文再引用"]')]), "m", tmp_path)
    proposal = retry_ok.propose([{"task_id": "t"}], [])
    assert proposal["attempts"] == 2 and proposal["rules_added"] == ["先读原文再引用"]
    both_bad = Improver(runner, RulesStore(tmp_path), ScriptedClient([text("想一想"), text("还是不给")]), "m", tmp_path)
    with pytest.raises(ValueError, match="还是不给"):
        both_bad.propose([{"task_id": "t"}], [])
