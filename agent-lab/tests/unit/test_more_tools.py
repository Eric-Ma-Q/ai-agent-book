import json

import pytest

from agent_lab.agent import run_agent
from agent_lab.config import AgentConfig
from agent_lab.gate import GateStore
from agent_lab.sandbox import Sandbox
from agent_lab.tools import all_tools
from agent_lab.tools.registry import RunState, ToolContext, ToolRegistry
from tests.helpers import BOOK, Recorder, deps, text, tool
from tests.unit.test_stores import personal  # noqa: F401  (pytest fixture)

REGISTRY = ToolRegistry(all_tools())
needs_sandbox = pytest.mark.skipif(not Sandbox().available, reason="需要 macOS sandbox-exec")
ANCHOR = "前缀稳定时，缓存命中率更高，推理成本"


def ctx(**kw):
    return ToolContext(book=BOOK, run_id="r", state=RunState(), **kw)


def call(tool_name, context, args=None, **kwargs):
    payload = {**(args or {}), **kwargs}
    outcome = REGISTRY.execute(tool_name, json.dumps(payload, ensure_ascii=False), context)
    return outcome, (json.loads(outcome.content) if outcome.error is None else None)


def test_list_highlights_and_inserts(personal):  # noqa: F811
    from agent_lab.stores import NotesStore

    context = ctx(notes=NotesStore(personal))
    _, data = call("list_highlights", context, chapter=2, only_with_notes=True)
    assert data["count"] == 1 and data["highlights"][0]["note"] == "这是什么意思呢"
    _, data = call("list_inserts", context)
    assert data["inserts"][0]["chapter"] == 1


def test_notes_tools_need_store():
    outcome, _ = call("list_highlights", ctx())
    assert "没有接入" in outcome.error


def test_propose_insert_creates_pending_action(tmp_path):
    gate = GateStore(tmp_path, executors={"insert": lambda p: {}})
    events = []
    context = ctx(gate=gate, emit=events.append)
    _, data = call("propose_insert", context, chapter=2, after=ANCHOR, markdown="## 补充\n说明")
    assert data["status"] == "pending"
    assert gate.list("pending")[0].payload["chapter"] == 2
    assert events[0].type == "gate" and events[0].status == "pending"
    assert context.state.proposed_actions == [data["action_id"]]


@pytest.mark.parametrize(
    "args,message",
    [
        ({"chapter": 2, "after": "太短", "markdown": "x"}, "太短"),
        ({"chapter": 2, "after": "这段文字在书里根本不存在哦", "markdown": "x"}, "找不到"),
        ({"chapter": 2, "after": ANCHOR, "markdown": "  "}, "不能为空"),
    ],
)
def test_propose_insert_validation(tmp_path, args, message):
    context = ctx(gate=GateStore(tmp_path, executors={"insert": lambda p: {}}))
    outcome, _ = call("propose_insert", context, args)
    assert message in outcome.error


def test_propose_insert_without_gate():
    outcome, _ = call("propose_insert", ctx(), chapter=2, after=ANCHOR, markdown="x")
    assert "不支持写入" in outcome.error


@needs_sandbox
def test_run_python():
    _, data = call("run_python", ctx(sandbox=Sandbox()), code="print(1000+2000+3000)")
    assert data["stdout"].strip() == "6000"


def test_run_python_without_sandbox():
    outcome, _ = call("run_python", ctx(), code="print(1)")
    assert "没有沙箱" in outcome.error


@needs_sandbox
def test_create_tool_then_call_it_in_a_run():
    code = "def run(args):\n    n = int(args['turns'])\n    return {'total': sum(1000 * t for t in range(1, n + 1))}\n"
    schema = {"type": "object", "properties": {"turns": {"type": "integer"}}, "required": ["turns"]}
    script = [
        tool("create_tool", {"name": "cache_reads", "description": "累计缓存读取量", "parameters": schema, "code": code}, call_id="a"),
        tool("cache_reads", {"turns": 3}, call_id="b"),
        text("三轮累计读取 6000 个 token。"),
    ]
    rec = Recorder()
    cfg = AgentConfig(tools=("search_book", "run_python", "create_tool"))
    outcome = run_agent(deps(script, sandbox=Sandbox()), "q", cfg, run_id="r", emit=rec)
    assert outcome.status == "ok"
    calls = rec.of("tool_call")
    assert calls[0].error is None and "已创建" in calls[0].result
    assert calls[1].error is None and json.loads(calls[1].result) == {"total": 6000}
    last_tools = [t["function"]["name"] for t in rec.of("llm_request")[-1].tools]
    assert "cache_reads" in last_tools


@needs_sandbox
@pytest.mark.parametrize(
    "args,message",
    [
        ({"name": "Bad", "description": "d", "parameters": {"type": "object"}, "code": "def run(args):\n    return 1"}, "不合法"),
        ({"name": "search_book", "description": "d", "parameters": {"type": "object"}, "code": "def run(args):\n    return 1"}, "已存在"),
        ({"name": "web_search", "description": "d", "parameters": {"type": "object"}, "code": "def run(args):\n    return 1"}, "已存在"),
        ({"name": "tool_x", "description": "d", "parameters": {"type": "string"}, "code": "def run(args):\n    return 1"}, "type=object"),
        ({"name": "tool_x", "description": "d", "parameters": {"type": "object"}, "code": "x = 1"}, "def run"),
        ({"name": "tool_x", "description": "d", "parameters": {"type": "object"}, "code": "def run(args):\n    return (\n"}, "无法加载"),
    ],
)
def test_create_tool_validation(args, message):
    outcome, _ = call("create_tool", ctx(sandbox=Sandbox()), args)
    assert message in outcome.error


@needs_sandbox
def test_custom_tool_runtime_error_reported():
    context = ctx(sandbox=Sandbox())
    spec = {"name": "boom_tool", "description": "d", "parameters": {"type": "object"}, "code": "def run(args):\n    raise ValueError('bad')\n"}
    call("create_tool", context, spec)
    registry = REGISTRY.with_specs(context.state.custom_tools.values())
    outcome = registry.execute("boom_tool", "{}", context)
    assert "ValueError" in outcome.error
