import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSection, parseOutline } from '../sections.mjs';
import { listAllHighlights } from '../highlights-index.mjs';

const BOOK = `# 第一章 入门

开头段落：Agent 是一个会循环的系统。

## 现代 Agent

这里讲 **LLM** 加上[上下文](https://example.com/context)和工具。

\`\`\`python
# not a heading
loop()
\`\`\`

### 工具：手脚

工具是 Agent 的手脚，决定它能做什么。

## 总结

重复的一句话。

## 附录

重复的一句话。
`;

const record = (quote, prefix = '', over = {}) => ({ quote, prefix, suffix: '', start: 0, ...over });

test('outline captures the title and h2/h3 sections, ignoring headings in code', () => {
  const outline = parseOutline(BOOK);
  assert.equal(outline.title, '第一章 入门');
  assert.deepEqual(
    outline.sections.map(({ depth, title }) => [depth, title]),
    [[2, '现代 Agent'], [3, '工具：手脚'], [2, '总结'], [2, '附录']],
  );
});

test('finds the section of a quote, including quotes crossing Markdown syntax', () => {
  const outline = parseOutline(BOOK);
  assert.deepEqual(findSection(outline, record('LLM 加上上下文和工具')), { title: '现代 Agent', parent: null });
  assert.deepEqual(findSection(outline, record('工具是 Agent 的手脚')), { title: '工具：手脚', parent: '现代 Agent' });
});

test('text before the first section has no section', () => {
  assert.equal(findSection(parseOutline(BOOK), record('Agent 是一个会循环的系统')), null);
});

test('a repeated phrase resolves by its relative position in the chapter', () => {
  const outline = parseOutline(BOOK);
  const early = findSection(outline, record('重复的一句话', '', { start: 1 }));
  const late = findSection(outline, record('重复的一句话', '', { start: BOOK.length }));
  assert.equal(early.title, '总结');
  assert.equal(late.title, '附录');
});

test('an unknown quote has no section', () => {
  assert.equal(findSection(parseOutline(BOOK), record('书里没有这句话')), null);
});

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'personal-index-'));
  const book = mkdtempSync(join(tmpdir(), 'personal-book-'));
  mkdirSync(join(book, 'book'));
  writeFileSync(join(book, 'book', 'chapter1.md'), BOOK);
  return { root, book };
}

const stored = (id, quote, createdAt) => ({
  id, chapter: 'ai-agents-in-depth:zh-CN:chapter1', quote, prefix: '', suffix: '',
  start: 0, end: quote.length, createdAt,
});

function writeNotes(root, locale, name, content) {
  mkdirSync(join(root, 'notes', locale), { recursive: true });
  writeFileSync(join(root, 'notes', locale, name), content);
}

test('lists highlights of every chapter with chapter and section labels', () => {
  const { root, book } = scratch();
  writeNotes(root, 'zh-CN', 'chapter1.json', JSON.stringify({
    highlights: [stored('a', '工具是 Agent 的手脚', '2026-10-01T00:00:00.000Z')],
  }));
  writeNotes(root, 'zh-CN', 'chapter1.drafts.json', JSON.stringify({ a: 'half-written' }));
  const result = listAllHighlights(root, book);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.chapters, [{
    key: 'ai-agents-in-depth:zh-CN:chapter1', locale: 'zh-CN', number: 1,
    title: '第一章 入门', path: '/book/chapter1/', count: 1,
  }]);
  const [highlight] = result.highlights;
  assert.equal(highlight.section, '工具：手脚');
  assert.equal(highlight.parentSection, '现代 Agent');
  assert.equal(highlight.noteDraft, 'half-written');
  assert.equal(highlight.chapterNumber, 1);
});

test('works without book sources, leaving sections empty', () => {
  const { root } = scratch();
  writeNotes(root, 'zh-CN', 'chapter1.json', JSON.stringify({
    highlights: [stored('a', 'x', '2026-10-01T00:00:00.000Z')],
  }));
  const { highlights, chapters } = listAllHighlights(root, undefined);
  assert.equal(highlights[0].section, null);
  assert.equal(chapters[0].title, '');
});

test('an unreadable notes file is reported without hiding other chapters', () => {
  const { root, book } = scratch();
  writeNotes(root, 'zh-CN', 'chapter1.json', JSON.stringify({ highlights: 'oops' }));
  writeNotes(root, 'zh-CN', 'chapter2.json', JSON.stringify({
    highlights: [{ ...stored('b', 'q', '2026-10-01T00:00:00.000Z'), chapter: 'ai-agents-in-depth:zh-CN:chapter2' }],
  }));
  const result = listAllHighlights(root, book);
  assert.equal(result.highlights.length, 1);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0].chapter, /chapter1$/);
});

test('an empty personal directory lists nothing', () => {
  const { root, book } = scratch();
  assert.deepEqual(listAllHighlights(root, book), { chapters: [], highlights: [], problems: [] });
});
