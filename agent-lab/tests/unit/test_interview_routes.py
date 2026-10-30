import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.client import LLMError
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.models import ModelStore
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from tests.helpers import BOOK_MD, text
from tests.unit.test_interview import report_request, turn_request
from tests.unit.test_models import profile_data


@pytest.fixture
def make_client(tmp_path):
    def make(script):
        book_dir = tmp_path / "book"
        book_dir.mkdir(exist_ok=True)
        (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
        settings = Settings(
            book_dir_override=book_dir,
            data_dir_override=tmp_path / "data",
            llm_api_key="k",
        )
        scripted = ScriptedClient(script)
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
    client, *_ = make_client(
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
