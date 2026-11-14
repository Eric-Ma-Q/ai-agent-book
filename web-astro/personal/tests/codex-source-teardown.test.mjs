// Requirement 046: the Codex teardown must stay on one fixed SHA, keep every
// evidence block traceable, and distinguish "not in this repository" from
// "confirmed closed". This test checks semantics, not section counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, STATS } from '../harness/catalog.mjs';
import { DIFFERENCES } from '../harness/teardown-codex/data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const ARCHIVE = path.join(HARNESS, 'archive');
const SITE = path.join(ARCHIVE, 'codex-source-teardown');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));
const SHA = '8703d32bd0ea5cf26768859a3dd476df906ba053';
const CHAPTERS = [
  '01-scope.html',
  '02-map.html',
  '03-loop.html',
  '04-tools.html',
  '05-context.html',
  '06-permission.html',
  '07-agents.html',
  '08-surface.html',
  '09-difference.html',
  '10-lessons.html',
];
const ALLOWED = new Set(['shared', 'implementation', 'new-surface', 'unverifiable']);

test('catalog exposes one Codex teardown in the product group', () => {
  const entries = PAGES.filter((page) => page.slug === 'codex-source-teardown');
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.group, 'product');
  assert.equal(entry.sitePath, 'codex-source-teardown/index.html');
  assert.equal(entry.kind, '源码拆解');
  assert.equal(STATS.pages, 25);
});

test('manifest lists the 12 generated files with matching bytes and hashes', async () => {
  const files = MANIFEST.files.filter((file) => file.target.startsWith('archive/codex-source-teardown/'));
  assert.equal(files.length, 12);
  for (const file of files) {
    const name = path.basename(file.target);
    assert.equal(file.category, 'page');
    assert.equal(file.source, `codex-source-teardown/${name}`);
    assert.equal(file.url, `/harness/site/codex-source-teardown/${name}`);
    const buffer = await readFile(path.join(HARNESS, file.target));
    assert.equal(buffer.length, file.bytes, `${name}: bytes`);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), file.sha256, `${name}: sha`);
  }
});

test('index links every chapter and each chapter has semantic blocks', async () => {
  const index = await readFile(path.join(SITE, 'index.html'), 'utf8');
  assert.match(index, /data-teardown-index/);
  for (const label of [
    '运行时与 App Server 分层',
    '工具可编程层',
    '权限组合',
    '条件后台压缩',
    '角色与协作生命周期',
  ]) {
    assert.ok(index.includes(label), `index leads with ${label}`);
  }
  assert.equal(/find \| xargs|不要越界|写法约束/.test(index), false, 'index keeps evidence method brief');
  for (const name of CHAPTERS) {
    assert.ok(index.includes(name), `index links ${name}`);
    const html = await readFile(path.join(SITE, name), 'utf8');
    for (const marker of ['data-user-problem', 'data-product-judgment', 'data-tradeoff']) {
      assert.match(html, new RegExp(marker), `${name}: ${marker}`);
    }
    assert.match(html, new RegExp(`/blob/${SHA}/`), `${name}: fixed SHA link`);
  }
});

test('every evidence block points at the same fixed SHA and a matching line', async () => {
  for (const name of CHAPTERS) {
    const html = await readFile(path.join(SITE, name), 'utf8');
    const blocks = [
      ...html.matchAll(/data-evidence data-path="([^"]+)" data-lines="([^"]+)" data-href="([^"]+)"/g),
    ];
    for (const [, file, lines, href] of blocks) {
      assert.ok(href.startsWith(`https://github.com/openai/codex/blob/${SHA}/`), `${name}: SHA`);
      assert.ok(href.includes(file), `${name}: path`);
      const start = lines.split('-')[0];
      assert.ok(href.includes(`#L${start}`), `${name}: line ${lines}`);
    }
    assert.equal(/blob\/(main|master)\//.test(html), false, `${name}: branch link`);
  }
});

test('pages are self-contained and avoid unprovable absolute claims', async () => {
  for (const name of [...CHAPTERS, 'index.html']) {
    const html = await readFile(path.join(SITE, name), 'utf8');
    assert.equal(/<script[^>]+src=/.test(html), false, `${name}: external script`);
    assert.equal(/<link[^>]+href="https?:/.test(html), false, `${name}: external stylesheet`);
    assert.equal(/<img[^>]+src="https?:/.test(html), false, `${name}: external image`);
    assert.equal(/https?:\/\/[^"']+\.(?:js|css|png|jpe?g|webp)/.test(html), false, `${name}: external asset`);
    assert.equal(/独家|首创|唯一|业界第一/.test(html), false, `${name}: absolute claim`);
    assert.equal(/闭源/.test(html), false, `${name}: unproven closed-source claim`);
  }
});

test('the difference ledger uses only the four allowed judgments', () => {
  assert.equal(DIFFERENCES.length, 11);
  for (const row of DIFFERENCES) {
    assert.ok(row.id.startsWith('C'), `${row.id}: claim id`);
    assert.ok(ALLOWED.has(row.kind), `${row.id}: kind ${row.kind}`);
    assert.ok(row.question && row.codex && row.cc && row.note, `${row.id}: fields`);
  }
  assert.equal(new Set(DIFFERENCES.map((row) => row.kind)).size, 4);
});
