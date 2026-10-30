import pytest

from agent_lab.interview import (
  InterviewError,
  build_report_prompt,
  build_turn_prompt,
  parse_report,
  parse_turn_reply,
  trim_transcript,
  validate_report_request,
  validate_turn_request,
)


def slot(sid, phase="deep_dive", title="项目深挖", topic="evidence", goal="追问证据", status="active"):
    return {
        "id": sid,
        "phase": phase,
        "title": title,
        "topic": topic,
        "topicLabel": "作品与评测证据",
        "goal": goal,
        "status": status,
    }


def turn_request(**overrides):
    data = {
        "settings": {
            "role": "ai-pm",
            "round": "resume",
            "level": "advanced",
            "mode": "practice",
            "questionCount": 4,
        },
        "profile": {"brief": "优先验证 PRD 状态与恢复；简历证据偏弱。", "weakTopics": ["prdstate"]},
        "plan": [
            slot("s1", "warmup", "开场与自我介绍", "position", "自我介绍", "done"),
            slot("s2", "deep_dive", "项目深挖", "evidence", "追问证据", "active"),
            slot("s3", "challenge", "追问与压力", "defend", "挑战归因", "pending"),
            slot("s4", "closing", "反问与收尾", "position", "让候选人提问", "pending"),
        ],
        "answeredSlot": slot("s2"),
        "nextSlot": slot("s3", "challenge", "追问与压力", "defend", "挑战归因", "pending"),
        "transcript": [
            {"role": "interviewer", "text": "先做个自我介绍。"},
            {"role": "candidate", "text": "我负责过报销流程改造。"},
        ],
        "followupAllowed": True,
        "skipped": False,
        "modelProfile": "glm-flash",
    }
    data.update(overrides)
    return data


def report_request(**overrides):
    data = turn_request()
    data["sessionId"] = "iv-1793333464386-84b273"
    data["reviewOptions"] = [
        {"id": "prdstate", "label": "PRD · 状态与恢复"},
        {"id": "bizmodel", "label": "商业模式与定价"},
    ]
    data.update(overrides)
    return data


def test_trim_transcript_keeps_the_opening_and_latest_turns():
    turns = [
        {"role": "interviewer", "text": "开场" + "。" * 20},
        {"role": "candidate", "text": "回答" + "。" * 20},
        *[
            {"role": "candidate" if index % 2 else "interviewer", "text": f"第{index}轮" + "。" * 20}
            for index in range(2, 20)
        ],
    ]
    trimmed = trim_transcript(turns, limit=120)
    assert trimmed[0]["text"].startswith("开场")
    assert trimmed[1]["text"].startswith("回答")
    assert trimmed[-1]["text"].startswith("第19轮")
    assert any(turn.get("role") == "system" and "省略" in turn.get("text", "") for turn in trimmed)
    assert len(trimmed) < len(turns)


def test_turn_prompt_contains_profile_plan_and_strict_output_format():
    system, user = build_turn_prompt(turn_request())
    assert "AI 产品经理面试官" in system
    assert "一次只问一个问题" in system
    assert "不要提及考试分数" in system
    assert "候选人正在从产品经理转向" in user
    assert "优先验证" in user
    assert "s2" in user and "s3" in user
    assert "允许追问" in user
    assert "<<<QUESTION>>>" in user
    assert "练习模式" in user or "FEEDBACK" in user
    assert "68%" not in user


def test_turn_prompt_changes_task_for_followup_skip_and_closing():
    _, followup = build_turn_prompt(turn_request(followupAllowed=True))
    assert "追问" in followup
    _, no_followup = build_turn_prompt(turn_request(followupAllowed=False))
    assert "不要再次追问" in no_followup or "进入下一环节" in no_followup
    _, skipped = build_turn_prompt(turn_request(skipped=True))
    assert "跳过" in skipped
    _, closing = build_turn_prompt(
        turn_request(
            answeredSlot=slot("s4", "closing", "反问与收尾", "position", "让候选人提问", "active"),
            nextSlot=None,
        )
    )
    assert "收尾" in closing and "CLOSING" in closing


def test_parse_turn_reply_standard_markers():
    text = """<<<QUESTION>>>
请讲一个你负责的 AI 项目。
<<<FOCUS>>>
项目证据
<<<FOLLOWUP>>>
yes
<<<CLOSING>>>
no
<<<FEEDBACK>>>
背景清楚，但缺少你的关键决策。
"""
    parsed = parse_turn_reply(text, followup_allowed=True)
    assert parsed["text"] == "请讲一个你负责的 AI 项目。"
    assert parsed["focus"] == "项目证据"
    assert parsed["followup"] is True
    assert parsed["closing"] is False
    assert "关键决策" in parsed["feedback"]


def test_parse_turn_reply_tolerates_spaces_and_clamps_followup():
    text = "<<< QUESTION >>> 你当时的取舍是什么？ <<< FOCUS >>> 取舍 <<< FOLLOWUP >>> yes"
    parsed = parse_turn_reply(text, followup_allowed=False)
    assert parsed["text"] == "你当时的取舍是什么？"
    assert parsed["followup"] is False


def test_parse_turn_reply_falls_back_to_plain_text():
    parsed = parse_turn_reply("请说说你的项目。", followup_allowed=True)
    assert parsed["text"] == "请说说你的项目。"
    assert parsed["focus"] == ""
    assert parsed["followup"] is False
    assert parsed["closing"] is False


def test_parse_turn_reply_rejects_an_empty_reply():
    with pytest.raises(InterviewError):
        parse_turn_reply("", followup_allowed=True)
    with pytest.raises(InterviewError):
        parse_turn_reply("<<<QUESTION>>>   ", followup_allowed=True)


def test_parse_report_structured_and_drops_unknown_review_ids():
    text = """前言
<<<OVERALL>>>
72
<<<GRADE>>>
有竞争力
<<<DIM>>>
structure|3.5|结论清楚
product|4|判断稳
ai|3|边界一般
data|2.5|缺验证
communication|4|沟通好
<<<STRENGTH>>>
- 先给结论
- 项目讲得清楚
<<<GAP>>>
- 失败状态没讲
<<<QUOTE>>>
我们加了重试。|缺少人工接管
<<<REVIEW>>>
prdstate|补失败恢复
nope|不存在
<<<NEXT>>>
重读 PRD 第 10–12 节
"""
    report = parse_report(text, report_request()["reviewOptions"])
    assert report["parse"] == "structured"
    assert report["overall"] == 72
    assert report["grade"] == "有竞争力"
    assert len(report["dimensions"]) == 5
    assert report["dimensions"][0] == {"id": "structure", "label": "结构化表达", "score": 3.5, "comment": "结论清楚"}
    assert report["strengths"] == ["先给结论", "项目讲得清楚"]
    assert report["gaps"] == ["失败状态没讲"]
    assert report["evidence"] == [{"quote": "我们加了重试。", "issue": "缺少人工接管"}]
    assert [item["id"] for item in report["review"]] == ["prdstate"]
    assert report["review"][0]["label"] == "PRD · 状态与恢复"
    assert report["next"] == ["重读 PRD 第 10–12 节"]


def test_parse_report_fills_missing_dimensions_and_clamps_scores():
    text = """<<<OVERALL>>> 140
<<<DIM>>>
structure|0|太低
data|7|太高
"""
    report = parse_report(text, [])
    assert report["overall"] == 100
    assert report["dimensions"][0]["score"] == 1
    assert report["dimensions"][3]["score"] == 5
    assert report["dimensions"][1]["score"] is None
    assert report["dimensions"][1]["comment"] == "本轮没有足够证据。"
    assert report["review"] == []


def test_parse_report_text_fallback_keeps_the_raw_text():
    report = parse_report("我没办法按格式输出，只能给一段话。", [])
    assert report["parse"] == "text"
    assert report["overall"] is None
    assert report["confidence"] == "low"
    assert "只能给一段话" in report["text"]


def test_report_prompt_contains_rubric_and_review_options():
    system, user = build_report_prompt(report_request())
    assert "复盘" in system
    assert "结构化表达" in user
    assert "数据与验证" in user
    assert "prdstate" in user and "商业模式与定价" in user
    assert "<<<OVERALL>>>" in user
    assert "证据不足" in user


def test_validation_rejects_bad_plan_and_transcript():
    data = turn_request()
    data["plan"] = []
    with pytest.raises(InterviewError):
        validate_turn_request(data)

    data = turn_request()
    data["transcript"] = [{"role": "candidate", "text": "x" * 4001}]
    with pytest.raises(InterviewError):
        validate_turn_request(data)

    data = turn_request()
    data["settings"] = {**data["settings"], "questionCount": 3}
    with pytest.raises(InterviewError):
        validate_turn_request(data)

    data = turn_request()
    data["nextSlot"] = {**data["nextSlot"], "id": "s99"}
    with pytest.raises(InterviewError):
        validate_turn_request(data)


def test_report_validation_requires_review_options():
    data = report_request()
    data["reviewOptions"] = "nope"
    with pytest.raises(InterviewError):
        validate_report_request(data)
