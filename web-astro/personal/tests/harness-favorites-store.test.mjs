// Requirement 007: favorites are a server-side JSON file keyed by exam + id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_FAVORITES,
  readExamFavorites,
  setExamFavorite,
} from '../harness/favorites-store.mjs';
import { examFavoritesFile, personalRoot } from '../paths.mjs';
import { writeJson } from '../fs-utils.mjs';

const FORMAT = 'harness-exam-favorites';

function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'favorites-store-'));
}
function removeRoot(root) {
  rmSync(root, { recursive: true, force: true });
}
function writeRaw(root, value) {
  const file = examFavoritesFile(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}
const status = (code) => (error) => error?.status === code;

test('returns an empty collection before the file exists', () => {
  const root = tempRoot();
  try {
    assert.deepEqual(readExamFavorites(root), {
      format: FORMAT,
      version: 1,
      updatedAt: null,
      items: [],
    });
  } finally {
    removeRoot(root);
  }
});

test('adds, repeats and removes a favorite', () => {
  const root = tempRoot();
  try {
    const added = setExamFavorite(root, {
      exam: 'harness',
      id: 'C14',
      favorite: true,
    });
    assert.equal(added.favorite, true);
    assert.equal(added.items.length, 1);
    assert.equal(added.items[0].exam, 'harness');
    assert.equal(added.items[0].id, 'C14');
    assert.ok(!Number.isNaN(Date.parse(added.items[0].addedAt)));

    const stored = JSON.parse(readFileSync(examFavoritesFile(root), 'utf8'));
    assert.equal(stored.format, FORMAT);
    assert.equal(stored.version, 1);
    assert.equal(stored.items.length, 1);
    assert.ok(stored.updatedAt);

    const repeated = setExamFavorite(root, {
      exam: 'harness',
      id: 'C14',
      favorite: true,
    });
    assert.equal(repeated.items.length, 1);
    assert.equal(repeated.items[0].addedAt, added.items[0].addedAt);

    const removed = setExamFavorite(root, {
      exam: 'harness',
      id: 'C14',
      favorite: false,
    });
    assert.equal(removed.favorite, false);
    assert.deepEqual(removed.items, []);
    const after = readExamFavorites(root);
    assert.deepEqual(after.items, []);
    assert.ok(after.updatedAt);
  } finally {
    removeRoot(root);
  }
});

test('keeps both banks and sorts the file deterministically', () => {
  const root = tempRoot();
  try {
    setExamFavorite(root, { exam: 'harness', id: 'A1', favorite: true });
    setExamFavorite(root, { exam: 'ai-pm', id: 'G1', favorite: true });
    setExamFavorite(root, { exam: 'harness', id: 'G7', favorite: true });
    const stored = JSON.parse(readFileSync(examFavoritesFile(root), 'utf8'));
    assert.deepEqual(
      stored.items.map((item) => `${item.exam}:${item.id}`),
      stored.items
        .slice()
        .sort(
          (a, b) =>
            a.addedAt.localeCompare(b.addedAt) ||
            a.exam.localeCompare(b.exam) ||
            a.id.localeCompare(b.id),
        )
        .map((item) => `${item.exam}:${item.id}`),
    );
    assert.equal(readExamFavorites(root).items.length, 3);
  } finally {
    removeRoot(root);
  }
});

test('rejects invalid exams, ids, booleans and bodies', () => {
  const root = tempRoot();
  try {
    const invalid = [
      null,
      { exam: 'nope', id: 'A1', favorite: true },
      { exam: 'harness', id: 'a1', favorite: true },
      { exam: 'harness', id: 'A', favorite: true },
      { exam: 'harness', id: 'A1234', favorite: true },
      { exam: 'harness', id: '1A', favorite: true },
      { exam: 'harness', id: 'A1', favorite: 'true' },
      { exam: 'harness', id: 'A1' },
    ];
    for (const body of invalid)
      assert.throws(
        () => setExamFavorite(root, body),
        status(400),
        JSON.stringify(body),
      );
  } finally {
    removeRoot(root);
  }
});

test('caps the collection at 500 favorites', () => {
  const root = tempRoot();
  try {
    const items = Array.from({ length: MAX_FAVORITES }, (_, index) => ({
      exam: 'harness',
      id: `A${index + 1}`,
      addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    }));
    writeJson(examFavoritesFile(root), {
      format: FORMAT,
      version: 1,
      updatedAt: items.at(-1).addedAt,
      items,
    });
    assert.equal(readExamFavorites(root).items.length, MAX_FAVORITES);
    assert.throws(
      () =>
        setExamFavorite(root, { exam: 'harness', id: 'B1', favorite: true }),
      status(400),
    );
    const removed = setExamFavorite(root, {
      exam: 'harness',
      id: 'A1',
      favorite: false,
    });
    assert.equal(removed.items.length, MAX_FAVORITES - 1);
    assert.equal(
      setExamFavorite(root, { exam: 'harness', id: 'B1', favorite: true }).items
        .length,
      MAX_FAVORITES,
    );
  } finally {
    removeRoot(root);
  }
});

test('rejects malformed files instead of guessing', () => {
  const cases = [
    '{',
    { format: 'wrong', version: 1, updatedAt: null, items: [] },
    { format: FORMAT, version: 2, updatedAt: null, items: [] },
    { format: FORMAT, version: 1, updatedAt: 1, items: [] },
    { format: FORMAT, version: 1, updatedAt: null, items: {} },
    {
      format: FORMAT,
      version: 1,
      updatedAt: null,
      items: [{ exam: 'nope', id: 'A1' }],
    },
    {
      format: FORMAT,
      version: 1,
      updatedAt: null,
      items: [
        { exam: 'harness', id: 'A1', addedAt: '2026-10-18T00:00:00.000Z' },
        { exam: 'harness', id: 'A1', addedAt: '2026-10-18T00:00:00.000Z' },
      ],
    },
  ];
  for (const value of cases) {
    const root = tempRoot();
    try {
      writeRaw(root, value);
      assert.throws(
        () => readExamFavorites(root),
        status(500),
        JSON.stringify(value).slice(0, 80),
      );
    } finally {
      removeRoot(root);
    }
  }
});

test('derives the file under <root>/harness and honors PERSONAL_DIR', () => {
  const root = tempRoot();
  const previous = process.env.PERSONAL_DIR;
  try {
    assert.equal(
      examFavoritesFile(root),
      join(root, 'harness', 'favorites.json'),
    );
    process.env.PERSONAL_DIR = root;
    assert.equal(personalRoot(), root);
  } finally {
    if (previous === undefined) delete process.env.PERSONAL_DIR;
    else process.env.PERSONAL_DIR = previous;
    removeRoot(root);
  }
});
