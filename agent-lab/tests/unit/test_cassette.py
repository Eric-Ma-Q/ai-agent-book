import json

import pytest

from agent_lab.llm.cassette import CassetteClient, CassetteMiss, request_key
from agent_lab.llm.client import ChatRequest, ChatResponse, Usage
from agent_lab.llm.scripted import ScriptedClient


def req(text="q"):
    return ChatRequest(model="m", messages=[{"role": "user", "content": text}])


def resp(text):
    return ChatResponse(message={"role": "assistant", "content": text}, usage=Usage(prompt_tokens=1), latency_ms=7)


def test_request_key_is_deterministic_and_content_sensitive():
    assert request_key(req("a")) == request_key(req("a"))
    assert request_key(req("a")) != request_key(req("b"))


def test_record_then_replay(tmp_path):
    path = tmp_path / "c.json"
    inner = ScriptedClient([resp("one"), resp("two")])
    recorder = CassetteClient(path, mode="record", inner=inner)
    assert recorder.complete(req()).message["content"] == "one"
    assert recorder.complete(req()).message["content"] == "two"
    assert len(json.loads(path.read_text())["entries"]) == 1

    player = CassetteClient(path, mode="replay")
    first = player.complete(req())
    assert first.message["content"] == "one"
    assert first.latency_ms == 7
    assert player.complete(req()).message["content"] == "two"


def test_replay_miss_raises(tmp_path):
    path = tmp_path / "c.json"
    CassetteClient(path, mode="record", inner=ScriptedClient([resp("one")])).complete(req())
    player = CassetteClient(path, mode="replay")
    with pytest.raises(CassetteMiss):
        player.complete(req("other"))
    player.complete(req())
    with pytest.raises(CassetteMiss):
        player.complete(req())


def test_replay_without_file_raises(tmp_path):
    with pytest.raises(CassetteMiss):
        CassetteClient(tmp_path / "missing.json", mode="replay").complete(req())


def test_record_requires_inner(tmp_path):
    with pytest.raises(ValueError):
        CassetteClient(tmp_path / "c.json", mode="record")


def test_record_overwrites_previous_entries(tmp_path):
    path = tmp_path / "c.json"
    CassetteClient(path, mode="record", inner=ScriptedClient([resp("old")])).complete(req())
    CassetteClient(path, mode="record", inner=ScriptedClient([resp("new")])).complete(req())
    assert CassetteClient(path, mode="replay").complete(req()).message["content"] == "new"


def test_scripted_client_records_requests_and_runs_out():
    client = ScriptedClient([resp("x")])
    client.complete(req("hello"))
    assert client.requests[0].messages[0]["content"] == "hello"
    with pytest.raises(AssertionError):
        client.complete(req())


def test_scripted_client_can_raise():
    from agent_lab.llm.client import LLMError

    client = ScriptedClient([LLMError("down")])
    with pytest.raises(LLMError):
        client.complete(req())
