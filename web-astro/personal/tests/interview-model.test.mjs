// Requirement 013: pure model-menu helpers shared by the setup form and the
// DSH-style composer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterModelChoices,
  formatContext,
  formatCost,
  formatLatency,
  formatUsage,
  modelButtonLabel,
  modelChoices,
  resolveModelChoice,
  resumeSignalsFromStorage,
} from '../client/harness/interview-model.ts';

const profile = {
  id: 'glm-flash',
  name: 'GLM-5.3-Flash',
  base_url: 'http://127.0.0.1:7864/v1',
  protocol: 'openai-chat',
  model: 'cn:glm-5.3-flash',
  context_window: 1000000,
  max_output_tokens: 131072,
  input_types: ['text'],
  reasoning: { parameter: 'reasoning_effort', default: 'medium', levels: [] },
  pricing: null,
  has_key: true,
};
const catalog = { version: 1, default: 'glm-flash', profiles: [profile], warnings: [] };

test('the default option comes first and profiles keep their labels', () => {
  const choices = modelChoices(catalog);
  assert.equal(choices.length, 2);
  assert.deepEqual(
    { value: choices[0].value, label: choices[0].label, isDefault: choices[0].isDefault, hasKey: choices[0].hasKey },
    { value: '', label: '默认模型', isDefault: true, hasKey: true },
  );
  assert.match(choices[0].meta, /GLM-5\.3-Flash/);
  assert.equal(choices[1].value, 'glm-flash');
  assert.equal(choices[1].label, 'GLM-5.3-Flash');
  assert.match(choices[1].meta, /cn:glm-5\.3-flash/);
  assert.match(choices[1].meta, /1M/);
  assert.equal(choices[1].isDefault, true);
  assert.equal(modelButtonLabel(choices[0]), 'GLM-5.3-Flash');
  assert.equal(modelButtonLabel(choices[1]), 'GLM-5.3-Flash');
});

test('without a catalog the menu stays usable with the env default', () => {
  const choices = modelChoices(null);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].value, '');
  assert.equal(choices[0].label, '默认模型');
  assert.equal(choices[0].meta, '.env 默认');
  assert.equal(modelButtonLabel(choices[0]), '默认模型');
});

test('search matches label, model id and value, case-insensitively', () => {
  const choices = modelChoices(catalog);
  assert.equal(filterModelChoices(choices, 'glm').length, 2);
  assert.equal(filterModelChoices(choices, 'FLASH').length, 2);
  assert.equal(filterModelChoices(choices, 'nope').length, 0);
  assert.equal(filterModelChoices(choices, '').length, 2);
});

test('a deleted saved profile falls back to the default option', () => {
  const choices = modelChoices(catalog);
  assert.equal(resolveModelChoice(choices, 'glm-flash'), 'glm-flash');
  assert.equal(resolveModelChoice(choices, 'gone'), '');
  assert.equal(resolveModelChoice(choices, ''), '');
  assert.equal(resolveModelChoice([], 'glm-flash'), '');
});

test('token, usage, cost and latency format for the composer', () => {
  assert.equal(formatContext(1000000), '1M');
  assert.equal(formatContext(128000), '128K');
  assert.equal(formatContext(200000), '200K');
  assert.equal(formatUsage({ prompt_tokens: 1800, completion_tokens: 120 }), '1,800 in · 120 out');
  assert.equal(formatUsage({}), '');
  assert.equal(formatCost(null), '成本未知');
  assert.equal(formatCost(0), '$0');
  assert.equal(formatCost(0.00012), '$0.00012');
  assert.equal(formatLatency(3200), '3.2 秒');
  assert.equal(formatLatency(500), '0.5 秒');
});

test('resume storage arrays become signals only when they look valid', () => {
  const check = Array.from({ length: 10 }, (_, index) => index < 7);
  const plan = Array.from({ length: 30 }, (_, index) => index < 12);
  assert.deepEqual(resumeSignalsFromStorage(check, plan), { selfCheck: 7, planDone: 12, planTotal: 30 });
  assert.equal(resumeSignalsFromStorage(null, plan), null);
  assert.equal(resumeSignalsFromStorage(check, null), null);
  assert.equal(resumeSignalsFromStorage('nope', plan), null);
  assert.equal(resumeSignalsFromStorage(check, ['x']), null);
  assert.equal(resumeSignalsFromStorage([], []), null);
});
