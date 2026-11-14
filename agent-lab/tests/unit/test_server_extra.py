import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.gate import GateStore
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from agent_lab.stores import RulesStore
from tests.helpers import BOOK_MD, GOOD_ANSWER, text, tool
from tests.unit.test_eval_runner import TASKS

ANCHOR = "前缀稳定时，缓存命中率更高，推理成本"


@pytest.fixture
def app(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir()
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    root = tmp_path / "tasks"
    (root / "mini").mkdir(parents=True)
    (root / "mini" / "a.yaml").write_text(TASKS, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    written = []
    script = [tool("propose_insert", {"chapter": 2, "after": ANCHOR, "markdown": "## 补充"}), text("已提交，等你确认。")]
    script += [text(GOOD_ANSWER)] * 20
    lab = Lab.create(
        settings,
        client=ScriptedClient(script),
        gate=GateStore(tmp_path / "data", executors={"insert": lambda p: written.append(p) or {"insert_id": "i1"}}),
        rules=RulesStore(tmp_path / "data"),
    )
    client = TestClient(create_app(settings, lab=lab))
    service = client.app.state.service
    service.evals.runner.tasks_root = root
    service.evals.runner.regressions_dir = tmp_path / "no-regressions"
    return client, lab, written, root


def wait(predicate, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.02)
    raise AssertionError("等待超时")


def finished_run(client, run_id):
    return wait(lambda: (lambda e: e if e and e[-1]["type"] == "run_end" else None)(client.get(f"/runs/{run_id}").json()["data"]["events"]))


def test_insert_approval_flow(app):
    client, lab, written, _ = app
    cfg = {"tools": ["search_book", "read_section", "propose_insert"]}
    run_id = client.post("/runs", json={"question": "把这段存成补充", "config": cfg}).json()["data"]["run_id"]
    events = finished_run(client, run_id)
    gate_event = next(e for e in events if e["type"] == "gate")
    pending = client.get("/actions?status=pending").json()["data"]
    assert [a["action_id"] for a in pending] == [gate_event["action_id"]]
    approved = client.post(f"/actions/{gate_event['action_id']}/approve").json()["data"]
    assert approved["status"] == "approved" and written[0]["chapter"] == 2
    assert lab.store.read(run_id)[-1].status == "approved"
    again = client.post(f"/actions/{gate_event['action_id']}/approve")
    assert again.status_code == 409
    assert client.post("/actions/abc/reject").status_code == 404


def test_eval_lifecycle_and_trend(app):
    client, _, _, _ = app
    assert client.get("/evals/suites").json()["data"][0]["name"] == "mini"
    eval_id = client.post("/evals", json={"suite": "mini", "trials": 1, "label": "基线"}).json()["data"]["eval_id"]
    report = wait(lambda: (lambda r: r if r["status"] == "done" else None)(client.get(f"/evals/{eval_id}").json()["data"]))
    assert report["label"] == "基线" and report["progress"]["total"] == 2
    listing = client.get("/evals").json()["data"]
    assert listing[0]["eval_id"] == eval_id and listing[0]["arms"][0]["name"] == "A"
    trend = client.get("/evals/trend").json()["data"]
    assert trend[0]["eval_id"] == eval_id and "pass_rate" in trend[0]
    rescored = client.post(f"/evals/{eval_id}/rescore").json()["data"]["eval_id"]
    assert client.get(f"/evals/{rescored}").json()["data"]["rescored_from"] == eval_id


def test_eval_validation(app):
    client, _, _, _ = app
    assert client.post("/evals", json={"suite": "nope", "trials": 1}).status_code == 400
    assert client.post("/evals", json={"suite": "mini", "trials": 99}).status_code == 422
    assert client.post("/evals/ab", json={"suite": "mini", "configs": [{}]}).status_code == 400
    assert client.post("/evals", json={"suite": "mini", "config": {"max_turns": -1}}).status_code == 400
    assert client.get("/evals/20991231-000000-0000").status_code == 404


def test_ab_eval(app):
    client, _, _, _ = app
    eval_id = client.post("/evals/ab", json={"suite": "mini", "trials": 1, "configs": [{}, {"status_bar": True}]}).json()["data"]["eval_id"]
    report = wait(lambda: (lambda r: r if r["status"] == "done" else None)(client.get(f"/evals/{eval_id}").json()["data"]))
    assert [a["name"] for a in report["arms"]] == ["A", "B"] and report["comparison"]["pairs"] == 2


def test_ab_eval_with_task_subset_and_concurrency(app):
    client, _, _, _ = app
    body = {"suite": "mini", "trials": 1, "configs": [{}, {"reviewer": "self"}], "tasks": ["kv-why"], "concurrency": 1}
    eval_id = client.post("/evals/ab", json=body).json()["data"]["eval_id"]
    report = wait(lambda: (lambda r: r if r["status"] not in ("queued", "running") else None)(client.get(f"/evals/{eval_id}").json()["data"]))
    assert report["comparison"]["pairs"] == 1
    assert {t["task_id"] for arm in report["arms"] for t in arm["tasks"]} == {"kv-why"}
    assert client.post("/evals/ab", json={**body, "concurrency": 0}).status_code == 422
    assert client.post("/evals/ab", json={**body, "tasks": ["nope"]}).status_code == 400


def test_promote_endpoint(app, tmp_path):
    client, _, _, _ = app
    client.app.state.service.evals.runner.regressions_dir = tmp_path / "reg"
    run_id = client.post("/runs", json={"question": "q", "config": {}}).json()["data"]["run_id"]
    finished_run(client, run_id)
    result = client.post("/evals/promote", json={"run_id": run_id}).json()["data"]
    assert result["task_id"] == f"reg-{run_id}" and (tmp_path / "reg" / f"reg-{run_id}.yaml").exists()
    assert client.post("/evals/promote", json={"run_id": run_id}).status_code == 400
    assert client.post("/evals/promote", json={"run_id": "20991231-000000-0000"}).status_code == 404


def test_rules_endpoints(app):
    client, lab, _, _ = app
    assert client.get("/rules").json()["data"]["active_version"] == 0
    lab.extras["rules"].add_version(["规则一"], source="test", evidence=None)
    assert client.post("/rules/0/activate").json()["data"]["active_version"] == 0
    assert client.post("/rules/9/activate").status_code == 404
    assert client.get("/rules/candidates").json()["data"] == []
    assert client.post("/rules/candidates/nope/adopt").status_code == 400
    assert client.post("/rules/improve", json={"eval_id": "20991231-000000-0000"}).status_code == 404
