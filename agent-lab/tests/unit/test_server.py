import json
import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from tests.helpers import BOOK_MD, GOOD_ANSWER, text, tool


@pytest.fixture
def make_client(tmp_path):
    def make(script, models=None):
        book_dir = tmp_path / "book"
        book_dir.mkdir(exist_ok=True)
        (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
        settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
        scripted = ScriptedClient(script)
        scripted.list_models = (lambda: models) if models is not None else None
        lab = Lab.create(settings, client=scripted)
        return TestClient(create_app(settings, lab=lab)), lab

    return make


def wait_done(client, run_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/runs/{run_id}").json()["data"]
        if data["events"] and data["events"][-1]["type"] == "run_end":
            return data["events"]
        time.sleep(0.02)
    raise AssertionError("运行未结束")


def test_create_run_and_fetch_events(make_client):
    client, _ = make_client([tool("search_book", {"query": "缓存"}), text(GOOD_ANSWER)])
    resp = client.post("/runs", json={"question": "为什么？", "config": {"status_bar": True}})
    body = resp.json()
    assert resp.status_code == 200 and body["success"] and body["error"] is None
    events = wait_done(client, body["data"]["run_id"])
    assert events[0]["config"]["status_bar"] is True
    assert events[-1]["status"] == "ok"
    listing = client.get("/runs").json()["data"]
    assert listing[0]["run_id"] == body["data"]["run_id"]


def test_invalid_config_rejected(make_client):
    client, _ = make_client([])
    resp = client.post("/runs", json={"question": "q", "config": {"max_turns": 0}})
    assert resp.status_code == 400
    assert resp.json()["success"] is False and "配置无效" in resp.json()["error"]


def test_empty_question_rejected(make_client):
    client, _ = make_client([])
    assert client.post("/runs", json={"question": "  ", "config": {}}).status_code == 400


def test_unknown_run_404(make_client):
    client, _ = make_client([])
    assert client.get("/runs/20991231-000000-0000").status_code == 404
    assert client.get("/runs/not-an-id").status_code == 400


def test_sse_stream_replays_and_closes(make_client):
    client, _ = make_client([text(GOOD_ANSWER)])
    run_id = client.post("/runs", json={"question": "q", "config": {}}).json()["data"]["run_id"]
    wait_done(client, run_id)
    with client.stream("GET", f"/runs/{run_id}/events") as stream:
        body = "".join(stream.iter_text())
    events = [json.loads(line[6:]) for line in body.splitlines() if line.startswith("data: ")]
    assert [e["type"] for e in events][0] == "run_start"
    assert events[-1]["type"] == "run_end"
    assert "id: 0" in body and "event: run_end" in body


def test_sse_resumes_after_last_event_id(make_client):
    client, _ = make_client([text(GOOD_ANSWER)])
    run_id = client.post("/runs", json={"question": "q", "config": {}}).json()["data"]["run_id"]
    events = wait_done(client, run_id)
    with client.stream("GET", f"/runs/{run_id}/events", headers={"Last-Event-ID": str(len(events) - 2)}) as stream:
        body = "".join(stream.iter_text())
    assert body.count("data: ") == 1


def test_compare_starts_two_runs(make_client):
    client, _ = make_client([text(GOOD_ANSWER), text(GOOD_ANSWER)])
    resp = client.post("/compare", json={"question": "q", "configs": [{}, {"drop_tool_results": True}]})
    run_ids = resp.json()["data"]["run_ids"]
    assert len(run_ids) == 2
    hashes = {wait_done(client, r)[0]["config_hash"] for r in run_ids}
    assert len(hashes) == 2


def test_compare_needs_two_configs(make_client):
    client, _ = make_client([])
    assert client.post("/compare", json={"question": "q", "configs": [{}]}).status_code == 400


def test_cancel_unknown_run(make_client):
    client, _ = make_client([])
    assert client.post("/runs/20991231-000000-0000/cancel").status_code == 404


def test_knobs_and_health(make_client):
    client, _ = make_client([], models=["m1", "m2"])
    knobs = client.get("/knobs").json()["data"]
    assert knobs["defaults"]["max_turns"] == 12
    assert knobs["groups"][0]["chapter"] == 1
    assert "search_book" in knobs["tools"]
    health = client.get("/health").json()["data"]
    assert health["llm"]["ok"] and health["llm"]["models"] == ["m1", "m2"]
    assert health["book_chapters"] == [2]


def test_health_reports_unreachable_llm(make_client):
    client, lab = make_client([])

    def boom():
        raise RuntimeError("connection refused")

    lab.client.list_models = boom
    health = client.get("/health").json()["data"]
    assert health["llm"]["ok"] is False and "connection refused" in health["llm"]["error"]
