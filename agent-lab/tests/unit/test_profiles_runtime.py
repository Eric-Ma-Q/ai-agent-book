import pytest

from agent_lab.config import AgentConfig, Settings
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.models import ModelError, ModelStore
from agent_lab.runtime import Lab
from tests.helpers import BOOK_MD, text
from tests.unit.test_models import profile_data


def make_lab(tmp_path, clients=None):
    book_dir = tmp_path / "book"
    book_dir.mkdir(exist_ok=True)
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    scripted = ScriptedClient([text("答")])
    lab = Lab.create(settings, client=scripted, clients=clients)
    return lab, scripted, ModelStore(tmp_path / "data")


def test_adapt_config_without_profiles_is_identity(tmp_path):
    lab, _, _ = make_lab(tmp_path)
    cfg = AgentConfig()
    assert lab.adapt_config(cfg) == cfg
    assert lab.client_for(cfg) is lab.client
    assert lab.request_extra(cfg) == {}


def test_adapt_config_overrides_model_and_caps_output(tmp_path):
    lab, _, store = make_lab(tmp_path)
    store.create(profile_data(max_output_tokens=8_192), api_key="k")
    adapted = lab.adapt_config(AgentConfig(model_profile="glm-flash", max_output_tokens=9_999))
    assert adapted.model == "cn:glm-5.3-flash"
    assert adapted.model_profile == "glm-flash"
    assert adapted.max_output_tokens == 8_192


def test_default_profile_applies_when_none_selected(tmp_path):
    lab, _, store = make_lab(tmp_path)
    created = store.create(profile_data(), api_key="k")
    store.set_default(created["id"])
    adapted = lab.adapt_config(AgentConfig())
    assert adapted.model_profile == "glm-flash"
    assert lab.request_extra(adapted) == {"reasoning_effort": "medium"}


def test_unknown_profile_rejected(tmp_path):
    lab, _, _ = make_lab(tmp_path)
    with pytest.raises(ModelError, match="不存在"):
        lab.adapt_config(AgentConfig(model_profile="nope"))


def test_pinned_client_is_used_for_profile(tmp_path):
    pinned = ScriptedClient([text("答")])
    lab, _, store = make_lab(tmp_path, clients={"glm-flash": pinned})
    store.create(profile_data(), api_key="k")
    cfg = lab.adapt_config(AgentConfig(model_profile="glm-flash"))
    assert lab.client_for(cfg) is pinned


def test_run_uses_profile_model_and_extra(tmp_path):
    pinned = ScriptedClient([text("答")])
    lab, _, store = make_lab(tmp_path, clients={"glm-flash": pinned})
    store.create(profile_data(max_output_tokens=8_192), api_key="k")
    outcome = lab.run("问题", AgentConfig(model_profile="glm-flash", max_output_tokens=9_999))
    assert outcome.status == "ok"
    request = pinned.requests[0]
    assert request.model == "cn:glm-5.3-flash"
    assert request.max_tokens == 8_192
    assert request.extra == {"reasoning_effort": "medium"}
    start = lab.store.read(outcome.run_id)[0]
    assert start.config["model_profile"] == "glm-flash"
    assert start.config["model"] == "cn:glm-5.3-flash"


def test_price_for_uses_profile_pricing(tmp_path):
    from agent_lab.llm.pricing import Price

    lab, _, store = make_lab(tmp_path)
    store.create(profile_data(pricing={"input": 0.15, "output": 0.6, "cache_read": 0.003}), api_key="k")
    assert lab.price_for(AgentConfig()) is None
    assert lab.price_for(AgentConfig(model_profile="glm-flash")) == Price(input=0.15, cached_input=0.003, output=0.6)


def test_run_cost_uses_profile_pricing(tmp_path):
    book_dir = tmp_path / "book"
    book_dir.mkdir(exist_ok=True)
    (book_dir / "chapter2.md").write_text(BOOK_MD, encoding="utf8")
    settings = Settings(book_dir_override=book_dir, data_dir_override=tmp_path / "data", llm_api_key="k")
    scripted = ScriptedClient([text("答", prompt=1_000_000, cached=400_000, completion=100_000)])
    lab = Lab.create(settings, client=scripted, clients={"glm-flash": scripted})
    ModelStore(tmp_path / "data").create(
        profile_data(pricing={"input": 0.15, "output": 0.6, "cache_read": 0.003}), api_key="k"
    )

    outcome = lab.run("问题", AgentConfig(model_profile="glm-flash"))

    expected = (600_000 * 0.15 + 400_000 * 0.003 + 100_000 * 0.6) / 1_000_000
    assert outcome.totals["cost"] == pytest.approx(expected)
    response = next(event for event in lab.store.read(outcome.run_id) if event.type == "llm_response")
    assert response.cost == pytest.approx(expected)
    assert response.reference_cost == pytest.approx((600_000 * 3 + 400_000 * 0.3 + 100_000 * 15) / 1_000_000)
