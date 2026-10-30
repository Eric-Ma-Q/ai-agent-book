// Requirement 034 wiring: route, page shell, shared data, directory entry and
// the link from the mock interview page. Read-only: no browser, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTERVIEW_GUIDE_PATH } from '../routes.mjs';
import {
  CHECKS,
  JD_LAYERS,
  PHASES as GUIDE_PHASES,
  READERS,
  SECTIONS,
  SOURCES,
  STEPS,
} from '../harness/interview-guide.mjs';
import { PHASES as INTERVIEW_PHASES } from '../harness/interview-profile.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the guide at /harness/interview-guide/', async () => {
  assert.equal(INTERVIEW_GUIDE_PATH, '/harness/interview-guide/');
  const integration = await read('../integration.mjs');
  for (const marker of ['INTERVIEW_GUIDE_PATH', 'INTERVIEW_GUIDE_PAGE', 'pages/interview-guide.astro']) {
    assert.ok(integration.includes(marker), marker);
  }
  assert.match(integration, /injectRoute\(\{ pattern: INTERVIEW_GUIDE_PATH/);
  const routes = await read('../routes.mjs');
  assert.match(routes, /export const INTERVIEW_GUIDE_PATH = '\/harness\/interview-guide\/'/);
});

test('the page carries nine sections, a toc and the print hook', async () => {
  const page = await read('../pages/interview-guide.astro');
  assert.equal(SECTIONS.length, 9);
  for (const section of SECTIONS) {
    assert.match(section.id, /^s\d+$/);
    assert.ok(section.title.length >= 3, section.title);
    assert.ok(page.includes(`id="${section.id}"`), `${section.id}: anchor`);
    assert.ok(page.includes(`data-ig-toc-link={section.id}`), `${section.id}: toc`);
  }
  for (const marker of [
    'data-ig-toc',
    'data-ig-section',
    'data-ig-print',
    'data-ig-builder',
    'data-ig-template',
    'data-ig-scene',
    'data-ig-move',
    'data-ig-result',
    'data-ig-method',
    'data-ig-output',
    'data-ig-copy',
    '<noscript>',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  assert.match(page, /client\/harness\/interview-guide\.css/);
  assert.match(page, /client\/harness\/interview-guide\.ts/);
  assert.doesNotMatch(page, /http:\/\/127\.0\.0\.1/);
});

test('the shared data stays complete', () => {
  assert.equal(STEPS.length, 5);
  for (const step of STEPS) {
    for (const key of ['no', 'title', 'ask', 'input', 'action', 'output', 'check']) {
      assert.ok(step[key], `${step.id}: ${key}`);
    }
  }
  assert.equal(CHECKS.length, 10);
  assert.ok(new Set(CHECKS).size === CHECKS.length, 'checks are unique');
  assert.equal(READERS.length, 4);
  assert.equal(JD_LAYERS.length, 4);
  for (const layer of JD_LAYERS) {
    for (const key of ['title', 'detail', 'action', 'example']) {
      assert.ok(layer[key], `${layer.id}: ${key}`);
    }
  }
});

test('sources are traceable and every citation resolves', async () => {
  assert.ok(SOURCES.length >= 30, `sources: ${SOURCES.length}`);
  const ids = SOURCES.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const source of SOURCES) {
    assert.match(source.id, /^S\d+$/);
    assert.match(source.url, /^https:\/\//, source.id);
    assert.match(source.date, /^\d{4}(-\d{2})?$/, source.id);
    assert.ok(source.org && source.title && source.kind && source.note, source.id);
  }

  const page = await read('../pages/interview-guide.astro');
  const cited = new Set(Array.from(page.matchAll(/<Cite id="(S\d+)"/g), (match) => match[1]));
  assert.ok(cited.size >= 30, `cited: ${cited.size}`);
  for (const id of cited) assert.ok(ids.includes(id), `${id}: missing source`);
  for (const id of ids) assert.ok(cited.has(id), `${id}: never cited`);
});

test('the guide and the mock interview share the same eight rounds', () => {
  assert.equal(GUIDE_PHASES.length, 8);
  assert.deepEqual(
    GUIDE_PHASES.map((phase) => phase.id),
    INTERVIEW_PHASES.map((phase) => phase.id),
  );
  assert.deepEqual(
    GUIDE_PHASES.map((phase) => phase.label),
    INTERVIEW_PHASES.map((phase) => phase.label),
  );
  for (const phase of GUIDE_PHASES) {
    for (const key of ['verify', 'structure', 'pitfall', 'practice']) {
      assert.ok(phase[key], `${phase.id}: ${key}`);
    }
  }
});

test('the directory and the interview page link to the guide', async () => {
  const catalog = await read('../harness/catalog.mjs');
  assert.match(catalog, /export const GUIDE/);
  assert.match(catalog, /href: '\/harness\/interview-guide\/'/);
  assert.match(catalog, /group: 'pm'/);
  assert.match(catalog, /STATS = \{ pages: 22/);

  const harness = await read('../pages/harness.astro');
  assert.match(harness, /import \{ GUIDE,/);
  assert.match(harness, /\[PRACTICE, GUIDE\]\.map/);

  const interview = await read('../pages/interview.astro');
  assert.match(interview, /INTERVIEW_GUIDE_PATH/);
  assert.match(interview, /先读面试与简历方法/);
});

test('styles cover print, reduced motion and small screens', async () => {
  const css = await read('../client/harness/interview-guide.css');
  assert.match(css, /@media print/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /max-width: 640px/);
  assert.match(css, /\.ig-table-wrap\s*\{[^}]*overflow-x: auto/s);
  assert.match(css, /\.ig-cite/);
});

test('the 2026 supplement stays on the page', async () => {
  const page = await read('../pages/interview-guide.astro');
  for (const marker of [
    '2026 的新变化',
    '现场轮替代 take-home',
    '上下文工程',
    '评测样本',
    'FDE（前线部署工程师）',
    'AI 可以帮你改措辞',
    '<Cite id="S29" />',
    '<Cite id="S31" />',
    '<Cite id="S33" />',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  const sources = await read('../harness/interview-guide.mjs');
  assert.match(sources, /id: 'S33'/);
  assert.match(sources, /id: 'S31'/);
});
