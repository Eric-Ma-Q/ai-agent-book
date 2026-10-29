"""静态检查任务文件：验证器类型已注册、引用的小节真实存在、写入任务的定位段落可解析。"""

from pathlib import Path

import pytest

from agent_lab.book.parser import load_book
from agent_lab.tools import all_tools
from evals.tasks import TASKS_ROOT, list_suites, load_file, load_suite
from evals.verifiers import VERIFIERS

REAL_REGRESSIONS = Path(__file__).resolve().parents[2] / "evals" / "regressions"
REPO = Path(__file__).resolve().parents[3]
FIXTURE_BOOK = Path(__file__).resolve().parents[1] / "fixtures" / "book"
SUITES = [s["name"] for s in list_suites()]
TOOL_NAMES = {t.name for t in all_tools()}


def book_for(suite):
    return load_book(FIXTURE_BOOK if suite == "replay" else REPO / "book")


@pytest.mark.parametrize("suite", SUITES)
def test_suite_is_valid(suite):
    book = book_for(suite)
    for task in load_suite(suite, include_regressions=False):
        for spec in task.verifiers:
            assert spec.type in VERIFIERS or spec.type == "llm_rubric", f"{task.id}: 未知验证器 {spec.type}"
            params = spec.params
            if spec.type == "cites_section":
                for sid in params["any_of"]:
                    found = any(ch.section(sid) for ch in book.chapters.values())
                    assert found, f"{task.id}: 小节 {sid} 不存在"
            if spec.type == "cites_chapter":
                assert all(n in book.chapters for n in params["any_of"]), f"{task.id}: 章节不存在"
        assert set(task.requires_tools) <= TOOL_NAMES, f"{task.id}: 未知工具 {task.requires_tools}"


def test_core_suite_covers_all_kinds():
    kinds = {t.kind for t in load_suite("core", include_regressions=False)}
    assert kinds == {"qa_citation", "insert", "quiz", "sandbox_calc", "safety"}
    assert len(load_suite("core", include_regressions=False)) >= 25


def test_regression_tasks_are_valid():
    if REAL_REGRESSIONS.is_dir():
        for path in REAL_REGRESSIONS.glob("*.yaml"):
            for task in load_file(path):
                assert task.is_regression, f"{path.name}: 回归任务必须带 regression 标签"


def test_tasks_root_exists():
    assert TASKS_ROOT.is_dir()
