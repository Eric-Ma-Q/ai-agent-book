import threading
import time

import pytest

from agent_lab.trace.schema import LlmRequest, RunEnd, RunStart, ToolCall, parse_event
from agent_lab.trace.store import RunStore, new_run_id
from agent_lab.trace.tokens import estimate_tokens, segment_tokens


def start(run_id="r1"):
    return RunStart(run_id=run_id, question="q", config={"model": "m"}, config_hash="abc", git_sha="x")


def test_new_run_id_format():
    run_id = new_run_id()
    assert len(run_id) == 20 and run_id[8] == "-"
    assert new_run_id() != run_id


def test_parse_event_roundtrip():
    event = ToolCall(turn=1, call_id="c", name="search_book", args="{}", result="[]")
    data = event.model_dump(mode="json")
    assert data["type"] == "tool_call"
    assert parse_event(data) == event


def test_parse_unknown_type():
    with pytest.raises(ValueError):
        parse_event({"type": "nope"})


def test_append_assigns_seq_and_reads_back(tmp_path):
    store = RunStore(tmp_path)
    run_id = new_run_id()
    store.append(run_id, start(run_id))
    store.append(run_id, LlmRequest(turn=1, messages=[{"role": "user", "content": "q"}]))
    events = store.read(run_id)
    assert [e.seq for e in events] == [0, 1]
    assert events[0].ts is not None
    assert isinstance(events[1], LlmRequest)


def test_read_missing_run(tmp_path):
    with pytest.raises(FileNotFoundError):
        RunStore(tmp_path).read("20991231-000000-0000")


def test_list_runs_summarizes_newest_first(tmp_path):
    store = RunStore(tmp_path)
    ids = []
    for i in range(3):
        run_id = f"2026101{i}-120000-aaaa"
        ids.append(run_id)
        store.append(run_id, start(run_id))
    store.append(ids[1], RunEnd(status="ok", answer="a", totals={"prompt_tokens": 5}))
    runs = store.list_runs(limit=10)
    assert [r["run_id"] for r in runs] == list(reversed(ids))
    done = next(r for r in runs if r["run_id"] == ids[1])
    assert done["status"] == "ok" and done["question"] == "q"
    running = next(r for r in runs if r["run_id"] == ids[0])
    assert running["status"] == "running"


def test_summary_finds_run_end_before_later_gate_events(tmp_path):
    from agent_lab.trace.schema import Gate

    store = RunStore(tmp_path)
    run_id = "20261011-120000-bbbb"
    store.append(run_id, start(run_id))
    store.append(run_id, RunEnd(status="ok"))
    store.append(run_id, Gate(action_id="a", kind="insert", payload={}, status="approved"))
    assert store.list_runs()[0]["status"] == "ok"


def test_wait_returns_new_events(tmp_path):
    store = RunStore(tmp_path)
    run_id = new_run_id()
    store.append(run_id, start(run_id))

    def later():
        time.sleep(0.05)
        store.append(run_id, RunEnd(status="ok"))

    threading.Thread(target=later).start()
    events = store.wait(run_id, after=1, timeout=2)
    assert [e.type for e in events] == ["run_end"]
    assert store.wait(run_id, after=2, timeout=0.05) == []


def test_run_id_validation(tmp_path):
    with pytest.raises(ValueError):
        RunStore(tmp_path).read("../../etc/passwd")


def test_estimate_tokens():
    assert estimate_tokens("") == 0
    assert estimate_tokens("你好世界") >= 2
    assert estimate_tokens("hello world, this is text") >= 4


def test_segment_tokens_groups_by_role():
    messages = [
        {"role": "system", "content": "规则" * 10},
        {"role": "user", "content": "问题"},
        {"role": "assistant", "content": None, "tool_calls": [{"function": {"name": "s", "arguments": "{\"q\":1}"}}]},
        {"role": "tool", "content": "结果" * 20},
    ]
    seg = segment_tokens(messages, tools=[{"type": "function", "function": {"name": "s"}}])
    assert set(seg) == {"system", "tools", "user", "assistant", "tool"}
    assert seg["tool"] > seg["user"] and seg["tools"] > 0


def test_events_default_to_main_agent_and_accept_review():
    from agent_lab.trace.schema import Info, LlmResponse

    old = parse_event({"type": "tool_call", "turn": 1, "call_id": "c", "name": "n", "args": "", "result": ""})
    assert old.agent == "main"
    review = parse_event({"type": "llm_request", "turn": 2, "purpose": "review", "agent": "reviewer", "messages": []})
    assert (review.purpose, review.agent) == ("review", "reviewer")
    assert LlmResponse(turn=1, agent="sub-1").agent == "sub-1"
    assert Info(turn=0, kind="k").agent == "main"


def test_session_runs_follow_start_time_not_run_id_suffix(tmp_path, monkeypatch):
    store = RunStore(tmp_path)
    stamps = iter(
        f"2026-10-19T02:00:0{index // 2}.{index % 2}00+00:00" for index in range(10)
    )
    monkeypatch.setattr("agent_lab.trace.store.now_iso", lambda: next(stamps))
    older = "20261019-100000-ffff"  # 后缀比 newer 大，按 run_id 倒序会排到前面
    newer = "20261019-100000-aaaa"
    store.append(older, RunStart(run_id=older, question="第一问", config={}, config_hash="", session_id="pa-order"))
    store.append(older, RunEnd(status="ok", answer="一"))
    store.append(newer, RunStart(run_id=newer, question="第二问", config={}, config_hash="", session_id="pa-order"))
    store.append(newer, RunEnd(status="ok", answer="二"))
    other = "20261019-100000-bbbb"
    store.append(other, RunStart(run_id=other, question="别的会话", config={}, config_hash="", session_id="pa-other"))
    store.append(other, RunEnd(status="ok", answer="x"))
    running = "20261019-100000-cccc"
    store.append(running, RunStart(run_id=running, question="还没结束", config={}, config_hash="", session_id="pa-order"))

    assert [item["run_id"] for item in store.session_runs("pa-order")] == [older, newer]
    assert [item["run_id"] for item in store.session_runs("pa-other")] == [other]


def test_session_runs_can_keep_unfinished_runs(tmp_path):
    store = RunStore(tmp_path)
    done = "20261019-100000-aaaa"
    open_run = "20261019-100100-bbbb"
    store.append(done, RunStart(run_id=done, question="第一问", config={}, config_hash="", session_id="pa-open"))
    store.append(done, RunEnd(status="ok", answer="一"))
    store.append(open_run, RunStart(run_id=open_run, question="第二问", config={}, config_hash="", session_id="pa-open"))

    assert [item["run_id"] for item in store.session_runs("pa-open")] == [done]
    kept = store.session_runs("pa-open", include_unfinished=True)
    assert [item["run_id"] for item in kept] == [done, open_run]
    assert kept[-1]["status"] == "running"


def test_session_runs_limit_applies_per_session(tmp_path):
    store = RunStore(tmp_path)
    old = "20261019-100000-aaaa"
    store.append(old, RunStart(run_id=old, question="旧会话", config={}, config_hash="", session_id="pa-old"))
    store.append(old, RunEnd(status="ok", answer="旧"))
    for index, name in enumerate(("pa-new-1", "pa-new-2")):
        run_id = f"20261019-11000{index}-cccc"
        store.append(run_id, RunStart(run_id=run_id, question="新会话", config={}, config_hash="", session_id=name))
        store.append(run_id, RunEnd(status="ok", answer="新"))

    # 全局最近 1 条落在新会话上；按会话筛之后仍能拿到旧会话那一轮
    assert [item["run_id"] for item in store.session_runs("pa-old", limit=1)] == [old]
