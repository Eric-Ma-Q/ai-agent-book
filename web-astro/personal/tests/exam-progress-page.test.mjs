// Requirement 008 wiring: the progress script, its API, the git boundary and
// the archive boundary are easy to disconnect by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(path.resolve(HERE, relative), 'utf8');

test('the integration serves and injects the progress script', async () => {
  const integration = await read('../integration.mjs');
  assert.match(integration, /HARNESS_EXAM_PROGRESS/);
  assert.match(integration, /examProgressFile: HARNESS_EXAM_PROGRESS/);
  const middleware = await read('../harness/static.mjs');
  assert.match(middleware, /examProgressFile/);
  assert.match(middleware, /data-exam-progress/);
});

test('the progress script covers the API, the gate, save wrappers and clear', async () => {
  const script = await read('../harness/exam-progress.js');
  for (const marker of [
    'data-exam-progress',
    '/__personal/exam-progress',
    'renderIntro',
    'saveStore',
    'emptyStore',
    'mergeStores',
    '清空全部记录',
    '记录仅存于本机',
    '阅读器服务器',
    'STORE_KEY',
  ])
    assert.ok(script.includes(marker), marker);
});

test('the API exposes both progress routes and a larger body limit', async () => {
  const api = await read('../api.mjs');
  assert.match(api, /'GET \/exam-progress'/);
  assert.match(api, /'POST \/exam-progress\/save'/);
  assert.match(api, /MAX_BODY = 4 \* 1024 \* 1024/);
});

test('progress data is server-local and not committed', async () => {
  const ignore = await read('../../../personal/.gitignore');
  assert.match(ignore, /harness\/progress\//);
});

test('the archived exam pages are not edited', async () => {
  for (const file of ['harness-exam.html', 'ai-pm-exam.html']) {
    const html = await read(`../harness/archive/${file}`);
    assert.ok(!html.includes('data-exam-progress'), file);
    assert.ok(!html.includes('data-exam-favorites'), file);
    assert.ok(!html.includes('exam-progress.js'), file);
  }
});
