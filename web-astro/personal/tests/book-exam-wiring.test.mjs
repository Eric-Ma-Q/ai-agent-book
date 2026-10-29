// Requirement 010 wiring: landing page, A/B endpoint, header entry, favorites
// and progress reuse. These checks read the source files rather than booting
// Astro, so they stay fast and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMS } from '../harness/exams.mjs';
import { injectNav } from '../harness/static.mjs';
import { BOOK_EXAM_PATH, HARNESS_FAVORITES_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the landing page and the A/B paper route', async () => {
  assert.equal(BOOK_EXAM_PATH, '/book-exam/');
  assert.equal(HARNESS_FAVORITES_PATH, '/harness/favorites/');
  const integration = await read('../integration.mjs');
  for (const marker of [
    'BOOK_EXAM_PATH',
    'BOOK_EXAM_PAGE',
    'BOOK_EXAM_PAPER_PAGE',
    'CLIENT_BOOK_EXAM_ENTRY',
    "pattern: `${BOOK_EXAM_PATH.slice(0, -1)}/[paper]`",
  ])
    assert.ok(integration.includes(marker), marker);
});

test('the two book papers are registered for favorites and progress', () => {
  const ids = EXAMS.map((exam) => exam.id);
  assert.deepEqual(ids, ['harness', 'ai-pm', 'book-a', 'book-b']);
  for (const id of ['book-a', 'book-b']) {
    const exam = EXAMS.find((item) => item.id === id);
    assert.ok(exam, id);
    assert.equal(exam.source, 'book', id);
    assert.match(exam.href, /^\/book-exam\/[ab]\/$/, id);
    assert.match(exam.file, /^ai-agent-book-exam-[ab]\.html$/, id);
  }
});

test('the [paper] endpoint injects progress, favorites and the floating nav', async () => {
  const endpoint = await read('../pages/book-exam/[paper].ts');
  for (const marker of [
    'injectExamProgress',
    'injectExamFavorites',
    'injectNav',
    'injectPageAssistant',
    'BOOK_EXAM_PATH',
    "homeLabel: '结业考试'",
    "homeShort: '试卷'",
    'paper.examId',
    'favoritesHref',
    '/harness/exam-progress.js',
    '/harness/exam-favorites.js',
    '/personal/client/page-assistant.ts',
    'PAPERS',
    'getStaticPaths',
    'rewriteAuthorBookLinks',
    'reader-links.mjs',
  ])
    assert.ok(endpoint.includes(marker), marker);
});

test('reader surfaces map book sources to local chapter routes', async () => {
  const endpoint = await read('../pages/book-exam/[paper].ts');
  assert.match(endpoint, /rewriteAuthorBookLinks\(html\)/);
  const favorites = await read('../pages/harness-favorites.astro');
  assert.match(favorites, /readerBookHref\(source\.href\)/);
  const build = await read('../exams/build.mjs');
  assert.ok(!build.includes('https://bojieli.github.io'), 'chapter URLs come from reader-links.mjs');
});

test('the landing page loads the floating nav with only the reader link', async () => {
  const page = await read('../pages/book-exam.astro');
  assert.match(page, /src=\{withBase\('\/harness\/nav\.js'\)\}/);
  assert.match(page, /data-home-href="none"/);
  assert.match(page, /data-base=\{withBase\('\/'\)\}/);
});

test('injectNav keeps the default archive tag and supports exam options', () => {
  const html = '<!doctype html><html><body><h1>Exam</h1></body></html>';
  const archive = injectNav(html, '/');
  assert.match(archive, /<script src="\/harness\/nav\.js" data-harness-nav data-base="\/" defer><\/script>/);
  const exam = injectNav(html, '/', {
    homeHref: '/book-exam/',
    homeLabel: '结业考试',
    homeShort: '试卷',
    homeIcon: '▤',
  });
  assert.match(exam, /data-home-href="\/book-exam\/"/);
  assert.match(exam, /data-home-label="结业考试"/);
  assert.match(exam, /data-home-short="试卷"/);
  assert.match(exam, /data-home-icon="▤"/);
  assert.doesNotMatch(exam, /data-interview/);
  assert.equal(exam.match(/data-harness-nav/g).length, 1);
});

test('the landing page links both papers and the shared favorites page', async () => {
  const page = await read('../pages/book-exam.astro');
  for (const marker of [
    'PAPERS',
    'paperQuestions',
    'paper.route',
    'HARNESS_FAVORITES_PATH',
    'A 卷',
    'B 卷',
  ])
    assert.ok(page.includes(marker), marker);
});

test('the favorites page reads book questions and uses each exam href', async () => {
  const page = await read('../pages/harness-favorites.astro');
  assert.match(page, /readExamQuestions\(ARCHIVE, \{ bookRoot: EXAMS_ROOT \}\)/);
  assert.match(page, /examHref/);
  assert.match(page, /card\.examHref/);
  assert.match(page, /BOOK_EXAM_PATH/);
});

test('the favorites script accepts a per-exam favorites link', async () => {
  const script = await read('../harness/exam-favorites.js');
  assert.match(script, /dataset\.favoritesHref/);
  assert.match(script, /FAVORITES_HREF/);
  assert.doesNotMatch(script, /link\.href = '\.\.\/favorites\/'/);
});

test('the header entry points at the book exam and marks the current page', async () => {
  const entry = await read('../client/book-exam-entry.ts');
  for (const marker of ['BOOK_EXAM_PATH', 'aria-current', 'header-tools', '结业考试'])
    assert.ok(entry.includes(marker), marker);
});
