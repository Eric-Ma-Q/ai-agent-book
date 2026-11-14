"""全书检索：BM25、TF-IDF 余弦与两者的 RRF 融合（第 3 章的检索开关）。

中文没有空格分词，这里用字二元组（bigram）作为基线：不依赖分词词典，召回稳定，
但会有一些噪声。第 3 章用评估结果比较不同检索方式。
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import cached_property
from typing import Literal

from .parser import Book, Chapter

Kind = Literal["bm25", "tfidf", "hybrid"]
_WORD = re.compile(r"[a-z0-9_]+")
_CJK = re.compile(r"[㐀-鿿豈-﫿]+")
RRF_K = 60


def tokenize(text: str) -> list[str]:
    lowered = text.lower()
    tokens = _WORD.findall(lowered)
    for run in _CJK.findall(lowered):
        tokens.extend([run] if len(run) == 1 else [run[i : i + 2] for i in range(len(run) - 1)])
    return tokens


@dataclass(frozen=True)
class Chunk:
    chapter: int
    section_id: str
    section_title: str
    text: str


@dataclass(frozen=True)
class Hit:
    chapter: int
    section_id: str
    section_title: str
    snippet: str
    score: float


def _split_long(paragraph: str, max_chars: int) -> list[str]:
    return [paragraph[i : i + max_chars] for i in range(0, len(paragraph), max_chars)]


def chunk_chapter(chapter: Chapter, max_chars: int = 350) -> list[Chunk]:
    chunks: list[Chunk] = []
    for section in chapter.sections:
        buffer = ""
        paragraphs = [p.strip() for p in section.text.split("\n\n") if p.strip()]
        for paragraph in (part for p in paragraphs for part in _split_long(p, max_chars)):
            if buffer and len(buffer) + len(paragraph) + 1 > max_chars:
                chunks.append(Chunk(chapter.number, section.id, section.title, buffer))
                buffer = ""
            buffer = f"{buffer}\n{paragraph}" if buffer else paragraph
        if buffer:
            chunks.append(Chunk(chapter.number, section.id, section.title, buffer))
    return chunks


class _Bm25:
    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.tfs = [Counter(d) for d in docs]
        self.lengths = [len(d) for d in docs]
        self.avgdl = (sum(self.lengths) / len(docs)) if docs else 0.0
        df = Counter(t for tf in self.tfs for t in tf)
        n = len(docs)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def scores(self, query: list[str]) -> list[float]:
        result = []
        for tf, length in zip(self.tfs, self.lengths):
            score = 0.0
            for term in set(query):
                freq = tf.get(term)
                if freq:
                    norm = freq + self.k1 * (1 - self.b + self.b * length / (self.avgdl or 1))
                    score += self.idf[term] * freq * (self.k1 + 1) / norm
            result.append(score)
        return result


class _Tfidf:
    def __init__(self, docs: list[list[str]]):
        n = len(docs)
        df = Counter(t for d in docs for t in set(d))
        self.idf = {t: math.log((1 + n) / (1 + f)) + 1 for t, f in df.items()}
        self.vectors = [self._vector(Counter(d)) for d in docs]

    def _vector(self, tf: Counter) -> dict[str, float]:
        vec = {t: (1 + math.log(c)) * self.idf.get(t, 0.0) for t, c in tf.items()}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
        return {t: v / norm for t, v in vec.items()}

    def scores(self, query: list[str]) -> list[float]:
        q = self._vector(Counter(query))
        return [sum(w * vec.get(t, 0.0) for t, w in q.items()) for vec in self.vectors]


def _rrf(*rankings: list[int]) -> dict[int, float]:
    fused: dict[int, float] = {}
    for ranking in rankings:
        for rank, index in enumerate(ranking):
            fused[index] = fused.get(index, 0.0) + 1.0 / (RRF_K + rank + 1)
    return fused


class SearchService:
    def __init__(self, book: Book, snippet_chars: int = 400):
        self.book = book
        self.snippet_chars = snippet_chars
        self.chunks = [c for ch in book.chapters.values() for c in chunk_chapter(ch)]

    @cached_property
    def _docs(self) -> list[list[str]]:
        return [tokenize(f"{c.section_title}\n{c.text}") for c in self.chunks]

    @cached_property
    def _bm25(self) -> _Bm25:
        return _Bm25(self._docs)

    @cached_property
    def _tfidf(self) -> _Tfidf:
        return _Tfidf(self._docs)

    def _ranked(self, scores: list[float], allowed: list[int]) -> list[int]:
        return sorted((i for i in allowed if scores[i] > 0), key=lambda i: -scores[i])

    def search(self, query: str, top_k: int = 5, chapter: int | None = None, kind: str = "bm25") -> list[Hit]:
        if kind not in ("bm25", "tfidf", "hybrid"):
            raise ValueError(f"未知的检索方式：{kind}")
        terms = tokenize(query)
        if not terms:
            return []
        allowed = [i for i, c in enumerate(self.chunks) if chapter is None or c.chapter == chapter]
        if kind == "hybrid":
            fused = _rrf(self._ranked(self._bm25.scores(terms), allowed), self._ranked(self._tfidf.scores(terms), allowed))
            order = sorted(fused, key=lambda i: -fused[i])
            scored = [(i, fused[i]) for i in order]
        else:
            scores = (self._bm25 if kind == "bm25" else self._tfidf).scores(terms)
            scored = [(i, scores[i]) for i in self._ranked(scores, allowed)]
        return [self._hit(i, score) for i, score in scored[:top_k]]

    def _hit(self, index: int, score: float) -> Hit:
        chunk = self.chunks[index]
        return Hit(chunk.chapter, chunk.section_id, chunk.section_title, chunk.text[: self.snippet_chars], round(score, 4))
