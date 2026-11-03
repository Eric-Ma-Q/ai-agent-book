// Requirement 008: one server store per exam, with an optional clear tombstone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_ATTEMPTS,
  MAX_PROGRESS_BYTES,
  readExamProgress,
  saveExamProgress,
} from '../harness/exam-progress-store.mjs';
import { examProgressFile } from '../paths.mjs';

const FORMAT = 'harness-exam-progress';
const draft = {
  mode: 'practice',
  qids: ['A1'],
  answers: { A1: ['循环'] },
  flags: [],
  checked: {},
  self: {},
  startedAt: 1000,
  elapsedMs: 2000,
};
const attempt = {
  id: 'a1',
  mode: 'exam',
  qids: ['A1'],
  startedAt: 1000,
  submittedAt: 2000,
  durationMs: 1000,
  answers: { A1: ['循环'] },
  self: {},
  scores: { A1: { got: 2, max: 2, status: 'ok' } },
  total: 2,
  max: 2,
  autoGot: 2,
  autoMax: 2,
  selfGot: 0,
  selfMax: 0,
};
const mistakes = { A1: { wrong: 1, lastWrong: 2000, streak: 0 } };
const emptyStore = () => ({
  schema: 1,
  draft: null,
  attempts: [],
  mistakes: {},
});
const sampleStore = () => ({
  schema: 1,
  draft,
  attempts: [attempt],
  mistakes,
});

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'exam-progress-'));
}
function removeRoot(root) {
  rmSync(root, { recursive: true, force: true });
}
const status = (code) => (error) => error?.status === code;
function writeRaw(root, exam, value) {
  const file = examProgressFile(root, exam);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}
function record(exam, store, extra = {}) {
  return {
    format: FORMAT,
    version: 1,
    exam,
    updatedAt: '2026-10-18T00:00:00.000Z',
    clearedAt: null,
    store,
    ...extra,
  };
}

test('returns exists:false before the file is written', () => {
  const root = tempRoot();
  try {
    assert.deepEqual(readExamProgress(root, 'harness'), {
      exists: false,
      exam: 'harness',
    });
    assert.equal(
      examProgressFile(root, 'harness'),
      join(root, 'harness', 'progress', 'harness.json'),
    );
  } finally {
    removeRoot(root);
  }
});

test('saves and reads a full store with a server timestamp', () => {
  const root = tempRoot();
  try {
    const saved = saveExamProgress(root, 'harness', sampleStore());
    assert.equal(saved.exam, 'harness');
    assert.equal(saved.clearedAt, null);
    assert.ok(!Number.isNaN(Date.parse(saved.updatedAt)));
    const file = JSON.parse(
      readFileSync(examProgressFile(root, 'harness'), 'utf8'),
    );
    assert.equal(file.format, FORMAT);
    assert.equal(file.version, 1);
    assert.equal(file.exam, 'harness');
    assert.equal(file.store.draft.mode, 'practice');
    assert.equal(file.store.attempts.length, 1);
    const read = readExamProgress(root, 'harness');
    assert.equal(read.exists, true);
    assert.equal(read.updatedAt, saved.updatedAt);
    assert.deepEqual(read.store, sampleStore());
    assert.equal(readExamProgress(root, 'ai-pm').exists, false);
  } finally {
    removeRoot(root);
  }
});

test('clearing writes a tombstone and later saves preserve it', () => {
  const root = tempRoot();
  try {
    saveExamProgress(root, 'harness', sampleStore());
    const cleared = saveExamProgress(root, 'harness', emptyStore(), {
      cleared: true,
    });
    assert.ok(cleared.clearedAt);
    assert.deepEqual(cleared.store, emptyStore());
    const read = readExamProgress(root, 'harness');
    assert.equal(read.clearedAt, cleared.clearedAt);
    assert.deepEqual(read.store, emptyStore());

    const later = saveExamProgress(root, 'harness', sampleStore());
    assert.equal(later.clearedAt, cleared.clearedAt);
    assert.equal(readExamProgress(root, 'harness').store.attempts.length, 1);
  } finally {
    removeRoot(root);
  }
});

test('a normal save refuses a corrupt file, while clearing can recover it', () => {
  const root = tempRoot();
  try {
    writeRaw(root, 'harness', '{');
    assert.throws(() => readExamProgress(root, 'harness'), status(500));
    assert.throws(
      () => saveExamProgress(root, 'harness', sampleStore()),
      status(500),
    );
    const cleared = saveExamProgress(root, 'harness', emptyStore(), {
      cleared: true,
    });
    assert.ok(cleared.clearedAt);
    assert.equal(readExamProgress(root, 'harness').store.attempts.length, 0);
  } finally {
    removeRoot(root);
  }
});

test('rejects unknown exams and malformed stores', () => {
  const root = tempRoot();
  try {
    assert.throws(() => readExamProgress(root, 'nope'), status(400));
    assert.throws(
      () => saveExamProgress(root, 'nope', sampleStore()),
      status(400),
    );
    const bad = [
      { schema: 2, draft: null, attempts: [], mistakes: {} },
      { schema: 1, draft: null, attempts: [], mistakes: [] },
      { schema: 1, draft: null, attempts: [], mistakes: { A1: { wrong: 1 } } },
      { schema: 1, draft: { mode: 'exam' }, attempts: [], mistakes: {} },
      { schema: 1, draft: null, attempts: [{ id: 'a1' }], mistakes: {} },
      {
        schema: 1,
        draft: null,
        attempts: Array.from({ length: MAX_ATTEMPTS + 1 }, (_, index) => ({
          ...attempt,
          id: `a${index}`,
        })),
        mistakes: {},
      },
    ];
    for (const store of bad)
      assert.throws(
        () => saveExamProgress(root, 'harness', store),
        status(400),
      );
    assert.equal(readExamProgress(root, 'harness').exists, false);
    assert.throws(
      () => saveExamProgress(root, 'harness', emptyStore(), { cleared: 'yes' }),
      status(400),
    );
  } finally {
    removeRoot(root);
  }
});

test('rejects a store over 2 MB', () => {
  const root = tempRoot();
  try {
    const store = emptyStore();
    store.attempts = [
      {
        ...attempt,
        answers: { A1: ['x'.repeat(MAX_PROGRESS_BYTES + 1)] },
      },
    ];
    assert.throws(() => saveExamProgress(root, 'harness', store), status(413));
  } finally {
    removeRoot(root);
  }
});

test('rejects malformed file metadata and exam mismatches', () => {
  const cases = [
    '{',
    record('harness', emptyStore(), { format: 'wrong' }),
    record('harness', emptyStore(), { version: 2 }),
    record('harness', emptyStore(), { updatedAt: 1 }),
    record('harness', emptyStore(), { clearedAt: 1 }),
    record('harness', emptyStore(), { exam: 'ai-pm' }),
    record('nope', emptyStore()),
  ];
  for (const value of cases) {
    const root = tempRoot();
    try {
      writeRaw(root, 'harness', value);
      assert.throws(
        () => readExamProgress(root, 'harness'),
        status(500),
        JSON.stringify(value).slice(0, 80),
      );
    } finally {
      removeRoot(root);
    }
  }
});
