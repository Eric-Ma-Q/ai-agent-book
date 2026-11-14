import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorFor, locate, normalizeText } from '../client/anchor.ts';

const blocks = [
  { text: 'Intro paragraph' },
  { text: 'Context', heading: 'context' },
  { text: 'First context paragraph' },
  { text: 'Repeated line' },
  { text: 'Tools', heading: 'tools' },
  { text: 'Repeated line' },
  { text: 'Last tools paragraph' },
];

test('normalizes whitespace', () => {
  assert.equal(normalizeText('  a \n\t b '), 'a b');
});

test('anchor records text, section and offset from the heading', () => {
  assert.deepEqual(anchorFor(blocks, 3), { after: 'Repeated line', section: 'context', offset: 2 });
  assert.deepEqual(anchorFor(blocks, 0), { after: 'Intro paragraph', section: '', offset: 1 });
  assert.deepEqual(anchorFor(blocks, 4), { after: 'Tools', section: 'tools', offset: 0 });
});

test('locates every block it anchored, including repeated text', () => {
  blocks.forEach((_, index) =>
    assert.deepEqual(locate(blocks, anchorFor(blocks, index)), { index, exact: true }),
  );
});

test('finds moved text even in another section', () => {
  const shuffled = [blocks[4], blocks[2], blocks[1]];
  assert.deepEqual(locate(shuffled, anchorFor(blocks, 2)), { index: 1, exact: true });
});

test('falls back to the same slot in the section when the text changed', () => {
  const edited = blocks.map((block, index) => (index === 2 ? { text: 'Rewritten upstream' } : block));
  assert.deepEqual(locate(edited, anchorFor(blocks, 2)), { index: 2, exact: false });
});

test('clamps the fallback to the end of a shortened section', () => {
  const shortened = blocks.filter((_, index) => index !== 2 && index !== 3);
  assert.deepEqual(locate(shortened, { after: 'Deleted upstream', section: 'context', offset: 2 }), {
    index: 1,
    exact: false,
  });
});

test('gives up when the section heading is gone', () => {
  const withoutTools = blocks.slice(0, 4);
  assert.equal(locate(withoutTools, { after: 'gone', section: 'tools', offset: 1 }), null);
});

test('text before the first heading falls back without a section', () => {
  assert.deepEqual(locate(blocks, { after: 'changed intro', section: '', offset: 1 }), { index: 0, exact: false });
  assert.equal(locate(blocks.slice(1), { after: 'changed intro', section: '', offset: 1 }), null);
});
