// Requirement 020: the Claude Code product-design teardown is a self-contained
// archive page. These checks keep its sections, citation set, key numbers and
// archive registration from drifting when the page is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const HTML = path.join(HARNESS, 'archive/claude-code-product-design.html');
const RESEARCH = path.join(HARNESS, 'archive/research/19-claude-code-product-design.md');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const SECTIONS = [
  'summary',
  'timeline',
  'positioning',
  'users',
  'loop',
  'tools',
  'trust',
  'context',
  'extend',
  'multi',
  'surfaces',
  'business',
  'opensource',
  'principles',
  'compare',
  'risks',
  'sources',
];

test('the Claude Code product page is registered in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'claude-code-product-design');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.sitePath, 'claude-code-product-design.html');
  assert.equal(page.kind, '产品拆解');
  assert.ok(page.tags.includes('Claude Code'));
  assert.ok(page.description.includes('39 条来源'));
  assert.equal(STATS.pages, 22);
});

test('the page ships every section and 39 numbered sources', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of SECTIONS) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: section anchor`);
  }
  const sources = [...html.matchAll(/<li id="s(\d+)">/g)].map((match) => Number(match[1]));
  assert.deepEqual(sources, Array.from({ length: 39 }, (_, index) => index + 1));
  const cited = new Set([...html.matchAll(/href="#s(\d+)"/g)].map((match) => Number(match[1])));
  assert.equal(cited.size, sources.length, 'every source is cited');
  for (const number of cited) assert.ok(sources.includes(number), `citation [${number}] resolves`);
});

test('the key numbers stay in the page', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /<b>550<\/b><span>npm 发布次数/);
  assert.match(html, /<b>45<\/b><span>在册内置工具/);
  assert.match(html, /<b>33<\/b><span>hook 事件/);
  assert.match(html, /<b>6<\/b><span>权限模式/);
  assert.match(html, /<b>9<\/b><span>运行界面/);
  assert.match(html, /\$2\.5B/);
  assert.match(html, /文档列出 46 条工具条目/);
  assert.match(html, /49 个选项/);
  assert.match(html, /39 条来源/);
});

test('the page stays self-contained and offline readable', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /<html lang="zh-CN">/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /@media print/);
  const info = await stat(HTML);
  assert.ok(info.size > 70_000 && info.size < 140_000, `unexpected page size: ${info.size}`);
});

test('the page and the research note are registered in the manifest', async () => {
  const entries = [
    {
      url: '/harness/site/claude-code-product-design.html',
      target: 'archive/claude-code-product-design.html',
      category: 'page',
      file: HTML,
    },
    {
      url: '/harness/site/research/19-claude-code-product-design.md',
      target: 'archive/research/19-claude-code-product-design.md',
      category: 'research',
      file: RESEARCH,
    },
  ];
  for (const entry of entries) {
    const record = MANIFEST.files.find((file) => file.url === entry.url);
    assert.ok(record, `${entry.url}: in manifest`);
    assert.equal(record.target, entry.target);
    assert.equal(record.category, entry.category);
    const bytes = await readFile(entry.file);
    assert.equal(record.bytes, bytes.length, `${entry.target}: bytes`);
    assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'), `${entry.target}: sha256`);
  }
  const note = await readFile(RESEARCH, 'utf8');
  assert.match(note, /Claude Code 产品设计拆解 · 调研分册/);
  assert.match(note, /npm view @anthropic-ai\/claude-code time/);
  assert.match(note, /已知限制/);
});
