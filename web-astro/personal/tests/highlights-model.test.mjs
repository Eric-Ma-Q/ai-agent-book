import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyView,
  formatDate,
  groupByChapter,
  parseView,
  searchItems,
  serializeView,
  toAnnotation,
  toMarkdown,
} from '../client/highlights-model.ts';

const chapters = [
  { key: 'k:zh-CN:chapter1', locale: 'zh-CN', number: 1, title: '入门', path: '/book/chapter1/', count: 3 },
  { key: 'k:zh-CN:chapter2', locale: 'zh-CN', number: 2, title: '上下文', path: '/book/chapter2/', count: 1 },
];

const item = (over) => ({
  id: 'a',
  chapter: 'k:zh-CN:chapter1',
  quote: 'quote',
  prefix: '',
  suffix: '',
  start: 0,
  end: 5,
  createdAt: '2026-10-01T00:00:00.000Z',
  locale: 'zh-CN',
  chapterNumber: 1,
  section: null,
  parentSection: null,
  ...over,
});

const items = [
  item({ id: 'late', start: 900, quote: '后面的划线', section: '工具', createdAt: '2026-10-03T00:00:00.000Z' }),
  item({ id: 'early', start: 10, quote: 'Agent 循环', note: '记住这个', createdAt: '2026-10-02T00:00:00.000Z' }),
  item({ id: 'ch2', chapter: 'k:zh-CN:chapter2', chapterNumber: 2, quote: '上下文窗口', createdAt: '2026-10-04T00:00:00.000Z' }),
];
const ids = (list) => list.map((entry) => entry.id);
const view = (over = {}) => ({ q: '', kind: 'all', chapter: null, sort: 'book', ...over });

test('book order follows chapter then position in the chapter', () => {
  assert.deepEqual(ids(applyView(items, view(), chapters)), ['early', 'late', 'ch2']);
});

test('recent order puts the newest highlight first', () => {
  assert.deepEqual(ids(applyView(items, view({ sort: 'recent' }), chapters)), ['ch2', 'late', 'early']);
});

test('kind filter separates highlights with and without notes', () => {
  assert.deepEqual(ids(applyView(items, view({ kind: 'notes' }), chapters)), ['early']);
  assert.deepEqual(ids(applyView(items, view({ kind: 'plain' }), chapters)), ['late', 'ch2']);
});

test('a whitespace-only note does not count as a note', () => {
  const blank = item({ id: 'blank', note: '  \n' });
  assert.deepEqual(ids(applyView([blank], view({ kind: 'plain' }), chapters)), ['blank']);
});

test('search matches quote, note, section and chapter title, case-insensitively', () => {
  const find = (q) => ids(searchItems(items, view({ q }), chapters)).sort();
  assert.deepEqual(find('agent'), ['early']);
  assert.deepEqual(find('记住'), ['early']);
  assert.deepEqual(find('工具'), ['late']);
  assert.deepEqual(find('入门'), ['early', 'late']);
});

test('every search term must match', () => {
  assert.deepEqual(ids(searchItems(items, view({ q: 'agent 记住' }), chapters)), ['early']);
  assert.deepEqual(ids(searchItems(items, view({ q: 'agent 工具' }), chapters)), []);
});

test('chapter filter keeps only that chapter', () => {
  assert.deepEqual(ids(applyView(items, view({ chapter: 'k:zh-CN:chapter2' }), chapters)), ['ch2']);
});

test('groups consecutive items by chapter', () => {
  const groups = groupByChapter(applyView(items, view(), chapters));
  assert.deepEqual(
    groups.map((group) => [group.chapter, ids(group.items)]),
    [
      ['k:zh-CN:chapter1', ['early', 'late']],
      ['k:zh-CN:chapter2', ['ch2']],
    ],
  );
});

test('view state round-trips through the query string and omits defaults', () => {
  assert.equal(serializeView(view()), '');
  const state = view({ q: 'a b', kind: 'notes', chapter: 'k:zh-CN:chapter2', sort: 'recent' });
  assert.deepEqual(parseView(serializeView(state)), state);
});

test('unknown query values fall back to the defaults', () => {
  assert.deepEqual(parseView('?f=bogus&s=sideways'), view());
});

test('markdown export is in book order with sections, quotes and notes', () => {
  const markdown = toMarkdown(
    [
      item({ id: 'b', start: 50, quote: '第二行\n第三行', section: '子节', parentSection: '大节' }),
      item({ id: 'a', start: 5, quote: '开头', note: '我的想法' }),
      item({ id: 'c', chapter: 'k:zh-CN:chapter2', chapterNumber: 2, quote: '二章' }),
    ],
    chapters,
  );
  assert.equal(
    markdown,
    [
      '# 我的划线与笔记',
      '',
      '## 第 1 章 入门',
      '',
      '> 开头',
      '',
      '**笔记：** 我的想法',
      '',
      '### 大节 › 子节',
      '',
      '> 第二行',
      '> 第三行',
      '',
      '## 第 2 章 上下文',
      '',
      '> 二章',
      '',
    ].join('\n'),
  );
});

test('annotation payload drops the display-only fields', () => {
  const payload = toAnnotation(item({ note: 'n', section: 's' }));
  assert.deepEqual(Object.keys(payload).sort(), [
    'chapter', 'createdAt', 'end', 'id', 'note', 'prefix', 'quote', 'start', 'suffix',
  ]);
});

test('dates read as today, yesterday, or a calendar date', () => {
  const now = new Date(2026, 9, 8, 15, 0);
  assert.match(formatDate(new Date(2026, 9, 8, 9, 5).toISOString(), now), /^今天 09:05$/);
  assert.match(formatDate(new Date(2026, 9, 7, 23, 0).toISOString(), now), /^昨天 23:00$/);
  assert.equal(formatDate(new Date(2026, 8, 2, 12, 0).toISOString(), now), '9月2日');
  assert.equal(formatDate(new Date(2025, 11, 31, 12, 0).toISOString(), now), '2025年12月31日');
  assert.equal(formatDate('nonsense', now), '');
});
