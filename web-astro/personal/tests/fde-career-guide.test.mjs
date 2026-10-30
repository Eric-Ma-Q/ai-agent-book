// Requirement 038: the FDE career guide is a self-contained archive page in the
// AI industry group. These checks keep its structure, citation set, interactive
// roots and archive registration from drifting when the page is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const HTML = path.join(HARNESS, 'archive/fde-career-guide-2026.html');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const SECTIONS = [
  'market',
  'money',
  'reality',
  'jobs',
  'fit',
  'skills',
  'portfolio',
  'resume',
  'interview',
  'plan',
  'risk',
  'sources',
];

test('the FDE career guide is registered in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'fde-career-guide-2026');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.sitePath, 'fde-career-guide-2026.html');
  assert.equal(page.kind, '就业指南');
  assert.ok(page.tags.includes('FDE'));
  assert.ok(page.description.includes('39 条来源'));
  assert.equal(STATS.pages, 22);
});

test('the page ships 12 sections and 39 numbered sources, all cited', async () => {
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

test('the pay, field reality and interview arguments stay in the page', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /\+729%/);
  assert.match(html, /2,000/);
  assert.match(html, /5–7 轮/);
  assert.match(html, /评估（evals）/);
  assert.match(html, /三种生意/);
  assert.match(html, /东京/);
  assert.match(html, /腾讯云 ADP/);
});

test('the three interactions and their hooks are present', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const hook of ['data-fit', 'data-fit-item', 'data-money', 'data-money-panel', 'data-plan', 'data-plan-item']) {
    assert.match(html, new RegExp(hook), `${hook}: present`);
  }
  assert.match(html, /data-fit-out/);
  assert.match(html, /data-plan-bar/);
});

test('the page is self-contained and writes no reader data', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+stylesheet/i);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.doesNotMatch(html, /localStorage\.setItem\((?!'harness-theme')/);
  assert.match(html, /@media print/);
});

test('the manifest pins the page bytes and hash', async () => {
  const entry = MANIFEST.files.find((file) => file.target === 'archive/fde-career-guide-2026.html');
  assert.ok(entry, 'manifest entry exists');
  assert.equal(entry.url, '/harness/site/fde-career-guide-2026.html');
  const buffer = await readFile(HTML);
  assert.equal(buffer.length, entry.bytes);
  assert.equal(createHash('sha256').update(buffer).digest('hex'), entry.sha256);
  const info = await stat(HTML);
  assert.ok(info.isFile());
});
