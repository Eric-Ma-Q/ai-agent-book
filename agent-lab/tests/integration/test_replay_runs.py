"""用录制的真实模型响应完整回放 Agent 运行：不访问网络，结果确定。

录制方法（需要真实模型接口）：
  LAB_BOOK_DIR=tests/fixtures/book uv run python -m agent_lab ask "<问题>" --record tests/cassettes/<名字>.json
"""

from pathlib import Path

import pytest

from agent_lab.config import AgentConfig, Settings
from agent_lab.llm.cassette import CassetteClient
from agent_lab.runtime import Lab

HERE = Path(__file__).resolve().parents[1]
QUESTION = "Agent 的核心公式是什么？三个组成部分分别起什么作用？"


@pytest.fixture
def lab_factory(tmp_path):
    def make(cassette: str) -> Lab:
        settings = Settings(book_dir_override=HERE / "fixtures" / "book", data_dir_override=tmp_path, llm_api_key="unused")
        return Lab.create(settings, client=CassetteClient(HERE / "cassettes" / cassette, mode="replay"))

    return make


def test_full_context_run_answers_with_citations(lab_factory):
    lab = lab_factory("ask_formula.json")
    outcome = lab.run(QUESTION, AgentConfig())
    assert outcome.status == "ok"
    assert outcome.totals["tool_calls"] >= 1
    events = lab.store.read(outcome.run_id)
    end = events[-1]
    assert end.citation_check["total"] >= 3
    assert end.citation_check["verified"] >= end.citation_check["total"] - 1
    assert "LLM" in outcome.answer and "工具" in outcome.answer


def test_dropping_tool_results_prevents_answer(lab_factory):
    lab = lab_factory("ask_formula_drop_results.json")
    outcome = lab.run(QUESTION, AgentConfig(drop_tool_results=True, max_turns=6))
    assert outcome.status == "max_turns"
    events = lab.store.read(outcome.run_id)
    requests = [e for e in events if e.type == "llm_request"]
    tool_messages = [m for m in requests[-1].messages if m["role"] == "tool"]
    assert tool_messages and all(m["content"] == "（工具结果已省略）" for m in tool_messages)


def test_replay_with_different_config_misses(lab_factory):
    lab = lab_factory("ask_formula.json")
    outcome = lab.run(QUESTION, AgentConfig(temperature=0.9))
    assert outcome.status == "error"
    assert "CassetteMiss" in lab.store.read(outcome.run_id)[-1].error


def test_reviewer_with_evidence_sends_answer_back(lab_factory):
    # 录制于 2026-10-11：审核者第一次输出为空（调用了不存在的工具），提醒后退回一条小节标错的引用，主 Agent 修改。
    lab = lab_factory("ask_formula_reviewer.json")
    outcome = lab.run(QUESTION, AgentConfig(reviewer="evidence"))
    assert outcome.status == "ok"
    events = lab.store.read(outcome.run_id)
    kinds = [e.kind for e in events if e.type == "info"]
    assert kinds == ["review_retry", "review_verdict"]
    verdict = next(e for e in events if e.type == "info" and e.kind == "review_verdict")
    assert verdict.agent == "reviewer" and verdict.detail["verdict"] == "revise"
    reviews = [e for e in events if e.type == "llm_request" and e.purpose == "review"]
    assert len(reviews) == 2 and "引用核对结果" in reviews[0].messages[1]["content"]
    assert set(outcome.totals["by_agent"]) == {"main", "reviewer"}


def test_isolated_subagent_reads_the_book(lab_factory):
    # 录制于 2026-10-11：主 Agent 先看目录再委派一次，子 Agent 查书 6 轮，主 Agent 引用 10 条全部核对通过。
    lab = lab_factory("ask_formula_subagent.json")
    outcome = lab.run(QUESTION, AgentConfig(subagent="isolated"))
    assert outcome.status == "ok"
    events = lab.store.read(outcome.run_id)
    main_tools = [e.name for e in events if e.type == "tool_call" and e.agent == "main"]
    sub_tools = [e.name for e in events if e.type == "tool_call" and e.agent == "sub-1"]
    assert main_tools == ["list_chapters", "delegate"]
    assert "read_section" in sub_tools and "delegate" not in sub_tools
    end = events[-1]
    assert end.citation_check["total"] == end.citation_check["verified"] == 10
    assert set(outcome.totals["by_agent"]) == {"main", "sub-1"}
