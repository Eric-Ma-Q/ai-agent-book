"""测试共享工具：临时工作区工厂。"""
import shutil
import tempfile
from pathlib import Path


def temp_workspace(testcase, files: dict | None = None) -> Path:
    """建一个临时目录当工作区，测试结束自动清理；files: {相对路径: 内容}。"""
    d = Path(tempfile.mkdtemp(prefix="mh-test-"))
    testcase.addCleanup(shutil.rmtree, d, ignore_errors=True)
    for rel, content in (files or {}).items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    return d


def msg_content(messages: list[dict], role: str, index: int = 0) -> str:
    """取第 index 个指定 role 消息的 content（找不到返回空串）。"""
    got = [m for m in messages if m["role"] == role]
    if len(got) <= index:
        return ""
    c = got[index].get("content")
    return c if isinstance(c, str) else ""
