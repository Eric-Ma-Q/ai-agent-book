from agent_lab.security.catalog import (
    ATTACKS,
    DEFENSES,
    DEMO_SECRET_FRAGMENT,
    LEAK_PATH,
    WEBPAGE_URL,
    attack_by_id,
    catalog,
    defense_by_id,
)


def test_catalog_has_three_attacks_and_four_layered_defenses():
    assert [item.id for item in ATTACKS] == ["direct", "indirect", "memory"]
    assert [item.id for item in DEFENSES] == ["D1", "D2", "D3", "D4"]
    assert DEFENSES[0].layers == ()
    assert DEFENSES[1].layers == ("prompt_hardening",)
    assert DEFENSES[2].layers == ("prompt_hardening", "source_tagging")
    assert DEFENSES[3].layers == ("prompt_hardening", "source_tagging", "runtime_guard")


def test_catalog_payload_is_serializable_and_hides_secret():
    data = catalog()
    assert data["protocol"] == "2-5-lab-v1"
    assert len(data["attacks"]) == 3 and len(data["defenses"]) == 4
    assert data["defaults"]["trials"] == 1
    assert DEMO_SECRET_FRAGMENT not in str(data)
    assert LEAK_PATH not in str(data["demo"].get("secret_label", ""))


def test_unknown_names_raise():
    try:
        attack_by_id("nope")
    except ValueError as error:
        assert "未知攻击" in str(error)
    else:
        raise AssertionError("expected ValueError")
    try:
        defense_by_id("D9")
    except ValueError as error:
        assert "未知防御" in str(error)
    else:
        raise AssertionError("expected ValueError")


def test_webpage_payload_mentions_leak_target():
    assert attack_by_id("indirect").user_messages[0].endswith(WEBPAGE_URL)
