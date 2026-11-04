"""读者数据的存储：笔记（只读）、跨会话记忆（第 3 章）、学习规则版本（第 9 章）。"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .book.index import tokenize
from .citations import CITATION

LOCALE = "zh-CN"
MEMORY_LIMIT = 200
MEMORY_ANSWER_CHARS = 200


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _atomic_write(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf8")
    tmp.replace(path)


class NotesStore:
    """读取阅读器保存在 personal/ 里的划线、笔记和补充。"""

    def __init__(self, personal_dir: Path):
        self.root = Path(personal_dir)

    def highlights(self, chapter: int | None = None) -> list[dict[str, Any]]:
        files = [self.root / "notes" / LOCALE / f"chapter{chapter}.json"] if chapter else sorted((self.root / "notes" / LOCALE).glob("chapter*.json"))
        items = []
        for path in files:
            match = re.fullmatch(r"chapter(\d+)\.json", path.name)
            if not match or not path.exists():
                continue
            data = json.loads(path.read_text(encoding="utf8"))
            for h in data.get("highlights", []):
                items.append({"chapter": int(match.group(1)), "quote": h.get("quote", ""), "note": h.get("note") or "", "created_at": h.get("createdAt")})
        return sorted(items, key=lambda i: (i["chapter"], i["created_at"] or ""))

    def inserts(self, chapter: int | None = None) -> list[dict[str, Any]]:
        base = self.root / "inserts" / LOCALE
        dirs = [base / f"chapter{chapter}"] if chapter else sorted(base.glob("chapter*"))
        items = []
        for directory in dirs:
            for path in sorted(directory.glob("*.md")) if directory.is_dir() else []:
                text = path.read_text(encoding="utf8")
                meta, body = {}, text
                if text.startswith("---"):
                    _, front, body = text.split("---", 2)
                    meta = yaml.safe_load(front) or {}
                items.append({"chapter": int(directory.name[7:]), "id": path.stem, "after": meta.get("after", ""), "markdown": body.strip()})
        return items

    def annotations(self, chapter: int | None = None) -> list[dict[str, Any]]:
        """阅读器批注（只读）。格式与 web-astro/personal/annotations-store.mjs 一致。

        坏文件、坏条目跳过而不是让整次 MCP 调用失败；阅读批注由人工/AI 生成流程维护，
        阅读器本身不写，这里也不提供写入。
        """
        base = self.root / "annotations" / LOCALE
        files = [base / f"chapter{chapter}.json"] if chapter else sorted(base.glob("chapter*.json"))
        items: list[dict[str, Any]] = []
        for path in files:
            match = re.fullmatch(r"chapter(\d+)\.json", path.name)
            if not match or not path.exists():
                continue
            try:
                data = json.loads(path.read_text(encoding="utf8"))
            except (OSError, ValueError):
                continue
            if not isinstance(data, dict) or data.get("format") != "ai-agent-book-annotations":
                continue
            raw_items = data.get("annotations")
            if not isinstance(raw_items, list):
                continue
            for raw in raw_items:
                item = _clean_annotation(raw)
                if item is not None:
                    items.append({"chapter": int(match.group(1)), **item})
        return sorted(items, key=lambda i: (i["chapter"], i["id"]))


ANNOTATION_KINDS = ("term", "ref", "entity", "update", "extend")
_URL = re.compile(r"^https?://[^\s\"'<>]+$")


def _clean_annotation(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    ident = raw.get("id")
    quote = raw.get("quote")
    title = raw.get("title")
    body = raw.get("body")
    kind = raw.get("kind")
    if not (isinstance(ident, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", ident)):
        return None
    if not (isinstance(quote, str) and quote.strip() and len(quote) <= 200):
        return None
    if not (isinstance(title, str) and title.strip() and len(title) <= 200):
        return None
    if not (isinstance(body, str) and body.strip() and len(body) <= 4000):
        return None
    if kind not in ANNOTATION_KINDS:
        return None
    context = raw.get("context")
    if not (isinstance(context, str) and context and len(context) <= 400 and quote in context):
        context = ""
    sources = []
    for source in raw.get("sources") or []:
        if not isinstance(source, dict):
            continue
        source_title = source.get("title")
        url = source.get("url")
        if isinstance(source_title, str) and source_title.strip() and len(source_title) <= 300 and isinstance(url, str) and _URL.match(url):
            sources.append({"title": source_title.strip(), "url": url})
    return {"id": ident, "quote": quote.strip(), "context": context, "kind": kind, "title": title.strip(), "body": body.strip(), "sources": sources}


class MemoryStore:
    """跨会话记忆：记下问过的问题和回答摘要，下次按相关度召回。"""

    def __init__(self, data_dir: Path, limit: int = 5):
        self.path = Path(data_dir) / "memory.json"
        self.limit = limit
        self._lock = threading.Lock()

    def entries(self) -> list[dict[str, Any]]:
        return json.loads(self.path.read_text(encoding="utf8")) if self.path.exists() else []

    def recall(self, question: str) -> list[str]:
        terms = set(tokenize(question))
        scored = []
        for entry in self.entries():
            overlap = len(terms & set(tokenize(entry["question"] + entry["answer"])))
            if overlap:
                scored.append((overlap, entry))
        scored.sort(key=lambda item: -item[0])
        return [f"{e['at'][:10]} 读者问过「{e['question']}」，当时的回答要点：{e['answer']}" for _, e in scored[: self.limit]]

    def remember(self, question: str, answer: str) -> None:
        plain = CITATION.sub(lambda m: f"「{m.group(3)}」", answer)
        summary = " ".join(plain.split())[:MEMORY_ANSWER_CHARS]
        with self._lock:
            entries = [*self.entries(), {"question": question, "answer": summary, "at": _now()}][-MEMORY_LIMIT:]
            _atomic_write(self.path, entries)

    def clear(self) -> None:
        with self._lock:
            _atomic_write(self.path, [])


class RulesStore:
    """学习规则的版本历史。只有通过门禁的候选才会成为新版本；可以随时切换回旧版本。"""

    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "rules.json"
        self._lock = threading.Lock()

    def state(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"active_version": 0, "versions": [{"version": 0, "rules": [], "created_at": None, "source": "初始（无规则）", "evidence": None}]}
        return json.loads(self.path.read_text(encoding="utf8"))

    def active(self) -> list[str]:
        state = self.state()
        version = next(v for v in state["versions"] if v["version"] == state["active_version"])
        return list(version["rules"])

    def add_version(self, rules: list[str], source: str, evidence: dict[str, Any] | None) -> dict[str, Any]:
        with self._lock:
            state = self.state()
            version = {"version": max(v["version"] for v in state["versions"]) + 1, "rules": rules, "created_at": _now(), "source": source, "evidence": evidence}
            _atomic_write(self.path, {"active_version": version["version"], "versions": [*state["versions"], version]})
            return version

    def activate(self, version: int) -> dict[str, Any]:
        with self._lock:
            state = self.state()
            if not any(v["version"] == version for v in state["versions"]):
                raise ValueError(f"规则版本 {version} 不存在")
            new_state = {**state, "active_version": version}
            _atomic_write(self.path, new_state)
            return new_state
