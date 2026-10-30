// Requirement 007 wiring: the page, the injected script, the archive boundary
// and the deployment sync path are easy to disconnect by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_FAVORITES_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the favorites page at /harness/favorites/', () => {
  assert.equal(HARNESS_FAVORITES_PATH, '/harness/favorites/');
});

test('the integration registers the page and the injected script', async () => {
  const integration = await read('../integration.mjs');
  assert.match(integration, /HARNESS_FAVORITES_PAGE/);
  assert.match(integration, /HARNESS_FAVORITES_PATH/);
  assert.match(integration, /examFavoritesFile: HARNESS_EXAM_FAVORITES/);
  const catalog = await read('../pages/harness.astro');
  assert.match(catalog, /我的收藏/);
  assert.match(catalog, /HARNESS_FAVORITES_PATH/);
});

test('the injected script covers stars, entries and reports', async () => {
  const script = await read('../harness/exam-favorites.js');
  for (const marker of [
    'data-exam-favorites',
    '/__personal/exam-favorites',
    'renderPaper',
    'showReport',
    'renderIntro',
    'data-fav',
    '收藏保存在阅读器',
  ])
    assert.ok(script.includes(marker), marker);
});

test('the page renders the list and filters on the server', async () => {
  const page = await read('../pages/harness-favorites.astro');
  for (const marker of [
    'readExamQuestions',
    'readExamFavorites',
    'data-fav-list',
    'data-fav-search',
    'data-fav-remove',
    'data-exam-filter',
    'data-fav-empty',
  ])
    assert.ok(page.includes(marker), marker);
});

test('the archived exam pages are not edited', async () => {
  for (const file of ['harness-exam.html', 'ai-pm-exam.html']) {
    const html = await read(`../harness/archive/${file}`);
    assert.ok(!html.includes('data-exam-favorites'), file);
    assert.ok(!html.includes('exam-favorites.js'), file);
  }
});

