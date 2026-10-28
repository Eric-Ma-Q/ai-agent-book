// Requirement 006, step 3: the catalog is the single source of truth for the
// directory page, and library.json must agree with the manifest and the files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LABS,
  LIBRARY_CATEGORIES,
  PAGES,
  PAGE_GROUPS,
  PRACTICE,
  READING_PATH,
  STATS,
} from '../harness/catalog.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.resolve(HERE, '../harness');
const MANIFEST = JSON.parse(await readFile(path.join(HARNESS, 'manifest.json'), 'utf8'));
const LIBRARY = JSON.parse(await readFile(path.join(HARNESS, 'library.json'), 'utf8'));
const byUrl = new Map(MANIFEST.files.map((file) => [file.url, file]));

test('the catalog lists 19 pages in 4 groups', () => {
  assert.equal(PAGES.length, 19);
  assert.equal(PAGE_GROUPS.length, 4);
  assert.equal(new Set(PAGES.map((page) => page.slug)).size, 19);
  assert.equal(new Set(PAGES.map((page) => page.sitePath)).size, 19);
  const groupIds = PAGE_GROUPS.map((group) => group.id);
  assert.equal(new Set(groupIds).size, 4);
  for (const page of PAGES) {
    assert.ok(groupIds.includes(page.group), `${page.slug}: known group`);
    assert.ok(page.title.length > 4, `${page.slug}: title`);
    assert.ok(page.description.length > 10, `${page.slug}: description`);
    assert.ok(page.kind.length > 0, `${page.slug}: kind`);
    assert.ok(page.tags.length > 0, `${page.slug}: tags`);
  }
  for (const group of PAGE_GROUPS) {
    assert.ok(PAGES.some((page) => page.group === group.id), `${group.id}: has pages`);
    assert.ok(group.title && group.description, `${group.id}: title and description`);
  }
  assert.deepEqual(STATS, { pages: 19, research: 19, labs: 2, topics: 4 });
});

test('the AI PM practice entry is not an archived page', () => {
  assert.equal(PRACTICE.group, 'pm');
  assert.equal(PRACTICE.href, '/harness/interview/');
  assert.equal(PRACTICE.kind, '模拟面试');
  assert.equal(PAGES.some((page) => page.href === PRACTICE.href), false);
  assert.equal(PAGES.length, 19);
});

test('every catalog page resolves to an archived file', async () => {
  for (const page of PAGES) {
    const url = `/harness/site/${page.sitePath}`;
    const file = byUrl.get(url);
    assert.ok(file, `${page.sitePath}: in manifest`);
    assert.equal(file.category, 'page');
    const info = await stat(path.join(HARNESS, file.target));
    assert.ok(info.isFile(), `${page.sitePath}: exists`);
  }
});

test('the reading path points at three archived pages', () => {
  assert.equal(READING_PATH.length, 3);
  for (const step of READING_PATH) {
    assert.match(step.step, /^\d{2}$/);
    assert.ok(step.title && step.description);
    assert.ok(byUrl.has(step.href), `${step.href}: in manifest`);
  }
});

test('two labs document their test count, command and README', async () => {
  assert.equal(LABS.length, 2);
  assert.deepEqual(
    LABS.map((lab) => lab.id),
    ['mini-harness', 'selfloop'],
  );
  for (const lab of LABS) {
    assert.ok(lab.tests > 0, `${lab.id}: tests`);
    assert.match(lab.command, /unittest discover/, `${lab.id}: command`);
    assert.match(lab.summary, /。/, `${lab.id}: summary`);
    const readme = byUrl.get(`/harness/site/${lab.readme}`);
    assert.ok(readme, `${lab.id}: README in manifest`);
    assert.equal(readme.category, 'lab');
    const info = await stat(path.join(HARNESS, readme.target));
    assert.ok(info.isFile(), `${lab.id}: README exists`);
  }
  assert.equal(LABS[0].tests, 67);
  assert.equal(LABS[0].workbench, '/harness/mini-harness/');
  assert.equal(LABS[1].tests, 14);
  assert.equal(LABS[1].workbench, '/harness/selfloop/');
});

test('library.json covers every displayable file and matches the manifest', () => {
  assert.equal(LIBRARY.format, 'harness-library');
  assert.equal(LIBRARY.total, 184);
  assert.equal(LIBRARY.metaCount, 4);
  assert.equal(LIBRARY.sourceCommit, MANIFEST.sourceCommit);

  const expectedIds = LIBRARY_CATEGORIES.map((category) => category.id);
  assert.deepEqual(
    LIBRARY.categories.map((category) => category.id),
    expectedIds,
  );

  const seen = new Set();
  let total = 0;
  for (const category of LIBRARY.categories) {
    const definition = LIBRARY_CATEGORIES.find((entry) => entry.id === category.id);
    assert.equal(category.label, definition.label);
    assert.equal(category.description, definition.description);
    assert.equal(category.count, category.files.length, `${category.id}: count`);
    total += category.count;
    for (const file of category.files) {
      assert.ok(file.title.length > 0, `${file.path}: title`);
      assert.ok(file.bytes >= 0, `${file.path}: bytes`);
      assert.ok(!seen.has(file.path), `${file.path}: unique`);
      seen.add(file.path);
      const manifestFile = byUrl.get(file.url);
      assert.ok(manifestFile, `${file.path}: in manifest`);
      assert.equal(manifestFile.target, file.path, `${file.path}: target`);
      assert.equal(manifestFile.bytes, file.bytes, `${file.path}: bytes`);
      assert.equal(manifestFile.category, definition.category, `${file.path}: category`);
    }
  }
  assert.equal(total, LIBRARY.total);
  const archived = MANIFEST.files.filter((file) => file.category !== 'meta');
  assert.equal(seen.size, archived.length);
  assert.equal(
    LIBRARY.total + LIBRARY.metaCount,
    MANIFEST.fileCount,
  );
});

test('library.json counts match the manifest per category', () => {
  for (const category of LIBRARY.categories) {
    const definition = LIBRARY_CATEGORIES.find((entry) => entry.id === category.id);
    assert.equal(category.count, MANIFEST.counts[definition.category], `${category.id}: manifest count`);
  }
});
