// Requirement 035: the single-agent loop decision page is a self-contained
// archive page. These checks keep its structure, citation set, interactive
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
const HTML = path.join(HARNESS, 'archive/single-agent-loop.html');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const SECTIONS = [
  'summary',
  'problem',
  'decision',
  'loop',
  'cost',
  'migrate',
  'cases',
  'eval',
  'org',
  'limits',
  'actions',
  'sources',
];

test('the single-agent loop page is registered in the industry group', () => {
  const page = PAGES.find((entry) => entry.slug === 'single-agent-loop');
  assert.ok(page, 'catalog entry exists');
  assert.equal(page.group, 'industry');
  assert.equal(page.sitePath, 'single-agent-loop.html');
  assert.equal(page.kind, '架构决策');
  assert.ok(page.tags.includes('单 Agent'));
  assert.ok(page.description.includes('三个保留条件'));
  assert.equal(STATS.pages, 22);
});

test('the page ships 12 sections and 17 numbered sources, all cited', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of SECTIONS) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: section anchor`);
  }
  const sources = [...html.matchAll(/<li id="s(\d+)">/g)].map((match) => Number(match[1]));
  assert.deepEqual(sources, Array.from({ length: 17 }, (_, index) => index + 1));
  const cited = new Set([...html.matchAll(/href="#s(\d+)"/g)].map((match) => Number(match[1])));
  assert.equal(cited.size, sources.length, 'every source is cited');
  for (const number of cited) assert.ok(sources.includes(number), `citation [${number}] resolves`);
});

test('the decision, migration and eval arguments stay in the page', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /三个保留条件/);
  assert.match(html, /四种处置/);
  assert.match(html, /六步迁移/);
  assert.match(html, /折叠推演/);
  assert.match(html, /翻转矩阵/);
  assert.match(html, /15×/);
  assert.match(html, /90\.2%/);
  assert.match(html, /30–50/);
  assert.match(html, /single-agent-loop-kit/);
  assert.match(html, /\/book\/chapter10\//);
  assert.match(html, /\/book\/chapter2\//);
  assert.match(html, /17 条来源/);
});

test('the eight interactive roots are present and self-contained', async () => {
  const html = await readFile(HTML, 'utf8');
  for (const id of ['decisionWizard', 'loopPanel', 'ledger', 'stepper', 'simulator', 'evalMatrix', 'checklist']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id}: interactive root`);
  }
  assert.match(html, /id="codeLoop"/);
  assert.match(html, /data-q="shared"/);
  assert.match(html, /data-preset="multi"/);
  assert.match(html, /data-scenario="research"/);
  assert.match(html, /data-view="detail"/);
  assert.doesNotMatch(html, /data-harness-nav/);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /prefers-color-scheme/);
  assert.match(html, /@media print/);
  assert.match(html, /html\.dark/);
  const info = await stat(HTML);
  assert.ok(info.size > 80_000 && info.size < 160_000, `unexpected page size: ${info.size}`);
});

test('the decision wizard exposes six signals, four dispositions and a gate', async () => {
  const html = await readFile(HTML, 'utf8');
  const questions = [...html.matchAll(/data-q="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(questions, ['handoff', 'cooccur', 'shared', 'parallel', 'bloat', 'conflict']);
  for (const label of ['建议：合并', '建议：折叠', '建议：作为工具', '建议：保留 / 接管', '建议：先渐进披露']) {
    assert.ok(html.includes(label), `${label}: verdict label`);
  }
  assert.match(html, /verdict--merge/);
  assert.match(html, /verdict--gate/);
  assert.match(html, /先渐进披露，复测后再定/);
  assert.match(html, /六个问题都没有命中/);
  assert.match(html, /这是基于六问的启发式/);
});

test('the simulation gates the hidden regression behind the run toggle', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /runToggle\.hidden = !isSupportFold/);
  assert.match(html, /\.run-toggle\[hidden\]\{display:none\}/);
  assert.match(html, /verdict3:/);
  assert.match(html, /hiddenAt1:/);
  assert.match(html, /guards = isSupportFold && sim\.runs === 1 \? \[12, 12\] : st\.guards/);
  assert.match(html, /本次全过；只跑 1 次，间歇失败可能被掩盖/);
});

test('the ledger keeps its bar nodes, announces totals and shows the crossover hint', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.doesNotMatch(html, /ledgerBar\.innerHTML/);
  assert.match(html, /<span id="ledgerTotal" aria-live="polite"/);
  assert.match(html, /id="ledgerHint"/);
  assert.match(html, /skills 少于 3 个或 tools 少于 6 个/);
  assert.match(html, /seg-history/);
  assert.match(html, /seg-skills/);
  assert.match(html, /seg-tools/);
  assert.match(html, /seg-subs/);
  assert.match(html, /<b id="checkCount" aria-live="polite"/);
});

test('metric bars stay inside their cards', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /\.metric \.m-bar\{display:block;height:5px/);
  assert.match(html, /\.metric \.m-bar i\{display:block;height:100%/);
});

test('the matrix marks flipped cells and both views print', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.equal([...html.matchAll(/cell-(?:pass|fail) cell-flip/g)].length, 5);
  assert.match(html, /黄色描边 = 与基线同次运行相比发生翻转/);
  assert.match(html, /printState\.push\(\[matrixAggregate/);
  assert.match(html, /printState\.push\(\[matrixDetail/);
  assert.match(html, /role="tabpanel" aria-labelledby="matrixTabAggregate"/);
});

test('tabs expose stable ids and panels are labelled', async () => {
  const html = await readFile(HTML, 'utf8');
  assert.match(html, /id="flowTab0"/);
  assert.match(html, /id="stepTab0"/);
  assert.match(html, /aria-labelledby="flowTab0"/);
  assert.match(html, /aria-labelledby="stepTab0"/);
  assert.match(html, /loopPanel\.setAttribute\('aria-labelledby', 'flowTab' \+ i\)/);
  assert.match(html, /stepPanel\.setAttribute\('aria-labelledby', 'stepTab' \+ i\)/);
  assert.match(html, /document\.addEventListener\('toggle', refreshScroll, true\)/);
});

test('the page is registered in the manifest with matching bytes and hash', async () => {
  const record = MANIFEST.files.find(
    (file) => file.url === '/harness/site/single-agent-loop.html',
  );
  assert.ok(record, 'manifest entry exists');
  assert.equal(record.target, 'archive/single-agent-loop.html');
  assert.equal(record.category, 'page');
  const bytes = await readFile(HTML);
  assert.equal(record.bytes, bytes.length);
  assert.equal(record.sha256, createHash('sha256').update(bytes).digest('hex'));
});
