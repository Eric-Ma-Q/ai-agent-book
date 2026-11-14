import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ANNOTATIONS_FORMAT, cleanAnnotation, readAnnotations } from '../annotations-store.mjs';

const KEY = 'ai-agents-in-depth:zh-CN:chapter2';
const item = (extra = {}) => ({
  id: 'c2-001',
  quote: 'KV Cache',
  kind: 'term',
  title: 'KV Cache',
  body: '缓存注意力的键和值。',
  sources: [{ title: 'Paper', url: 'https://arxiv.org/abs/1706.03762' }],
  ...extra,
});

function withFile(content) {
  const root = mkdtempSync(join(tmpdir(), 'personal-annotations-'));
  mkdirSync(join(root, 'annotations/zh-CN'), { recursive: true });
  writeFileSync(join(root, 'annotations/zh-CN/chapter2.json'), content);
  return root;
}

test('a chapter without annotations reads as empty', () => {
  assert.deepEqual(readAnnotations(mkdtempSync(join(tmpdir(), 'personal-annotations-')), KEY), []);
});

test('reads valid entries and drops malformed ones', () => {
  const root = withFile(
    JSON.stringify({
      format: ANNOTATIONS_FORMAT,
      version: 1,
      annotations: [item(), item({ id: 'bad id' }), item({ id: 'c2-002', kind: 'gossip' }), item({ id: 'c2-003', body: '' })],
    }),
  );
  assert.deepEqual(readAnnotations(root, KEY), [item()]);
});

test('keeps only http(s) sources and contexts that contain the quote', () => {
  const cleaned = cleanAnnotation(
    item({
      context: '与 KV Cache 无关',
      sources: [
        { title: 'ok', url: 'https://example.com/a' },
        { title: 'script', url: 'javascript:alert(1)' },
        { url: 'https://example.com/untitled' },
      ],
    }),
  );
  assert.deepEqual(cleaned.sources, [{ title: 'ok', url: 'https://example.com/a' }]);
  assert.equal(cleaned.context, '与 KV Cache 无关');
  assert.equal(cleanAnnotation(item({ context: '毫不相关' })).context, undefined);
});

test('a broken file is an error, not silently empty', () => {
  assert.throws(() => readAnnotations(withFile('{oops'), KEY), /not valid JSON/);
  assert.throws(() => readAnnotations(withFile('{"annotations": []}'), KEY), /unexpected format/);
});

test('rejects chapter keys that could escape the directory', () => {
  assert.throws(() => readAnnotations('/tmp', 'ai-agents-in-depth:../x:chapter1'), /Invalid chapter key/);
});
