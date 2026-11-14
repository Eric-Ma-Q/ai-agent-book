import pytest

from agent_lab.cli import main
from agent_lab.gate import GateStore
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.stores import RulesStore
from tests.helpers import BOOK_MD, GOOD_ANSWER, text
from tests.unit.test_eval_runner import TASKS


@pytest.fixture
def env(tmp_path, monkeypatch):
    book = tmp_path / "book"
    book.mkdir()
    (book / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    monkeypatch.setenv("LAB_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("LAB_BOOK_DIR", str(book))
    monkeypatch.setenv("LAB_LLM_API_KEY", "unused")
    script = ScriptedClient([text(GOOD_ANSWER)] * 40)
    monkeypatch.setattr("agent_lab.runtime.default_client", lambda settings: script)
    root = tmp_path / "tasks"
    (root / "mini").mkdir(parents=True)
    (root / "mini" / "a.yaml").write_text(TASKS, encoding="utf8")
    return tmp_path


def run_eval(env, *extra):
    return main(["eval", "--suite", "mini", "--trials", "1", "--tasks-dir", str(env / "tasks"), "--out", str(env / "evals"), *extra])


def test_compare(env, capsys):
    assert main(["compare", "为什么？", "--b-set", "status_bar=true"]) == 0
    out = capsys.readouterr().out
    assert "配置差异" in out and "status_bar" in out and "引用通过/总数" in out


def test_eval_single_and_ab(env, capsys):
    assert run_eval(env, "--label", "测试") == 0
    assert "2/2 = 100%" in capsys.readouterr().out
    assert run_eval(env, "--b-set", "status_bar=true") == 0
    assert "A/B 结论" in capsys.readouterr().out
    assert run_eval(env, "--min-pass-rate", "1.01") == 1


def test_verify_without_manifest_is_reported(env, capsys):
    (env / "x").mkdir()
    assert main(["verify", str(env / "x")]) == 2
    assert "错误" in capsys.readouterr().err


def test_promote_and_actions_and_rules(env, capsys):
    from agent_lab.cli import main as cli

    assert cli(["ask", "随便问问", "--quiet"]) == 0
    run_id = capsys.readouterr().err.split("run_id: ")[1].strip()
    assert cli(["promote", run_id]) == 0
    assert "已加入回归集" in capsys.readouterr().out

    gate = GateStore(env / "data", executors={"insert": lambda p: {}})
    action = gate.create("insert", {"chapter": 2, "after": "x"}, run_id=run_id)
    assert cli(["actions"]) == 0
    assert action.action_id in capsys.readouterr().out
    assert cli(["actions", "--reject", action.action_id]) == 0
    assert "rejected" in capsys.readouterr().out

    RulesStore(env / "data").add_version(["规则一"], source="test", evidence=None)
    assert cli(["rules"]) == 0
    assert "* v1" in capsys.readouterr().out
    assert cli(["rules", "--activate", "0"]) == 0
    assert "* v0" in capsys.readouterr().out


def test_improve_adopt_unknown_candidate(env, capsys):
    assert main(["improve", "--adopt", "nope"]) == 2
    assert "不存在" in capsys.readouterr().err


def test_profile_flag_reaches_config():
    from agent_lab.cli import build_config, parser

    from agent_lab.config import Settings

    args = parser().parse_args(["ask", "问题", "--profile", "glm-flash"])
    assert build_config(args, Settings()).model_profile == "glm-flash"
    assert parser().parse_args(["compare", "问题", "--profile", "glm-flash"]).profile == "glm-flash"
    assert parser().parse_args(["eval", "--suite", "core", "--profile", "glm-flash"]).profile == "glm-flash"
