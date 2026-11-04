// Requirement 008: pure merge/normalize rules used by the injected script.
// Importing the script in Node stops before the DOM branch, so there is no
// browser or happy-dom dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../harness/exam-progress.js';

const { normalizeStore, mergeStores, hasData } = globalThis.ExamProgress;

const attempt = (id, submittedAt) => ({
  id,
  mode: 'exam',
  qids: ['A1'],
  submittedAt,
  answers: {},
  self: {},
  scores: {},
});
const draft = (startedAt) => ({
  mode: 'practice',
  qids: ['A1'],
  answers: {},
  flags: [],
  checked: {},
  self: {},
  startedAt,
  elapsedMs: 0,
});

test('normalizes a store without sharing references and caps attempts', () => {
  const input = {
    schema: 9,
    draft: draft(1),
    attempts: Array.from({ length: 35 }, (_, index) =>
      attempt(`a${index}`, index),
    ),
    mistakes: { A1: { wrong: 1, lastWrong: 2, streak: 0 } },
  };
  const normalized = normalizeStore(input);
  assert.equal(normalized.schema, 1);
  assert.equal(normalized.draft.startedAt, 1);
  assert.equal(normalized.attempts.length, 30);
  assert.equal(normalized.attempts[0].id, 'a5');
  normalized.draft.startedAt = 99;
  normalized.mistakes.A1.wrong = 99;
  assert.equal(input.draft.startedAt, 1);
  assert.equal(input.mistakes.A1.wrong, 1);
});

test('normalizes missing or wrong-shaped fields to empty values', () => {
  for (const value of [null, undefined, 'x', 42, []]) {
    const normalized = normalizeStore(value);
    assert.deepEqual(normalized, {
      schema: 1,
      draft: null,
      attempts: [],
      mistakes: {},
    });
  }
  const wrong = normalizeStore({ draft: [], attempts: {}, mistakes: [] });
  assert.deepEqual(wrong, {
    schema: 1,
    draft: null,
    attempts: [],
    mistakes: {},
  });
});

test('merges attempts by id, prefers the server copy and keeps the latest 30', () => {
  const server = {
    schema: 1,
    draft: null,
    attempts: [attempt('a1', 1), attempt('a2', 2)],
    mistakes: {},
  };
  const local = {
    schema: 1,
    draft: null,
    attempts: [attempt('a2', 99), attempt('a3', 3)],
    mistakes: {},
  };
  const merged = mergeStores(server, local);
  assert.deepEqual(
    merged.attempts.map((item) => [item.id, item.submittedAt]),
    [
      ['a1', 1],
      ['a2', 2],
      ['a3', 3],
    ],
  );
  assert.equal(merged.attempts.length, 3);

  const many = Array.from({ length: 40 }, (_, index) =>
    attempt(`m${index}`, index),
  );
  const capped = mergeStores(
    { schema: 1, draft: null, attempts: many.slice(0, 20), mistakes: {} },
    { schema: 1, draft: null, attempts: many.slice(20), mistakes: {} },
  );
  assert.equal(capped.attempts.length, 30);
  assert.equal(capped.attempts[0].id, 'm10');
  assert.equal(capped.attempts.at(-1).id, 'm39');
});

test('merges mistakes by the latest lastWrong and keeps one-sided records', () => {
  const merged = mergeStores(
    {
      schema: 1,
      draft: null,
      attempts: [],
      mistakes: {
        A1: { wrong: 1, lastWrong: 10, streak: 1 },
        A2: { wrong: 2, lastWrong: 20, streak: 0 },
      },
    },
    {
      schema: 1,
      draft: null,
      attempts: [],
      mistakes: {
        A1: { wrong: 2, lastWrong: 30, streak: 0 },
        A2: { wrong: 2, lastWrong: 5, streak: 0 },
        A3: { wrong: 1, lastWrong: 1, streak: 0 },
      },
    },
  );
  assert.equal(merged.mistakes.A1.lastWrong, 30);
  assert.equal(merged.mistakes.A1.wrong, 2);
  assert.equal(merged.mistakes.A2.lastWrong, 20);
  assert.equal(merged.mistakes.A3.lastWrong, 1);
});

test('merges drafts by startedAt with the server winning ties', () => {
  const server = { schema: 1, draft: draft(10), attempts: [], mistakes: {} };
  const local = { schema: 1, draft: draft(20), attempts: [], mistakes: {} };
  assert.equal(mergeStores(server, local).draft.startedAt, 20);
  assert.equal(mergeStores(local, server).draft.startedAt, 20);
  assert.equal(
    mergeStores({ ...server, draft: null }, local).draft.startedAt,
    20,
  );
  assert.equal(
    mergeStores(server, { ...local, draft: null }).draft.startedAt,
    10,
  );
  assert.equal(
    mergeStores({ ...server, draft: null }, { ...local, draft: null }).draft,
    null,
  );
  const tied = mergeStores(
    { ...server, draft: { ...draft(10), mode: 'exam' } },
    { ...local, draft: { ...draft(10), mode: 'practice' } },
  );
  assert.equal(tied.draft.mode, 'exam');
});

test('hasData only treats a draft, attempts or mistakes as real data', () => {
  assert.equal(
    hasData({ schema: 1, draft: null, attempts: [], mistakes: {} }),
    false,
  );
  assert.equal(
    hasData({ schema: 1, draft: draft(1), attempts: [], mistakes: {} }),
    true,
  );
  assert.equal(
    hasData({
      schema: 1,
      draft: null,
      attempts: [attempt('a1', 1)],
      mistakes: {},
    }),
    true,
  );
  assert.equal(
    hasData({
      schema: 1,
      draft: null,
      attempts: [],
      mistakes: { A1: { wrong: 1 } },
    }),
    true,
  );
  assert.equal(hasData(null), false);
});
