"""子 Agent 接入主循环：委派 → 子 Agent 查书 → 主 Agent 作答，以及各种失败。"""

import json

from agent_lab.agent import run_agent
from agent_lab.config import AgentConfig
from agent_lab.llm.client import LLMError
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.prompts import MANAGER_PROMPT, SUBAGENT_PROMPT
from tests.helpers import GOOD_ANSWER, Recorder, deps, text, tool

POINTS = "- 前缀稳定提高缓存命中。[[ch2#kv-cache-的原理与约束|前缀稳定时，缓存命中率更高]]"


def delegate(task="查前缀稳定与缓存命中的关系", call_id="d1", **kw):
    return tool("delegate", {"task": task}, call_id=call_id, **kw)


def names(request):
    return [t["function"]["name"] for t in request.tools or []]


def infos(rec, kind):
    return [e for e in rec.of("info") if e.kind == kind]


def test_isolated_subagent_round_trip():
    rec = Recorder()
    client = ScriptedClient([delegate(), tool("search_book", {"query": "缓存"}, call_id="s1"), text(POINTS), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "前缀为什么要稳定？", AgentConfig(subagent="isolated"), run_id="r", emit=rec)
    assert outcome.status == "ok" and outcome.answer == GOOD_ANSWER
    main1, sub1, sub2, main2 = client.requests
    assert names(main1) == ["list_chapters", "delegate"]
    assert main1.messages[0]["content"].startswith(MANAGER_PROMPT)
    assert names(sub1) == ["list_chapters", "search_book", "read_section"]
    assert sub1.messages[0]["content"].startswith(SUBAGENT_PROMPT)
    assert [m["role"] for m in sub1.messages] == ["system", "user"]
    assert sub1.messages[1]["content"] == "任务：查前缀稳定与缓存命中的关系"
    assert main2.messages[-1] == {"role": "tool", "tool_call_id": "d1", "content": POINTS}
    calls = rec.of("tool_call")
    assert [(c.agent, c.name) for c in calls] == [("sub-1", "search_book"), ("main", "delegate")]
    assert [(e.agent, e.turn) for e in rec.of("llm_request")] == [("main", 1), ("sub-1", 1), ("sub-1", 2), ("main", 2)]
    [start], [end_info] = infos(rec, "subagent_start"), infos(rec, "subagent_end")
    assert start.agent == "main" and start.detail == {"agent": "sub-1", "mode": "isolated", "task": "查前缀稳定与缓存命中的关系", "call_id": "d1", "input_messages": 1}
    assert end_info.detail["agent"] == "sub-1" and end_info.detail["status"] == "ok" and end_info.detail["turns"] == 2
    end = rec.of("run_end")[0]
    assert end.citation_check["verified"] == 1
    assert set(end.totals["by_agent"]) == {"main", "sub-1"} and end.totals["tool_calls"] == 2
    assert end.totals["turns"] == 2


def test_shared_subagent_sees_the_conversation():
    client = ScriptedClient([delegate(), text(POINTS), text(GOOD_ANSWER)])
    run_agent(deps(client), "前缀为什么要稳定？", AgentConfig(subagent="shared"), run_id="r", emit=Recorder())
    sub = client.requests[1].messages
    assert [m["role"] for m in sub] == ["system", "user", "user"]
    assert sub[1]["content"] == "前缀为什么要稳定？" and sub[2]["content"].startswith("任务：")


def test_delegation_limit():
    script = []
    for i in range(4):
        script += [delegate(call_id=f"d{i}"), text(POINTS)]
    script += [delegate(call_id="d4"), text(GOOD_ANSWER)]
    rec = Recorder()
    client = ScriptedClient(script)
    outcome = run_agent(deps(client), "q", AgentConfig(subagent="isolated"), run_id="r", emit=rec)
    assert outcome.status == "ok" and len(client.requests) == 10
    last = rec.of("tool_call")[-1]
    assert last.name == "delegate" and "最多委派 4 次" in last.error
    assert len(infos(rec, "subagent_start")) == 4


def test_subagent_out_of_turns_returns_error_to_main():
    rec = Recorder()
    client = ScriptedClient([delegate(), tool("search_book", {"query": "x"}, call_id="s1"), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "q", AgentConfig(subagent="isolated", subagent_max_turns=1), run_id="r", emit=rec)
    assert outcome.status == "ok"
    call = [c for c in rec.of("tool_call") if c.name == "delegate"][0]
    assert "max_turns" in call.error and json.loads(call.result)["error"] == call.error
    assert infos(rec, "subagent_end")[0].detail["status"] == "max_turns"


def test_subagent_llm_error_returns_error_to_main():
    rec = Recorder()
    client = ScriptedClient([delegate(), LLMError("sub down"), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "q", AgentConfig(subagent="isolated"), run_id="r", emit=rec)
    assert outcome.status == "ok"
    assert "llm_error" in [c for c in rec.of("tool_call") if c.name == "delegate"][0].error


def test_subagent_shares_the_token_budget():
    client = ScriptedClient([delegate(prompt=400), text(POINTS, prompt=700), text("不会到这里")])
    outcome = run_agent(deps(client), "q", AgentConfig(subagent="isolated", max_total_tokens=1000), run_id="r", emit=Recorder())
    assert outcome.status == "budget_exceeded"


def test_invalid_delegate_arguments():
    rec = Recorder()
    client = ScriptedClient([tool("delegate", {"what": 1}), text(GOOD_ANSWER)])
    outcome = run_agent(deps(client), "q", AgentConfig(subagent="isolated"), run_id="r", emit=rec)
    assert outcome.status == "ok" and len(client.requests) == 2
    assert "参数" in rec.of("tool_call")[0].error and not infos(rec, "subagent_start")


def test_delegate_is_not_offered_without_the_switch():
    client = ScriptedClient([text(GOOD_ANSWER)])
    run_agent(deps(client), "q", AgentConfig(), run_id="r", emit=Recorder())
    assert "delegate" not in names(client.requests[0])
