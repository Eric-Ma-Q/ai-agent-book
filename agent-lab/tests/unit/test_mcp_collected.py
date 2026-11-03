"""036：个人收集网页的目录、抽取、检索与分页阅读。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_lab.mcp.collected import CollectedService
from agent_lab.mcp.models import ListPagesArgs, ReadPageArgs, SearchPagesArgs, ToolInputError

PAGE_HTML = """<!doctype html><html><head><title>任务队列</title>
<script>var secret = "不该出现";</script><style>.x{color:red}</style></head>
<body><nav>站点导航</nav>
<article><h1>任务队列</h1>
<p>任务队列是 Agent 的第二条时间线，把长任务拆成可恢复的步骤。</p>
<p>上下文工程决定每一步看到什么，工具选择决定能做什么。</p>
</article><footer>页脚版权</footer></body></html>"""

SECOND_HTML = """<html><body><article><h1>上下文工程</h1>
<p>上下文工程关心的是每一步喂给模型的内容。</p></article></body></html>"""

LONG_MD = "# 长文\n\n" + "".join(f"第{i}段：这是一段用于分页测试的中文内容。\n\n" for i in range(1, 600))


def _library() -> dict:
    return {
        "format": "harness-library",
        "version": 1,
        "categories": [
            {
                "id": "pages",
                "label": "内容页",
                "files": [
                    {"path": "archive/task-queue.html", "title": "任务队列", "url": "/harness/site/task-queue.html", "bytes": 100},
                    {"path": "archive/context.html", "title": "上下文工程", "url": "/harness/site/context.html", "bytes": 80},
                ],
            },
            {
                "id": "longform",
                "label": "长文",
                "files": [{"path": "archive/long.md", "title": "长文", "url": "/harness/site/long.md", "bytes": 9000}],
            },
            {
                "id": "labs",
                "label": "实验",
                "files": [
                    {"path": "archive/labs/run.py", "title": "run", "url": "/harness/site/labs/run.py", "bytes": 20},
                    {"path": "archive/_deck/x.pptx", "title": "deck", "url": "/harness/site/_deck/x.pptx", "bytes": 20},
                ],
            },
        ],
    }


@pytest.fixture()
def harness(tmp_path: Path) -> Path:
    root = tmp_path / "harness"
    (root / "archive" / "labs").mkdir(parents=True)
    (root / "archive" / "_deck").mkdir(parents=True)
    (root / "library.json").write_text(json.dumps(_library(), ensure_ascii=False), encoding="utf8")
    (root / "archive" / "task-queue.html").write_text(PAGE_HTML, encoding="utf8")
    (root / "archive" / "context.html").write_text(SECOND_HTML, encoding="utf8")
    (root / "archive" / "long.md").write_text(LONG_MD, encoding="utf8")
    (root / "archive" / "labs" / "run.py").write_text("print('hi')\n", encoding="utf8")
    (root / "archive" / "_deck" / "x.pptx").write_bytes(b"PK\x03\x04")
    return root


@pytest.fixture()
def service(harness: Path) -> CollectedService:
    return CollectedService(harness, reader_url="http://reader.test")


def test_list_pages_defaults_to_content_pages(service):
    result = service.list_pages(ListPagesArgs())
    assert "任务队列" in result.text and "/harness/site/task-queue.html" in result.text
    assert "run.py" not in result.text and "x.pptx" not in result.text
    data = result.structured or {}
    assert data["count"] == 2 and data["total"] == 2
    assert [row["path"] for row in data["pages"]] == ["archive/task-queue.html", "archive/context.html"]


def test_list_pages_paginates_and_keeps_order(service):
    first = service.list_pages(ListPagesArgs(limit=1)).structured or {}
    assert len(first["pages"]) == 1 and first["next_offset"] == 1
    second = service.list_pages(ListPagesArgs(offset=1, limit=1)).structured or {}
    assert second["pages"][0]["path"] == "archive/context.html"
    assert second["next_offset"] is None


def test_list_pages_rejects_unknown_category(service):
    with pytest.raises(ToolInputError):
        service.list_pages(ListPagesArgs(category="nope"))


def test_list_pages_hides_unreadable_archives(service):
    data = service.list_pages(ListPagesArgs(category="labs")).structured or {}
    assert data["pages"] == [] and data["count"] == 0
    assert data["total"] == 0


def test_search_finds_chinese_terms_without_script_noise(service):
    result = service.search_pages(SearchPagesArgs(query="任务队列"))
    assert "任务队列" in result.text
    data = result.structured or {}
    assert data["count"] >= 1
    top = data["hits"][0]
    assert top["path"] == "archive/task-queue.html"
    assert len({hit["path"] for hit in data["hits"]}) == len(data["hits"])
    assert top["url"] == "http://reader.test/harness/site/task-queue.html"
    assert "不该出现" not in result.text
    assert "站点导航" not in result.text


def test_search_skips_unreadable_and_can_filter_category(service):
    data = service.search_pages(SearchPagesArgs(query="上下文工程", category="pages")).structured or {}
    assert {hit["path"] for hit in data["hits"]} == {"archive/task-queue.html", "archive/context.html"}
    with pytest.raises(ToolInputError):
        service.search_pages(SearchPagesArgs(query="上下文工程", category="labs"))


def test_search_rejects_blank_query(service):
    with pytest.raises(ToolInputError):
        service.search_pages(SearchPagesArgs(query="   "))


def test_read_page_strips_boilerplate_and_paginates(service):
    first = service.read_page(ReadPageArgs(path="archive/long.md"))
    data = first.structured or {}
    assert data["offset"] == 0 and data["remaining"] > 0
    assert data["next_offset"] == 6000
    assert len(data["text"]) == 6000
    second = service.read_page(ReadPageArgs(path="archive/long.md", offset=data["next_offset"])).structured or {}
    assert second["text"] != data["text"]
    assert second["offset"] == 6000
    assert data["text"] + second["text"] == data["text"] + second["text"]

    short = service.read_page(ReadPageArgs(path="archive/task-queue.html")).structured or {}
    assert "任务队列是 Agent 的第二条时间线" in short["text"]
    assert "不该出现" not in short["text"] and "页脚版权" not in short["text"]


def test_read_page_accepts_reader_url(service):
    data = service.read_page(ReadPageArgs(url="http://reader.test/harness/site/task-queue.html")).structured or {}
    assert data["path"] == "archive/task-queue.html"
    assert data["url"] == "http://reader.test/harness/site/task-queue.html"


def test_read_page_rejects_unknown_binary_and_foreign_url(service):
    with pytest.raises(ToolInputError):
        service.read_page(ReadPageArgs(path="archive/missing.html"))
    with pytest.raises(ToolInputError):
        service.read_page(ReadPageArgs(path="archive/labs/run.py"))
    with pytest.raises(ToolInputError):
        service.read_page(ReadPageArgs(url="https://example.com/harness/site/task-queue.html"))


def test_missing_library_reports_readable_error(tmp_path: Path):
    service = CollectedService(tmp_path / "empty", reader_url="http://reader.test")
    with pytest.raises(ToolInputError):
        service.list_pages(ListPagesArgs())


def test_mcp_search_pages_end_to_end(tmp_path: Path):
    from tests.mcp_helpers import make_mcp

    h = make_mcp(tmp_path)
    headers = h.init()
    result = h.tool(headers, "search_pages", {"query": "任务队列"})
    assert result["isError"] is False
    text = result["content"][0]["text"]
    assert "archive/task-queue.html" in text
    assert "http://reader.test/harness/site/task-queue.html" in text


# -- 037：抽取择优与标题检索 ---------------------------------------------


def test_choose_text_falls_back_when_extraction_is_empty():
    from agent_lab.mcp.collected import _choose_text

    assert _choose_text(None, "正文内容") == "正文内容"
    assert _choose_text("   ", "正文内容") == "正文内容"


def test_choose_text_falls_back_below_absolute_floor():
    from agent_lab.mcp.collected import _choose_text

    plain = "长" * 1000
    assert _choose_text("短" * 100, plain) == plain


def test_choose_text_falls_back_when_ratio_is_low():
    from agent_lab.mcp.collected import _choose_text

    plain = "长" * 5000
    assert _choose_text("短" * 500, plain) == plain


def test_choose_text_keeps_extraction_above_threshold():
    from agent_lab.mcp.collected import _choose_text

    extracted = "抽" * 700
    assert _choose_text(extracted, "长" * 1000) == extracted


def test_choose_text_unescapes_entities():
    from agent_lab.mcp.collected import _choose_text

    assert _choose_text("a &amp; b" * 200, "回退") == ("a & b" * 200)


def test_html_to_text_ignores_truncated_extraction(monkeypatch):
    from agent_lab.mcp import collected

    body = "".join(f"<p>第{i}段：简历筛选看的是关键词命中与证据密度。</p>" for i in range(40))
    html = f"<html><body><article><h1>简历优化</h1>{body}</article></body></html>"
    monkeypatch.setattr("trafilatura.extract", lambda *args, **kwargs: "###### 个人简介\n示例简历")
    text = collected.html_to_text(html)
    assert "第39段" in text
    assert len(text) > 600


def test_search_matches_page_title_without_body_terms(service, tmp_path: Path):
    root = tmp_path / "harness"
    library = json.loads((root / "library.json").read_text(encoding="utf8"))
    library["categories"][0]["files"].append(
        {"path": "archive/title-only.html", "title": "简历装配质检", "url": "/harness/site/title-only.html", "bytes": 60}
    )
    (root / "library.json").write_text(json.dumps(library, ensure_ascii=False), encoding="utf8")
    (root / "archive" / "title-only.html").write_text(
        "<html><body><article><p>这一段只讲排版与字体，不重复那个词。</p></article></body></html>", encoding="utf8"
    )
    fresh = CollectedService(root, reader_url="http://reader.test")
    data = fresh.search_pages(SearchPagesArgs(query="简历")).structured or {}
    assert [hit["path"] for hit in data["hits"]] == ["archive/title-only.html"]
