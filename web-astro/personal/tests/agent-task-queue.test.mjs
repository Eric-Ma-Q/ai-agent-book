// Requirement 032: the task-queue deep dive is a self-contained archive page.
// These checks keep its structure, citation set, key contracts and archive
// registration from drifting when the page is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const HTML = path.join(HARNESS, 'archive/agent-task-queue.html');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const SECTIONS = [
  'summary',
  'lanes',
  'contracts',
  'interface',
  'compare',
  'failures',
  'model',
  'lease',
  'scheduling',
  'bypass',
  'sql',
  'metrics',
  'principles',
  'sources',
];

test('the task-queue page is registered in the deep group', () => {
  const page = PAGES.find((entry) => entry.slug === 'agent-task-queue');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'deep');
  assert.equal(page.sitePath, 'agent-task-queue.html');
  assert.equal(page.kind, '产品设计');
  assert.ok(page.tags.includes('任务队列'));
  assert.ok(page.description.includes('四条车道'));
  assert.equal(STATS.pages, 22);
});

test('the page ships every section and 14 numbered sources', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of SECTIONS) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: section anchor`);
  }
  const sources = [...html.matchAll(/<li id="s(\d+)">/g)].map((match) => Number(match[1]));
  assert.deepEqual(sources, Array.from({ length: 14 }, (_, index) => index + 1));
  const cited = new Set([...html.matchAll(/href="#s(\d+)"/g)].map((match) => Number(match[1])));
  assert.equal(cited.size, sources.length, 'every source is cited');
  for (const number of cited) assert.ok(sources.includes(number), `citation [${number}] resolves`);
});

test('the key contracts stay in the page', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /四条车道/);
  assert.match(html, /六个契约/);
  assert.match(html, /九个状态/);
  assert.match(html, /十二个失败模式/);
  assert.match(html, /drain_policy/);
  assert.match(html, /FOR UPDATE SKIP LOCKED/);
  assert.match(html, /lease_epoch/);
  assert.match(html, /steered/);
  assert.match(html, /queued/);
  assert.match(html, /\/book\/chapter6\//);
  assert.match(html, /14 条来源/);
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

test('the page is registered in the manifest with matching bytes and hash', async () => {
  const record = MANIFEST.files.find(
    (file) => file.url === '/harness/site/agent-task-queue.html',
  );
  assert.ok(record, 'manifest entry exists');
  assert.equal(record.target, 'archive/agent-task-queue.html');
  assert.equal(record.category, 'page');
  const bytes = await readFile(HTML);
  assert.equal(record.bytes, bytes.length);
  assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
});
