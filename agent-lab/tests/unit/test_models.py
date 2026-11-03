import json
import stat

import pytest

from agent_lab.models import ModelError, ModelStore


def profile_data(**overrides):
    data = {
        "name": "GLM Flash",
        "base_url": "http://127.0.0.1:7864/v1/",
        "model": "cn:glm-5.3-flash",
        "context_window": 1_000_000,
        "max_output_tokens": 131_072,
        "input_types": ["text", "image"],
        "reasoning": {
            "parameter": "reasoning_effort",
            "default": "medium",
            "levels": [
                {"name": "off", "value": None},
                {"name": "low", "value": "low"},
                {"name": "medium", "value": "medium"},
                {"name": "high", "value": "high"},
            ],
        },
    }
    data.update(overrides)
    return data


@pytest.fixture
def store(tmp_path):
    return ModelStore(tmp_path)


def test_empty_store_has_no_profiles(store):
    listing = store.listing()
    assert listing["profiles"] == [] and listing["default"] is None and listing["warnings"] == []


def test_create_writes_metadata_and_key_with_restricted_mode(store, tmp_path):
    created = store.create(profile_data(), api_key="sk-secret")
    assert created["id"] == "glm-flash"
    assert created["has_key"] is True
    assert created["base_url"] == "http://127.0.0.1:7864/v1"
    assert created["input_types"] == ["text", "image"]
    meta = json.loads((tmp_path / "models.json").read_text("utf8"))
    assert "sk-secret" not in json.dumps(meta)
    keys = json.loads((tmp_path / "models.keys.json").read_text("utf8"))
    assert keys["keys"]["glm-flash"] == "sk-secret"
    assert stat.S_IMODE((tmp_path / "models.keys.json").stat().st_mode) == 0o600


def test_ids_are_slugged_and_unique(store):
    first = store.create(profile_data(name="GLM/Flash 5"), api_key=None)
    second = store.create(profile_data(name="GLM/Flash 5"), api_key=None)
    assert first["id"] == "glm-flash-5"
    assert second["id"] == "glm-flash-5-2"


def test_chinese_name_gets_fallback_id(store):
    created = store.create(profile_data(name="通义千问"), api_key=None)
    assert created["id"] == "model"


def test_listing_never_contains_key(store):
    store.create(profile_data(), api_key="sk-secret")
    listing = store.listing()
    assert "sk-secret" not in json.dumps(listing)
    assert listing["profiles"][0]["has_key"] is True


def test_update_keeps_key_when_blank(store):
    created = store.create(profile_data(), api_key="sk-one")
    updated = store.update(created["id"], profile_data(name="GLM Flash 2"), api_key=None)
    assert updated["name"] == "GLM Flash 2" and updated["has_key"] is True
    assert store.key_for(created["id"]) == "sk-one"


def test_update_base_url_requires_new_key(store):
    created = store.create(profile_data(), api_key="sk-one")
    with pytest.raises(ModelError, match="重新输入"):
        store.update(created["id"], profile_data(base_url="http://evil.test/v1"), api_key=None)
    updated = store.update(created["id"], profile_data(base_url="http://evil.test/v1"), api_key="sk-two")
    assert updated["base_url"] == "http://evil.test/v1"
    assert store.key_for(created["id"]) == "sk-two"


def test_update_without_existing_key_may_change_url(store):
    created = store.create(profile_data(), api_key=None)
    updated = store.update(created["id"], profile_data(base_url="http://other.test/v1"), api_key=None)
    assert updated["base_url"] == "http://other.test/v1" and updated["has_key"] is False


def test_default_and_delete(store):
    first = store.create(profile_data(name="One"), api_key=None)
    second = store.create(profile_data(name="Two"), api_key=None)
    store.set_default(first["id"])
    assert store.listing()["default"] == first["id"]
    store.delete(second["id"])
    assert [p["id"] for p in store.listing()["profiles"]] == [first["id"]]
    store.delete(first["id"])
    assert store.listing()["default"] is None


def test_delete_removes_key(store, tmp_path):
    created = store.create(profile_data(), api_key="sk-one")
    store.delete(created["id"])
    assert not (tmp_path / "models.keys.json").exists()


def test_invalid_profile_rejected(store):
    with pytest.raises(ModelError, match="base_url"):
        store.create(profile_data(base_url="ftp://x"), api_key=None)
    with pytest.raises(ModelError, match="最大输出"):
        store.create(profile_data(max_output_tokens=2_000_000), api_key=None)
    with pytest.raises(ModelError, match="默认档位"):
        store.create(
            profile_data(reasoning={"parameter": "reasoning_effort", "default": "max", "levels": [{"name": "low", "value": "low"}]}),
            api_key=None,
        )
    with pytest.raises(ModelError, match="不能重复"):
        store.create(
            profile_data(
                reasoning={
                    "parameter": "reasoning_effort",
                    "default": "low",
                    "levels": [{"name": "low", "value": "low"}, {"name": "low", "value": "high"}],
                }
            ),
            api_key=None,
        )


def test_reasoning_extra_only_when_default_set():
    from agent_lab.models import ReasoningConfig

    assert ReasoningConfig().extra() == {}
    assert ReasoningConfig(default="off").extra() == {}
    assert ReasoningConfig(default="high").extra() == {"reasoning_effort": "high"}
    custom = ReasoningConfig(parameter="thinking", default="on", levels=[{"name": "on", "value": {"type": "enabled"}}])
    assert custom.extra() == {"thinking": {"type": "enabled"}}


def test_reasoning_extra_for_selected_level():
    from agent_lab.models import ReasoningConfig

    config = ReasoningConfig(default="medium")
    assert config.level("high") is not None
    assert config.level("max") is None
    assert config.extra_for(None) == {"reasoning_effort": "medium"}
    assert config.extra_for("") == {"reasoning_effort": "medium"}
    assert config.extra_for("high") == {"reasoning_effort": "high"}
    # 空值档位表示本次不注入，即使档案默认是 medium。
    assert config.extra_for("off") == {}
    assert config.extra_for("max") == {}


def test_resolve_explicit_and_default(store):
    created = store.create(profile_data(), api_key=None)
    assert store.resolve("") is None
    store.set_default(created["id"])
    default = store.default_profile()
    assert default is not None and default.id == created["id"]
    assert store.resolve(created["id"]).model == "cn:glm-5.3-flash"
    with pytest.raises(ModelError):
        store.resolve("nope")


def test_corrupt_file_is_reported(store, tmp_path):
    (tmp_path / "models.json").write_text("{not json", "utf8")
    with pytest.raises(ModelError, match="无法读取"):
        store.listing()


def test_default_pointing_to_unknown_profile_is_reported(store, tmp_path):
    (tmp_path / "models.json").write_text(json.dumps({"default": "missing", "profiles": []}), "utf8")
    with pytest.raises(ModelError, match="不存在"):
        store.listing()


def test_loose_key_permissions_warn(store, tmp_path):
    store.create(profile_data(), api_key="sk-one")
    (tmp_path / "models.keys.json").chmod(0o644)
    warnings = store.listing()["warnings"]
    assert warnings and "chmod 600" in warnings[0]


def test_pricing_round_trip(store, tmp_path):
    created = store.create(
        profile_data(
            pricing={
                "input": 0.15,
                "output": 0.6,
                "cache_read": 0.003,
                "source": "models.dev",
                "model_key": "deepseek/deepseek-flash",
                "synced_at": "2026-10-18T10:00:00Z",
            }
        )
    )
    assert created["pricing"]["input"] == 0.15 and created["pricing"]["cache_read"] == 0.003
    assert created["pricing"]["currency"] == "USD"
    meta = json.loads((tmp_path / "models.json").read_text("utf8"))
    assert meta["profiles"][0]["pricing"]["model_key"] == "deepseek/deepseek-flash"


def test_pricing_validation(store):
    with pytest.raises(ModelError, match="pricing"):
        store.create(profile_data(pricing={"input": -1, "output": 1}))
    with pytest.raises(ModelError, match="pricing"):
        store.create(profile_data(pricing={"input": 1}))
    with pytest.raises(ModelError, match="pricing"):
        store.create(profile_data(pricing={"input": 1, "output": 1, "source": "guess"}))
    with pytest.raises(ModelError, match="pricing"):
        store.create(profile_data(pricing={"input": 1, "output": 1, "unknown": True}))


def test_pricing_defaults_to_manual_and_zero_cache(store):
    created = store.create(profile_data(pricing={"input": 0, "output": 0}))
    assert created["pricing"]["source"] == "manual"
    assert created["pricing"]["cache_read"] == 0 and created["pricing"]["cache_write"] == 0
    assert created["pricing"]["model_key"] == "" and created["pricing"]["synced_at"] is None


def test_update_keeps_pricing_unless_explicitly_cleared(store):
    created = store.create(profile_data(pricing={"input": 1, "output": 2}))
    renamed = store.update(created["id"], {"name": "改名"})
    assert renamed["pricing"]["input"] == 1
    cleared = store.update(created["id"], {"pricing": None})
    assert cleared["pricing"] is None


def test_create_copies_key_from_source_profile(store):
    source = store.create(profile_data(), api_key="sk-shared")
    copied = store.create(profile_data(name="GLM Flash B", model="cn:glm-5.3-flash-b"), api_key=None, copy_key_from=source["id"])
    assert copied["id"] == "glm-flash-b" and copied["has_key"] is True
    assert store.key_for(copied["id"]) == "sk-shared"
    assert store.key_for(source["id"]) == "sk-shared"


def test_create_api_key_wins_over_copied_key(store):
    source = store.create(profile_data(), api_key="sk-old")
    copied = store.create(profile_data(name="GLM Flash B"), api_key="sk-new", copy_key_from=source["id"])
    assert store.key_for(copied["id"]) == "sk-new"
    assert store.key_for(source["id"]) == "sk-old"


def test_create_copy_key_requires_same_base_url(store):
    source = store.create(profile_data(), api_key="sk-one")
    with pytest.raises(ModelError, match="重新输入"):
        store.create(profile_data(name="GLM Flash B", base_url="http://evil.test/v1"), api_key=None, copy_key_from=source["id"])
    assert [item["id"] for item in store.listing()["profiles"]] == [source["id"]]


def test_create_copy_key_from_unknown_or_keyless_profile(store):
    with pytest.raises(ModelError, match="不存在"):
        store.create(profile_data(name="GLM Flash B"), api_key=None, copy_key_from="nope")
    source = store.create(profile_data(name="GLM Flash A"), api_key=None)
    copied = store.create(profile_data(name="GLM Flash B"), api_key=None, copy_key_from=source["id"])
    assert copied["has_key"] is False and store.key_for(copied["id"]) == ""
