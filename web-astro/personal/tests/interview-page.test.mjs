// Requirement 013 wiring: route, page shell, setup entry and the AI PM exam
// navigation marker. The archived pages stay untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTERVIEW_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the interview at /harness/interview/', async () => {
  assert.equal(INTERVIEW_PATH, '/harness/interview/');
  const integration = await read('../integration.mjs');
  for (const marker of ['INTERVIEW_PATH', 'INTERVIEW_PAGE', 'injectRoute({ pattern: INTERVIEW_PATH']) {
    assert.ok(integration.includes(marker), marker);
  }
  assert.match(integration, /pages\/interview\.astro/);
});

test('the page ships the setup, chat, report and bootstrap shell', async () => {
  const page = await read('../pages/interview.astro');
  for (const marker of [
    'data-iv-root',
    'data-iv-setup',
    'data-iv-form',
    'data-iv-model',
    'data-iv-topics',
    'data-iv-use-resume',
    'data-iv-session',
    'data-iv-transcript',
    'data-iv-composer',
    'data-iv-input',
    'data-iv-send',
    'data-iv-model-host',
    'data-iv-report',
    'data-iv-bootstrap',
    'data-iv-toast',
    '<noscript>',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  assert.match(page, /client\/harness\/interview\.ts/);
  assert.match(page, /client\/harness\/interview\.css/);
  assert.match(page, /client\/harness\/interview-chat\.css/);
  assert.match(page, /readExamProgress\(root, 'ai-pm'\)/);
  assert.match(page, /buildCandidateProfile/);
  assert.match(page, /readAllInterviewSessions/);
  assert.match(page, /jsonForScript/);
  assert.doesNotMatch(page, /api_key/);
});

test('the Harness directory and favorites page link to the interview', async () => {
  const harness = await read('../pages/harness.astro');
  assert.match(harness, /INTERVIEW_PATH/);
  assert.match(harness, /PRACTICE/);
  assert.match(harness, /harness-practice-card/);
  const favorites = await read('../pages/harness-favorites.astro');
  assert.match(favorites, /INTERVIEW_PATH/);
  assert.match(favorites, /模拟面试/);
});

test('the catalog practice card stays out of the 17 archived pages', async () => {
  const catalog = await read('../harness/catalog.mjs');
  assert.match(catalog, /export const PRACTICE/);
  assert.match(catalog, /href: '\/harness\/interview\/'/);
  assert.match(catalog, /export const STATS = \{ pages: 21/);
});

test('the AI PM exam nav marker and nav script are runtime-only', async () => {
  const staticSource = await read('../harness/static.mjs');
  assert.match(staticSource, /exam === 'ai-pm'/);
  assert.match(staticSource, /data-interview/);
  const nav = await read('../harness/nav.js');
  assert.match(nav, /harness\/interview\//);
  assert.match(nav, /模拟面试/);
  for (const file of ['ai-pm-exam.html', 'ai-agent-pm-career.html', 'ai-pm-resume.html']) {
    const archive = await read(`../harness/archive/${file}`);
    assert.doesNotMatch(archive, /data-interview/);
    assert.doesNotMatch(archive, /harness\/interview\//);
  }
});

test('interview records are git-ignored and not part of the archive', async () => {
  const ignore = await read('../../../personal/.gitignore');
  assert.match(ignore, /harness\/interview\//);
});
