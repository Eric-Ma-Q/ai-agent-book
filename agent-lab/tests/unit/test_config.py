from pathlib import Path

import pytest

from agent_lab.config import AgentConfig, Settings, apply_overrides, config_hash, load_config_file


def test_defaults_keep_full_context():
    cfg = AgentConfig()
    assert not cfg.drop_history and not cfg.drop_tool_results and not cfg.drop_tool_definitions
    assert cfg.stable_prefix and cfg.compression == "none"


def test_config_is_immutable():
    cfg = AgentConfig()
    with pytest.raises(Exception):
        cfg.max_turns = 3  # type: ignore[misc]


def test_unknown_fields_rejected():
    with pytest.raises(Exception):
        AgentConfig(nonsense=True)  # type: ignore[call-arg]


def test_hash_is_stable_and_sensitive():
    a, b = AgentConfig(), AgentConfig()
    assert config_hash(a) == config_hash(b)
    assert len(config_hash(a)) == 12
    assert config_hash(a) != config_hash(AgentConfig(drop_tool_results=True))


def test_chapter10_switches_default_off():
    cfg = AgentConfig()
    assert cfg.subagent == "none" and cfg.reviewer == "none"
    assert cfg.subagent_max_turns == 6 and cfg.review_rounds == 1
    with pytest.raises(Exception):
        AgentConfig(review_rounds=4)
    with pytest.raises(Exception):
        AgentConfig(subagent="parallel")  # type: ignore[arg-type]


def test_hash_unchanged_for_existing_configs():
    # Values recorded before the chapter 10 switches existed: eval cassettes live under these hashes.
    assert config_hash(AgentConfig()) == "44ecb095bb51"
    assert config_hash(AgentConfig(drop_tool_results=True)) == "91258111f502"
    assert config_hash(AgentConfig(learned_rules=True, retrieval="hybrid")) == "da0303fe34e8"


def test_hash_changes_with_chapter10_switches():
    base = config_hash(AgentConfig())
    variants = [AgentConfig(subagent="isolated"), AgentConfig(subagent="shared"), AgentConfig(reviewer="evidence"), AgentConfig(review_rounds=2)]
    assert len({base, *map(config_hash, variants)}) == 5


def test_final_answer_default_keeps_existing_hashes():
    assert config_hash(AgentConfig()) == "44ecb095bb51"
    assert config_hash(AgentConfig(final_answer=True)) != config_hash(AgentConfig())


def test_apply_overrides_parses_values():
    cfg = apply_overrides(AgentConfig(), ["drop_tool_results=true", "max_turns=5", "model=x", "temperature=0.5"])
    assert cfg.drop_tool_results is True
    assert cfg.max_turns == 5
    assert cfg.model == "x"
    assert cfg.temperature == 0.5


def test_apply_overrides_tools_list():
    cfg = apply_overrides(AgentConfig(), ["tools=search_book,read_section"])
    assert cfg.tools == ("search_book", "read_section")


def test_apply_overrides_rejects_bad_input():
    with pytest.raises(ValueError):
        apply_overrides(AgentConfig(), ["no_equals_sign"])
    with pytest.raises(ValueError):
        apply_overrides(AgentConfig(), ["max_turns=abc"])


def test_load_config_file(tmp_path: Path):
    path = tmp_path / "cfg.yaml"
    path.write_text("drop_history: true\nmax_turns: 4\n", encoding="utf8")
    cfg = load_config_file(path)
    assert cfg.drop_history and cfg.max_turns == 4


def test_settings_from_env(tmp_path: Path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("LAB_MODEL=foo\nLAB_LLM_API_KEY=secret\n# comment\n", encoding="utf8")
    monkeypatch.delenv("LAB_MODEL", raising=False)
    monkeypatch.delenv("LAB_LLM_API_KEY", raising=False)
    settings = Settings.load(env_file=env, repo_root=tmp_path)
    assert settings.model == "foo"
    assert settings.llm_api_key == "secret"
    assert settings.book_dir == tmp_path / "book"
    assert settings.data_dir == tmp_path / "personal" / "lab"


def test_environment_wins_over_env_file(tmp_path: Path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("LAB_MODEL=from-file\n", encoding="utf8")
    monkeypatch.setenv("LAB_MODEL", "from-env")
    assert Settings.load(env_file=env, repo_root=tmp_path).model == "from-env"


def test_settings_repr_hides_key(tmp_path: Path):
    settings = Settings(llm_api_key="secret", repo_root=tmp_path)
    assert "secret" not in repr(settings)


def test_model_profile_is_hashed_only_when_set():
    assert config_hash(AgentConfig()) == "44ecb095bb51"
    assert config_hash(AgentConfig(model_profile="glm-flash")) != config_hash(AgentConfig())


def test_apply_overrides_accepts_model_profile():
    cfg = apply_overrides(AgentConfig(), ["model_profile=glm-flash"])
    assert cfg.model_profile == "glm-flash"


def test_pricing_settings_from_env(tmp_path: Path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text("LAB_PRICING_URL=http://mirror.test/api.json\nLAB_PRICING_TTL_H=48\n", encoding="utf8")
    monkeypatch.delenv("LAB_PRICING_URL", raising=False)
    monkeypatch.delenv("LAB_PRICING_TTL_H", raising=False)
    settings = Settings.load(env_file=env, repo_root=tmp_path)
    assert settings.pricing_url == "http://mirror.test/api.json"
    assert settings.pricing_ttl_h == 48


def test_pricing_defaults_to_models_dev():
    settings = Settings()
    assert settings.pricing_url == "https://models.dev/api.json"
    assert settings.pricing_ttl_h == 24


def test_web_search_settings_from_env(tmp_path: Path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(
        "LAB_WEB_SEARCH_URL=http://127.0.0.1:8001\nLAB_WEB_SEARCH_TIMEOUT_S=12.5\n",
        encoding="utf8",
    )
    monkeypatch.delenv("LAB_WEB_SEARCH_URL", raising=False)
    monkeypatch.delenv("LAB_WEB_SEARCH_TIMEOUT_S", raising=False)
    settings = Settings.load(env_file=env, repo_root=tmp_path)
    assert settings.web_search_url == "http://127.0.0.1:8001"
    assert settings.web_search_timeout_s == 12.5


def test_web_search_defaults_to_disabled():
    settings = Settings()
    assert settings.web_search_url == ""
    assert settings.web_search_timeout_s == 25.0
