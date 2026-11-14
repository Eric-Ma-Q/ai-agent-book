import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from agent_lab.security.catalog import DEMO_SECRET
from tests.helpers import BOOK_MD, text


@pytest.fixture
def client(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir(exist_ok=True)
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    lab = Lab.create(settings, client=ScriptedClient([text("安全回答。")]))
    with TestClient(create_app(settings, lab=lab)) as app:
        yield app


def wait(client, campaign_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/security/campaigns/{campaign_id}").json()["data"]
        if data["status"] in ("done", "cancelled", "failed", "interrupted"):
            return data
        time.sleep(0.01)
    raise AssertionError("campaign did not finish")


def body(**overrides):
    data = {
        "attacks": ["direct"],
        "defenses": ["D1"],
        "trials": 1,
        "label": "接口测试",
        "config": {"temperature": 0.2},
    }
    data.update(overrides)
    return data


def test_catalog_is_available(client):
    response = client.get("/security/catalog")
    data = response.json()["data"]
    assert response.status_code == 200
    assert [item["id"] for item in data["attacks"]] == ["direct", "indirect", "memory"]
    assert data["defaults"]["trials"] == 1
    assert DEMO_SECRET not in str(data)


def test_create_get_and_list_campaign(client):
    response = client.post("/security/campaigns", json=body())
    payload = response.json()
    assert response.status_code == 200 and payload["success"] is True
    campaign_id = payload["data"]["campaign_id"]
    report = wait(client, campaign_id)
    assert report["status"] == "done"
    assert report["cells"][0]["done"] == 1
    assert report["cells"][0]["results"][0]["verdict"] == "no_secret_leak"
    listing = client.get("/security/campaigns").json()["data"]
    assert listing[0]["campaign_id"] == campaign_id
    assert listing[0]["overall_success_rate"] == 0.0


def test_invalid_selection_returns_400(client):
    response = client.post("/security/campaigns", json=body(attacks=["nope"]))
    assert response.status_code == 400
    assert response.json()["success"] is False and "未知攻击" in response.json()["error"]


def test_unknown_campaign_returns_404(client):
    response = client.get("/security/campaigns/20991231-000000-0000")
    assert response.status_code == 404


def test_cancel_is_idempotent(client):
    campaign_id = client.post("/security/campaigns", json=body()).json()["data"]["campaign_id"]
    first = client.post(f"/security/campaigns/{campaign_id}/cancel")
    second = client.post(f"/security/campaigns/{campaign_id}/cancel")
    assert first.status_code == 200 and second.status_code == 200
    assert wait(client, campaign_id)["status"] in ("done", "cancelled")
