import time

import pytest
from fastapi.testclient import TestClient

from agent_lab.config import Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.models import ModelStore
from agent_lab.runtime import Lab
from agent_lab.server import create_app
from tests.helpers import BOOK_MD, text
from tests.unit.test_models import profile_data
from tests.unit.test_pricing_catalog import AMBIGUOUS, NOW, RAW


@pytest.fixture
def app(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir()
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    scripted = ScriptedClient([text("答")])
    lab = Lab.create(settings, client=scripted, clients={"glm-flash": scripted})
    return TestClient(create_app(settings, lab=lab)), lab, ModelStore(tmp_path / "data"), scripted


def wait_done(client, run_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        data = client.get(f"/runs/{run_id}").json()["data"]
        if data["events"] and data["events"][-1]["type"] == "run_end":
            return data["events"]
        time.sleep(0.02)
    raise AssertionError("运行未结束")


def test_empty_catalog(app):
    client, *_ = app
    data = client.get("/models").json()["data"]
    assert data == {
        "version": 1,
        "default": None,
        "profiles": [],
        "warnings": [],
        "env": {"configured": True, "model": "big-pickle"},
    }


def test_empty_catalog_without_env_fallback(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir()
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="")
    lab = Lab.create(settings, client=ScriptedClient([text("答")]))
    client = TestClient(create_app(settings, lab=lab))
    data = client.get("/models").json()["data"]
    assert data["profiles"] == []
    assert data["env"] == {"configured": False, "model": "big-pickle"}


def test_crud_and_key_never_returned(app):
    client, _, store, _ = app
    created = client.post("/models", json={**profile_data(), "api_key": "sk-secret"}).json()["data"]
    assert created["id"] == "glm-flash" and created["has_key"] is True
    listing = client.get("/models")
    assert "sk-secret" not in listing.text
    assert store.key_for("glm-flash") == "sk-secret"
    updated = client.put("/models/glm-flash", json={**profile_data(name="改名"), "api_key": ""}).json()["data"]
    assert updated["name"] == "改名" and updated["has_key"] is True
    assert "sk-secret" not in client.put("/models/glm-flash", json={**profile_data(name="改名2"), "api_key": ""}).text
    default = client.post("/models/glm-flash/default").json()["data"]
    assert default["id"] == "glm-flash"
    assert client.get("/models").json()["data"]["default"] == "glm-flash"
    assert client.delete("/models/glm-flash").json()["data"] == {"deleted": "glm-flash"}
    assert client.get("/models").json()["data"]["profiles"] == []


def test_invalid_profile_is_400(app):
    client, *_ = app
    response = client.post("/models", json={**profile_data(base_url="ftp://x"), "api_key": "k"})
    assert response.status_code == 400 and response.json()["success"] is False
    assert client.post("/models/nope/default").status_code == 400
    assert client.put("/models/nope", json={**profile_data(), "api_key": "k"}).json()["success"] is False


def test_base_url_change_requires_key(app):
    client, _, store, _ = app
    client.post("/models", json={**profile_data(), "api_key": "sk-one"})
    response = client.put("/models/glm-flash", json={**profile_data(base_url="http://new.test/v1"), "api_key": ""})
    assert response.status_code == 400 and "重新输入" in response.json()["error"]


def test_create_with_copy_key_from_reuses_source_key(app):
    client, _, store, _ = app
    client.post("/models", json={**profile_data(), "api_key": "sk-shared"})
    created = client.post("/models", json={**profile_data(name="GLM Flash B", model="cn:b"), "copy_key_from": "glm-flash"})
    assert created.status_code == 200
    data = created.json()["data"]
    assert data["id"] == "glm-flash-b" and data["has_key"] is True
    assert store.key_for("glm-flash-b") == "sk-shared"
    assert "sk-shared" not in client.get("/models").text


def test_create_copy_key_from_rejects_changed_base_url(app):
    client, _, store, _ = app
    client.post("/models", json={**profile_data(), "api_key": "sk-one"})
    response = client.post("/models", json={**profile_data(name="GLM Flash B", base_url="http://new.test/v1"), "copy_key_from": "glm-flash"})
    assert response.status_code == 400 and "重新输入" in response.json()["error"]
    assert [item["id"] for item in client.get("/models").json()["data"]["profiles"]] == ["glm-flash"]


def test_copy_key_from_is_rejected_on_update(app):
    client, *_ = app
    client.post("/models", json={**profile_data(), "api_key": "sk-one"})
    response = client.put("/models/glm-flash", json={**profile_data(name="改名"), "copy_key_from": "glm-flash"})
    assert response.status_code == 400 and "新建" in response.json()["error"]


def test_probe_saved_profile_uses_stored_key(app, monkeypatch):
    client, _, store, _ = app
    store.create(profile_data(), api_key="sk-secret")
    seen = {}

    def fake_probe(base_url, api_key="", timeout_s=10.0):
        seen.update(base_url=base_url, api_key=api_key)
        return {"ok": True, "models": ["cn:glm-5.3-flash"], "latency_ms": 3, "error": None}

    monkeypatch.setattr("agent_lab.model_routes.probe_endpoint", fake_probe)
    data = client.post("/models/glm-flash/test").json()["data"]
    assert data["ok"] and seen == {"base_url": "http://127.0.0.1:7864/v1", "api_key": "sk-secret"}


def test_probe_draft_can_reuse_saved_key(app, monkeypatch):
    client, _, store, _ = app
    store.create(profile_data(), api_key="sk-secret")
    seen = {}

    def fake_probe(base_url, api_key="", timeout_s=10.0):
        seen.update(api_key=api_key)
        return {"ok": True, "models": [], "latency_ms": 1, "error": None}

    monkeypatch.setattr("agent_lab.model_routes.probe_endpoint", fake_probe)
    client.post("/models/test", json={"base_url": "http://127.0.0.1:7864/v1", "id": "glm-flash"})
    assert seen["api_key"] == "sk-secret"


def test_health_reports_profile_count(app):
    client, _, store, _ = app
    store.create(profile_data(), api_key=None)
    health = client.get("/health").json()["data"]
    assert health["model_profiles"] == {"default": None, "count": 1}
    assert health["llm"]["ok"] is True


def test_run_uses_profile_with_pinned_client(app):
    client, _, store, scripted = app
    store.create(profile_data(), api_key="k")
    run_id = client.post("/runs", json={"question": "q", "config": {"model_profile": "glm-flash"}}).json()["data"]["run_id"]
    events = wait_done(client, run_id)
    assert events[0]["config"]["model"] == "cn:glm-5.3-flash"
    assert events[0]["config"]["model_profile"] == "glm-flash"
    assert scripted.requests[0].model == "cn:glm-5.3-flash"
    assert scripted.requests[0].extra == {"reasoning_effort": "medium"}


def test_run_with_unknown_profile_is_400(app):
    client, *_ = app
    response = client.post("/runs", json={"question": "q", "config": {"model_profile": "nope"}})
    assert response.status_code == 400 and "不存在" in response.json()["error"]


def test_run_without_profile_keeps_env_model(app):
    client, _, _, scripted = app
    run_id = client.post("/runs", json={"question": "q", "config": {}}).json()["data"]["run_id"]
    events = wait_done(client, run_id)
    assert events[0]["config"]["model"] == "big-pickle"
    assert scripted.requests[0].extra == {}


def fake_catalog(tmp_path, fetcher=None):
    from agent_lab.pricing_catalog import PriceCatalog

    return PriceCatalog(
        tmp_path / "data",
        url="https://example.test/api.json",
        ttl_s=3600,
        fetcher=fetcher or (lambda url: RAW),
        now=lambda: NOW,
    )


def test_pricing_status_and_lookup(app, tmp_path):
    client, lab, *_ = app
    lab.pricing = fake_catalog(tmp_path)
    empty = client.get("/pricing/status").json()["data"]
    assert empty["fetched_at"] is None and empty["count"] == 0

    data = client.post("/pricing/lookup", json={"model": "deepseek-flash", "base_url": "https://api.deepseek.com/v1"}).json()["data"]
    assert data["matches"][0]["key"] == "deepseek/deepseek-flash"
    assert data["catalog"]["count"] == 5
    assert client.get("/pricing/status").json()["data"]["count"] == 5


def test_sync_pricing_for_one_profile(app, tmp_path):
    client, lab, store, _ = app
    lab.pricing = fake_catalog(tmp_path)
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"), api_key="k")

    data = client.post("/models/glm-flash/pricing/sync", json={}).json()["data"]

    assert data["profile"]["pricing"]["input"] == 0.15
    assert data["match"]["key"] == "deepseek/deepseek-flash"
    assert client.get("/models").json()["data"]["profiles"][0]["pricing"]["source"] == "models.dev"


def test_sync_pricing_ambiguous_is_400(app, tmp_path):
    client, lab, store, _ = app
    lab.pricing = fake_catalog(tmp_path, fetcher=lambda url: AMBIGUOUS)
    store.create(profile_data(model="twin-model", base_url="http://127.0.0.1:7864/v1"), api_key=None)

    response = client.post("/models/glm-flash/pricing/sync", json={})

    assert response.status_code == 400 and "匹配到 2 条" in response.json()["error"]


def test_sync_all_pricing_reports_skips(app, tmp_path):
    client, lab, store, _ = app
    lab.pricing = fake_catalog(tmp_path)
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"), api_key=None)
    store.create(profile_data(name="manual", pricing={"input": 1, "output": 2}), api_key=None)

    data = client.post("/models/pricing/sync", json={}).json()["data"]

    assert data["updated"] == ["glm-flash"]
    assert data["skipped"] == [{"id": "manual", "reason": "手填价格不覆盖"}]


def test_pricing_unavailable_is_503(app, tmp_path):
    client, lab, *_ = app

    def boom(url):
        raise RuntimeError("offline")

    lab.pricing = fake_catalog(tmp_path, fetcher=boom)
    response = client.post("/pricing/lookup", json={"model": "deepseek-flash"})

    assert response.status_code == 503 and "无法获取模型价格目录" in response.json()["error"]


def test_put_clears_pricing_only_when_explicit(app):
    client, *_ = app
    body = {**profile_data(pricing={"input": 1, "output": 2}), "api_key": "k"}
    client.post("/models", json=body)
    kept = client.put("/models/glm-flash", json={**profile_data(name="改名"), "api_key": ""}).json()["data"]
    assert kept["pricing"]["input"] == 1
    cleared = client.put("/models/glm-flash", json={**profile_data(), "api_key": "", "pricing": None}).json()["data"]
    assert cleared["pricing"] is None


def test_apply_selected_pricing_candidate(app, tmp_path):
    client, lab, store, _ = app
    lab.pricing = fake_catalog(tmp_path)
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"), api_key=None)

    data = client.post("/models/glm-flash/pricing/apply", json={"key": "deepseek/deepseek-flash"}).json()["data"]

    assert data["profile"]["pricing"]["input"] == 0.15
    assert data["match"]["key"] == "deepseek/deepseek-flash"
    assert client.post("/models/glm-flash/pricing/apply", json={"key": "nope"}).status_code == 400
