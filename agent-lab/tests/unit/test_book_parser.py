import json
from pathlib import Path

import pytest

from agent_lab.book.parser import Slugger, load_book, markdown_to_text, normalize_for_match, parse_chapter

REPO = Path(__file__).resolve().parents[3]
FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "reader_section_ids.json"

READER_PAGE_IDS = {"footnote-label", "navigation-title"}  # 阅读器页面自带的元素，不是书稿标题

SAMPLE = """# 示例章

开头的导语，**加粗**和[链接](http://x)。

## 第一节：概念

第一段。

```python
# 这不是标题
print("hi")
```

### 子节 `代码`

子节内容[^1]。

## 第一节：概念

重复标题。

[^1]: 脚注文字。
"""


def test_slugger_matches_github_slugger_rules():
    s = Slugger()
    assert s.slug("上下文：决定 Agent 能力上限的关键") == "上下文决定-agent-能力上限的关键"
    assert s.slug("现代 Agent = LLM + 上下文 + 工具") == "现代-agent--llm--上下文--工具"
    assert s.slug("KV Cache 的原理与约束") == "kv-cache-的原理与约束"
    assert s.slug("KV Cache 的原理与约束") == "kv-cache-的原理与约束-1"
    assert s.slug("τ²-bench 的 telecom 领域") == "τ-bench-的-telecom-领域"


def test_parse_chapter_sections():
    chapter = parse_chapter(3, SAMPLE)
    assert chapter.title == "示例章"
    ids = [s.id for s in chapter.sections]
    assert ids == ["", "第一节概念", "子节-代码", "第一节概念-1"]
    intro, first, sub, dup = chapter.sections
    assert intro.title == "示例章" and "导语" in intro.text
    assert sub.parent_id == "第一节概念" and sub.depth == 3
    assert "这不是标题" in first.text  # 代码块内容保留，但不当作标题
    assert dup.text.strip().startswith("重复标题")


def test_markdown_to_text_strips_markup():
    text = markdown_to_text("**加粗**、[链接](http://x)、![图](a.png)、`code`、<b>html</b>、注释[^ch2-x]")
    assert text == "加粗、链接、、code、html、注释"


def test_normalize_for_match_ignores_whitespace_and_width():
    assert normalize_for_match("Agent  =\nLLM") == normalize_for_match("Agent=LLM")
    assert normalize_for_match("ＡＢＣ") == normalize_for_match("ABC")


def test_blocks_are_split_by_blank_lines():
    chapter = parse_chapter(3, SAMPLE)
    starts = [b.text[:4] for b in chapter.blocks]
    assert "开头的导" in starts and "第一段。" in starts


def test_section_lookup():
    chapter = parse_chapter(3, SAMPLE)
    assert chapter.section("子节-代码").title == "子节 代码"
    assert chapter.section("nope") is None


@pytest.mark.skipif(not FIXTURE.exists(), reason="需要阅读器 id 夹具")
def test_section_ids_match_live_reader_for_all_chapters():
    expected = json.loads(FIXTURE.read_text(encoding="utf8"))
    book = load_book(REPO / "book")
    assert sorted(book.chapters) == list(range(1, 11))
    for number, ids in expected.items():
        ours = [s.id for s in book.chapters[int(number)].sections if s.id]
        reader = [i for i in ids if i not in READER_PAGE_IDS]
        assert ours == reader, f"第 {number} 章小节 id 与阅读器不一致"
