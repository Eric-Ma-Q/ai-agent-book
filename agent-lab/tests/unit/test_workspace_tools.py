import json

import pytest

from agent_lab.sandbox import Sandbox
from agent_lab.tools import all_tools
from agent_lab.tools.registry import RunState, ToolContext, ToolRegistry
from agent_lab.workspace import BashResult, BashRunner, Workspace, WorkspaceError

REGISTRY = ToolRegistry(all_tools())


@pytest.fixture
def repo(tmp_path):
    root = tmp_path / "repo"
    root.mkdir()
    (root / "README.md").write_text("# 项目\n这是公开文档。\n", encoding="utf8")
    (root / "docs").mkdir()
    (root / "docs" / "a.md").write_text("第一行\nneedle 在第二行\n第三行\n" + "填充内容" * 80 + "\n", encoding="utf8")
    (root / "agent-lab").mkdir()
    (root / "agent-lab" / "app.py").write_text("def run():\n    return 'needle'\n", encoding="utf8")
    (root / "agent-lab" / ".env").write_text("LAB_LLM_API_KEY=sk-secret\n", encoding="utf8")
    (root / "personal").mkdir()
    (root / "personal" / "secret.txt").write_text("读者私有数据\n", encoding="utf8")
    (root / "node_modules").mkdir()
    (root / "node_modules" / "x.js").write_text("needle\n", encoding="utf8")
    (root / "binary.bin").write_bytes(b"needle\x00binary")
    (root / "link.md").symlink_to(root / "personal" / "secret.txt")
    return root


@pytest.fixture
def workspace(repo):
    return Workspace(repo, repo / "personal" / "lab" / "page-assistant" / "workspace")


def call(name, context, **args):
    outcome = REGISTRY.execute(name, json.dumps(args, ensure_ascii=False), context)
    return outcome, (json.loads(outcome.content) if outcome.error is None else None)


def context(workspace):
    return ToolContext(workspace=workspace, run_id="r", state=RunState())


def test_read_file_and_offset(workspace):
    data = workspace.read_file("docs/a.md", 0, 200)
    assert data["path"] == "docs/a.md"
    assert "needle" in data["content"]
    assert data["next_offset"] is not None
    rest = workspace.read_file("docs/a.md", data["next_offset"], 200)
    assert rest["content"] == "" or rest["next_offset"] is None


def test_read_file_rejects_private_paths(workspace):
    for path in ["personal/secret.txt", "agent-lab/.env", "../outside.md", "/etc/passwd", "node_modules/x.js"]:
        with pytest.raises(WorkspaceError):
            workspace.read_file(path)


def test_read_file_rejects_binary_and_missing(workspace):
    with pytest.raises(WorkspaceError):
        workspace.read_file("binary.bin")
    with pytest.raises(WorkspaceError):
        workspace.read_file("missing.md")


def test_glob_and_grep(workspace):
    data = workspace.glob("**/*.md")
    assert data["files"] == ["README.md", "docs/a.md"]
    assert workspace.glob("**/*.py")["files"] == ["agent-lab/app.py"]
    assert workspace.glob("**/*.md")["files"] == ["README.md", "docs/a.md"]
    found = workspace.grep("needle")
    assert found["count"] == 2
    assert {item["path"] for item in found["matches"]} == {"docs/a.md", "agent-lab/app.py"}
    assert all("secret" not in item["text"] for item in found["matches"])
    only_md = workspace.grep("needle", glob="**/*.md")
    assert only_md["count"] == 1
    with_context = workspace.grep("needle", context=1)
    doc_hit = next(item for item in with_context["matches"] if item["path"] == "docs/a.md")
    assert doc_hit["before"] == ["第一行"]


def test_grep_invalid_regex_and_empty(workspace):
    with pytest.raises(WorkspaceError):
        workspace.grep("(")
    with pytest.raises(WorkspaceError):
        workspace.grep("")
    assert workspace.grep("needle", fixed=True)["count"] == 2


def test_write_and_edit_are_confined_to_workspace(workspace):
    created = workspace.write_file("notes/a.md", "hello")
    assert created["path"] == "notes/a.md"
    assert (workspace.workspace_root / "notes" / "a.md").read_text(encoding="utf8") == "hello"
    with pytest.raises(WorkspaceError):
        workspace.write_file("notes/a.md", "again")
    workspace.write_file("notes/a.md", "again", overwrite=True)
    edited = workspace.edit_file("notes/a.md", "again", "world")
    assert edited["replaced"] == 1
    assert (workspace.workspace_root / "notes" / "a.md").read_text(encoding="utf8") == "world"
    with pytest.raises(WorkspaceError):
        workspace.write_file("../outside.md", "x")
    with pytest.raises(WorkspaceError):
        workspace.edit_file("missing.md", "a", "b")


def test_edit_multiple_matches_needs_replace_all(workspace):
    workspace.write_file("x.txt", "a a")
    with pytest.raises(WorkspaceError):
        workspace.edit_file("x.txt", "a", "b")
    result = workspace.edit_file("x.txt", "a", "b", replace_all=True)
    assert result["replaced"] == 2


def test_bash_with_fake_runner(repo, workspace):
    calls = []

    def fake(root, cwd, command, timeout):
        calls.append((root, cwd, command, timeout))
        return BashResult("ok", "", 0, False, 3)

    runner = BashRunner(repo, workspace.workspace_root, execute=fake)
    ws = Workspace(repo, workspace.workspace_root, bash=runner)
    assert ws.bash("echo ok", "docs", 5) == {"stdout": "ok", "stderr": "", "exit_code": 0, "timed_out": False}
    assert calls[0][2] == "echo ok" and calls[0][1] == repo / "docs"


def test_bash_rejects_bad_cwd_and_empty(workspace):
    with pytest.raises(WorkspaceError):
        workspace.bash("echo x", "../outside")
    with pytest.raises(WorkspaceError):
        workspace.bash("  ")


@pytest.mark.skipif(not BashRunner(__import__("pathlib").Path.cwd(), __import__("pathlib").Path.cwd()).available, reason="需要 macOS sandbox-exec")
def test_bash_actual_sandbox_blocks_network_and_outside_writes(tmp_path):
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    ws = Workspace(repo_root, repo_root / "personal" / "lab" / "page-assistant" / "workspace")
    safe = ws.bash("printf ok; pwd")
    assert safe["stdout"].endswith("ok") or "ok" in safe["stdout"]
    denied = ws.bash("printf x > ../outside.txt")
    assert denied["exit_code"] != 0 or "Operation not permitted" in denied["stderr"]
    assert not (ws.workspace_root.parent / "outside.txt").exists()
    network = ws.bash("curl -sS http://example.com >/dev/null")
    assert network["exit_code"] != 0 or "Operation not permitted" in network["stderr"]


def test_file_and_shell_tools_via_registry(repo, workspace):
    ctx = context(workspace)
    outcome, data = call("read_file", ctx, path="README.md")
    assert outcome.error is None and "项目" in data["content"]
    outcome, _ = call("read_file", ctx, path="personal/secret.txt")
    assert outcome.error and "不允许" in outcome.error
    _, files = call("glob", ctx, pattern="**/*.md")
    assert files["files"] == ["README.md", "docs/a.md"]
    _, matches = call("grep", ctx, pattern="needle")
    assert matches["count"] == 2
    _, written = call("write_file", ctx, path="out.txt", content="hello")
    assert written["path"] == "out.txt"
    _, edited = call("edit_file", ctx, path="out.txt", old="hello", new="world")
    assert edited["replaced"] == 1

    def fake(root, cwd, command, timeout):
        return BashResult("fake", "", 0, False, 1)

    ws = Workspace(repo, workspace.workspace_root, bash=BashRunner(repo, workspace.workspace_root, execute=fake))
    _, data = call("bash", context(ws), command="echo ok")
    assert data["stdout"] == "fake"


def test_code_interpreter_tool_uses_sandbox():
    class FakeSandbox:
        def run(self, code):
            assert code == "print(1)"
            return type("R", (), {"to_dict": lambda self=None: {"stdout": "1\n", "stderr": "", "exit_code": 0, "timed_out": False}})()

    _, data = call("code_interpreter", ToolContext(sandbox=FakeSandbox()), code="print(1)")
    assert data["stdout"] == "1\n"


def test_shell_tools_without_services_are_readable():
    ctx = ToolContext()
    outcome, _ = call("bash", ctx, command="echo x")
    assert outcome.error and "工作区" in outcome.error
    outcome, _ = call("code_interpreter", ctx, code="print(1)")
    assert outcome.error and "沙箱" in outcome.error


def test_required_tool_names_exist():
    names = {spec.name for spec in all_tools()}
    for name in ["code_interpreter", "bash", "read_file", "write_file", "edit_file", "glob", "grep", "web_search", "web_fetch"]:
        assert name in names
