import json
from datetime import datetime, timedelta, timezone

import pytest

from agent_lab.models import ModelError, ModelStore
from agent_lab.pricing_catalog import (
    ALIAS,
    CONTAINS,
    EXACT,
    HOST_BONUS,
    PriceCatalog,
    PricingError,
    PricingUnavailable,
    build_entries,
    normalize_model_id,
)
from tests.unit.test_models import profile_data

NOW = datetime(2026, 10, 18, 10, 0, tzinfo=timezone.utc)

RAW = {
    "deepseek": {
        "name": "DeepSeek",
        "api": "https://api.deepseek.com",
        "models": {
            "deepseek-flash": {
                "name": "DeepSeek V4.1 Flash 1017",
                "canonical_model_id": "deepseek/deepseek-v4.1-flash-1017",
                "cost": {"input": 0.15, "output": 0.6, "cache_read": 0.003},
                "limit": {"context": 1_000_000, "output": 393_216},
                "modalities": {"input": ["text", "image"], "output": ["text"]},
                "release_date": "2026-10-17",
            },
            "deepseek-v4-flash-vision-exp": {
                "name": "DeepSeek V4 Flash Vision Exp",
                "cost": {"input": 0.15, "output": 0.6},
                "status": "deprecated",
                "modalities": {"input": ["text"], "output": ["text"]},
            },
            "text-embedding-v4": {
                "name": "Embedding",
                "cost": {"input": 0.01, "output": 0.01},
                "modalities": {"input": ["text"], "output": ["text"]},
            },
        },
    },
    "zhipuai": {
        "name": "Zhipu AI",
        "api": "https://open.bigmodel.cn/api/paas/v4",
        "models": {
            "glm-5.3-flash": {
                "name": "GLM-5.3-Flash",
                "canonical_model_id": "zhipuai/glm-5.3-flash",
                "cost": {"input": 0.15, "output": 0.5, "cache_read": 0.03, "cache_write": 0},
                "limit": {"context": 1_000_000, "output": 131_072},
                "modalities": {"input": ["text", "image"], "output": ["text"]},
                "release_date": "2026-08-26",
            }
        },
    },
    "zhipuai-coding-plan": {
        "name": "Zhipu Coding Plan",
        "models": {
            "glm-5.3-flash": {
                "name": "GLM-5.3-Flash",
                "canonical_model_id": "zhipuai/glm-5.3-flash",
                "cost": {"input": 0, "output": 0},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
    "reseller-no-canonical": {
        "name": "Reseller Without Canonical",
        "models": {
            "reseller/glm-5.3-flash": {
                "name": "GLM-5.3-Flash",
                "cost": {"input": 0.2, "output": 0.6},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
    "aggregator": {
        "name": "Aggregator",
        "models": {
            "deepseek/deepseek-flash": {
                "name": "DeepSeek Flash",
                "canonical_model_id": "deepseek/deepseek-flash",
                "cost": {"input": 0.2, "output": 0.8},
                "modalities": {"input": ["text"], "output": ["text"]},
                "release_date": "2026-10-18",
            }
        },
    },
    "no-price": {"name": "No Price", "models": {"mystery": {"name": "Mystery"}}},
}


AMBIGUOUS = {
    "vendor-a": {
        "name": "Vendor A",
        "api": "https://a.test/v1",
        "models": {
            "twin-model": {
                "name": "Twin",
                "cost": {"input": 1, "output": 2},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
    "vendor-b": {
        "name": "Vendor B",
        "api": "https://b.test/v1",
        "models": {
            "twin-model": {
                "name": "Twin",
                "cost": {"input": 3, "output": 4},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
}


class Clock:
    def __init__(self):
        self.moment = NOW

    def __call__(self) -> datetime:
        return self.moment

    def advance(self, seconds: float) -> None:
        self.moment = self.moment + timedelta(seconds=seconds)


class Fetcher:
    def __init__(self, payload=RAW, error: Exception | None = None):
        self.payload = payload
        self.error = error
        self.calls = 0

    def __call__(self, url: str):
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.payload


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def fetcher():
    return Fetcher()


def catalog(tmp_path, fetcher, clock, ttl_s=3600):
    return PriceCatalog(tmp_path / "data", url="https://example.test/api.json", ttl_s=ttl_s, fetcher=fetcher, now=clock)


def test_normalize_model_id_handles_namespaces_and_markers():
    assert normalize_model_id("cn:glm-5.3-flash") == "glm-5.3-flash"
    assert normalize_model_id("zhipuai/glm-5.3-flash[1m]") == "glm-5.3-flash"
    assert normalize_model_id("openai:gpt-4o") == "gpt-4o"
    assert normalize_model_id("glm-5:free") == "glm-5"
    assert normalize_model_id("deepseek/DeepSeek-Chat") == "deepseek-chat"
    assert normalize_model_id("  ") == ""


def test_build_entries_drops_deprecated_embedding_and_unpriced():
    entries = build_entries(RAW)
    models = sorted((entry["key"], entry["cost"]["input"], entry["cost"]["output"]) for entry in entries)
    assert models == [
        ("aggregator/deepseek/deepseek-flash", 0.2, 0.8),
        ("deepseek/deepseek-flash", 0.15, 0.6),
        ("reseller-no-canonical/reseller/glm-5.3-flash", 0.2, 0.6),
        ("zhipuai-coding-plan/glm-5.3-flash", 0.0, 0.0),
        ("zhipuai/glm-5.3-flash", 0.15, 0.5),
    ]


def test_build_entries_rejects_wrong_shape():
    with pytest.raises(PricingUnavailable, match="JSON 对象"):
        build_entries([])
    with pytest.raises(PricingUnavailable, match="没有可用"):
        build_entries({"x": {"models": {"m": {"name": "no cost"}}}})


def test_lookup_prefers_exact_match_and_provider_host(tmp_path, fetcher, clock):
    result = catalog(tmp_path, fetcher, clock).lookup("deepseek-flash", "https://api.deepseek.com/v1")
    first = result["matches"][0]
    assert first["key"] == "deepseek/deepseek-flash"
    assert first["score"] == EXACT + HOST_BONUS
    assert first["cost"] == {"input": 0.15, "output": 0.6, "cache_read": 0.003, "cache_write": 0.0}
    assert [item["key"] for item in result["matches"][1:]] == ["aggregator/deepseek/deepseek-flash"]
    assert result["catalog"]["count"] == 5


def test_lookup_returns_contains_candidates(tmp_path, fetcher, clock):
    result = catalog(tmp_path, fetcher, clock).lookup("cn:glm-5.3")
    assert [item["key"] for item in result["matches"]] == [
        "zhipuai/glm-5.3-flash",
        "zhipuai-coding-plan/glm-5.3-flash",
        "reseller-no-canonical/reseller/glm-5.3-flash",
    ]
    assert {item["score"] for item in result["matches"]} == {CONTAINS}


def test_lookup_rejects_empty_model(tmp_path, fetcher, clock):
    with pytest.raises(PricingError, match="不能为空"):
        catalog(tmp_path, fetcher, clock).lookup("   ")


def test_cache_is_reused_within_ttl(tmp_path, fetcher, clock):
    price = catalog(tmp_path, fetcher, clock)
    price.entries()
    price.entries()
    assert fetcher.calls == 1
    assert json.loads((tmp_path / "data" / "pricing" / "models.dev.json").read_text("utf8"))["version"] == 1
    price.entries(force=True)
    assert fetcher.calls == 2


def test_stale_cache_is_used_when_refresh_fails(tmp_path, clock):
    fetcher = Fetcher()
    price = catalog(tmp_path, fetcher, clock, ttl_s=60)
    price.entries()
    clock.advance(120)
    fetcher.error = RuntimeError("network down")
    entries, meta = price.entries()
    assert entries and meta["stale"] is True
    assert "network down" in meta["warnings"][0]
    assert meta["fetched_at"] == "2026-10-18T10:00:00Z"


def test_fetch_failure_without_cache_is_unavailable(tmp_path, clock):
    price = catalog(tmp_path, Fetcher(error=RuntimeError("offline")), clock)
    with pytest.raises(PricingUnavailable, match="LAB_PRICING_URL"):
        price.entries()


def test_status_reports_cache_age(tmp_path, fetcher, clock):
    price = catalog(tmp_path, fetcher, clock, ttl_s=3600)
    empty = price.status()
    assert empty["fetched_at"] is None and empty["count"] == 0
    price.entries()
    clock.advance(30)
    filled = price.status()
    assert filled["count"] == 5 and filled["age_s"] == 30 and filled["stale"] is False
    clock.advance(4000)
    assert price.status()["stale"] is True


def test_sync_profile_writes_models_dev_pricing(tmp_path, fetcher, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"))
    price = catalog(tmp_path, fetcher, clock)

    result = price.sync_profile(store, "glm-flash")

    assert result["match"]["key"] == "deepseek/deepseek-flash"
    pricing = result["profile"]["pricing"]
    assert pricing["input"] == 0.15 and pricing["output"] == 0.6 and pricing["cache_read"] == 0.003
    assert pricing["source"] == "models.dev" and pricing["model_key"] == "deepseek/deepseek-flash"
    assert pricing["synced_at"] == "2026-10-18T10:00:00Z"
    assert store.catalog().find("glm-flash").pricing.input == 0.15


def test_sync_profile_prefers_original_listing_over_resellers(tmp_path, fetcher, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="glm-5.3-flash", base_url="http://127.0.0.1:7864/v1"))

    result = catalog(tmp_path, fetcher, clock).sync_profile(store, "glm-flash")

    assert result["match"]["key"] == "zhipuai/glm-5.3-flash"
    assert result["profile"]["pricing"]["input"] == 0.15
    assert result["profile"]["pricing"]["output"] == 0.5


def test_sync_profile_refuses_ambiguous_matches(tmp_path, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="twin-model", base_url="http://127.0.0.1:7864/v1"))
    price = catalog(tmp_path, Fetcher(payload=AMBIGUOUS), clock)
    with pytest.raises(PricingError, match="匹配到 2 条"):
        price.sync_profile(store, "glm-flash")


def test_sync_profile_reports_missing_match(tmp_path, fetcher, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="unlisted-model"))
    with pytest.raises(PricingError, match="没有与 unlisted-model 相关"):
        catalog(tmp_path, fetcher, clock).sync_profile(store, "glm-flash")


def test_sync_all_updates_unpriced_and_skips_manual(tmp_path, fetcher, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"))
    manual = store.create(profile_data(name="manual"), api_key=None)
    store.apply_pricing({manual["id"]: {"input": 1.0, "output": 2.0, "source": "manual"}})
    store.create(profile_data(name="unknown-model", model="unlisted-model"), api_key=None)

    result = catalog(tmp_path, fetcher, clock).sync_all(store)

    assert result["updated"] == ["glm-flash"]
    assert {item["id"]: item["reason"] for item in result["skipped"]} == {
        manual["id"]: "手填价格不覆盖",
        "unknown-model": "models.dev 里没有与 unlisted-model 相关的价格；在页面上查找候选，或手填单价",
    }
    assert store.catalog().find("glm-flash").pricing.source == "models.dev"
    assert store.catalog().find(manual["id"]).pricing.input == 1.0


def test_apply_pricing_can_clear(tmp_path):
    store = ModelStore(tmp_path)
    store.create(profile_data(pricing={"input": 1.0, "output": 2.0}))
    store.apply_pricing({"glm-flash": None})
    assert store.catalog().find("glm-flash").pricing is None


def test_sync_profile_unknown_id(tmp_path, fetcher, clock):
    with pytest.raises(ModelError, match="不存在"):
        catalog(tmp_path, fetcher, clock).sync_profile(ModelStore(tmp_path / "data"), "nope")


def test_sync_all_force_refreshes_catalog_once(tmp_path, clock):
    fetcher = Fetcher()
    price = catalog(tmp_path, fetcher, clock, ttl_s=60)
    price.entries()
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-flash", base_url="https://api.deepseek.com/v1"), api_key=None)
    store.create(profile_data(name="second", model="deepseek-flash", base_url="https://api.deepseek.com/v1"), api_key=None)

    result = price.sync_all(store, force=True)

    assert result["updated"] == ["glm-flash", "second"]
    assert fetcher.calls == 2


def test_malformed_refresh_falls_back_to_cache(tmp_path, clock):
    fetcher = Fetcher()
    price = catalog(tmp_path, fetcher, clock, ttl_s=60)
    price.entries()
    clock.advance(120)
    fetcher.payload = []
    entries, meta = price.entries()
    assert entries and meta["stale"] is True
    assert "价格目录格式无效" in meta["warnings"][0]


def test_fetch_json_uses_curl_first(monkeypatch):
    import agent_lab.pricing_catalog as module

    seen = {}

    class Completed:
        returncode = 0
        stdout = b'{"providers": {}}'
        stderr = b""

    def fake_run(command, **kwargs):
        seen["command"] = command
        return Completed()

    monkeypatch.setattr(module.shutil, "which", lambda name: "/usr/bin/curl")
    monkeypatch.setattr(module.subprocess, "run", fake_run)
    assert module._fetch_json("https://example.test/api.json") == {"providers": {}}
    assert seen["command"][0] == "/usr/bin/curl"


def test_fetch_json_falls_back_to_httpx(monkeypatch):
    import agent_lab.pricing_catalog as module

    def boom(*args, **kwargs):
        raise OSError("no curl")

    monkeypatch.setattr(module.shutil, "which", lambda name: "/usr/bin/curl")
    monkeypatch.setattr(module.subprocess, "run", boom)
    monkeypatch.setattr(module, "_fetch_with_httpx", lambda url: {"ok": True})
    assert module._fetch_json("https://example.test/api.json") == {"ok": True}


def test_fetch_json_reports_both_failures(monkeypatch):
    import agent_lab.pricing_catalog as module

    monkeypatch.setattr(module.shutil, "which", lambda name: None)

    def boom(url):
        raise RuntimeError("tls reset")

    monkeypatch.setattr(module, "_fetch_with_httpx", boom)
    with pytest.raises(PricingUnavailable, match="价格目录拉取失败.*tls reset"):
        module._fetch_json("https://example.test/api.json")


ALIAS_RAW = {
    "deepseek": {
        "name": "DeepSeek",
        "api": "https://api.deepseek.com",
        "models": {
            "deepseek-flash": {
                "name": "DeepSeek V4.1 Flash 1017",
                "canonical_model_id": "deepseek/deepseek-v4.1-flash-1017",
                "cost": {"input": 0.15, "output": 0.6, "cache_read": 0.003},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
    "reseller": {
        "name": "Reseller",
        "models": {
            "deepseek-v4.1-flash": {
                "name": "DeepSeek V4.1 Flash",
                "canonical_model_id": "deepseek/deepseek-v4.1-flash",
                "cost": {"input": 0.0, "output": 0.0},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
}


def test_lookup_uses_canonical_alias_and_puts_original_first(tmp_path, clock):
    price = catalog(tmp_path, Fetcher(payload=ALIAS_RAW), clock)
    result = price.lookup("deepseek-v4.1-flash", "http://127.0.0.1:7864/v1")

    assert [item["key"] for item in result["matches"]] == ["deepseek/deepseek-flash", "reseller/deepseek-v4.1-flash"]
    assert result["matches"][0]["score"] == ALIAS and result["matches"][0]["original"] is True
    assert result["matches"][1]["score"] == EXACT


def test_sync_uses_unique_original_alias(tmp_path, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-v4.1-flash", base_url="http://127.0.0.1:7864/v1"))
    price = catalog(tmp_path, Fetcher(payload=ALIAS_RAW), clock)

    result = price.sync_profile(store, "glm-flash")

    assert result["match"]["key"] == "deepseek/deepseek-flash"
    assert result["profile"]["pricing"]["input"] == 0.15
    assert result["profile"]["pricing"]["cache_read"] == 0.003


SAME_PRICE = {
    "vendor-a": {
        "name": "Vendor A",
        "models": {
            "same-model": {
                "name": "Same",
                "cost": {"input": 0.1, "output": 0.2},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
    "vendor-b": {
        "name": "Vendor B",
        "models": {
            "same-model": {
                "name": "Same",
                "cost": {"input": 0.1, "output": 0.2},
                "modalities": {"input": ["text"], "output": ["text"]},
            }
        },
    },
}


def test_sync_collapses_matches_with_identical_prices(tmp_path, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="same-model", base_url="http://127.0.0.1:7864/v1"))
    price = catalog(tmp_path, Fetcher(payload=SAME_PRICE), clock)

    result = price.sync_profile(store, "glm-flash")

    assert result["profile"]["pricing"]["input"] == 0.1
    assert result["match"]["key"] == "vendor-a/same-model"


def test_apply_profile_accepts_selected_candidate(tmp_path, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-v4.1-flash", base_url="http://127.0.0.1:7864/v1"))
    price = catalog(tmp_path, Fetcher(payload=ALIAS_RAW), clock)

    result = price.apply_profile(store, "glm-flash", "deepseek/deepseek-flash")

    assert result["match"]["key"] == "deepseek/deepseek-flash"
    assert result["profile"]["pricing"]["input"] == 0.15
    assert result["profile"]["pricing"]["source"] == "models.dev"


def test_apply_profile_rejects_unknown_or_unrelated_key(tmp_path, clock):
    store = ModelStore(tmp_path / "data")
    store.create(profile_data(model="deepseek-v4.1-flash", base_url="http://127.0.0.1:7864/v1"))
    price = catalog(tmp_path, Fetcher(payload={**ALIAS_RAW, **SAME_PRICE}), clock)

    with pytest.raises(PricingError, match="不存在"):
        price.apply_profile(store, "glm-flash", "deepseek/not-there")
    with pytest.raises(PricingError, match="不匹配"):
        price.apply_profile(store, "glm-flash", "vendor-a/same-model")
