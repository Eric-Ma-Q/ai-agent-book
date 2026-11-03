from agent_lab.config import AgentConfig
from agent_lab.multi.subagent import DELEGATE, MAX_DELEGATIONS, SUB_TOOLS, main_tools, sub_config, sub_history
from agent_lab.prompts import BASE_PROMPT, MANAGER_PROMPT, system_prompt_for

QUESTION = {"role": "user", "content": "前缀为什么要稳定？"}
CALL1 = {"role": "assistant", "content": None, "tool_calls": [{"id": "d1", "type": "function", "function": {"name": "delegate", "arguments": "{}"}}]}
RESULT1 = {"role": "tool", "tool_call_id": "d1", "content": "要点一"}
CALL2 = {"role": "assistant", "content": "再查一下", "tool_calls": [{"id": "d2", "type": "function", "function": {"name": "delegate", "arguments": "{}"}}]}


def test_isolated_gets_only_the_task():
    assert sub_history("isolated", [QUESTION, CALL1, RESULT1, CALL2], "查 KV 缓存") == ([{"role": "user", "content": "任务：查 KV 缓存"}], 0)


def test_shared_gets_everything_before_the_pending_call():
    history, question_index = sub_history("shared", [QUESTION, CALL1, RESULT1, CALL2], "查 KV 缓存")
    assert history == [QUESTION, CALL1, RESULT1, {"role": "user", "content": "任务：查 KV 缓存"}]
    assert question_index == 3


def test_shared_drops_results_already_appended_after_the_pending_call():
    batch = {**CALL2, "tool_calls": [*CALL2["tool_calls"], {"id": "x", "type": "function", "function": {"name": "list_chapters", "arguments": "{}"}}]}
    history, _ = sub_history("shared", [QUESTION, batch, {"role": "tool", "tool_call_id": "x", "content": "目录"}], "任务甲")
    assert history == [QUESTION, {"role": "user", "content": "任务：任务甲"}]


def test_main_agent_delegates_instead_of_reading():
    cfg = AgentConfig(subagent="isolated", tools=("list_chapters", "search_book", "read_section", "run_python"))
    assert main_tools(cfg) == ("list_chapters", "run_python")
    assert main_tools(AgentConfig()) == AgentConfig().tools


def test_sub_config_is_a_plain_book_reader():
    cfg = AgentConfig(subagent="shared", reviewer="evidence", memory=True, learned_rules=True, subagent_max_turns=3, distractor_tools=2)
    sub = sub_config(cfg)
    assert sub.tools == SUB_TOOLS and sub.max_turns == 3
    assert (sub.subagent, sub.reviewer, sub.memory, sub.learned_rules) == ("none", "none", False, False)
    assert sub.distractor_tools == 2 and sub.max_total_tokens == cfg.max_total_tokens


def test_delegate_spec_and_limit():
    assert DELEGATE.name == "delegate" and "task" in DELEGATE.params.model_json_schema()["properties"]
    assert MAX_DELEGATIONS == 4


def test_manager_prompt_only_when_delegate_is_available():
    assert system_prompt_for(["list_chapters", "search_book", "read_section"]) == BASE_PROMPT
    prompt = system_prompt_for(["list_chapters", "delegate"])
    assert prompt.startswith(MANAGER_PROMPT) and "delegate" in prompt
