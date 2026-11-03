from pathlib import Path

import pytest

from agent_lab.agent import run_agent
from agent_lab.cli import main
from agent_lab.config import AgentConfig
from agent_lab.llm.client import LLMError
from agent_lab.render import render_run
from agent_lab.trace.schema import Gate, Info
from tests.helpers import GOOD_ANSWER, Recorder, deps, text, tool

HERE = Path(__file__).resolve().parents[1]


def test_render_full_run():
    rec = Recorder()
    run_agent(deps([tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)]), "问题？", AgentConfig(), run_id="r", emit=rec)
    rec(Info(turn=1, kind="compressed", detail={"mode": "truncate"}))
    rec(Gate(action_id="a1", kind="insert", payload={}, status="pending"))
    output = render_run(rec.events)
    assert "问题：问题？" in output
    assert "── 第 1 轮" in output and "→ search_book" in output
    assert "思路：" not in output  # 工具调用轮没有正文内容
    assert "状态：完成" in output
    assert "核对通过 1" in output
    assert "※ compressed" in output and "⚑ 待确认动作 a1" in output
    assert "缓存命中率 0%" in output


def test_render_error_run():
    rec = Recorder()
    run_agent(deps([LLMError("down")]), "q", AgentConfig(), run_id="r", emit=rec)
    output = render_run(rec.events)
    assert "模型出错：down" in output and "模型接口出错" in output


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LAB_BOOK_DIR", str(HERE / "fixtures" / "book"))
    monkeypatch.setenv("LAB_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LAB_LLM_API_KEY", "unused")
    return tmp_path


def test_cli_ask_replay_show_and_runs(env, capsys):
    question = "Agent 的核心公式是什么？三个组成部分分别起什么作用？"
    code = main(["ask", question, "--replay", str(HERE / "cassettes" / "ask_formula.json"), "--quiet"])
    assert code == 0
    captured = capsys.readouterr()
    run_id = captured.err.strip().split("run_id: ")[1]
    assert "LLM" in captured.out

    assert main(["show", run_id]) == 0
    assert "── 结果" in capsys.readouterr().out
    assert main(["show", run_id, "--json"]) == 0
    assert '"type": "run_start"' in capsys.readouterr().out
    assert main(["runs"]) == 0
    assert run_id in capsys.readouterr().out


def test_cli_reports_bad_override(env, capsys):
    assert main(["ask", "q", "--set", "nonsense"]) == 2
    assert "key=value" in capsys.readouterr().err


def test_cli_show_missing_run(env, capsys):
    assert main(["show", "20991231-000000-0000"]) == 2
