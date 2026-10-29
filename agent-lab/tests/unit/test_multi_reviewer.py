from agent_lab.citations import CheckedCitation, CheckResult
from agent_lab.multi.reviewer import Verdict, feedback_message, parse_verdict, review_messages
from agent_lab.prompts import REVIEWER_PROMPT

CHECK = CheckResult(
    (
        CheckedCitation(2, "kv", "前缀稳定时，缓存命中率更高", "verified", "kv"),
        CheckedCitation(2, "kv", "编造出来的一句话不在书里", "not_found"),
        CheckedCitation(2, "tools", "前缀稳定时，缓存命中率更高", "wrong_section", "kv"),
    ),
    {"total": 3},
)


def test_self_review_sees_only_question_and_answer():
    messages = review_messages("self", "问题甲", "回答乙", CHECK)
    assert messages[0] == {"role": "system", "content": REVIEWER_PROMPT}
    user = messages[1]["content"]
    assert "问题甲" in user and "回答乙" in user
    assert "核对" not in user and "not_found" not in user and "找不到" not in user


def test_evidence_review_lists_every_citation_status():
    user = review_messages("evidence", "问题甲", "回答乙", CHECK)[1]["content"]
    assert "引用核对结果" in user
    assert "通过" in user and "原文中找不到" in user and "不在标注的小节" in user
    assert "编造出来的一句话不在书里" in user
    assert "实际在小节 kv" in user


def test_evidence_review_without_citations_says_so():
    user = review_messages("evidence", "q", "a", CheckResult((), {"total": 0}))[1]["content"]
    assert "回答中没有引用" in user


def test_same_system_prompt_for_both_modes():
    assert review_messages("self", "q", "a", CHECK)[0] == review_messages("evidence", "q", "a", CHECK)[0]


def test_parse_verdict_variants():
    assert parse_verdict('{"verdict": "pass", "issues": []}') == Verdict("pass", ())
    fenced = '审核如下：\n```json\n{"verdict": "revise", "issues": ["第二条引用找不到", "  "]}\n```'
    assert parse_verdict(fenced) == Verdict("revise", ("第二条引用找不到",))
    assert parse_verdict('{"verdict": "REVISE", "issues": "只有一条"}') == Verdict("revise", ("只有一条",))
    assert parse_verdict("看起来不错") is None
    assert parse_verdict('{"verdict": "maybe"}') is None
    assert parse_verdict("") is None
    assert parse_verdict(None) is None


def test_revise_without_issues_is_treated_as_pass():
    assert parse_verdict('{"verdict": "revise", "issues": []}') == Verdict("pass", ())


def test_feedback_message_lists_issues():
    message = feedback_message(Verdict("revise", ("引用 A 找不到", "漏了第三点")))
    assert message["role"] == "user"
    assert "1. 引用 A 找不到" in message["content"] and "2. 漏了第三点" in message["content"]
    assert "逐字复制" in message["content"]
