import json

import pytest

from agent_lab.stores import MemoryStore, NotesStore, RulesStore


@pytest.fixture
def personal(tmp_path):
    notes = tmp_path / "notes" / "zh-CN"
    notes.mkdir(parents=True)
    (notes / "chapter2.json").write_text(json.dumps({"highlights": [
        {"quote": "工具结果的替换字符串在首次出现时就被冻结", "note": "这是什么意思呢", "createdAt": "2026-10-08T15:03:57Z"},
        {"quote": "KV Cache", "createdAt": "2026-10-07T00:00:00Z"},
    ]}, ensure_ascii=False), encoding="utf8")
    (notes / "chapter3.json").write_text(json.dumps({"highlights": [{"quote": "记忆", "note": ""}]}), encoding="utf8")
    (notes / "chapter2.drafts.json").write_text("{}", encoding="utf8")
    inserts = tmp_path / "inserts" / "zh-CN" / "chapter1"
    inserts.mkdir(parents=True)
    (inserts / "a.md").write_text('---\nafter: "段落开头"\nsection: "s"\n---\n\n## 补充\n内容\n', encoding="utf8")
    return tmp_path


def test_highlights(personal):
    store = NotesStore(personal)
    items = store.highlights()
    assert [i["chapter"] for i in items] == [2, 2, 3]
    assert items[0]["quote"] == "KV Cache"  # 按时间排序
    assert store.highlights(2)[1]["note"] == "这是什么意思呢"
    assert store.highlights(9) == []


def test_inserts(personal):
    items = NotesStore(personal).inserts()
    assert items == [{"chapter": 1, "id": "a", "after": "段落开头", "markdown": "## 补充\n内容"}]
    assert NotesStore(personal).inserts(5) == []


def test_annotations(personal):
    directory = personal / "annotations" / "zh-CN"
    directory.mkdir(parents=True)
    (directory / "chapter2.json").write_text(json.dumps({
        "format": "ai-agent-book-annotations",
        "version": 1,
        "chapter": "2",
        "annotations": [
            {
                "id": "c2-a",
                "quote": "前缀稳定",
                "context": "前缀稳定时，缓存命中率更高",
                "kind": "term",
                "title": "前缀缓存",
                "body": "前缀不变的部分可以复用缓存。",
                "sources": [{"title": "来源", "url": "https://example.com/a"}, {"title": "坏链接", "url": "javascript:alert(1)"}],
            },
            {"id": "bad", "quote": "", "kind": "term", "title": "x", "body": "y"},
        ],
    }, ensure_ascii=False), encoding="utf8")
    (directory / "chapter3.json").write_text("{broken", encoding="utf8")
    items = NotesStore(personal).annotations()
    assert len(items) == 1
    assert items[0]["chapter"] == 2
    assert items[0]["context"].startswith("前缀稳定")
    assert items[0]["sources"] == [{"title": "来源", "url": "https://example.com/a"}]
    assert NotesStore(personal).annotations(2)[0]["kind"] == "term"
    assert NotesStore(personal).annotations(9) == []


def test_memory_remember_and_recall(tmp_path):
    memory = MemoryStore(tmp_path)
    assert memory.recall("KV Cache 是什么") == []
    memory.remember("KV Cache 是什么", "它缓存注意力的键值。[[ch2#kv|前缀不变的部分可以复用]]")
    memory.remember("怎么设计工具", "工具描述要清楚。")
    recalled = memory.recall("再讲讲 KV Cache")
    assert len(recalled) == 1 and "KV Cache 是什么" in recalled[0]
    assert "[[" not in recalled[0] and "「前缀不变的部分可以复用」" in recalled[0]
    memory.clear()
    assert memory.entries() == []


def test_memory_is_capped(tmp_path, monkeypatch):
    monkeypatch.setattr("agent_lab.stores.MEMORY_LIMIT", 3)
    memory = MemoryStore(tmp_path)
    for i in range(5):
        memory.remember(f"问题{i}", "回答")
    assert [e["question"] for e in memory.entries()] == ["问题2", "问题3", "问题4"]


def test_rules_versions(tmp_path):
    rules = RulesStore(tmp_path)
    assert rules.active() == [] and rules.state()["active_version"] == 0
    v1 = rules.add_version(["引用前先读小节"], source="improve", evidence={"eval_id": "e"})
    assert v1["version"] == 1 and rules.active() == ["引用前先读小节"]
    rules.add_version(["规则二"], source="improve", evidence=None)
    rules.activate(1)
    assert rules.active() == ["引用前先读小节"]
    rules.activate(0)
    assert rules.active() == []
    with pytest.raises(ValueError):
        rules.activate(9)
