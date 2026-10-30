// 需求 041：没有可用模型时，实验台与随页问答指向设置页。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsModelSetup } from '../client/settings/model-profiles.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');
const catalog = (profiles, env) => ({ version: 1, default: null, profiles, warnings: [], env });

test('only prompt when there is neither a profile nor an .env fallback', () => {
  assert.equal(needsModelSetup(null), false);
  assert.equal(needsModelSetup(undefined), false);
  // 有档案：不打扰。
  assert.equal(needsModelSetup(catalog([{ id: 'glm-flash' }], { configured: false, model: 'm' })), false);
  // 没有档案，但 .env 的 key 或地址已经配置。
  assert.equal(needsModelSetup(catalog([], { configured: true, model: 'm' })), false);
  // 完全没有配置。
  assert.equal(needsModelSetup(catalog([], { configured: false, model: 'm' })), true);
  // 旧后端没有 env 字段：不误报。
  assert.equal(needsModelSetup({ version: 1, default: null, profiles: [], warnings: [] }), false);
});

test('the lab banner is limited to the four model tabs', async () => {
  const source = await read('../client/lab/main.ts');
  for (const marker of ['needsModelSetup', 'modelSetupNotice', 'setupHost', 'healthHost', 'renderBanners'])
    assert.ok(source.includes(marker), marker);
  assert.match(source, /MODEL_TABS = new Set\(\['ask', 'compare', 'injection', 'evals'\]\)/);
  assert.match(source, /setupHost\.hidden = !setupNeeded \|\| !modelTab/);
  assert.match(source, /healthHost\.hidden = setupNeeded && modelTab/);
});

test('the page assistant carries a compact setup notice', async () => {
  const source = await read('../client/page-assistant.ts');
  for (const marker of ['needsModelSetup', 'modelSetupNotice', "modelSetupNotice('pa-setup', true)", 'updateSetup'])
    assert.ok(source.includes(marker), marker);
  assert.match(source, /setup\.hidden = !needsModelSetup\(catalog\)/);
});

test('the settings empty state distinguishes the missing .env fallback', async () => {
  const source = await read('../client/settings/models-page.ts');
  assert.match(source, /catalog\?\.env\?\.configured/);
  assert.match(source, /也没有可用的 \.env 默认接口/);
  assert.match(source, /不添加时继续使用 \.env 里的默认模型/);
});

test('the shared notice links to /settings/', async () => {
  const source = await read('../client/model-setup.ts');
  for (const marker of ['SETTINGS_PATH', 'withBase', '打开设置 · 模型档案', '去设置页添加']) assert.ok(source.includes(marker), marker);
});
