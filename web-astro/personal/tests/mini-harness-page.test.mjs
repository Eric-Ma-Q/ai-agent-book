// Requirement 009 wiring: the page, route, catalog entry and browser-only
// simulator are easy to disconnect by accident. Keep the archive untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MINI_HARNESS_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the workbench at /harness/mini-harness/', async () => {
  assert.equal(MINI_HARNESS_PATH, '/harness/mini-harness/');
  const integration = await read('../integration.mjs');
  assert.match(integration, /MINI_HARNESS_PATH/);
  assert.match(integration, /MINI_HARNESS_PAGE/);
  assert.match(integration, /injectRoute\(\{ pattern: MINI_HARNESS_PATH/);
});

test('the page ships the workbench shell, mechanisms and no-script fallback', async () => {
  const page = await read('../pages/mini-harness.astro');
  for (const marker of [
    'data-mh-root',
    'data-mh-workbench',
    'data-mh-scenarios',
    'data-mh-options',
    'data-mh-step',
    'data-mh-play',
    'data-mh-reset',
    'data-mh-back',
    'data-mh-timeline',
    'data-mh-ask',
    'data-mh-approve',
    'data-mh-deny',
    'data-mh-tab="context"',
    'data-mh-tab="state"',
    'data-mh-tab="raw"',
    'data-mh-eval-run',
    'data-mh-eval-noop',
    'data-mh-mechanism',
    'data-mh-see-stage',
    '<noscript>',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  for (const stage of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']) {
    assert.ok(page.includes(`data-mh-mechanism={stage.id}`) || page.includes(stage), stage);
  }
  assert.match(page, /client\/harness\/mini-harness\.ts/);
  assert.match(page, /client\/harness\/mini-harness\.css/);
});

test('the client imports only local modules and never uses the network or storage', async () => {
  const client = await read('../client/harness/mini-harness.ts');
  assert.match(client, /\.\.\/\.\.\/harness\/mini-harness\/engine\.mjs/);
  assert.match(client, /最终回答/);
  assert.match(client, /data-mh-back|backButton/);
  for (const forbidden of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /localStorage/,
    /sessionStorage/,
    /clipboard/,
    /navigator\./,
  ]) {
    assert.doesNotMatch(client, forbidden);
  }
  const engine = await read('../harness/mini-harness/engine.mjs');
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /localStorage/, /process\.env/]) {
    assert.doesNotMatch(engine, forbidden);
  }
  // No innerHTML on data-bearing paths; the only allowed use would be a static
  // icon, and there is none in this module.
  assert.doesNotMatch(client, /innerHTML/);
});

test('the catalog exposes the workbench from the mini-harness lab card', async () => {
  const catalog = await read('../harness/catalog.mjs');
  assert.match(catalog, /workbench: '\/harness\/mini-harness\/'/);
  const page = await read('../pages/harness.astro');
  assert.match(page, /打开交互运行台/);
  assert.match(page, /lab\.workbench/);
});

test('the archived lab and pages are not edited by the workbench', async () => {
  const archive = await read('../harness/archive/labs/mini-harness/README.md');
  assert.doesNotMatch(archive, /data-mh/);
  assert.doesNotMatch(archive, /mini-harness\.ts/);
  const exam = await read('../harness/archive/ai-harness-flow.html');
  assert.doesNotMatch(exam, /data-mh/);
});
