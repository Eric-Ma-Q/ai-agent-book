import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPriceMatch,
  copyForm,
  copyName,
  formatPrice,
  formatReasoningValue,
  formatTokenCount,
  formFromProfile,
  groupPriceMatches,
  markManualPrice,
  priceChoiceLabel,
  needsKey,
  parsePrice,
  parseReasoningValue,
  parseTokenCount,
  priceLine,
  priceSummary,
  pricingFromForm,
  profileOptions,
  profilePayload,
  reasoningLabel,
  reuseKeyId,
  validateProfileForm,
} from '../client/settings/model-profiles.ts';

const profile = {
  id: 'glm-flash',
  name: 'GLM-5.3-Flash',
  base_url: 'http://127.0.0.1:7864/v1',
  protocol: 'openai-chat',
  model: 'cn:glm-5.3-flash',
  context_window: 1000000,
  max_output_tokens: 131072,
  input_types: ['text', 'image'],
  reasoning: {
    parameter: 'reasoning_effort',
    default: 'medium',
    levels: [
      { name: 'off', value: null },
      { name: 'low', value: 'low' },
      { name: 'medium', value: 'medium' },
    ],
  },
  pricing: null,
  has_key: true,
};

test('token counts accept K/M suffixes and plain numbers', () => {
  assert.equal(parseTokenCount('1M'), 1000000);
  assert.equal(parseTokenCount('128k'), 128000);
  assert.equal(parseTokenCount('200_000'), 200000);
  assert.equal(parseTokenCount('1,000'), 1000);
  assert.equal(parseTokenCount('abc'), null);
  assert.equal(parseTokenCount(''), null);
});

test('token counts format back to short strings', () => {
  assert.equal(formatTokenCount(1000000), '1M');
  assert.equal(formatTokenCount(128000), '128K');
  assert.equal(formatTokenCount(1234), '1234');
  assert.equal(formatTokenCount(0), '');
});

test('reasoning values stay strings unless they look like JSON', () => {
  assert.equal(parseReasoningValue(''), null);
  assert.equal(parseReasoningValue('low'), 'low');
  assert.equal(parseReasoningValue('5'), '5');
  assert.deepEqual(parseReasoningValue('{"type":"enabled"}'), { type: 'enabled' });
  assert.equal(parseReasoningValue('true'), true);
  assert.equal(formatReasoningValue(null), '');
  assert.equal(formatReasoningValue('low'), 'low');
  assert.equal(formatReasoningValue({ type: 'enabled' }), '{"type":"enabled"}');
});

test('form is filled from an existing profile without the key', () => {
  const form = formFromProfile(profile);
  assert.equal(form.context_window, '1M');
  assert.equal(form.max_output_tokens, '131072');
  assert.equal(form.api_key, '');
  assert.equal(form.reasoning_default, 'medium');
  assert.deepEqual(form.reasoning_levels.map((level) => level.name), ['off', 'low', 'medium']);
});

test('a new form starts with sensible defaults', () => {
  const form = formFromProfile();
  assert.equal(form.reasoning_default, '');
  assert.deepEqual(form.input_types, ['text']);
  assert.equal(validateProfileForm({ ...form, name: 'x', base_url: 'http://x/v1', model: 'm' }).length, 0);
});

test('validation catches empty fields, bad URLs and oversized output', () => {
  const base = formFromProfile();
  assert.ok(validateProfileForm(base).some((error) => error.includes('名称')));
  assert.ok(validateProfileForm({ ...base, name: 'x', base_url: 'ftp://x', model: 'm' }).some((error) => error.includes('http')));
  const tooLarge = { ...base, name: 'x', base_url: 'http://x/v1', model: 'm', context_window: '1K', max_output_tokens: '2000' };
  assert.ok(validateProfileForm(tooLarge).some((error) => error.includes('不能超过')));
  const duplicate = {
    ...base,
    name: 'x',
    base_url: 'http://x/v1',
    model: 'm',
    reasoning_levels: [
      { name: 'low', value: 'low' },
      { name: 'low', value: 'high' },
    ],
  };
  assert.ok(validateProfileForm(duplicate).some((error) => error.includes('重复')));
});

test('changing the URL of a stored profile requires a new key', () => {
  assert.equal(needsKey({ hasKey: true, baseUrlChanged: true, keyInForm: '' }), true);
  assert.equal(needsKey({ hasKey: true, baseUrlChanged: true, keyInForm: 'sk-new' }), false);
  assert.equal(needsKey({ hasKey: true, baseUrlChanged: false, keyInForm: '' }), false);
  assert.equal(needsKey({ hasKey: false, baseUrlChanged: true, keyInForm: '' }), false);
});

test('copying a profile prefills everything but the key and marks the name as a draft', () => {
  const form = copyForm(profile);
  assert.equal(form.name, 'GLM-5.3-Flash 副本');
  assert.equal(form.api_key, '');
  assert.equal(form.base_url, profile.base_url);
  assert.equal(form.model, profile.model);
  assert.equal(form.context_window, '1M');
  assert.equal(form.reasoning_default, 'medium');
  assert.deepEqual(form.input_types, ['text', 'image']);
});

test('the copy suffix survives the 60 char name limit', () => {
  assert.equal(copyName('x'.repeat(60)), `${'x'.repeat(57)} 副本`);
  assert.equal(copyName(' GLM '), 'GLM 副本');
});

test('a copied profile reuses the source key only while the API address is unchanged', () => {
  const form = copyForm(profile);
  assert.equal(reuseKeyId(profile, form), 'glm-flash');
  assert.equal(reuseKeyId({ ...profile, has_key: false }, form), undefined);
  assert.equal(reuseKeyId(undefined, form), undefined);
  assert.equal(reuseKeyId(profile, { ...form, api_key: ' sk-new ' }), undefined);
  assert.equal(reuseKeyId(profile, { ...form, base_url: 'http://other.test/v1' }), undefined);
  assert.equal(reuseKeyId(profile, { ...form, base_url: `${profile.base_url}/` }), 'glm-flash');
});

test('payload omits a blank key and parses the token fields', () => {
  const form = { ...formFromProfile(profile), name: 'GLM', base_url: 'http://x/v1/', context_window: '256K', max_output_tokens: '8192' };
  const payload = profilePayload(form);
  assert.equal(payload.base_url, 'http://x/v1');
  assert.equal(payload.context_window, 256000);
  assert.equal(payload.max_output_tokens, 8192);
  assert.equal('api_key' in payload, false);
  assert.deepEqual(payload.reasoning.levels.find((level) => level.name === 'off').value, null);
  const withKey = profilePayload({ ...form, api_key: ' sk-new ' });
  assert.equal(withKey.api_key, 'sk-new');
});

test('disabling reasoning sends a single inert level', () => {
  const form = { ...formFromProfile(), name: 'x', base_url: 'http://x/v1', model: 'm', reasoning_enabled: false };
  const payload = profilePayload(form);
  assert.equal(payload.reasoning.default, null);
  assert.deepEqual(payload.reasoning.levels, [{ name: 'off', value: null }]);
});

test('options put the env default first and label profiles with their model', () => {
  const options = profileOptions({ version: 1, default: 'glm-flash', profiles: [profile], warnings: [] });
  assert.deepEqual(options[0], { value: '', label: '默认（.env / 未指定）' });
  assert.equal(options[1].value, 'glm-flash');
  assert.match(options[1].label, /GLM-5\.3-Flash/);
});

test('reasoning summary explains what will be sent', () => {
  assert.equal(reasoningLabel(profile), 'reasoning_effort = medium');
  assert.equal(
    reasoningLabel({ ...profile, reasoning: { ...profile.reasoning, default: 'off' } }),
    'off（不发送）',
  );
  assert.equal(
    reasoningLabel({ ...profile, reasoning: { ...profile.reasoning, default: null } }),
    '不注入推理参数',
  );
});

test('prices accept plain numbers and format without trailing zeros', () => {
  assert.equal(parsePrice('0.15'), 0.15);
  assert.equal(parsePrice(' $0.003 '), 0.003);
  assert.equal(parsePrice('1,5'), null);
  assert.equal(parsePrice('-1'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(formatPrice(0.15), '0.15');
  assert.equal(formatPrice(0.003), '0.003');
  assert.equal(formatPrice(15), '15');
  assert.equal(formatPrice(0), '0');
});

test('price fields turn into a USD pricing block, or null when empty', () => {
  const base = { ...formFromProfile(profile), price_input: '0.15', price_output: '0.6', price_cache_read: '0.003' };
  assert.deepEqual(pricingFromForm(base), {
    currency: 'USD',
    input: 0.15,
    output: 0.6,
    cache_read: 0.003,
    cache_write: 0,
    source: 'manual',
    model_key: '',
    synced_at: null,
  });
  assert.equal(pricingFromForm(formFromProfile(profile)), null);
  const payload = profilePayload({ ...base, price_source: 'models.dev', price_model_key: 'deepseek/deepseek-flash', price_synced_at: '2026-10-18T10:00:00Z' });
  assert.equal(payload.pricing.source, 'models.dev');
  assert.equal(payload.pricing.model_key, 'deepseek/deepseek-flash');
  assert.equal(profilePayload(formFromProfile(profile)).pricing, null);
});

test('validation requires input and output prices together', () => {
  const base = { ...formFromProfile(profile), name: 'x', base_url: 'http://x/v1', model: 'm' };
  assert.equal(validateProfileForm({ ...base, price_input: '0.15', price_output: '0.6' }).length, 0);
  assert.ok(validateProfileForm({ ...base, price_input: '0.15' }).some((error) => error.includes('一起填')));
  assert.ok(validateProfileForm({ ...base, price_input: 'abc', price_output: '0.6' }).some((error) => error.includes('非负')));
});

test('a models.dev match fills all four prices and the source', () => {
  const match = {
    provider: 'deepseek',
    provider_name: 'DeepSeek',
    model: 'deepseek-flash',
    name: 'DeepSeek V4.1 Flash 1017',
    key: 'deepseek/deepseek-flash',
    cost: { input: 0.15, output: 0.6, cache_read: 0.003, cache_write: 0 },
    limit: { context: 1000000, output: 393216 },
    score: 4,
  };
  const form = applyPriceMatch(formFromProfile(profile), match, '2026-10-18T10:30:00Z');
  assert.equal(form.price_input, '0.15');
  assert.equal(form.price_output, '0.6');
  assert.equal(form.price_cache_read, '0.003');
  assert.equal(form.price_source, 'models.dev');
  assert.equal(form.price_model_key, 'deepseek/deepseek-flash');
  assert.equal(form.price_synced_at, '2026-10-18T10:30:00Z');
  assert.match(priceSummary(match), /输入 \$0\.15 · 输出 \$0\.6/);
});

test('price line names the source and the sync date', () => {
  const priced = {
    ...profile,
    pricing: {
      currency: 'USD',
      input: 0.15,
      output: 0.6,
      cache_read: 0.003,
      cache_write: 0,
      source: 'models.dev',
      model_key: 'deepseek/deepseek-flash',
      synced_at: '2026-10-18T10:30:00Z',
    },
  };
  assert.equal(priceLine(priced), '输入 $0.15 · 缓存命中 $0.003 · 输出 $0.6 / 百万 token（models.dev · 2026-10-18）');
  assert.equal(priceLine(profile), '未填价格（成本记为未知）');
  const manual = { ...priced, pricing: { ...priced.pricing, source: 'manual', cache_write: 2 } };
  assert.match(priceLine(manual), /缓存写入 \$2.*（手填）/);
});

test('editing a synced price marks the profile manual and clears the source key', () => {
  const synced = {
    ...formFromProfile(profile),
    price_input: '0.15',
    price_output: '0.6',
    price_source: 'models.dev',
    price_model_key: 'deepseek/deepseek-flash',
    price_synced_at: '2026-10-18T10:30:00Z',
  };
  const manual = markManualPrice({ ...synced, price_input: '0.2' });
  assert.equal(manual.price_input, '0.2');
  assert.equal(manual.price_source, 'manual');
  assert.equal(manual.price_model_key, '');
  assert.equal(manual.price_synced_at, '');
});

test('candidates collapse into one choice per price point, original first', () => {
  const cost = { input: 0.15, output: 0.6, cache_read: 0.003, cache_write: 0 };
  const match = (key, providerName, price, original) => ({
    provider: key.split('/')[0],
    provider_name: providerName,
    model: key.split('/').pop(),
    name: providerName,
    key,
    cost: price,
    limit: {},
    original,
    score: original ? 2 : 3,
  });
  const choices = groupPriceMatches([
    match('ollama-cloud/deepseek-v4.1-flash', 'Ollama Cloud', cost, false),
    match('deepseek/deepseek-flash', 'DeepSeek', cost, true),
    match('alibaba-token-plan/deepseek-v4.1-flash', 'Alibaba', { input: 0, output: 0, cache_read: 0, cache_write: 0 }, false),
  ]);
  assert.equal(choices.length, 2);
  assert.equal(choices[0].original, true);
  assert.equal(choices[0].key, 'deepseek/deepseek-flash');
  assert.equal(choices[0].matches.length, 2);
  assert.equal(priceChoiceLabel(choices[0]), '原厂 DeepSeek 等 2 家');
  assert.equal(priceChoiceLabel(choices[1]), 'Alibaba');
});
