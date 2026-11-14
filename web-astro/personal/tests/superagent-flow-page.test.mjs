// Requirement 045 wiring: the page, route, catalog entry and browser replay
// engine are easy to disconnect by accident. The archive must stay untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPERAGENT_FLOW_PATH } from '../routes.mjs';
import { PHASES, SCENARIOS } from '../harness/superagent-flow/engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the superagent-flow workbench at /harness/superagent-flow/', async () => {
  assert.equal(SUPERAGENT_FLOW_PATH, '/harness/superagent-flow/');
  const integration = await read('../integration.mjs');
  assert.match(integration, /SUPERAGENT_FLOW_PATH/);
  assert.match(integration, /SUPERAGENT_FLOW_PAGE/);
  assert.match(integration, /injectRoute\(\{\s*pattern: SUPERAGENT_FLOW_PATH/);
});

test('the page ships the workbench shell, rule tables and no-script fallback', async () => {
  const page = await read('../pages/superagent-flow.astro');
  for (const marker of [
    'data-sf-root',
    'data-sf-workbench',
    'data-sf-scenarios',
    'data-sf-step',
    'data-sf-play',
    'data-sf-back',
    'data-sf-reset',
    'data-sf-jump',
    'data-sf-speed',
    'data-sf-timeline',
    'data-sf-metrics',
    'data-sf-tab="record"',
    'data-sf-tab="tickets"',
    'data-sf-tab="ledger"',
    'data-sf-tab="raw"',
    'data-sf-stage',
    'data-sf-raw',
    '<noscript>',
  ]) {
    assert.ok(page.includes(marker), marker);
  }
  assert.match(page, /SCENARIOS\.map/);
  assert.match(page, /PHASES\.map/);
  assert.match(page, /STAGE_ROWS\.map/);
  assert.match(page, /client\/harness\/superagent-flow\.ts/);
  assert.match(page, /client\/harness\/superagent-flow\.css/);
  assert.match(page, /订阅扇出/);
  assert.match(page, /Eval/);
  assert.match(page, /unavailable/);
  assert.equal(SCENARIOS.length, 8);
  assert.ok(PHASES.length >= 9);
});

test('the client imports only local modules and never touches network, storage or markup sinks', async () => {
  const client = await read('../client/harness/superagent-flow.ts');
  assert.match(client, /\.\.\/\.\.\/harness\/superagent-flow\/engine\.mjs/);
  assert.match(client, /replay/);
  assert.match(client, /activeTab/);
  for (const forbidden of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /localStorage/,
    /sessionStorage/,
    /clipboard/,
    /navigator\./,
    /innerHTML/,
    /outerHTML/,
    /insertAdjacentHTML/,
  ]) {
    assert.doesNotMatch(client, forbidden);
  }
  const engine = await read('../harness/superagent-flow/engine.mjs');
  for (const forbidden of [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /localStorage/,
    /sessionStorage/,
    /process\.env/,
    /Date\.now/,
    /Math\.random/,
    /document\./,
    /window\./,
  ]) {
    assert.doesNotMatch(engine, forbidden);
  }
});

test('the catalog exposes the workbench from the superagent-flow lab card', async () => {
  const catalog = await read('../harness/catalog.mjs');
  assert.match(catalog, /workbench: '\/harness\/superagent-flow\/'/);
  const page = await read('../pages/harness.astro');
  assert.match(page, /打开交互运行台/);
  assert.match(page, /lab\.workbench/);
});

test('the stylesheet covers light, dark, narrow screens and reduced motion', async () => {
  const css = await read('../client/harness/superagent-flow.css');
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.sf-workbench/);
  assert.match(css, /\.sf-timeline/);
  assert.match(css, /\.sf-ticket/);
});

test('the archived superagent-flow lab is not edited by the workbench', async () => {
  const readme = await read('../harness/archive/labs/superagent-flow/README.md');
  assert.doesNotMatch(readme, /data-sf/);
  assert.doesNotMatch(readme, /superagent-flow\.ts/);
  const engine = await read('../harness/archive/labs/superagent-flow/superagent_flow/engine.py');
  assert.doesNotMatch(engine, /data-sf/);
  assert.doesNotMatch(engine, /superagent-flow\.ts/);
});
