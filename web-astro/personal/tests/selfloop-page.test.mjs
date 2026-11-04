// Requirement 014 wiring: the page, route, catalog entry and browser-only
// simulator are easy to disconnect by accident. Keep the archive untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SELFLOOP_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the SelfLoop workbench at /harness/selfloop/', async () => {
  assert.equal(SELFLOOP_PATH, '/harness/selfloop/');
  const integration = await read('../integration.mjs');
  assert.match(integration, /SELFLOOP_PATH/);
  assert.match(integration, /SELFLOOP_PAGE/);
  assert.match(integration, /injectRoute\(\{ pattern: SELFLOOP_PATH/);
});

test('the page ships the workbench shell, gates, stop table and no-script fallback', async () => {
  const page = await read('../pages/selfloop.astro');
  for (const marker of [
    'data-sl-root',
    'data-sl-workbench',
    'data-sl-scenarios',
    'data-sl-options',
    'data-sl-step',
    'data-sl-play',
    'data-sl-reset',
    'data-sl-back',
    'data-sl-jump',
    'data-sl-timeline',
    'data-sl-chart',
    'data-sl-candidates-body',
    'data-sl-metrics',
    'data-sl-tab="gates"',
    'data-sl-tab="archive"',
    'data-sl-tab="diff"',
    'data-sl-tab="raw"',
    'data-sl-see-stage',
    'data-sl-mechanism',
    '<noscript>',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  assert.match(page, /STAGES\.map/);
  assert.match(page, /SCENARIOS\.map/);
  for (const reason of ['verified', 'budget', 'plateau', 'max_rounds', 'stopped']) {
    assert.ok(page.includes(reason), reason);
  }
  assert.match(page, /client\/harness\/selfloop\.ts/);
  assert.match(page, /client\/harness\/selfloop\.css/);
  assert.match(page, /score = 0\.35/);
  assert.match(page, /verified = integrity/);
});

test('the client imports only local modules and never uses the network or storage', async () => {
  const client = await read('../client/harness/selfloop.ts');
  assert.match(client, /\.\.\/\.\.\/harness\/selfloop\/engine\.mjs/);
  assert.match(client, /data-sl-tab|activeTab/);
  assert.match(client, /unifiedDiff/);
  assert.match(client, /停机检查/);
  assert.match(client, /待验证/);
  assert.match(client, /gateReady/);
  assert.match(client, /被拒轮次/);
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
  assert.doesNotMatch(client, /innerHTML/);
  const engine = await read('../harness/selfloop/engine.mjs');
  for (const forbidden of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /localStorage/,
    /sessionStorage/,
    /process\.env/,
    /Date\.now/,
    /Math\.random/,
  ]) {
    assert.doesNotMatch(engine, forbidden);
  }
  assert.doesNotMatch(engine, /innerHTML/);
});

test('the catalog exposes the workbench from the SelfLoop lab card', async () => {
  const catalog = await read('../harness/catalog.mjs');
  assert.match(catalog, /workbench: '\/harness\/selfloop\/'/);
  const page = await read('../pages/harness.astro');
  assert.match(page, /打开交互运行台/);
  assert.match(page, /lab\.workbench/);
});

test('the archived SelfLoop lab is not edited by the workbench', async () => {
  const readme = await read('../harness/archive/labs/selfloop/README.md');
  assert.doesNotMatch(readme, /data-sl/);
  assert.doesNotMatch(readme, /selfloop\.ts/);
  const loop = await read('../harness/archive/labs/selfloop/selfloop/loop.py');
  assert.doesNotMatch(loop, /data-sl/);
  assert.doesNotMatch(loop, /selfloop\.ts/);
});
