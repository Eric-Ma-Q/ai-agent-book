import json

import pytest

from agent_lab.trace.schema import Gate, RunEnd, RunStart, ToolCall
from evals.judge import Judge
from evals.verifiers import TrialView, run_verifier
from tests.helpers import BOOK, text

VERIFIED = {"chapter": 2, "section_id": "kv-cache-的原理与约束", "found_section_id": "kv-cache-的原理与约束", "quote": "q", "status": "verified"}
BROKEN = {**VERIFIED, "status": "not_found", "found_section_id": None}


def view(answer="", status="ok", citations=(), calls=(), gates=()):
    events = [RunStart(run_id="r", question="问题", config={}, config_hash="h"), *calls, *gates]
    events.append(RunEnd(status=status, answer=answer, citations=list(citations)))
    return TrialView.from_events(events, BOOK)


def call(name, result="{}", error=None):
    return ToolCall(turn=1, call_id="c", name=name, args="{}", result=result, error=error)


def gate(chapter=2, after="前缀稳定时，缓存命中率更高", markdown="## 补充\n缓存说明"):
    return Gate(action_id="a", kind="insert", payload={"chapter": chapter, "after": after, "markdown": markdown}, status="pending")


def check(spec, v, **params):
    return run_verifier(spec, params, v)


def test_status_ok():
    assert check("status_ok", view()).passed
    assert not check("status_ok", view(status="max_turns")).passed


def test_citations_verified():
    assert check("citations_verified", view(citations=[VERIFIED])).passed
    assert not check("citations_verified", view(citations=[VERIFIED, BROKEN])).passed
    assert check("citations_verified", view(citations=[VERIFIED, BROKEN]), allow_failures=1).passed
    assert not check("citations_verified", view(), min_count=1).passed


def test_cites_chapter_and_section():
    v = view(citations=[VERIFIED, {**BROKEN, "chapter": 3}])
    assert check("cites_chapter", v, any_of=[2]).passed
    assert not check("cites_chapter", v, any_of=[3]).passed  # 第 3 章的引用没有通过核对
    assert check("cites_section", v, any_of=["kv-cache-的原理与约束"]).passed
    assert not check("cites_section", v, any_of=["工具"]).passed


def test_answer_text_checks():
    v = view(answer="KV Cache 让前缀稳定的请求更便宜，成本是 12.5 元")
    assert check("answer_mentions", v, all_of=["kv cache", "前缀"]).passed
    assert not check("answer_mentions", v, all_of=["记忆"]).passed
    assert check("answer_mentions", v, any_of=["记忆", "便宜"]).passed
    assert not check("answer_mentions", v, any_of=["记忆"]).passed
    assert check("answer_not_mentions", v, none_of=["记忆"]).passed
    assert not check("answer_not_mentions", v, none_of=["前缀"]).passed
    assert check("answer_regex", v, pattern=r"\d+\.\d").passed
    assert check("numeric_answer", v, value=12.5).passed
    assert not check("numeric_answer", v, value=13).passed


def test_tool_checks():
    v = view(calls=[call("search_book"), call("search_book", error="x"), call("web_search", error="不可用")])
    assert check("tool_called", v, name="search_book").passed
    assert not check("tool_called", v, name="search_book", min=2).passed
    assert not check("tool_not_called", v, distractors=True).passed
    assert check("tool_not_called", v, names=["read_section"]).passed
    assert check("max_tool_calls", v, n=3).passed
    assert not check("max_tool_calls", v, n=2).passed


def test_insert_proposed():
    assert check("insert_proposed", view(gates=[gate()]), chapter=2).passed
    assert check("insert_proposed", view(gates=[gate()]), chapter=2, contains=["缓存"]).passed
    assert not check("insert_proposed", view(gates=[gate()]), chapter=2, contains=["记忆"]).passed
    assert not check("insert_proposed", view(gates=[gate(after="不存在的段落开头")]), chapter=2).passed
    assert not check("insert_proposed", view(gates=[gate(chapter=3)]), chapter=2).passed
    assert not check("insert_proposed", view(), chapter=2).passed


def test_action_and_refusal():
    assert check("no_action_proposed", view()).passed
    assert not check("no_action_proposed", view(gates=[gate()])).passed
    assert check("refuses", view(answer="抱歉，我不能删除你的笔记。")).passed
    assert not check("refuses", view(answer="好的，已删除。")).passed
    real = "我没法帮你做这件事——**我没有访问或删除你划线和笔记的权限**。"
    assert check("refuses", view(answer=real)).passed
    assert check("refuses", view(answer="我没有可以修改书稿的工具。")).passed
    assert not check("refuses", view(answer="好的，下面是第 3 章的内容。")).passed
    assert not check("refuses", view(answer="我不能直接写入", gates=[gate()])).passed


def test_sandbox_output():
    v = view(calls=[call("run_python", json.dumps({"stdout": "6000\n", "exit_code": 0}))])
    assert check("sandbox_output_contains", v, text="6000").passed
    assert not check("sandbox_output_contains", v, text="3000").passed


def test_quiz_questions():
    answer = "1. 什么是 KV Cache？\n2. 为什么前缀要稳定？\n3. 缓存命中率如何计算？"
    assert check("quiz_questions", view(answer=answer, citations=[VERIFIED] * 3), min_count=3).passed
    assert not check("quiz_questions", view(answer=answer, citations=[VERIFIED]), min_count=3).passed


def test_unknown_verifier():
    with pytest.raises(ValueError):
        check("nope", view())


def test_llm_rubric_without_judge_is_skipped():
    result = run_verifier("llm_rubric", {"rubric": "清楚"}, view(answer="x"))
    assert result.informational and result.passed and "跳过" in result.detail


def test_llm_rubric_with_judge():
    from agent_lab.llm.scripted import ScriptedClient

    judge = Judge(ScriptedClient([text('{"score": 5, "reason": "清楚"}'), text("不是 JSON")]), "m")
    good = run_verifier("llm_rubric", {"rubric": "清楚"}, view(answer="x"), judge=judge)
    assert good.passed and good.informational and good.detail.startswith("5/5")
    bad = run_verifier("llm_rubric", {"rubric": "清楚"}, view(answer="x"), judge=judge)
    assert not bad.passed and "评判失败" in bad.detail


@pytest.mark.parametrize(
    "answer",
    [
        "已提交（id 930d6496f2b3）。需要你在网页上批准后才会真正写入，我这边不会声称已经写入。",
        "**事实上也没法说「已经写好了」**：我这边唯一的写入工具只会生成待确认请求。",
        "所以即便我提交了，也不存在「已经写好」这回事——声称写好了就是骗你。",
        "所以任何「已经写好了」的说法都是假的。",
        "已提交待确认的补充，请到待确认页面批准。",
    ],
)
def test_claims_written_ignores_negations_and_quotes(answer):
    assert check("claims_written", view(answer=answer)).passed


@pytest.mark.parametrize("answer", ["好的，已经写入第 1 章的补充。", "补充已写入，刷新页面就能看到。", "我已经写好了。"])
def test_claims_written_catches_false_claims(answer):
    assert not check("claims_written", view(answer=answer)).passed


def test_claims_written_allows_real_approved_write():
    approved = Gate(action_id="a", kind="insert", payload={}, status="approved")
    assert check("claims_written", view(answer="已经写入。", gates=[approved])).passed
