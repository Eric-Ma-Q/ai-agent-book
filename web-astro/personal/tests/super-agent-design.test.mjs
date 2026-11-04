// Requirement 042: the Super-agent design page is a self-contained archive
// page interpreting the 2026-11 DeepSeek Harness article. These checks keep its
// structure, citation set, interactive roots and archive registration from
// drifting when the page is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const HTML = path.join(HARNESS, 'archive/super-agent-design-2026-11.html');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const SECTIONS = [
  'summary',
  'problem',
  'features',
  'twolayer',
  'events',
  'context',
  'interaction',
  'separation',
  'watchdog',
  'experiments',
  'limits',
  'reading',
  'sources',
];

test('the Super-agent page is registered in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'super-agent-design');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.sitePath, 'super-agent-design-2026-11.html');
  assert.equal(page.kind, '架构解读');
  assert.ok(page.tags.includes('Super-agent'));
  assert.ok(page.description.includes('Watchdog'));
  assert.equal(STATS.pages, 24);
});

test('the page ships 13 sections and 8 numbered sources, all cited', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of SECTIONS) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: section anchor`);
  }
  const sources = [...html.matchAll(/<li id="s(\d+)">/g)].map((match) => Number(match[1]));
  assert.deepEqual(sources, Array.from({ length: 8 }, (_, index) => index + 1));
  const cited = new Set([...html.matchAll(/href="#s(\d+)"/g)].map((match) => Number(match[1])));
  assert.equal(cited.size, sources.length, 'every source is cited');
  for (const number of cited) assert.ok(sources.includes(number), `citation [${number}] resolves`);
});

test('the architecture argument and its numbers stay in the page', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /Session 是系统的实现细节/);
  assert.match(html, /3 到 5 个活跃 Session/);
  assert.match(html, /Router 层/);
  assert.match(html, /Worker/);
  assert.match(html, /Inline/);
  assert.match(html, /链式召回/);
  assert.match(html, /start\(\)/);
  assert.match(html, /stop\(\)/);
  assert.match(html, /BYOM/);
  assert.match(html, /Watchdog/);
  assert.match(html, /12\.4/);
  assert.match(html, /15\.7/);
  assert.match(html, /29\.5/);
  assert.match(html, /2323/);
  assert.match(html, /3177/);
  assert.match(html, /6\.4/);
  assert.match(html, /1\.6/);
  assert.match(html, /100 词/);
  assert.match(html, /8 条来源/);
});

test('the six interactive roots are present and self-contained', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of ['featureMap', 'archToggle', 'batchCalc', 'spillDemo', 'labTable', 'checklist']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: interactive root`);
  }
  const feats = [...html.matchAll(/data-feat="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(feats, ['cont', 'eff', 'pro', 'per']);
  const views = [...html.matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(views, ['time', 'token', 'decide']);
  const steps = [...html.matchAll(/data-step="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(steps, ['1', '2', '3']);
  assert.doesNotMatch(html, /data-harness-nav/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /@media print/);
  assert.match(html, /html\.dark/);
  const info = await stat(HTML);
  assert.ok(info.size > 70_000 && info.size < 180_000, `unexpected page size: ${info.size}`);
});

test('the manifest entry matches the page byte for byte', async () => {
  const file = MANIFEST.files.find((entry) => entry.target === 'archive/super-agent-design-2026-11.html');
  assert.ok(file, 'manifest entry exists');
  assert.equal(file.category, 'page');
  assert.equal(file.source, 'super-agent-design-2026-11.html');
  assert.equal(file.url, '/harness/site/super-agent-design-2026-11.html');
  const buffer = await readFile(HTML);
  assert.equal(buffer.length, file.bytes);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), file.sha256);
  assert.equal(MANIFEST.counts.page, MANIFEST.files.filter((entry) => entry.category === 'page').length);
});
