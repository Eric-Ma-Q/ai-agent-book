import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patchNote, putNotes, readNotes, removeNote } from '../notes-store.mjs';

const KEY = 'ai-agents-in-depth:zh-CN:chapter3';
const fresh = () => mkdtempSync(join(tmpdir(), 'personal-notes-'));
const record = (id, extra = {}) => ({
  id,
  chapter: KEY,
  quote: 'agent loop',
  prefix: 'the ',
  suffix: ' runs',
  start: 4,
  end: 14,
  createdAt: `2026-10-04T00:00:0${id.length % 10}.000Z`,
  ...extra,
});

test('stores highlights in the reader backup format, drafts in a sidecar', () => {
  const root = fresh();
  putNotes(root, KEY, [record('a', { note: 'kept', noteDraft: 'typing' })]);
  const file = JSON.parse(readFileSync(join(root, 'notes/zh-CN/chapter3.json'), 'utf8'));
  assert.equal(file.format, 'ai-agent-book-highlights');
  assert.equal(file.version, 2);
  assert.deepEqual(file.highlights, [record('a', { note: 'kept' })]);
  const drafts = JSON.parse(readFileSync(join(root, 'notes/zh-CN/chapter3.drafts.json'), 'utf8'));
  assert.deepEqual(drafts, { a: 'typing' });
  assert.deepEqual(readNotes(root, KEY), [record('a', { note: 'kept', noteDraft: 'typing' })]);
});

test('returns an empty list for a chapter with no file', () => {
  assert.deepEqual(readNotes(fresh(), KEY), []);
});

test('put replaces by id and can remove in the same call', () => {
  const root = fresh();
  putNotes(root, KEY, [record('a'), record('bb')]);
  putNotes(root, KEY, [record('a', { note: 'new' })], 'bb');
  assert.deepEqual(readNotes(root, KEY), [record('a', { note: 'new' })]);
});

test('drops unknown fields from stored records', () => {
  const root = fresh();
  putNotes(root, KEY, [{ ...record('a'), injected: '<script>' }]);
  assert.equal('injected' in readNotes(root, KEY)[0], false);
});

test('rejects records for another chapter or with bad offsets', () => {
  const root = fresh();
  assert.throws(() => putNotes(root, KEY, [record('a', { chapter: 'x' })]), /Invalid highlight/);
  assert.throws(() => putNotes(root, KEY, [record('a', { end: 99 })]), /Invalid highlight/);
  assert.throws(() => putNotes(root, KEY, 'nope'), /array/);
});

test('rejects chapter keys that could escape the notes directory', () => {
  const root = fresh();
  for (const key of ['ai-agents-in-depth:../..:chapter1', 'ai-agents-in-depth:en:chapter11', '', null])
    assert.throws(() => readNotes(root, key), /Invalid chapter key/);
});

test('patch saves a note, null clears fields, drafts stay out of the tracked file', () => {
  const root = fresh();
  putNotes(root, KEY, [record('a')]);
  patchNote(root, KEY, 'a', { noteDraft: 'half' });
  assert.equal(readNotes(root, KEY)[0].noteDraft, 'half');
  assert.equal(readNotes(root, KEY)[0].note, undefined);
  patchNote(root, KEY, 'a', { note: 'done', noteDraft: null });
  assert.deepEqual(readNotes(root, KEY), [record('a', { note: 'done' })]);
  assert.equal(existsSync(join(root, 'notes/zh-CN/chapter3.drafts.json')), false);
  patchNote(root, KEY, 'a', { note: null });
  assert.deepEqual(readNotes(root, KEY), [record('a')]);
});

test('patch reports a missing highlight as 404', () => {
  const root = fresh();
  assert.throws(() => patchNote(root, KEY, 'gone', { note: 'x' }), (error) => error.status === 404);
});

test('remove returns the deleted record with its draft and deletes empty files', () => {
  const root = fresh();
  putNotes(root, KEY, [record('a', { noteDraft: 'd' })]);
  assert.deepEqual(removeNote(root, KEY, 'a'), record('a', { noteDraft: 'd' }));
  assert.equal(removeNote(root, KEY, 'a'), undefined);
  assert.equal(existsSync(join(root, 'notes/zh-CN/chapter3.json')), false);
});

test('reports a corrupt notes file instead of overwriting it', async () => {
  const root = fresh();
  const { writeAtomic } = await import('../fs-utils.mjs');
  writeAtomic(join(root, 'notes/zh-CN/chapter3.json'), '{oops');
  assert.throws(() => readNotes(root, KEY), /Corrupt JSON/);
  assert.throws(() => putNotes(root, KEY, [record('a')]), /Corrupt JSON/);
});
