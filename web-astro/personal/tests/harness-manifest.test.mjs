// Requirement 006, step 1: the migration manifest must describe the archive
// exactly, and verify.mjs must detect a missing or modified file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../harness/verify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));

const EXPECTED_COUNTS = {
  page: 34,
  research: 19,
  longform: 2,
  lab: 41,
  doc: 21,
  collab: 71,
  build: 8,
  artifact: 2,
  meta: 4,
};

test('manifest lists 202 unique targets with the documented category counts', () => {
  assert.equal(MANIFEST.format, 'harness-migration-manifest');
  assert.equal(MANIFEST.version, 1);
  assert.equal(MANIFEST.fileCount, 202);
  assert.equal(MANIFEST.files.length, 202);
  assert.deepEqual(MANIFEST.counts, EXPECTED_COUNTS);
  assert.equal(
    Object.values(MANIFEST.counts).reduce((sum, value) => sum + value, 0),
    202,
  );

  const targets = new Set(MANIFEST.files.map((file) => file.target));
  assert.equal(targets.size, MANIFEST.files.length, 'targets must be unique');

  const counted = {};
  for (const file of MANIFEST.files) counted[file.category] = (counted[file.category] ?? 0) + 1;
  assert.deepEqual(counted, EXPECTED_COUNTS);
});

test('every entry carries a byte count, a SHA-256 and a served URL unless it is meta', () => {
  for (const file of MANIFEST.files) {
    assert.ok(Number.isInteger(file.bytes) && file.bytes >= 0, `${file.target}: bytes`);
    assert.match(file.sha256, /^[0-9a-f]{64}$/, `${file.target}: sha256`);
    assert.match(file.mode, /^1006(44|55)$/, `${file.target}: mode`);
    if (file.category === 'meta') {
      assert.equal(file.url, null, `${file.target}: meta must not be served`);
      assert.ok(file.target.startsWith('meta/'), `${file.target}: meta lives in meta/`);
    } else {
      assert.ok(file.target.startsWith('archive/'), `${file.target}: archive target`);
      assert.ok(file.url.startsWith('/harness/site/'), `${file.target}: site URL`);
    }
  }
  const total = MANIFEST.files.reduce((sum, file) => sum + file.bytes, 0);
  assert.equal(total, MANIFEST.totalBytes);
});

test('the archive matches the manifest byte for byte', async () => {
  const { updated } = await verify({ log() {} });
  assert.deepEqual(updated, []);

  for (const file of MANIFEST.files) {
    const buffer = await readFile(path.join(HARNESS, file.target));
    assert.equal(buffer.length, file.bytes, `${file.target}: bytes`);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), file.sha256, `${file.target}: sha`);
  }
});

test('the 34 root pages, 19 research volumes and both labs are archived', () => {
  const pages = MANIFEST.files.filter((file) => file.category === 'page');
  assert.equal(pages.length, 34);
  assert.ok(pages.some((file) => file.source === 'index.html'));
  // 多页专题（如 cc-source-teardown）除 HTML 还带一份共享样式表。
  for (const page of pages) assert.match(page.target, /^archive\/(?:.+\/)?[^/]+\.(?:html|css)$/);

  const research = MANIFEST.files.filter((file) => file.category === 'research');
  assert.equal(research.length, 19);
  assert.ok(research.every((file) => file.target.startsWith('archive/research/')));

  const labs = MANIFEST.files.filter((file) => file.category === 'lab');
  assert.ok(labs.some((file) => file.source === 'labs/mini-harness/harness/loop.py'));
  assert.ok(labs.some((file) => file.source === 'labs/selfloop/run.py'));
  // The only nested dot file is renamed so it can stay tracked.
  assert.ok(labs.some((file) => file.target === 'archive/labs/selfloop/gitignore.txt'));
  assert.equal(labs.filter((file) => path.basename(file.target).startsWith('.')).length, 0);
});

test('non-content run state is excluded', () => {
  const sources = MANIFEST.files.map((file) => file.source);
  for (const pattern of ['.playwright-mcp/', '__pycache__/', '.selfloop/', 'pdfout/', '.DS_Store']) {
    assert.ok(sources.every((source) => !source.includes(pattern)), `${pattern} must not be migrated`);
  }
  for (const entry of ['.git/', '.playwright-mcp/', '**/__pycache__/', 'labs/selfloop/.selfloop/', '_deck/pdfout/']) {
    assert.ok(MANIFEST.excluded.includes(entry), `excluded list mentions ${entry}`);
  }
});

test('verify reports a tampered file and --update repairs the hash', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'harness-verify-'));
  try {
    await mkdir(path.join(root, 'archive'), { recursive: true });
    await writeFile(path.join(root, 'archive', 'sample.txt'), 'original');
    const manifest = {
      format: 'harness-migration-manifest',
      version: 1,
      fileCount: 1,
      totalBytes: 8,
      counts: { page: 1 },
      files: [
        {
          source: 'sample.txt',
          target: 'archive/sample.txt',
          category: 'page',
          url: '/harness/site/sample.txt',
          bytes: 8,
          sha256: createHash('sha256').update('original').digest('hex'),
          mode: '100644',
        },
      ],
    };
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    await verify({ root, log() {} });

    await writeFile(path.join(root, 'archive', 'sample.txt'), 'changed!');
    await assert.rejects(() => verify({ root, log() {} }), /sha256 differs/);

    const { updated } = await verify({ root, update: true, log() {} });
    assert.deepEqual(updated, ['archive/sample.txt']);
    const rescued = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(rescued.totalBytes, 8);
    assert.equal(rescued.files[0].sha256, createHash('sha256').update('changed!').digest('hex'));
    assert.ok(rescued.updatedAt);
    await verify({ root, log() {} });

    // --update must also accept a length change, not only a same-length edit.
    const longer = 'changed with more text';
    await writeFile(path.join(root, 'archive', 'sample.txt'), longer);
    await assert.rejects(() => verify({ root, log() {} }), /sha256 differs/);
    const resized = await verify({ root, update: true, log() {} });
    assert.deepEqual(resized.updated, ['archive/sample.txt']);
    const repaired = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(repaired.files[0].bytes, Buffer.byteLength(longer));
    assert.equal(repaired.totalBytes, Buffer.byteLength(longer));
    assert.equal(repaired.files[0].sha256, createHash('sha256').update(longer).digest('hex'));
    await verify({ root, log() {} });

    await writeFile(path.join(root, 'archive', 'extra.txt'), 'x');
    await assert.rejects(() => verify({ root, log() {} }), /unlisted file: archive\/extra.txt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
