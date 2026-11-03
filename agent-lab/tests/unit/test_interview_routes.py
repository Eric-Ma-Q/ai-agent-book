import threading
import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.client import ChatResponse, LLMError, Usage
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.models import ModelStore
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from tests.helpers import BOOK_MD, text
from tests.unit.test_interview import report_request, turn_request
from tests.unit.test_models import profile_data


def truncated(content: str) -> ChatResponse:
    """A reply the provider cut at max_tokens (finish_reason=length)."""
    return ChatResponse(
        message={"role": "assistant", "content": content},
        usage=Usage(prompt_tokens=100, completion_tokens=2000),
        latency_ms=10,
        finish_reason="length",
    )


@pytest.fixture
def make_client(tmp_path):
    def make(script, client=None):
        book_dir = tmp_path / "book"
        book_dir.mkdir(exist_ok=True)
        (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
        settings = Settings(
            book_dir_override=book_dir,
            data_dir_override=tmp_path / "data",
            llm_api_key="k",
        )
        scripted = client or ScriptedClient(script)
        lab = Lab.create(settings, client=scripted, clients={"glm-flash": scripted})
        store = ModelStore(tmp_path / "data")
        store.create(
            profile_data(pricing={"input": 1.0, "output": 2.0, "cache_read": 0.5}),
            api_key="sk-secret",
        )
        return TestClient(create_app(settings, lab=lab)), lab, scripted

    return make


def test_turn_uses_the_selected_profile_and_returns_usage_and_cost(make_client):
    client, _, scripted = make_client(
        [
            text(
                "<<<QUESTION>>>\n请讲一个你负责的项目。\n<<<FOCUS>>>\n项目证据\n"
                "<<<FOLLOWUP>>>\nyes\n<<<CLOSING>>>\nno\n<<<FEEDBACK>>>\n背景清楚，补关键决策。"
            )
        ]
    )
    response = client.post("/interview/turn", json=turn_request())
    body = response.json()
    assert response.status_code == 200 and body["success"] is True
    data = body["data"]
    assert data["text"] == "请讲一个你负责的项目。"
    assert data["focus"] == "项目证据"
    assert data["followup"] is True
    assert data["closing"] is False
    assert "关键决策" in data["feedback"]
    assert data["model"] == "cn:glm-5.3-flash"
    assert data["modelProfile"] == "glm-flash"
    assert data["usage"]["prompt_tokens"] == 100
    assert data["cost"] > 0
    assert "sk-secret" not in response.text
    assert scripted.requests[0].model == "cn:glm-5.3-flash"
    assert scripted.requests[0].extra == {"reasoning_effort": "medium"}
    assert "请讲一个你负责的项目" not in scripted.requests[0].messages[1]["content"]


def test_turn_clamps_followup_and_closing_when_the_page_forbids_them(make_client):
    client, *_ = make_client(
        [
            text(
                "<<<QUESTION>>>\n再展开说说。\n<<<FOCUS>>>\n追问\n<<<FOLLOWUP>>>\nyes\n"
                "<<<CLOSING>>>\nyes"
            )
        ]
    )
    body = turn_request(followupAllowed=False, nextSlot={"id": "s3", "phase": "challenge", "title": "下一题", "topic": "defend", "goal": "继续"})
    data = client.post("/interview/turn", json=body).json()["data"]
    assert data["followup"] is False
    assert data["closing"] is False


def test_turn_uses_the_env_model_when_no_profile_is_selected(make_client):
    client, _, scripted = make_client([text("<<<QUESTION>>>\n第一题\n<<<FOLLOWUP>>>\nno")])
    body = turn_request(modelProfile="")
    data = client.post("/interview/turn", json=body).json()["data"]
    assert data["model"] == "big-pickle"
    assert data["modelProfile"] == ""
    assert scripted.requests[0].extra == {}
    assert data["cost"] == 0  # big-pickle is a known free model


def test_unknown_profile_is_400(make_client):
    client, *_ = make_client([])
    response = client.post("/interview/turn", json=turn_request(modelProfile="nope"))
    assert response.status_code == 400
    assert "不存在" in response.json()["error"]


def test_model_failure_is_502_without_the_key(make_client):
    client, *_ = make_client([LLMError("HTTP 401: bad key sk-secret")])
    response = client.post("/interview/turn", json=turn_request())
    assert response.status_code == 502
    assert "模型调用失败" in response.json()["error"]
    assert "sk-secret" not in response.text


def test_empty_model_reply_is_502(make_client):
    client, *_ = make_client([text("   ")])
    response = client.post("/interview/turn", json=turn_request())
    assert response.status_code == 502
    assert "没有返回" in response.json()["error"]


def test_report_returns_structured_scores_confidence_and_metrics(make_client):
    client, _, scripted = make_client(
        [
            text(
                "<<<OVERALL>>>\n72\n<<<GRADE>>>\n有竞争力\n<<<DIM>>>\n"
                "structure|3.5|清楚\nproduct|4|稳\nai|3|一般\ndata|2.5|缺验证\ncommunication|4|好\n"
                "<<<STRENGTH>>>\n- 先给结论\n<<<GAP>>>\n- 失败状态没讲\n"
                "<<<QUOTE>>>\n我们加了重试。|缺人工接管\n<<<REVIEW>>>\nprdstate|补失败恢复\n"
                "<<<NEXT>>>\n重读 PRD 第 10 节"
            )
        ]
    )
    response = client.post("/interview/report", json=report_request())
    body = response.json()
    assert response.status_code == 200 and body["success"] is True
    data = body["data"]
    assert data["parsed"] is True
    assert data["report"]["parse"] == "structured"
    assert data["report"]["overall"] == 72
    assert data["report"]["answered"] == 1
    assert data["report"]["planned"] == 4
    assert data["report"]["confidence"] == "low"
    assert len(data["report"]["dimensions"]) == 5
    assert data["report"]["review"][0]["id"] == "prdstate"
    assert data["report"]["truncated"] is False
    # 输出上限跟着模型档案（profile_data 的 131072），不再被页面里的常量收紧。
    assert scripted.requests[0].max_tokens == 131_072
    assert data["maxTokens"] == 131_072
    assert data["cost"] > 0
    assert "sk-secret" not in response.text


def test_report_text_fallback_is_still_200(make_client):
    client, *_ = make_client([text("我只能给一段文字复盘。")])
    data = client.post("/interview/report", json=report_request()).json()["data"]
    assert data["parsed"] is False
    assert data["report"]["parse"] == "text"
    assert data["report"]["overall"] is None
    assert "一段文字" in data["report"]["text"]


def test_invalid_plan_or_review_options_are_400(make_client):
    client, *_ = make_client([])
    data = turn_request()
    data["plan"] = data["plan"][:1]
    data["nextSlot"] = {"id": "s3", "phase": "challenge", "title": "x", "topic": "defend", "goal": "x"}
    assert client.post("/interview/turn", json=data).status_code == 400
    bad_report = report_request()
    bad_report["reviewOptions"] = "nope"
    assert client.post("/interview/report", json=bad_report).status_code == 400


def test_report_half_cut_by_the_token_cap_is_flagged(make_client):
    client, *_ = make_client(
        [
            truncated(
                "<<<OVERALL>>>\n60\n<<<GRADE>>>\n基础待补\n<<<DIM>>>\n"
                "structure|3|点状罗列\n<<<STRENGTH>>>\n- 先给范围\n<<<QUOTE>>>\n我们加了重试。|缺"
            )
        ]
    )
    response = client.post("/interview/report", json=report_request())
    body = response.json()
    assert response.status_code == 200
    data = body["data"]
    assert data["parsed"] is True
    assert data["report"]["truncated"] is True
    assert data["report"]["overall"] == 60


def test_report_cut_before_any_section_is_502_instead_of_a_garbage_report(make_client):
    client, *_ = make_client([truncated("<<<OVERALL>>>\n")])
    response = client.post("/interview/report", json=report_request())
    assert response.status_code == 502
    error = response.json()["error"]
    assert "截断" in error and "重新生成" in error


REPORT_TEXT = (
    "<<<OVERALL>>>\n60\n<<<GRADE>>>\n基础待补\n<<<DIM>>>\n"
    "structure|3|点状罗列\n<<<STRENGTH>>>\n- 先给范围\n"
)


def test_a_repeat_report_request_reuses_the_result(make_client):
    client, _, scripted = make_client([text(REPORT_TEXT)])
    first = client.post("/interview/report", json=report_request()).json()["data"]
    second = client.post("/interview/report", json=report_request()).json()["data"]
    assert first["deduped"] is False
    assert second["deduped"] is True
    assert second["report"] == first["report"]
    assert len(scripted.requests) == 1


def test_another_session_is_not_deduped(make_client):
    client, _, scripted = make_client([text(REPORT_TEXT), text(REPORT_TEXT)])
    client.post("/interview/report", json=report_request(sessionId="iv-1793333464386-84b273"))
    data = client.post("/interview/report", json=report_request(sessionId="iv-1793333464386-aaaaaa")).json()["data"]
    assert data["deduped"] is False
    assert len(scripted.requests) == 2


def test_a_failed_report_is_retried_on_the_next_request(make_client):
    client, *_ = make_client([LLMError("HTTP 500: boom"), text(REPORT_TEXT)])
    first = client.post("/interview/report", json=report_request())
    assert first.status_code == 502
    second = client.post("/interview/report", json=report_request())
    assert second.status_code == 200 and second.json()["data"]["deduped"] is False


def test_report_requires_a_session_id(make_client):
    client, *_ = make_client([])
    body = report_request()
    body["sessionId"] = "nope"
    response = client.post("/interview/report", json=body)
    assert response.status_code == 400
    assert "sessionId" in response.json()["error"]


def test_a_second_request_waits_for_the_running_report(make_client):
    class SlowClient(ScriptedClient):
        def __init__(self, script):
            super().__init__(script)
            self.started = threading.Event()
            self.release = threading.Event()

        def complete(self, request):
            self.started.set()
            assert self.release.wait(5)
            return super().complete(request)

    slow = SlowClient([text(REPORT_TEXT)])
    client, _, _ = make_client(None, client=slow)
    answers = {}

    def call(name):
        answers[name] = client.post("/interview/report", json=report_request())

    first = threading.Thread(target=call, args=("first",))
    first.start()
    assert slow.started.wait(5)
    second = threading.Thread(target=call, args=("second",))
    second.start()
    time.sleep(0.2)
    slow.release.set()
    first.join(10)
    second.join(10)

    assert len(slow.requests) == 1
    assert answers["first"].status_code == 200 and answers["second"].status_code == 200
    assert {answers["first"].json()["data"]["deduped"], answers["second"].json()["data"]["deduped"]} == {True, False}
    assert answers["first"].json()["data"]["report"] == answers["second"].json()["data"]["report"]
