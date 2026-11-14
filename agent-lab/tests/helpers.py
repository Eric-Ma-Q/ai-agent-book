"""测试共用的小工具：构造模型响应、内存中的书、Agent 依赖。"""

from __future__ import annotations

import json

from agent_lab.agent import AgentDeps
from agent_lab.book.index import SearchService
from agent_lab.book.parser import Book, parse_chapter
from agent_lab.citations import CitationChecker
from agent_lab.llm.client import ChatResponse, Usage
from agent_lab.llm.scripted import ScriptedClient
from agent_lab.tools import all_tools
from agent_lab.tools.registry import ToolRegistry

BOOK_MD = """# 上下文工程

导语：上下文决定 Agent 的能力上限。

## KV Cache 的原理与约束

前缀稳定时，缓存命中率更高，推理成本和延迟都会下降。

## 工具

工具让 Agent 能够操作外部世界，例如搜索和执行代码。
"""

BOOK = Book({2: parse_chapter(2, BOOK_MD)})
GOOD_ANSWER = "前缀稳定很重要。[[ch2#kv-cache-的原理与约束|前缀稳定时，缓存命中率更高]]"


def usage(prompt=100, cached=0, completion=20):
    return Usage(prompt_tokens=prompt, cached_tokens=cached, completion_tokens=completion, reasoning_tokens=0)


def text(content: str, **kw) -> ChatResponse:
    return ChatResponse(message={"role": "assistant", "content": content}, usage=usage(**kw), latency_ms=10)


def tool(name: str, args: dict | None = None, call_id: str = "c1", **kw) -> ChatResponse:
    call = {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args or {}, ensure_ascii=False)}}
    message = {"role": "assistant", "content": None, "tool_calls": [call], "reasoning_content": "先检索"}
    return ChatResponse(message=message, usage=usage(**kw), latency_ms=10)


def deps(script, book: Book = BOOK, **extra) -> AgentDeps:
    client = script if not isinstance(script, list) else ScriptedClient(script)
    return AgentDeps(
        client=client,
        registry=ToolRegistry(all_tools()),
        book=book,
        search=SearchService(book),
        checker=CitationChecker(book),
        **extra,
    )


LONG_BOOK = Book({2: parse_chapter(2, BOOK_MD.replace("推理成本和延迟都会下降。", "推理成本和延迟都会下降。" + "细节" * 1500))})


def page_snapshot(**overrides):
    data = {
        "version": 1,
        "url": "http://reader.local/book/chapter2/",
        "title": "第 2 章 上下文工程",
        "path": "/book/chapter2/",
        "lang": "zh-CN",
        "pageType": "chapter",
        "capturedAt": "2026-10-19T09:00:00.000Z",
        "viewport": {"width": 1200, "height": 800, "scrollY": 500, "pageHeight": 4000, "scrollRatio": 0.125, "devicePixelRatio": 2},
        "chapter": {"number": 2, "key": "ai-agents-in-depth:zh-CN:chapter2", "title": "第 2 章 上下文工程"},
        "current": {"blockIndex": 4, "blockId": "sec-2", "sectionId": "sec-2", "sectionTitle": "2.2 上下文窗口", "percent": 0.125},
        "selection": {"text": "选中原文", "blockIndex": 4, "sectionId": "sec-2"},
        "headings": [
            {"id": "sec-1", "text": "2.1 前缀稳定", "level": 2, "blockIndex": 1},
            {"id": "sec-2", "text": "2.2 上下文窗口", "level": 2, "blockIndex": 3},
        ],
        "blocks": [
            {"index": 1, "id": "sec-1", "tag": "h2", "role": "heading", "sectionId": "sec-1", "sectionTitle": "2.1 前缀稳定", "text": "2.1 前缀稳定", "top": 100, "height": 40, "inViewport": False},
            {"index": 2, "id": "", "tag": "p", "role": "paragraph", "sectionId": "sec-1", "sectionTitle": "2.1 前缀稳定", "text": "前缀稳定时，缓存命中率更高。", "top": 160, "height": 80, "inViewport": False},
            {"index": 3, "id": "sec-2", "tag": "h2", "role": "heading", "sectionId": "sec-2", "sectionTitle": "2.2 上下文窗口", "text": "2.2 上下文窗口", "top": 300, "height": 40, "inViewport": False},
            {"index": 4, "id": "", "tag": "p", "role": "paragraph", "sectionId": "sec-2", "sectionTitle": "2.2 上下文窗口", "text": "上下文决定 Agent 的能力上限。", "top": 520, "height": 100, "inViewport": True},
            {"index": 5, "id": "", "tag": "pre", "role": "code", "sectionId": "sec-2", "sectionTitle": "2.2 上下文窗口", "text": "def run():\\n    return 1", "top": 700, "height": 100, "inViewport": True},
            {"index": 6, "id": "", "tag": "table", "role": "table", "sectionId": "sec-2", "sectionTitle": "2.2 上下文窗口", "text": "项目 | 值\\n窗口 | 128k", "top": 820, "height": 120, "inViewport": False},
        ],
        "links": [{"text": "原文", "href": "https://example.com/a", "blockIndex": 4}],
        "truncated": False,
    }
    data.update(overrides)
    return data


class Recorder:
    def __init__(self):
        self.events = []

    def __call__(self, event):
        stamped = event.model_copy(update={"seq": len(self.events)})
        self.events.append(stamped)
        return stamped

    def types(self):
        return [e.type for e in self.events]

    def of(self, kind):
        return [e for e in self.events if e.type == kind]
