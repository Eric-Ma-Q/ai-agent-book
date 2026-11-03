"""审核者接入主循环：退回 → 修改 → 通过、轮数上限、无法解析、出错、预算。"""

import json

from agent_lab.agent import run_agent
from agent_lab.config import AgentConfig
from agent_lab.llm.client import LLMError
from agent_lab.llm.scripted import ScriptedClient
from tests.helpers import GOOD_ANSWER, Recorder, deps, text, tool

BAD_ANSWER = "前缀稳定很重要。[[ch2#kv-cache-的原理与约束|这句话书里根本没有出现过]]"


def verdict(kind, *issues, **kw):
    return text(json.dumps({"verdict": kind, "issues": list(issues)}, ensure_ascii=False), **kw)


def infos(rec, kind):
    return [e for e in rec.of("info") if e.kind == kind]


def test_reviewer_off_makes_no_extra_call():
    client = ScriptedClient([text(GOOD_ANSWER)])
    run_agent(deps(client), "q", AgentConfig(), run_id="r", emit=Recorder())
    assert len(client.requests) == 1


def test_revise_then_main_agent_fixes_answer():
    rec = Recorder()
    client = ScriptedClient([text(BAD_ANSWER), verdict("revise", "第 1 条引用在原文中找不到"), tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "为什么前缀要稳定？", AgentConfig(reviewer="evidence"), run_id="r", emit=rec)
    assert outcome.status == "ok" and outcome.answer == GOOD_ANSWER
    review_request = client.requests[1]
    assert review_request.tools is None
    assert "原文中找不到" in review_request.messages[1]["content"]
    # The main agent continues the same conversation with the feedback as a user message.
    third = client.requests[2].messages
    assert third[-1]["role"] == "user" and "第 1 条引用在原文中找不到" in third[-1]["content"]
    assert third[-2] == {"role": "assistant", "content": BAD_ANSWER}
    agents = [(e.type, e.agent) for e in rec.events if e.type in ("llm_request", "llm_response")]
    assert agents[2:4] == [("llm_request", "reviewer"), ("llm_response", "reviewer")]
    assert [e.purpose for e in rec.of("llm_request")] == ["agent", "review", "agent", "agent"]
    [v] = infos(rec, "review_verdict")
    assert v.agent == "reviewer" and v.detail == {"round": 1, "mode": "evidence", "verdict": "revise", "issues": ["第 1 条引用在原文中找不到"]}
    end = rec.of("run_end")[0]
    assert end.citation_check["verified"] == 1
    assert set(end.totals["by_agent"]) == {"main", "reviewer"}
    assert end.totals["turns"] == 3


def test_self_review_input_has_no_evidence():
    client = ScriptedClient([text(BAD_ANSWER), verdict("pass")])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self"), run_id="r", emit=Recorder())
    assert outcome.answer == BAD_ANSWER
    assert "引用核对结果" not in client.requests[1].messages[1]["content"]


def test_rounds_limit_last_revision_is_final():
    rec = Recorder()
    client = ScriptedClient([text("初稿"), verdict("revise", "太短"), text("二稿")])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self", review_rounds=1), run_id="r", emit=rec)
    assert outcome.answer == "二稿" and len(client.requests) == 3


def test_two_rounds():
    client = ScriptedClient([text("初稿"), verdict("revise", "太短"), text("二稿"), verdict("revise", "还缺引用"), text("三稿")])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self", review_rounds=2), run_id="r", emit=Recorder())
    assert outcome.answer == "三稿" and len(client.requests) == 5


def test_unparsed_verdict_is_retried_once():
    rec = Recorder()
    phantom = tool("bash", {"command": "ls"})  # 真实录制中出现过：没给工具，模型仍然调用不存在的工具，正文为空
    client = ScriptedClient([text(BAD_ANSWER), phantom, verdict("revise", "引用找不到"), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="evidence"), run_id="r", emit=rec)
    assert outcome.answer == GOOD_ANSWER
    retry = client.requests[2]
    assert retry.tools is None
    assert retry.messages[:2] == client.requests[1].messages
    assert retry.messages[2]["role"] == "user" and "只输出" in retry.messages[2]["content"]
    assert infos(rec, "review_retry")[0].detail == {"round": 1, "raw": ""}
    assert [e.purpose for e in rec.of("llm_request")] == ["agent", "review", "review", "agent"]


def test_unparsed_twice_counts_as_pass():
    rec = Recorder()
    client = ScriptedClient([text(GOOD_ANSWER), text("我觉得挺好"), text("还是挺好")])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self"), run_id="r", emit=rec)
    assert outcome.status == "ok" and outcome.answer == GOOD_ANSWER
    assert infos(rec, "review_unparsed")[0].detail["raw"] == "还是挺好"


def test_reviewer_llm_error_keeps_answer():
    rec = Recorder()
    client = ScriptedClient([text(GOOD_ANSWER), LLMError("reviewer down")])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="evidence"), run_id="r", emit=rec)
    assert outcome.status == "ok" and outcome.answer == GOOD_ANSWER
    assert rec.of("llm_response")[-1].error == "reviewer down"
    assert infos(rec, "review_failed")[0].detail["error"] == "reviewer down"


def test_revision_running_out_of_turns_keeps_previous_answer():
    rec = Recorder()
    client = ScriptedClient([text("初稿"), verdict("revise", "补引用"), tool("search_book", {"query": "x"})])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self", max_turns=2), run_id="r", emit=rec)
    assert outcome.status == "ok" and outcome.answer == "初稿"
    assert infos(rec, "revision_incomplete")[0].detail["status"] == "max_turns"


def test_reviewer_counts_toward_budget():
    client = ScriptedClient([text(GOOD_ANSWER, prompt=500), verdict("pass", prompt=600)])
    outcome = run_agent(deps(client), "q", AgentConfig(reviewer="self", max_total_tokens=1000), run_id="r", emit=Recorder())
    assert outcome.status == "budget_exceeded"
