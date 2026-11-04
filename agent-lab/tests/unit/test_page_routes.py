import base64
import json
import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.models import ModelStore
from agent_lab.page_routes import _clip, _replay_payload, _session_runs
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from agent_lab.trace.schema import LlmRequest, LlmResponse, RunEnd, RunStart, ToolCall
from tests.helpers import BOOK_MD, page_snapshot, text, tool
from tests.unit.test_models import profile_data


def wait_done(client, run_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        events = client.get(f"/runs/{run_id}").json()["data"]["events"]
        if events and events[-1]["type"] == "run_end":
            return events
        time.sleep(0.02)
    raise AssertionError("run did not finish")


SCREENSHOT = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"fake-image").decode("ascii")


@pytest.fixture
def make_client(tmp_path):
    def make(script, *, profiles=None):
        book_dir = tmp_path / "book"
        book_dir.mkdir(exist_ok=True)
        (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
        data_dir = tmp_path / "data"
        settings = Settings(book_dir_override=book_dir, data_dir_override=data_dir, llm_api_key="k")
        scripted = ScriptedClient(script)
        clients = {}
        store = ModelStore(data_dir)
        for profile in profiles or []:
            created = store.create(profile_data(**profile), api_key="")
            clients[created["id"]] = scripted
        lab = Lab.create(settings, client=scripted, clients=clients)
        return TestClient(create_app(settings, lab=lab)), lab, scripted, data_dir

    return make


def body(**overrides):
    data = {
        "question": "这段在讲什么？",
        "page": page_snapshot(),
        "screenshot": SCREENSHOT,
        "modelProfile": "",
        "sessionId": "pa-test-1",
        "sendScreenshot": True,
    }
    data.update(overrides)
    return data


def test_page_run_uses_page_context_and_returns_events(make_client):
    client, _, scripted, data_dir = make_client([tool("page_context", {}), text("这段在讲上下文窗口。")])
    response = client.post("/page/runs", json=body())
    payload = response.json()
    assert response.status_code == 200 and payload["success"] is True
    data = payload["data"]
    assert data["run_id"] and data["screenshot_url"].startswith("/__lab/page/screenshots/")
    assert data["vision"] is False
    events = wait_done(client, data["run_id"])
    assert events[0]["type"] == "run_start"
    assert events[0]["meta"]["source"] == "page-assistant"
    assert events[-1]["status"] == "ok"
    assert "上下文窗口" in events[-1]["answer"]
    tool_calls = [event for event in events if event["type"] == "tool_call"]
    assert tool_calls[0]["name"] == "page_context"
    assert "上下文决定" in tool_calls[0]["result"]
    request = next(event for event in events if event["type"] == "llm_request")
    names = {item["function"]["name"] for item in request["tools"]}
    assert "page_read_range" in names and "bash" in names and "web_search" in names
    assert request["messages"][1]["content"].startswith("【页面快照")
    assert request["messages"][2]["content"] == "这段在讲什么？"
    system = request["messages"][0]["content"]
    assert "围栏语言写 mermaid" in system
    assert "flowchart TD" in system
    assert "不要用字符画" in system
    assert "不要写 HTML" in system
    assert "【页面快照" not in scripted.requests[0].messages[2]["content"]

    screenshot = data_dir / "page-assistant" / data["run_id"] / "screenshot.png"
    assert screenshot.is_file()
    assert (screenshot.parent / "page.json").is_file()
    image = client.get(data["screenshot_url"].replace("/__lab", ""))
    assert image.status_code == 200 and image.headers["content-type"].startswith("image/png")


def test_page_run_sends_image_only_to_vision_profiles(make_client):
    client, _, scripted, _ = make_client([text("看到了。")], profiles=[{"name": "Vision", "input_types": ["text", "image"]}])
    listing = client.get("/models").json()["data"]
    profile_id = listing["profiles"][0]["id"]
    payload = body(modelProfile=profile_id)
    data = client.post("/page/runs", json=payload).json()["data"]
    assert data["vision"] is True
    wait_done(client, data["run_id"])
    content = next(message["content"] for message in scripted.requests[0].messages if isinstance(message.get("content"), list))
    assert content[0] == {"type": "text", "text": "这段在讲什么？"}
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_page_run_applies_selected_reasoning_level(make_client):
    client, _, scripted, _ = make_client([text("好")], profiles=[{"name": "Reasoner"}])
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    data = client.post("/page/runs", json=body(modelProfile=profile_id, reasoningLevel="high")).json()["data"]
    events = wait_done(client, data["run_id"])
    assert data["reasoningLevel"] == "high"
    assert scripted.requests[0].extra == {"reasoning_effort": "high"}
    assert events[0]["meta"]["reasoning"] == {
        "level": "high",
        "parameter": "reasoning_effort",
        "value": "high",
        "source": "panel",
    }


def test_page_run_follows_the_profile_output_cap(make_client):
    client, _, scripted, _ = make_client(
        [text("好")], profiles=[{"name": "Big", "max_output_tokens": 393_216}]
    )
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    data = client.post("/page/runs", json=body(modelProfile=profile_id)).json()["data"]
    events = wait_done(client, data["run_id"])
    assert events[0]["config"]["max_output_tokens"] == 393_216
    assert scripted.requests[0].max_tokens == 393_216


def test_page_run_defaults_to_profile_reasoning(make_client):
    client, _, scripted, _ = make_client([text("好")], profiles=[{"name": "Reasoner"}])
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    data = client.post("/page/runs", json=body(modelProfile=profile_id)).json()["data"]
    events = wait_done(client, data["run_id"])
    assert data["reasoningLevel"] == "medium"
    assert scripted.requests[0].extra == {"reasoning_effort": "medium"}
    assert events[0]["meta"]["reasoning"]["source"] == "profile"


def test_page_run_null_level_sends_no_reasoning_parameter(make_client):
    client, _, scripted, _ = make_client([text("好")], profiles=[{"name": "Reasoner"}])
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    data = client.post("/page/runs", json=body(modelProfile=profile_id, reasoningLevel="off")).json()["data"]
    wait_done(client, data["run_id"])
    assert scripted.requests[0].extra == {}
    assert data["reasoningLevel"] == "off"


def test_page_run_rejects_unknown_reasoning_level(make_client):
    client, *_ = make_client([])
    response = client.post("/page/runs", json=body(reasoningLevel="high"))
    assert response.status_code == 400 and "思考" in response.json()["error"]

    client, _, _, _ = make_client([text("好")], profiles=[{"name": "Reasoner"}])
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    response = client.post("/page/runs", json=body(modelProfile=profile_id, reasoningLevel="max"))
    assert response.status_code == 400 and "思考档位" in response.json()["error"]


def test_page_run_rejects_bad_snapshot_and_screenshot(make_client):
    client, *_ = make_client([])
    bad_page = body()
    bad_page["page"] = {"url": "x", "blocks": "nope"}
    response = client.post("/page/runs", json=bad_page)
    assert response.status_code == 400 and "页面快照" in response.json()["error"]

    bad_image = body(screenshot="data:image/png;base64,!!!")
    response = client.post("/page/runs", json=bad_image)
    assert response.status_code == 400 and "截图" in response.json()["error"]

    no_image = body(sendScreenshot=False)
    data = client.post("/page/runs", json=no_image).json()["data"]
    assert data["screenshot_url"] == ""
    wait_done(client, data["run_id"])


def test_page_screenshot_route_rejects_unknown_and_bad_ids(make_client):
    client, *_ = make_client([])
    assert client.get("/page/screenshots/not-an-id").status_code == 404
    assert client.get("/page/screenshots/20261019-090000-abcd").status_code == 404


def test_page_run_redacts_image_from_trace(make_client):
    client, _, _, data_dir = make_client([text("ok")], profiles=[{"name": "Vision", "input_types": ["text", "image"]}])
    profile_id = client.get("/models").json()["data"]["profiles"][0]["id"]
    data = client.post("/page/runs", json=body(modelProfile=profile_id)).json()["data"]
    wait_done(client, data["run_id"])
    traces = list((data_dir / "runs").rglob("*.jsonl"))
    assert traces
    raw = "\n".join(path.read_text(encoding="utf8") for path in traces)
    assert base64.b64encode(b"fake-image").decode("ascii") not in raw
    assert "<redacted>" in raw


def test_page_run_validation():
    from agent_lab.page_routes import PageRunBody

    with pytest.raises(ValueError):
        PageRunBody(question="  ", page={})
    with pytest.raises(ValueError):
        PageRunBody(question="q", page={}, modelProfile="Bad ID")
    with pytest.raises(ValueError):
        PageRunBody(question="q", page={}, sessionId="bad id")
    with pytest.raises(ValueError):
        PageRunBody(question="q", page={}, reasoningLevel="x" * 41)
    assert PageRunBody(question="q", page={}, reasoningLevel=" high ").reasoningLevel == "high"


def test_follow_up_reuses_the_session_history(make_client):
    client, _, scripted, _ = make_client([text("第一轮回答"), text("第二轮回答")])
    first = client.post("/page/runs", json=body(question="第一问", sessionId="pa-follow-1")).json()["data"]
    wait_done(client, first["run_id"])
    second = client.post("/page/runs", json=body(question="第二问", sessionId="pa-follow-1")).json()["data"]
    wait_done(client, second["run_id"])
    messages = scripted.requests[1].messages
    assert any(message.get("role") == "user" and message.get("content") == "第一问" for message in messages)
    assert any(message.get("role") == "assistant" and message.get("content") == "第一轮回答" for message in messages)
    assert any(message.get("role") == "user" and message.get("content") == "第二问" for message in messages)
    assert "[状态栏" in messages[-1]["content"]


def test_failed_run_enters_session_history(make_client):
    script = [tool("page_context", {}, call_id=f"c{i}") for i in range(12)] + [text("第二问回答")]
    client, _, scripted, _ = make_client(script)
    first = client.post("/page/runs", json=body(question="第一问", sessionId="pa-failed-1")).json()["data"]
    events = wait_done(client, first["run_id"])
    assert events[-1]["status"] == "max_turns"
    second = client.post("/page/runs", json=body(question="第二问", sessionId="pa-failed-1")).json()["data"]
    wait_done(client, second["run_id"])
    messages = scripted.requests[-1].messages
    assert any(message.get("role") == "user" and message.get("content") == "第一问" for message in messages)
    assert any(
        message.get("role") == "assistant" and "上一次运行未完成" in str(message.get("content")) for message in messages
    )
    restored = client.get("/page/sessions/pa-failed-1").json()["data"]
    assert [item["question"] for item in restored["runs"]] == ["第一问", "第二问"]
    assert restored["runs"][0]["status"] == "max_turns"
    assert restored["runs"][0]["error"]
    assert restored["runs"][0]["answer"] == ""
    assert restored["runs"][1]["status"] == "ok"


def test_session_history_rebuilds_turns_and_page_context(make_client):
    client, *_ = make_client([text("第一轮回答"), text("第二轮回答")])
    first = client.post("/page/runs", json=body(question="第一问", sessionId="pa-resume-1")).json()["data"]
    wait_done(client, first["run_id"])
    second = client.post("/page/runs", json=body(question="第二问", sessionId="pa-resume-1")).json()["data"]
    wait_done(client, second["run_id"])

    response = client.get("/page/sessions/pa-resume-1")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sessionId"] == "pa-resume-1"
    assert [item["question"] for item in data["runs"]] == ["第一问", "第二问"]
    assert [item["answer"] for item in data["runs"]] == ["第一轮回答", "第二轮回答"]
    assert data["runs"][0]["runId"] == first["run_id"]
    assert data["runs"][0]["page"] == {
        "title": "第 2 章 上下文工程",
        "section": "2.2 上下文窗口",
        "percent": 0.125,
        "path": "/book/chapter2/",
    }
    assert data["runs"][0]["startedAt"]
    assert data["runs"][0]["citations"] == []

    by_run = client.get(f"/page/runs/{second['run_id']}/session")
    assert by_run.status_code == 200
    assert by_run.json()["data"]["sessionId"] == "pa-resume-1"
    assert [item["question"] for item in by_run.json()["data"]["runs"]] == ["第一问", "第二问"]


def test_unfinished_session_stays_restorable(make_client):
    client, lab, *_ = make_client([])
    session = "pa-unfinished-1"
    run_id = "20261030-173557-abcd"
    lab.store.append(
        run_id,
        RunStart(run_id=run_id, question="还没结束的问题", config={}, config_hash="", session_id=session),
    )

    response = client.get(f"/page/sessions/{session}")
    assert response.status_code == 200
    [run] = response.json()["data"]["runs"]
    assert run["question"] == "还没结束的问题"
    assert run["status"] == "interrupted"
    assert run["answer"] == ""
    assert "没有正常结束" in run["error"]


def test_running_run_reports_running_until_it_ends(make_client):
    client, lab, *_ = make_client([])
    session = "pa-running-1"
    run_id = "20261030-173600-abcd"
    lab.store.append(
        run_id,
        RunStart(run_id=run_id, question="正在跑的问题", config={}, config_hash="", session_id=session),
    )

    [active] = _session_runs(lab.store, session, active={run_id})
    assert active["status"] == "running"
    assert "还没结束" in active["error"]
    [stale] = _session_runs(lab.store, session, active=set())
    assert stale["status"] == "interrupted"


def test_interrupted_run_enters_follow_up_context(make_client):
    client, lab, scripted, _ = make_client([text("新一轮回答")])
    session = "pa-interrupted-ctx"
    run_id = "20261030-170000-abcd"
    lab.store.append(
        run_id,
        RunStart(run_id=run_id, question="被打断的问题", config={}, config_hash="", session_id=session),
    )

    created = client.post("/page/runs", json=body(question="接着上次问", sessionId=session)).json()["data"]
    wait_done(client, created["run_id"])
    messages = scripted.requests[-1].messages
    assert any(message.get("role") == "user" and message.get("content") == "被打断的问题" for message in messages)
    assert any(
        message.get("role") == "assistant" and "上一次运行未完成" in str(message.get("content"))
        for message in messages
    )


def test_session_history_rejects_unknown_or_invalid_ids(make_client):
    client, *_ = make_client([])
    assert client.get("/page/sessions/pa-missing").status_code == 404
    assert client.get("/page/sessions/bad").status_code == 400
    assert client.get("/page/runs/20261019-090000-abcd/session").status_code == 404

    plain = client.post("/runs", json={"question": "没有会话的运行"}).json()["data"]
    wait_done(client, plain["run_id"])
    response = client.get(f"/page/runs/{plain['run_id']}/session")
    assert response.status_code == 404
    assert "会话" in response.json()["error"]


def test_check_mode_appends_grader_prompt_without_changing_budget(make_client):
    client, _, scripted, _ = make_client([text("回答。\n```check\n为什么工具描述重要？\n```")])
    data = client.post("/page/runs", json=body(mode="check")).json()["data"]
    assert data["mode"] == "check"
    events = wait_done(client, data["run_id"])
    assert events[0]["meta"]["mode"] == "check"
    assert events[0]["config"]["max_turns"] == 12
    system = next(event for event in events if event["type"] == "llm_request")["messages"][0]["content"]
    assert "检验模式" in system and "```check" in system
    assert "判卷" in system
    assert "一道题只问一件事" in system
    assert "答案没发过来" in system


def test_map_mode_uses_chapter_budget_and_never_sends_images(make_client):
    concept = '```concept\n{"title":"第 2 章","nodes":[{"id":"n1","label":"前缀","section":"sec-1"},{"id":"n2","label":"窗口","section":"sec-2"}],"edges":[{"from":"n1","to":"n2","label":"影响"}]}\n```'
    client, _, scripted, data_dir = make_client([text(concept)])
    data = client.post("/page/runs", json=body(mode="map", screenshot=SCREENSHOT)).json()["data"]
    assert data["mode"] == "map"
    assert data["screenshot_url"] == ""
    events = wait_done(client, data["run_id"])
    config = events[0]["config"]
    assert config["max_turns"] == 4
    # 没有模型档案时用 .env 的上限（默认 4096），有档案时用档案的 max_output_tokens。
    assert config["max_output_tokens"] == 4_096
    assert set(config["tools"]) == {"page_outline", "list_chapters", "search_book", "read_section"}
    request = next(event for event in events if event["type"] == "llm_request")
    system = request["messages"][0]["content"]
    assert "概念图助手" in system and "```concept" in system
    assert "page_read_range" not in system and "web_search" not in system
    prelude = request["messages"][1]["content"]
    assert "本轮模式" in prelude and "concept" in prelude
    assert not (data_dir / "page-assistant" / data["run_id"]).exists()


def test_map_mode_rejects_non_chapter_pages_and_focus(make_client):
    client, *_ = make_client([])
    page = page_snapshot(chapter={"number": None, "key": "", "title": ""})
    response = client.post("/page/runs", json=body(mode="map", page=page))
    assert response.status_code == 400
    assert "章节页" in response.json()["error"]

    focus = {"blockIndex": 6, "role": "table", "caption": "表"}
    response = client.post("/page/runs", json=body(mode="map", focus=focus))
    assert response.status_code == 400
    assert "聚焦" in response.json()["error"]


def test_focus_block_is_validated_and_written_to_page_json(make_client):
    client, _, scripted, data_dir = make_client([text("这张表在对比窗口。")])
    focus = {"blockIndex": 6, "role": "table", "caption": "表 2-1"}
    data = client.post("/page/runs", json=body(focus=focus)).json()["data"]
    assert data["focus"] == focus
    events = wait_done(client, data["run_id"])
    assert events[0]["meta"]["focus"] == focus
    prelude = next(event for event in events if event["type"] == "llm_request")["messages"][1]["content"]
    assert "【聚焦元素】" in prelude and "第 6 块（table）" in prelude
    assert "项目 | 值" in prelude
    page_json = json.loads((data_dir / "page-assistant" / data["run_id"] / "page.json").read_text())
    assert page_json["mode"] == "ask"
    assert page_json["focus"] == focus
    assert page_json["screenshot"]["kind"] == "element"


def test_focus_rejects_missing_or_mismatched_blocks(make_client):
    client, *_ = make_client([])
    missing = client.post("/page/runs", json=body(focus={"blockIndex": 99, "role": "table", "caption": ""}))
    assert missing.status_code == 400
    assert "不在页面快照" in missing.json()["error"]
    mismatch = client.post("/page/runs", json=body(focus={"blockIndex": 6, "role": "figure", "caption": ""}))
    assert mismatch.status_code == 400
    assert "类型" in mismatch.json()["error"]


def test_replay_projects_turns_tools_and_usage(make_client):
    client, _, scripted, _ = make_client([tool("page_context", {}), text("这段在讲上下文窗口。")])
    data = client.post("/page/runs", json=body()).json()["data"]
    wait_done(client, data["run_id"])
    response = client.get(f"/page/runs/{data['run_id']}/replay")
    assert response.status_code == 200
    replay = response.json()["data"]
    assert replay["runId"] == data["run_id"]
    assert replay["status"] == "ok"
    assert replay["model"]
    assert replay["turns"]
    first = replay["turns"][0]
    assert first["request"]["messageCount"] >= 1
    assert "page_context" in first["request"]["tools"]
    assert "messages" not in first["request"]
    assert first["response"]["latencyMs"] == 10
    assert first["tools"][0]["name"] == "page_context"
    assert "上下文决定" in first["tools"][0]["result"]
    assert "这段在讲上下文窗口" in replay["answer"]


def test_replay_rejects_unknown_non_page_and_invalid_runs(make_client):
    client, *_ = make_client([])
    assert client.get("/page/runs/20261019-090000-abcd/replay").status_code == 404
    plain = client.post("/runs", json={"question": "普通运行"}).json()["data"]
    wait_done(client, plain["run_id"])
    assert client.get(f"/page/runs/{plain['run_id']}/replay").status_code == 404
    assert client.get("/page/runs/bad/replay").status_code == 404


def test_replay_projection_clips_secrets_and_missing_end():
    class Store:
        def __init__(self, events):
            self.events = events

        def read(self, _run_id):
            return self.events

    start = RunStart(run_id="20261023-101500-a1b2", question="问题", config={"model": "m"}, config_hash="x", meta={"source": "page-assistant"}, ts="2026-10-23T02:15:00.000+00:00")
    request = LlmRequest(turn=1, messages=[{"role": "user", "content": "x"}], tools=[{"type": "function", "function": {"name": "page_context"}}])
    response = LlmResponse(turn=1, usage={"prompt_tokens": 10, "completion_tokens": 2}, latency_ms=5)
    call = ToolCall(turn=1, call_id="c1", name="page_context", args="x" * 700, result="data:image/png;base64," + "A" * 100 + " sk-abcdefgh", duration_ms=3)
    payload = _replay_payload(Store([start, request, response, call]), "20261023-101500-a1b2")
    assert payload["status"] == "error"
    assert payload["error"] == "这次运行没有正常结束"
    assert payload["turns"][0]["tools"][0]["args"].endswith("…（已截断，原 700 字）")
    assert "[图片数据]" in payload["turns"][0]["tools"][0]["result"]
    assert "sk-" not in payload["turns"][0]["tools"][0]["result"]
    assert payload["durationMs"] == 0

    end = RunEnd(status="ok", answer="y" * 2100, totals={"prompt_tokens": 10})
    payload = _replay_payload(Store([start, request, response, call, end]), "20261023-101500-a1b2")
    assert payload["status"] == "ok"
    assert payload["answer"].endswith("…（已截断，原 2100 字）")
    assert payload["totals"] == {"prompt_tokens": 10}

    other = RunStart(run_id="20261023-101500-a1b2", question="问题", config={}, config_hash="x", meta={"source": "lab"})
    with pytest.raises(ValueError, match="不是随页问答"):
        _replay_payload(Store([other]), "20261023-101500-a1b2")
