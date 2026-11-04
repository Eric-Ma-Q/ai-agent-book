import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listInserts,
  newInsertId,
  parseInsert,
  removeInsert,
  saveInsert,
  serializeInsert,
} from '../inserts-store.mjs';

const KEY = 'ai-agents-in-depth:zh-CN:chapter2';
const DIR = 'inserts/zh-CN/chapter2';
const fresh = () => mkdtempSync(join(tmpdir(), 'personal-inserts-'));
const draft = { after: '上下文决定能力上限', section: 'kv-cache', offset: 2, markdown: '我的理解：\n\n- 一\n' };

test('saves a new insert as a Markdown file with its anchor in frontmatter', () => {
  const root = fresh();
  const insert = saveInsert(root, KEY, draft, new Date('2026-10-04T08:30:00Z'));
  assert.match(insert.id, /^20261004-083000-[0-9a-f]{4}$/);
  const text = readFileSync(join(root, DIR, `${insert.id}.md`), 'utf8');
  assert.equal(
    text,
    '---\nafter: "上下文决定能力上限"\nsection: "kv-cache"\noffset: 2\n' +
      'created: "2026-10-04T08:30:00.000Z"\nupdated: "2026-10-04T08:30:00.000Z"\n---\n\n我的理解：\n\n- 一\n',
  );
  assert.deepEqual(listInserts(root, KEY), [insert]);
});

test('editing keeps the original anchor and creation time', () => {
  const root = fresh();
  const first = saveInsert(root, KEY, draft, new Date('2026-10-04T08:30:00Z'));
  const edited = saveInsert(
    root,
    KEY,
    { id: first.id, markdown: '改过了', after: 'ignored', section: 'other' },
    new Date('2026-10-05T00:00:00Z'),
  );
  assert.equal(edited.after, draft.after);
  assert.equal(edited.section, draft.section);
  assert.equal(edited.created, first.created);
  assert.equal(edited.updated, '2026-10-05T00:00:00.000Z');
  assert.equal(listInserts(root, KEY)[0].markdown, '改过了\n');
});

test('lists inserts in creation order and ignores non-insert files', () => {
  const root = fresh();
  const later = saveInsert(root, KEY, draft, new Date('2026-10-05T00:00:00Z'));
  const earlier = saveInsert(root, KEY, draft, new Date('2026-10-04T00:00:00Z'));
  writeFileSync(join(root, DIR, 'notes.txt'), 'x');
  assert.deepEqual(listInserts(root, KEY).map(({ id }) => id), [earlier.id, later.id]);
});

test('reads hand-written YAML frontmatter', () => {
  const root = fresh();
  mkdirSync(join(root, DIR), { recursive: true });
  writeFileSync(
    join(root, DIR, 'my-note.md'),
    '---\nafter: 段落开头\nsection: intro\noffset: 1\ncreated: 2026-10-01T00:00:00Z\n---\nBody\n',
  );
  const [insert] = listInserts(root, KEY);
  assert.equal(insert.id, 'my-note');
  assert.equal(insert.after, '段落开头');
  assert.equal(insert.created, '2026-10-01T00:00:00.000Z');
  assert.equal(insert.markdown, 'Body\n');
});

test('serialize and parse round-trip quotes and newlines in anchors', () => {
  const insert = { after: 'say "hi"\nthere: yes', section: '', offset: 0, created: 'c', updated: 'u', markdown: 'm' };
  const parsed = parseInsert('x', serializeInsert(insert));
  assert.equal(parsed.after, insert.after);
  assert.equal(parsed.markdown, 'm\n');
});

test('rejects empty text, bad offsets, unknown and path-like ids', () => {
  const root = fresh();
  assert.throws(() => saveInsert(root, KEY, { ...draft, markdown: '  ' }), /empty/);
  assert.throws(() => saveInsert(root, KEY, { ...draft, offset: -1 }), /offset/);
  assert.throws(() => saveInsert(root, KEY, { ...draft, id: 'missing' }), (e) => e.status === 404);
  assert.throws(() => saveInsert(root, KEY, { ...draft, id: '../../x' }), /Invalid id/);
  assert.throws(() => removeInsert(root, KEY, '../chapter1/x'), /Invalid id/);
});

test('remove deletes the file and tolerates a missing one', () => {
  const root = fresh();
  const insert = saveInsert(root, KEY, draft);
  removeInsert(root, KEY, insert.id);
  removeInsert(root, KEY, insert.id);
  assert.deepEqual(readdirSync(join(root, DIR)), []);
});

test('generated ids sort by time', () => {
  const a = newInsertId(new Date('2026-01-01T00:00:00Z'));
  const b = newInsertId(new Date('2026-01-01T00:00:01Z'));
  assert.ok(a < b);
});
