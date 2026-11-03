import threading

from agent_lab.agent import run_agent
from agent_lab.config import AgentConfig
from agent_lab.llm.client import LLMError
from agent_lab.llm.scripted import ScriptedClient
from tests.helpers import GOOD_ANSWER, LONG_BOOK, Recorder, deps, text, tool


def test_tool_round_then_cited_answer():
    rec = Recorder()
    script = [tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER, prompt=200, cached=100)]
    outcome = run_agent(deps(script), "为什么前缀要稳定？", AgentConfig(), run_id="r", emit=rec)
    assert outcome.status == "ok"
    assert rec.types() == ["run_start", "llm_request", "llm_response", "tool_call", "llm_request", "llm_response", "run_end"]
    call = rec.of("tool_call")[0]
    assert call.name == "search_book" and call.error is None and "kv-cache" in call.result
    end = rec.of("run_end")[0]
    assert end.citation_check["verified"] == 1
    assert end.citations[0]["link"].startswith("/book/chapter2/")
    assert end.totals["prompt_tokens"] == 300 and end.totals["cached_tokens"] == 100
    assert end.totals["llm_calls"] == 2 and end.totals["tool_calls"] == 1
    assert end.totals["cost"] == 0.0
    assert end.totals["reference_cost"] > 0


def test_second_request_contains_tool_result():
    client = ScriptedClient([tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])
    run_agent(deps(client), "q", AgentConfig(), run_id="r", emit=Recorder())
    second = client.requests[1].messages
    assert [m["role"] for m in second] == ["system", "user", "assistant", "tool"]
    assert "reasoning_content" not in second[2]
    assert second[3]["tool_call_id"] == "c1"


def test_drop_tool_definitions_sends_no_tools():
    client = ScriptedClient([text("凭记忆回答")])
    run_agent(deps(client), "q", AgentConfig(drop_tool_definitions=True), run_id="r", emit=Recorder())
    assert client.requests[0].tools is None


def test_max_turns():
    script = [tool("search_book", {"query": "x"}, call_id=f"c{i}") for i in range(3)]
    rec = Recorder()
    outcome = run_agent(deps(script), "q", AgentConfig(max_turns=3), run_id="r", emit=rec)
    assert outcome.status == "max_turns"
    assert len(rec.of("llm_request")) == 3


def test_final_answer_turn_has_no_tools():
    script = [tool("search_book", {"query": "x"}, call_id="c1"), text("用已有材料回答")]
    client = ScriptedClient(script)
    outcome = run_agent(
        deps(client), "q", AgentConfig(max_turns=2, final_answer=True, tools=("search_book",)), run_id="r", emit=Recorder()
    )
    assert outcome.status == "ok" and outcome.answer == "用已有材料回答"
    assert client.requests[0].tools is not None
    assert client.requests[1].tools is None


def test_final_answer_turn_without_text_still_reports_max_turns():
    script = [tool("search_book", {"query": "x"}, call_id="c1"), tool("search_book", {"query": "y"}, call_id="c2")]
    outcome = run_agent(
        deps(script), "q", AgentConfig(max_turns=2, final_answer=True, tools=("search_book",)), run_id="r", emit=Recorder()
    )
    assert outcome.status == "max_turns"


def test_budget_exceeded():
    script = [tool("search_book", {"query": "x"}, prompt=900, completion=200), text("不会到这里")]
    outcome = run_agent(deps(script), "q", AgentConfig(max_total_tokens=1000), run_id="r", emit=Recorder())
    assert outcome.status == "budget_exceeded"


def test_llm_error_recorded():
    rec = Recorder()
    outcome = run_agent(deps([LLMError("upstream down")]), "q", AgentConfig(), run_id="r", emit=rec)
    assert outcome.status == "llm_error"
    assert rec.of("llm_response")[0].error == "upstream down"
    assert "upstream down" in rec.of("run_end")[0].error


def test_unexpected_client_failure_is_error_status():
    class Broken:
        def complete(self, request):
            raise RuntimeError("cassette miss")

    outcome = run_agent(deps(Broken()), "q", AgentConfig(), run_id="r", emit=Recorder())
    assert outcome.status == "error"


def test_unknown_tool_is_reported_to_model():
    rec = Recorder()
    run_agent(deps([tool("delete_everything"), text("好的")]), "q", AgentConfig(), run_id="r", emit=rec)
    assert rec.of("tool_call")[0].error == "未知工具：delete_everything"


def test_tool_not_enabled_in_config_is_unknown():
    rec = Recorder()
    cfg = AgentConfig(tools=("search_book",))
    run_agent(deps([tool("read_section", {"chapter": 2, "section_id": "工具"}), text("x")]), "q", cfg, run_id="r", emit=rec)
    assert rec.of("tool_call")[0].error == "未知工具：read_section"


def test_missing_tool_call_id_is_generated():
    response = tool("list_chapters")
    response.message["tool_calls"][0].pop("id")
    rec = Recorder()
    run_agent(deps([response, text("x")]), "q", AgentConfig(), run_id="r", emit=rec)
    assert rec.of("tool_call")[0].call_id == "call_1_0"


def test_cancel_before_first_turn():
    cancel = threading.Event()
    cancel.set()
    outcome = run_agent(deps([]), "q", AgentConfig(), run_id="r", emit=Recorder(), cancel=cancel)
    assert outcome.status == "cancelled"


def test_session_history_is_sent():
    client = ScriptedClient([text("第二次回答")])
    session = [{"role": "user", "content": "旧问题"}, {"role": "assistant", "content": "旧回答"}]
    run_agent(deps(client), "新问题", AgentConfig(), run_id="r", emit=Recorder(), session_history=session)
    contents = [m["content"] for m in client.requests[0].messages[1:]]
    assert contents == ["旧问题", "旧回答", "新问题"]


def test_distractor_tools_are_offered():
    client = ScriptedClient([text("x")])
    run_agent(deps(client), "q", AgentConfig(distractor_tools=3), run_id="r", emit=Recorder())
    names = [t["function"]["name"] for t in client.requests[0].tools]
    assert len(names) == 6 and "web_search" in names


def test_summarize_compression_calls_model_and_rewrites_history():
    script = [
        tool("read_section", {"chapter": 2, "section_id": "kv-cache-的原理与约束"}, call_id="a"),
        tool("read_section", {"chapter": 2, "section_id": "kv-cache-的原理与约束", "offset": 0}, call_id="b"),
        text("摘要：读过 ch2 两个小节"),
        text(GOOD_ANSWER),
    ]
    client = ScriptedClient(script)
    rec = Recorder()
    cfg = AgentConfig(compression="summarize", compress_after_tokens=1000)
    outcome = run_agent(deps(client, book=LONG_BOOK), "q", cfg, run_id="r", emit=rec)
    assert outcome.status == "ok"
    purposes = [e.purpose for e in rec.of("llm_request")]
    assert "summary" in purposes
    final = client.requests[-1].messages
    assert any("[之前工作的摘要]" in str(m.get("content")) for m in final)
    assert rec.of("info")[0].kind == "compressed"


def test_memory_and_rules_hooks():
    class Memory:
        def __init__(self):
            self.saved = []

        def recall(self, question):
            return ["读者问过 KV Cache"]

        def remember(self, question, answer):
            self.saved.append((question, answer))

    class Rules:
        def active(self):
            return ["引用前先读小节"]

    memory = Memory()
    client = ScriptedClient([text(GOOD_ANSWER)])
    rec = Recorder()
    cfg = AgentConfig(memory=True, learned_rules=True)
    run_agent(deps(client, memory=memory, rules=Rules()), "q", cfg, run_id="r", emit=rec)
    system = client.requests[0].messages[0]["content"]
    assert "读者问过 KV Cache" in system and "引用前先读小节" in system
    assert memory.saved and memory.saved[0][0] == "q"
    assert {"memory_recalled", "rules_applied", "memory_saved"} <= {e.kind for e in rec.of("info")}


def test_unknown_configured_tool_is_error():
    outcome = run_agent(deps([]), "q", AgentConfig(tools=("nope",)), run_id="r", emit=Recorder())
    assert outcome.status == "error"
