from datetime import datetime, timedelta, timezone

import httpx
import pytest

from agent_lab.gate import GateError, GateStore
from agent_lab.reader_client import InsertError, InsertWriter, citations_to_links, find_anchor, parse_blocks

PAGE = """<html><body><nav><p>导航</p></nav>
<div id="chapter-content">
<p>导语段落。</p>
<h2 id="kv-cache">KV Cache</h2>
<p>前缀稳定时，<strong>缓存</strong>命中率更高。</p>
<img src="x.png">
<p>前缀稳定的另一段。</p>
<h3 id="sub">子节</h3>
<p>子节内容。</p>
</div><footer><p>页脚</p></footer></body></html>"""


class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 11, tzinfo=timezone.utc)

    def __call__(self):
        return self.now


def test_gate_lifecycle(tmp_path):
    executed = []
    gate = GateStore(tmp_path, executors={"insert": lambda p: executed.append(p) or {"ok": 1}})
    action = gate.create("insert", {"chapter": 2}, run_id="r")
    assert action.status == "pending" and gate.list("pending")[0].action_id == action.action_id
    approved = gate.approve(action.action_id)
    assert approved.status == "approved" and approved.result == {"ok": 1} and executed == [{"chapter": 2}]
    with pytest.raises(GateError):
        gate.approve(action.action_id)
    assert gate.list("pending") == []


def test_gate_reject_does_not_execute(tmp_path):
    executed = []
    gate = GateStore(tmp_path, executors={"insert": lambda p: executed.append(p)})
    action = gate.create("insert", {}, run_id="r")
    assert gate.reject(action.action_id).status == "rejected"
    assert executed == []


def test_gate_failure_is_recorded(tmp_path):
    def boom(payload):
        raise RuntimeError("reader down")

    gate = GateStore(tmp_path, executors={"insert": boom})
    action = gate.approve(gate.create("insert", {}, run_id="r").action_id)
    assert action.status == "failed" and "reader down" in action.detail


def test_gate_expiry(tmp_path):
    clock = Clock()
    gate = GateStore(tmp_path, executors={"insert": lambda p: {}}, clock=clock)
    action = gate.create("insert", {}, run_id="r")
    clock.now += timedelta(minutes=31)
    assert gate.get(action.action_id).status == "expired"
    with pytest.raises(GateError):
        gate.approve(action.action_id)


def test_gate_validation(tmp_path):
    gate = GateStore(tmp_path, executors={"insert": lambda p: {}})
    with pytest.raises(GateError):
        gate.create("delete", {}, run_id="r")
    with pytest.raises(GateError):
        gate.get("../etc")
    with pytest.raises(GateError):
        gate.get("abc123")
    assert GateStore(tmp_path / "empty").list() == []


def test_parse_blocks_and_anchor():
    blocks = parse_blocks(PAGE)
    assert [b["tag"] for b in blocks] == ["p", "h2", "p", "img", "p", "h3", "p"]
    anchor = find_anchor(blocks, "前缀稳定时， 缓存")
    assert anchor == {"after": "前缀稳定时，缓存命中率更高。", "section": "kv-cache", "offset": 1}
    assert find_anchor(blocks, "子节内容")["section"] == "sub"
    assert find_anchor(blocks, "导语")["section"] == ""
    with pytest.raises(InsertError):
        find_anchor(blocks, "前缀稳定")  # 两段都以它开头
    with pytest.raises(InsertError):
        find_anchor(blocks, "不存在")


def test_insert_writer_posts_to_reader():
    seen = {}

    def handler(request: httpx.Request):
        if request.method == "GET":
            assert request.url.path == "/book/chapter2/"
            return httpx.Response(200, text=PAGE)
        seen["headers"] = request.headers
        seen["body"] = request.read().decode()
        return httpx.Response(200, json={"ok": True, "data": {"id": "ins1"}})

    writer = InsertWriter("http://reader", http=httpx.Client(transport=httpx.MockTransport(handler)))
    result = writer.save({"chapter": 2, "after": "子节内容", "markdown": "## 补充 [[ch2#sub|子节内容]]"})
    assert result["insert_id"] == "ins1"
    assert "[[" not in seen["body"] and "/book/chapter2/?quote=" in seen["body"]
    assert seen["headers"]["x-personal-api"] == "1"
    assert "ai-agents-in-depth:zh-CN:chapter2" in seen["body"]


def test_insert_writer_errors():
    def rejecting(request):
        if request.method == "GET":
            return httpx.Response(200, text=PAGE)
        return httpx.Response(200, json={"ok": False, "error": "bad"})

    writer = InsertWriter("http://reader", http=httpx.Client(transport=httpx.MockTransport(rejecting)))
    with pytest.raises(InsertError, match="bad"):
        writer.save({"chapter": 2, "after": "子节内容", "markdown": "x"})
    down = InsertWriter("http://reader", http=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503))))
    with pytest.raises(InsertError, match="无法读取"):
        down.save({"chapter": 2, "after": "x", "markdown": "x"})
    empty = InsertWriter("http://reader", http=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text="<p>x</p>"))))
    with pytest.raises(InsertError, match="chapter-content"):
        empty.save({"chapter": 2, "after": "x", "markdown": "x"})


def test_citations_become_reader_links():
    out = citations_to_links("要点。[[ch2#kv-cache|前缀稳定时缓存命中]] 以及 [[ch1|上下文]]")
    assert out.startswith("要点。[「前缀稳定时缓存命中」](/book/chapter2/?quote=")
    assert "#kv-cache)" in out and "[「上下文」](/book/chapter1/?quote=" in out
    assert "[[" not in out
