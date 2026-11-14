// Requirement 029: the model profile editor moved out of the lab into a
// standalone /settings/ page. These checks read source files so they stay fast;
// the rendered page is verified in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_PATH } from '../routes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('registers the settings page at /settings/', async () => {
  assert.equal(SETTINGS_PATH, '/settings/');
  const integration = await read('../integration.mjs');
  for (const marker of [
    'SETTINGS_PATH',
    'SETTINGS_PAGE',
    'CLIENT_SETTINGS_ENTRY',
    'pages/settings.astro',
  ])
    assert.ok(integration.includes(marker), marker);

  assert.match(integration, /injectRoute\(\{[^}]*pattern: SETTINGS_PATH/s);
  // Entries must exist before the grouping module collects them.
  const entry = integration.indexOf('CLIENT_SETTINGS_ENTRY');
  const groups = integration.indexOf('CLIENT_HEADER_GROUPS');
  assert.ok(entry >= 0 && groups > entry, 'grouping must load after the settings entry');
});

test('the settings page ships a shell and the shared model editor', async () => {
  const page = await read('../pages/settings.astro');
  for (const marker of [
    'Layout',
    'Header',
    'settings-root',
    'settings-page',
    'client/settings/main.ts',
    'client/lab/lab.css',
    'client/settings/settings.css',
    '全局配置',
    '设置',
  ])
    assert.ok(page.includes(marker), marker);
  assert.doesNotMatch(page, /api_key/);

  const main = await read('../client/settings/main.ts');
  assert.match(main, /mountModelSettings/);
  assert.match(main, /settings-root/);
});

test('the model editor keeps the existing endpoints and key rules', async () => {
  const source = await read('../client/settings/models-page.ts');
  assert.match(source, /export function mountModelSettings/);
  for (const marker of [
    "'/models'",
    '/models/test',
    '/models/pricing/sync',
    '/pricing/lookup',
    '/pricing/apply',
    'has_key',
    'invalidateProfiles',
  ])
    assert.ok(source.includes(marker), marker);
  assert.match(source, /from '\.\.\/lab\/api'/);
  assert.match(source, /from '\.\/model-profiles'/);
  // The fetched model IDs use an explicit dropdown, not a native datalist:
  // the datalist arrow did not open reliably inside the form.
  assert.doesNotMatch(source, /el\('datalist'\)/);
  for (const marker of ['lab-model-combo-list', "setAttribute('role', 'listbox')", 'openPicker()', 'fieldFor('])
    assert.ok(source.includes(marker), marker);
});

test('the lab no longer owns a model tab and redirects the old hash', async () => {
  const main = await read('../client/lab/main.ts');
  assert.doesNotMatch(main, /label: '模型'/);
  assert.doesNotMatch(main, /mountModels/);
  assert.match(main, /SETTINGS_PATH/);
  assert.match(main, /location\.replace/);
  assert.match(main, /tab === 'models'/);

  const page = await read('../pages/lab.astro');
  assert.match(page, /SETTINGS_PATH/);
  assert.match(page, /设置/);
});

test('the interview model link points at settings instead of the lab', async () => {
  const page = await read('../pages/interview.astro');
  assert.match(page, /SETTINGS_PATH/);
  assert.match(page, /settingsHref/);
  assert.doesNotMatch(page, /labModelsHref/);
  assert.doesNotMatch(page, /LAB_PATH/);
});

test('the header entry is a gear labelled 设置 and selects itself on /settings/', async () => {
  const entry = await read('../client/settings-entry.ts');
  for (const marker of ['SETTINGS_PATH', 'settings-entry', "LABEL = '设置'", 'aria-label', 'aria-current'])
    assert.ok(entry.includes(marker), marker);
  assert.match(entry, /<svg/);
  assert.match(entry, /tools\.prepend/);
});
