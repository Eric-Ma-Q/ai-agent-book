// Requirement 042 companion: the Super-agent structure diagram is a standalone
// archive page next to the article. These checks keep it registered, offline and
// in sync with the manifest, and make sure the two pages keep linking to each
// other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const ARCHIVE = path.join(HARNESS, 'archive');
const DIAGRAM = path.join(ARCHIVE, 'super-agent-architecture.html');
const ARTICLE = path.join(ARCHIVE, 'super-agent-design-2026-11.html');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));
const HTML = await readFile(DIAGRAM, 'utf8');

const BANDS = ['01', '02', '03', '04', '05', '06', '07', '08'];

test('the diagram is a catalog page in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'super-agent-architecture');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.kind, '结构图');
  assert.equal(page.sitePath, 'super-agent-architecture.html');
  const article = PAGES.find((entry) => entry.slug === 'super-agent-design');
  assert.ok(article, 'the article it belongs to stays registered');
});

test('the diagram keeps its eight bands and the load-bearing labels', () => {
  for (const band of BANDS) {
    assert.match(HTML, new RegExp('<span class="no"[^>]*>' + band + '</span>'), 'band ' + band);
  }
  for (const label of [
    'Router 层',
    'Worker 层',
    'FAST PATH',
    'SLOW PATH',
    'Inline &amp; Spill',
    '链式召回',
    '异步 ReAct Loop',
    'Watchdog',
    'BYOM',
    '12.4',
    '6.4 → 1.6',
  ]) {
    assert.ok(HTML.includes(label), 'missing label: ' + label);
  }
});

test('the diagram loads no external assets', () => {
  assert.doesNotMatch(HTML, /<script[^>]+src=/i, 'no external script');
  assert.doesNotMatch(HTML, /<link[^>]+href=/i, 'no external stylesheet');
  assert.doesNotMatch(HTML, /https?:\/\//i, 'no absolute URL');
  assert.doesNotMatch(HTML, /@import/i, 'no css import');
});

test('the article and the diagram link to each other', async () => {
  const article = await readFile(ARTICLE, 'utf8');
  assert.match(article, /href="super-agent-architecture\.html"/);
  assert.match(HTML, /href="super-agent-design-2026-11\.html"/);
});

test('the manifest records the diagram byte for byte', async () => {
  const file = MANIFEST.files.find((entry) => entry.target === 'archive/super-agent-architecture.html');
  assert.ok(file, 'manifest entry exists');
  assert.equal(file.category, 'page');
  assert.equal(file.url, '/harness/site/super-agent-architecture.html');
  const buffer = await readFile(DIAGRAM);
  assert.equal(file.bytes, buffer.length);
  assert.equal(file.sha256, createHash('sha256').update(buffer).digest('hex'));
  const index = await readFile(path.join(ARCHIVE, 'index.html'), 'utf8');
  assert.match(index, /href="super-agent-architecture\.html"/, 'directory card exists');
  assert.equal((await stat(DIAGRAM)).isFile(), true);
});
