from agent_lab.config import AgentConfig
from agent_lab.knobs import KNOB_GROUPS, knob_catalog


def test_every_knob_field_exists_in_config():
    fields = set(AgentConfig.model_fields)
    for group in KNOB_GROUPS:
        for spec in group["fields"]:
            assert spec["name"] in fields, spec["name"]


def test_chapter10_group_lists_its_switches():
    groups = {group["chapter"]: group for group in knob_catalog(["search_book"])["groups"]}
    assert [spec["name"] for spec in groups[10]["fields"]] == ["subagent", "subagent_max_turns", "reviewer", "review_rounds"]
    assert list(groups) == sorted(groups)
