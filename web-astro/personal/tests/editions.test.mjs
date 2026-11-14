import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editionStubs, headingStub, parseEditions } from '../editions.mjs';

test('parses the editions to keep, defaulting to Chinese only', () => {
  assert.deepEqual([...parseEditions()], ['book']);
  assert.deepEqual([...parseEditions('')], ['book']);
  assert.deepEqual([...parseEditions('book, book-en')], ['book', 'book-en']);
  assert.equal(parseEditions('all'), null);
});

test('stub keeps headings in order, skips code fences, puts the notice after the title', () => {
  const source = [
    '# Chapter title {.unnumbered}',
    'Intro prose.',
    '## Section A',
    '```python',
    '# not a heading',
    '```',
    '### Sub A',
    'More prose with a # sign.',
    '~~~',
    '## inside tilde fence',
    '~~~',
    '## Section B {#sec:b}',
  ].join('\n');
  assert.equal(
    headingStub(source, 'NOTE'),
    '# Chapter title {.unnumbered}\n\n> NOTE\n\n## Section A\n\n### Sub A\n\n## Section B {#sec:b}\n',
  );
});

test('stub keeps a footnote when the source has footnotes', () => {
  assert.equal(
    headingStub('# T\ntext[^1]\n## A\n\n[^1]: source', 'N'),
    '# T\n\n> N[^stub]\n\n## A\n\n[^stub]: —\n',
  );
});

test('stub without a level-1 title starts with the notice', () => {
  assert.equal(headingStub('## A\ntext', 'N'), '> N\n\n## A\n');
});

function setup(keep) {
  const root = mkdtempSync(join(tmpdir(), 'personal-editions-'));
  for (const dir of ['book', 'book-en']) {
    mkdirSync(join(root, dir));
    writeFileSync(join(root, dir, 'chapter3.md'), '# Title\nprose\n## Part\n');
  }
  const cacheDir = join(root, 'cache');
  const plugin = editionStubs({ keep, cacheDir, notice: 'N' });
  const context = { resolve: async (source) => ({ id: join(root, source.replace(/^(\.\.\/)+/, '')) }) };
  const resolve = (source) => plugin.resolveId.call(context, source, '/x/[chapter].astro', {});
  return { root, cacheDir, resolve };
}

test('redirects other editions to a stub that keeps the edition directory name', async () => {
  const { cacheDir, resolve } = setup(parseEditions());
  const stub = await resolve('../../../../book-en/chapter3.md');
  assert.equal(stub, join(cacheDir, 'book-en', 'chapter3.md'));
  assert.equal(readFileSync(stub, 'utf8'), '# Title\n\n> N\n\n## Part\n');
});

test('leaves kept editions, raw imports and other files alone', async () => {
  const { resolve } = setup(parseEditions());
  assert.equal(await resolve('../../../../book/chapter3.md'), null);
  assert.equal(await resolve('../../../../book-en/chapter3.md?raw'), null);
  assert.equal(await resolve('../lib/i18n.ts'), null);
});

test('does nothing when every edition is kept', async () => {
  const { resolve } = setup(parseEditions('all'));
  assert.equal(await resolve('../../../../book-en/chapter3.md'), null);
});
