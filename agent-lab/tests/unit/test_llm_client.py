import json

import httpx
import pytest

from agent_lab.llm.client import ChatRequest, LLMError, OpenAICompatClient, parse_usage


def ok_payload(content="hi", tool_calls=None, usage=None):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "model": "m",
        "choices": [{"message": message, "finish_reason": "stop"}],
        "usage": usage
        or {
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "prompt_tokens_details": {"cached_tokens": 64},
            "completion_tokens_details": {"reasoning_tokens": 5},
        },
    }


def make_client(handler, **kwargs):
    transport = httpx.MockTransport(handler)
    return OpenAICompatClient(
        base_url="http://llm/v1", api_key="k", http=httpx.Client(transport=transport), sleep=lambda s: None, **kwargs
    )


REQ = ChatRequest(model="m", messages=[{"role": "user", "content": "q"}], tools=None, temperature=0.2, max_tokens=50)


def test_parse_usage_full():
    usage = parse_usage(ok_payload()["usage"])
    assert (usage.prompt_tokens, usage.cached_tokens, usage.completion_tokens, usage.reasoning_tokens) == (100, 64, 20, 5)


def test_parse_usage_missing_fields_are_none():
    usage = parse_usage({"prompt_tokens": 10})
    assert usage.prompt_tokens == 10
    assert usage.cached_tokens is None and usage.completion_tokens is None and usage.reasoning_tokens is None
    assert parse_usage(None).prompt_tokens is None


def test_request_body_and_auth():
    seen = {}

    def handler(request: httpx.Request):
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        seen["url"] = str(request.url)
        return httpx.Response(200, json=ok_payload())

    tools = [{"type": "function", "function": {"name": "t", "parameters": {"type": "object"}}}]
    req = ChatRequest(model="m", messages=[{"role": "user", "content": "q"}], tools=tools, temperature=0.1, max_tokens=9)
    resp = make_client(handler).complete(req)
    assert seen["auth"] == "Bearer k"
    assert seen["url"] == "http://llm/v1/chat/completions"
    assert seen["body"]["tools"] == tools and seen["body"]["max_tokens"] == 9
    assert resp.message["content"] == "hi"
    assert resp.usage.cached_tokens == 64
    assert resp.retries == []


def test_no_tools_field_when_none():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=ok_payload())

    make_client(handler).complete(REQ)
    assert "tools" not in seen["body"]


def test_retries_server_errors_then_succeeds():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json=ok_payload())

    resp = make_client(handler).complete(REQ)
    assert calls["n"] == 3
    assert [r.reason for r in resp.retries] == ["HTTP 503", "HTTP 503"]


def test_retries_rate_limit():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(429 if calls["n"] == 1 else 200, json=ok_payload())

    assert len(make_client(handler).complete(REQ).retries) == 1


def test_gives_up_after_max_retries():
    def handler(request):
        return httpx.Response(500, text="boom")

    with pytest.raises(LLMError) as info:
        make_client(handler, max_retries=2).complete(REQ)
    assert "500" in str(info.value)
    assert len(info.value.retries) == 2


def test_client_errors_are_not_retried():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(400, json={"error": {"message": "bad model"}})

    with pytest.raises(LLMError) as info:
        make_client(handler).complete(REQ)
    assert calls["n"] == 1
    assert "bad model" in str(info.value)


def test_network_errors_are_retried():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectError("refused")
        return httpx.Response(200, json=ok_payload())

    resp = make_client(handler).complete(REQ)
    assert resp.retries[0].reason.startswith("ConnectError")


def test_malformed_response_raises():
    def handler(request):
        return httpx.Response(200, json={"choices": []})

    with pytest.raises(LLMError):
        make_client(handler).complete(REQ)


def test_list_models():
    def handler(request):
        return httpx.Response(200, json={"data": [{"id": "a"}, {"id": "b"}]})

    assert make_client(handler).list_models() == ["a", "b"]


def test_extra_fields_merge_into_request_body():
    req = ChatRequest(model="m", messages=[{"role": "user", "content": "q"}], extra={"reasoning_effort": "high"})
    body = req.body()
    assert body["reasoning_effort"] == "high"
    assert "reasoning_effort" not in REQ.body()
