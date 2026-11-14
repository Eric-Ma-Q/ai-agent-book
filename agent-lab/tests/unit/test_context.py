from agent_lab.config import AgentConfig
from agent_lab.context import ContextInputs, build_context, build_system_prompt
from agent_lab.tools.registry import RunState


def round_(i, result="结果" * 50):
    call = {"id": f"c{i}", "type": "function", "function": {"name": "search_book", "arguments": "{}"}}
    return [
        {"role": "assistant", "content": None, "tool_calls": [call]},
        {"role": "tool", "tool_call_id": f"c{i}", "content": result},
    ]


SESSION = [{"role": "user", "content": "上一个问题"}, {"role": "assistant", "content": "上一个回答"}]
HISTORY = SESSION + [{"role": "user", "content": "现在的问题"}] + round_(1) + round_(2)


def inputs(**cfg):
    return ContextInputs(
        system_prompt="系统提示",
        history=HISTORY,
        question_index=2,
        config=AgentConfig(**cfg),
        state=RunState(sections_read=[(2, "kv-cache")]),
        turn=3,
        tokens_used=1234,
    )


def contents(messages):
    return [m.get("content") for m in messages]


def test_full_context_keeps_everything():
    result = build_context(inputs())
    assert result.messages[0] == {"role": "system", "content": "系统提示"}
    assert result.messages[1:] == HISTORY
    assert result.notes == []


def test_drop_history_keeps_question_and_last_round():
    result = build_context(inputs(drop_history=True))
    roles = [m["role"] for m in result.messages]
    assert roles == ["system", "user", "assistant", "tool"]
    assert result.messages[1]["content"] == "现在的问题"
    assert result.messages[2]["tool_calls"][0]["id"] == "c2"


def test_drop_tool_results_replaces_content():
    result = build_context(inputs(drop_tool_results=True))
    tool_msgs = [m for m in result.messages if m["role"] == "tool"]
    assert all(m["content"] == "（工具结果已省略）" for m in tool_msgs)
    assert HISTORY[4]["content"].startswith("结果")  # 原历史不被修改


def test_status_bar_appended():
    result = build_context(inputs(status_bar=True))
    last = result.messages[-1]
    assert last["role"] == "user" and "[状态栏" in last["content"]
    assert "第 3/12 轮" in last["content"] and "ch2#kv-cache" in last["content"]


def test_status_bar_warns_near_the_turn_limit():
    late = inputs(status_bar=True, final_answer=True)
    late = ContextInputs(**{**late.__dict__, "turn": 11})
    assert "只剩 1 轮" in build_context(late).messages[-1]["content"]
    final = ContextInputs(**{**late.__dict__, "turn": 12})
    assert "工具已关闭" in build_context(final).messages[-1]["content"]


def test_truncate_compression_shrinks_old_tool_results():
    long_history = SESSION + [{"role": "user", "content": "问"}] + round_(1, "长" * 30000) + round_(2, "短")
    ins = inputs(compression="truncate", compress_after_tokens=1000, keep_recent_tool_results=1)
    ins = ContextInputs(**{**ins.__dict__, "history": long_history})
    result = build_context(ins)
    tool_msgs = [m for m in result.messages if m["role"] == "tool"]
    assert tool_msgs[0]["content"].startswith("[已压缩")
    assert tool_msgs[1]["content"] == "短"
    assert result.notes and result.notes[0]["kind"] == "compressed"


def test_truncate_not_applied_under_threshold():
    result = build_context(inputs(compression="truncate", compress_after_tokens=100000))
    assert result.notes == []


def test_system_prompt_stable_prefix():
    a = build_system_prompt("基础", AgentConfig(), memories=[], rules=[])
    b = build_system_prompt("基础", AgentConfig(), memories=[], rules=[])
    assert a == b == "基础"


def test_system_prompt_unstable_prefix_changes_each_call():
    cfg = AgentConfig(stable_prefix=False)
    a = build_system_prompt("基础", cfg, memories=[], rules=[])
    b = build_system_prompt("基础", cfg, memories=[], rules=[])
    assert a != b and a.endswith("基础")


def test_system_prompt_includes_memories_and_rules():
    text = build_system_prompt("基础", AgentConfig(memory=True, learned_rules=True), memories=["读者问过 KV Cache"], rules=["引用前先读小节"])
    assert "读者问过 KV Cache" in text and "引用前先读小节" in text


def test_memories_and_rules_ignored_when_switched_off():
    text = build_system_prompt("基础", AgentConfig(), memories=["m"], rules=["r"])
    assert text == "基础"
