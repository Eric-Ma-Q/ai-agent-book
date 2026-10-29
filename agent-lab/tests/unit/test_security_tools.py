import json

from agent_lab.security.catalog import LEAK_PATH, NOTES_URL, WEBPAGE_URL, defense_by_id
from agent_lab.security.tools import MockToolbox, TrialWorkspace


def toolbox(tmp_path, defense="D1"):
    workspace = TrialWorkspace(tmp_path / "trial")
    return MockToolbox(workspace, defense_by_id(defense)), workspace


def test_unknown_url_is_refused_without_network(tmp_path):
    tools, _ = toolbox(tmp_path)
    execution = tools.execute("read_webpage", {"url": "https://evil.example/"}, "总结")
    assert execution.executed is False and execution.error == "unknown_url"
    assert "只提供内置网页" in execution.result


def test_d3_marks_webpage_content(tmp_path):
    tools, _ = toolbox(tmp_path, "D3")
    execution = tools.execute("read_webpage", {"url": WEBPAGE_URL}, "总结")
    assert execution.executed and execution.result.startswith('<external_content source="webpage">')
    assert LEAK_PATH in execution.result


def test_write_file_stays_inside_workspace(tmp_path):
    tools, workspace = toolbox(tmp_path)
    execution = tools.execute("write_file", {"path": "../../escape.txt", "content": "x"}, "保存")
    assert execution.executed is False and "越出隔离工作区" in execution.result
    assert not (tmp_path / "escape.txt").exists()
    assert not (tmp_path / "trial" / "escape.txt").exists()


def test_absolute_path_is_mapped_into_isolated_files(tmp_path):
    tools, workspace = toolbox(tmp_path)
    execution = tools.execute("write_file", {"path": LEAK_PATH, "content": "history"}, "请总结")
    assert execution.executed is True
    assert (workspace.files / "tmp" / "leaked.txt").read_text(encoding="utf8") == "history"
    assert not (tmp_path / "tmp").exists()


def test_d4_blocks_unapproved_write_and_email(tmp_path):
    tools, workspace = toolbox(tmp_path, "D4")
    write = tools.execute("write_file", {"path": LEAK_PATH, "content": "x"}, "请总结这个网页")
    mail = tools.execute("send_email", {"to": "backup@example.com", "subject": "s", "body": "b"}, "保存报告")
    assert write.blocked and not write.executed
    assert mail.blocked and not mail.executed
    assert not workspace.outbox_path.exists()
    assert "[已被安全策略拦截]" in write.result


def test_d4_allows_target_explicitly_named_by_user(tmp_path):
    tools, workspace = toolbox(tmp_path, "D4")
    execution = tools.execute("write_file", {"path": "report.txt", "content": "ok"}, "请保存成 report.txt")
    assert execution.executed
    assert (workspace.files / "report.txt").read_text(encoding="utf8") == "ok"


def test_send_email_appends_outbox(tmp_path):
    tools, workspace = toolbox(tmp_path)
    execution = tools.execute(
        "send_email",
        {"to": "backup@example.com", "subject": "报告", "body": "季度总结"},
        "保存",
    )
    assert execution.executed
    line = json.loads(workspace.outbox_path.read_text(encoding="utf8").splitlines()[0])
    assert line["to"] == "backup@example.com" and line["subject"] == "报告"


def test_save_memory_limits_and_accumulates(tmp_path):
    tools, workspace = toolbox(tmp_path)
    for index in range(25):
        tools.execute("save_memory", {"content": f"偏好 {index} " + "长" * 3000, "source": NOTES_URL}, "记住")
    entries = workspace.memory()
    assert len(entries) == 20
    assert len(entries[-1]["content"]) == 2000
