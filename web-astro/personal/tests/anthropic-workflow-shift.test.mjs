// Requirement 018: the Anthropic workflow brief is a self-contained archive
// page. These checks keep the source list, section anchors and offline
// constraints from drifting when the page is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(HERE, '../harness/archive/anthropic-workflow-shift-2026-10.html');

test('the Anthropic workflow page is registered in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'anthropic-workflow-shift-2026-10');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.sitePath, 'anthropic-workflow-shift-2026-10.html');
  assert.equal(page.kind, '深度案例');
  assert.ok(page.tags.includes('Anthropic'));
  assert.equal(STATS.pages, 21);
});

test('the page ships the expected sections and 14 numbered sources', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of ['summary', 'timeline', 'matrix', 'code', 'review', 'scion', 'org', 'research', 'nontech', 'mechanism', 'evidence', 'implications', 'conclusion', 'sources']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: section anchor`);
  }
  const sources = [...html.matchAll(/<li id="s(\d+)">/g)].map((match) => Number(match[1]));
  assert.deepEqual(sources, Array.from({ length: 14 }, (_, index) => index + 1));
  const cited = new Set([...html.matchAll(/href="#s(\d+)"/g)].map((match) => Number(match[1])));
  for (const number of cited) assert.ok(sources.includes(number), `citation [${number}] resolves`);
  assert.match(html, /90% 是代码行占比/);
  assert.match(html, /手机上可左右滑动/);
});

test('the page stays self-contained and offline readable', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.doesNotMatch(html, /data-harness-nav/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /@media print/);
  assert.match(html, /--paper:#fff/);
  const info = await stat(HTML);
  assert.ok(info.size > 40_000 && info.size < 120_000, `unexpected page size: ${info.size}`);
});
