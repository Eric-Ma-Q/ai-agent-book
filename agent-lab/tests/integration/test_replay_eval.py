"""用录制的真实响应回放 replay 任务集：零成本、结果确定，作为 pre-push 的自动测试。

回放要求判定与录制时逐项一致（tests/cassettes/evals/expected.json），而不是要求全部通过：
录制时模型真实失败的任务，回放时也应该失败。验证器改动导致判定变化时，测试会失败，
确认变化合理后用 --write-expected 更新。
"""

import json
from pathlib import Path

import pytest

from agent_lab.cli import main

HERE = Path(__file__).resolve().parents[1]
CASSETTES = HERE / "cassettes" / "evals"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LAB_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("LAB_LLM_API_KEY", "unused")
    monkeypatch.setenv("LAB_MODEL", "big-pickle")
    return tmp_path


def args(env, replay_dir, *extra):
    return [
        "eval", "--suite", "replay", "--trials", "1", "--no-regressions", "--book-dir", str(HERE / "fixtures" / "book"),
        "--replay", str(replay_dir), "--out", str(env / "evals"), *extra,
    ]


def test_replay_reproduces_recorded_verdicts(env, capsys):
    code = main(args(env, CASSETTES, "--check-expected"))
    output = capsys.readouterr().out
    assert code == 0, output
    assert "逐项一致" in output
    expected = json.loads((CASSETTES / "expected.json").read_text("utf8"))
    passed = sum(v[0] for v in expected.values())
    assert f"{passed}/{len(expected)}" in output
    eval_dir = next((env / "evals").iterdir())
    assert main(["verify", str(eval_dir)]) == 0
    assert "复核通过" in capsys.readouterr().out


def test_missing_cassettes_fail_loudly(env, capsys):
    (env / "missing").mkdir()
    (env / "missing" / "expected.json").write_text((CASSETTES / "expected.json").read_text("utf8"), "utf8")
    assert main(args(env, env / "missing", "--check-expected")) == 1
    assert "不一致" in capsys.readouterr().out
