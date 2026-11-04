import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilesStore, MAX_TEXT_BYTES } from '../files-store.mjs';

const quiet = { info() {}, warn() {}, error() {} };

function makeTree() {
  const root = mkdtempSync(join(tmpdir(), 'personal-files-'));
  const write = (path, text) => {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
    return full;
  };
  write('book/chapter7.md', '# 第 7 章');
  write('chapter7/README.md', '# 章节实验');
  write('chapter7/android-world/README.md', '# 实验目录');
  write('chapter7/android-world/t3a_failed.md', '# T3A 失败轨迹\n\n样本一。\n');
  write('chapter8/README.md', '# 第 8 章');
  write('docs/a.md', '# 文档');
  write('personal/notes/secret.json', '{"token":"nope"}');
  write('.env', 'SECRET=1');
  write('web-astro/node_modules/x.md', '# 依赖');
  write('image.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  write('big.txt', 'x'.repeat(MAX_TEXT_BYTES + 32));
  write('book/chapter7-bom.md', '\uFEFF# 带 BOM');
  return { root, write };
}

test('resolves names and sorts the current chapter first', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const { files, totals } = store.resolve(['README.md'], {
    page: '/book/chapter7/',
    chapter: 'ai-agents-in-depth:zh-CN:chapter7',
  });
  assert.deepEqual(
    files['README.md'].map((entry) => entry.path),
    ['chapter7/README.md', 'chapter7/android-world/README.md', 'chapter8/README.md'],
  );
  assert.equal(totals['README.md'], 3);
  assert.equal(files['README.md'][0].format, 'markdown');
  assert.ok(files['README.md'][0].bytes > 0);
});

test('gives an exact relative path the first slot', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const { files } = store.resolve(['chapter7/README.md'], { page: '/book/chapter7/' });
  assert.equal(files['chapter7/README.md'][0].path, 'chapter7/README.md');
});

test('returns an empty list and a zero total for unknown names', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const { files, totals } = store.resolve(['nope.md', 'foo.unknownext']);
  assert.deepEqual(files['nope.md'], []);
  assert.equal(totals['nope.md'], 0);
  assert.deepEqual(files['foo.unknownext'], []);
});

test('caps candidates at eight but reports the real total', () => {
  const { root, write } = makeTree();
  for (let i = 0; i < 9; i += 1) write(`samples/${i}/same.md`, `# ${i}`);
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const { files, totals } = store.resolve(['same.md']);
  assert.equal(files['same.md'].length, 8);
  assert.equal(totals['same.md'], 9);
});

test('rejects duplicate and oversized resolve payloads', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const names = Array.from({ length: 51 }, (_, i) => `f${i}.md`);
  assert.throws(() => store.resolve(names), /at most 50/);
  assert.throws(() => store.resolve(['x'.repeat(301)]), /invalid/);
  assert.throws(() => store.resolve('README.md'), /array/);
});

test('never indexes personal/, dotfiles, key files or node_modules', () => {
  const { root, write } = makeTree();
  write('deploy/id_rsa', 'private');
  write('deploy/credentials.json', '{}');
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const { files, totals } = store.resolve([
    'secret.json',
    '.env',
    'x.md',
    'id_rsa',
    'credentials.json',
  ]);
  for (const name of Object.keys(files)) {
    assert.equal(files[name].length, 0, name);
    assert.equal(totals[name], 0, name);
  }
  assert.equal(store.stats().files > 0, true);
});

test('reads text, strips a BOM and reports truncation', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const md = store.read('chapter7/android-world/t3a_failed.md');
  assert.equal(md.binary, false);
  assert.match(md.text, /^# T3A 失败轨迹/);
  assert.equal(md.truncated, false);
  assert.equal(md.mime, 'text/markdown; charset=utf-8');

  const bom = store.read('book/chapter7-bom.md');
  assert.equal(bom.text.startsWith('#'), true);

  const big = store.read('big.txt');
  assert.equal(big.truncated, true);
  assert.equal(big.bytes, MAX_TEXT_BYTES + 32);
  assert.equal(Buffer.byteLength(big.text), MAX_TEXT_BYTES);
});

test('reports binary files without text', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const image = store.read('image.png');
  assert.equal(image.binary, true);
  assert.equal(image.text, undefined);
  assert.equal(image.mime, 'image/png');
});

test('rejects paths that escape, are denied, or are symlinks', () => {
  const { root } = makeTree();
  const outside = mkdtempSync(join(tmpdir(), 'personal-outside-'));
  writeFileSync(join(outside, 'x.md'), '# outside');
  symlinkSync(join(outside, 'x.md'), join(root, 'link.md'));
  const store = createFilesStore({ bookRoot: root, log: quiet });
  for (const path of [
    '../personal/notes/secret.json',
    '/etc/passwd',
    'personal/notes/secret.json',
    '.env',
    'web-astro/node_modules/x.md',
    'deploy/id_rsa',
    'link.md',
    'docs',
    'missing.md',
  ]) {
    assert.throws(
      () => store.read(path),
      /not previewable|not found|not a file|escapes|may not contain|must be relative|must use forward/,
      path,
    );
  }
});

test('blob returns bytes with an attachment disposition', () => {
  const { root } = makeTree();
  const store = createFilesStore({ bookRoot: root, log: quiet });
  const image = store.blob('image.png');
  assert.equal(image.mime, 'image/png');
  assert.equal(image.disposition, 'inline');
  assert.equal(image.buffer.length, 4);
  const text = store.blob('docs/a.md');
  assert.equal(text.disposition, 'attachment');
  assert.match(text.fileName, /a\.md$/);
});

test('reuses the index until the cache expires', () => {
  const { root, write } = makeTree();
  let clock = 0;
  const store = createFilesStore({ bookRoot: root, log: quiet, now: () => clock });
  assert.equal(store.resolve(['fresh.md']).files['fresh.md'].length, 0);
  write('chapter7/fresh.md', '# fresh');
  assert.equal(store.resolve(['fresh.md']).files['fresh.md'].length, 0);
  clock += 61_000;
  assert.equal(store.resolve(['fresh.md']).files['fresh.md'].length, 1);
});
