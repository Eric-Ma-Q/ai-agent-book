// Model profiles: pure helpers shared by the models page and the knob form.
// Kept free of DOM/API imports so `node --test` can load it directly.

export type ProfileInputType = 'text' | 'image';

export type ReasoningLevel = { name: string; value: unknown };

export type ReasoningConfig = {
  parameter: string;
  default: string | null;
  levels: ReasoningLevel[];
};

export type PriceSource = 'manual' | 'models.dev';

/** USD per 1M tokens. cache_write is stored for display only: the chat API
 * never reports cache-write tokens, so it does not enter the cost math. */
export type ModelPricing = {
  currency: 'USD';
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  source: PriceSource;
  model_key: string;
  synced_at: string | null;
};

export type PriceMatch = {
  provider: string;
  provider_name: string;
  model: string;
  name: string;
  key: string;
  cost: { input: number; output: number; cache_read: number; cache_write: number };
  limit: { context?: number | null; output?: number | null };
  release_date?: string;
  original?: boolean;
  score: number;
};

export type PriceChoice = {
  key: string;
  cost: PriceMatch['cost'];
  matches: PriceMatch[];
  original: boolean;
};

export type PriceCatalogMeta = {
  url: string;
  fetched_at: string | null;
  count: number;
  stale: boolean;
  ttl_h: number;
  warnings: string[];
};

export type PriceLookup = { matches: PriceMatch[]; catalog: PriceCatalogMeta; warnings: string[] };

export type ModelProfile = {
  id: string;
  name: string;
  base_url: string;
  protocol: 'openai-chat';
  model: string;
  context_window: number;
  max_output_tokens: number;
  input_types: ProfileInputType[];
  reasoning: ReasoningConfig;
  pricing: ModelPricing | null;
  has_key: boolean;
};

export type ModelCatalog = {
  version: number;
  default: string | null;
  profiles: ModelProfile[];
  warnings: string[];
};

export type ProbeResult = { ok: boolean; models: string[]; latency_ms: number; error: string | null };

export type LevelDraft = { name: string; value: string };

export type ProfileForm = {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  context_window: string;
  max_output_tokens: string;
  input_types: ProfileInputType[];
  reasoning_enabled: boolean;
  reasoning_parameter: string;
  reasoning_default: string;
  reasoning_levels: LevelDraft[];
  price_input: string;
  price_output: string;
  price_cache_read: string;
  price_cache_write: string;
  price_source: PriceSource;
  price_model_key: string;
  price_synced_at: string;
};

export const REASONING_OFF: ReasoningConfig = {
  parameter: 'reasoning_effort',
  default: null,
  levels: [{ name: 'off', value: null }],
};

const DEFAULT_LEVELS: LevelDraft[] = [
  { name: 'off', value: '' },
  { name: 'low', value: 'low' },
  { name: 'medium', value: 'medium' },
  { name: 'high', value: 'high' },
];

export function parseTokenCount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[, _]/g, '');
  const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(cleaned);
  if (!match) return null;
  const suffix = (match[2] ?? '').toLowerCase();
  const multiplier = suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  const value = Math.round(Number(match[1]) * multiplier);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value % 1_000 === 0) return `${value / 1_000}K`;
  return String(value);
}

/** Price text -> USD per 1M tokens. Empty and malformed input both yield null. */
export function parsePrice(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, '').trim();
  if (!cleaned) return null;
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const text = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return text || '0';
}

/** Collapse candidates that share the same four prices: 19 resellers usually
 * mean 2 or 3 real price points, not 19 decisions. */
export function groupPriceMatches(matches: PriceMatch[]): PriceChoice[] {
  const groups = new Map<string, PriceChoice>();
  for (const match of matches) {
    const signature = [match.cost.input, match.cost.output, match.cost.cache_read, match.cost.cache_write].join('|');
    const existing = groups.get(signature);
    if (!existing) {
      groups.set(signature, { key: match.key, cost: match.cost, matches: [match], original: Boolean(match.original) });
      continue;
    }
    existing.matches.push(match);
    if (match.original && !existing.original) {
      existing.original = true;
      existing.key = match.key;
    }
  }
  return [...groups.values()].sort((a, b) => Number(b.original) - Number(a.original));
}

export function priceChoiceMatch(choice: PriceChoice): PriceMatch {
  return choice.matches.find((match) => match.original) ?? choice.matches[0];
}

export function priceChoiceLabel(choice: PriceChoice): string {
  const first = priceChoiceMatch(choice);
  const prefix = choice.original ? '原厂 ' : '';
  return choice.matches.length === 1 ? `${prefix}${first.provider_name}` : `${prefix}${first.provider_name} 等 ${choice.matches.length} 家`;
}

export function priceSummary(match: PriceMatch): string {
  const cost = match.cost;
  return `输入 $${formatPrice(cost.input)} · 输出 $${formatPrice(cost.output)} / 百万 token`;
}

export function priceLine(profile: ModelProfile): string {
  const pricing = profile.pricing;
  if (!pricing) return '未填价格（成本记为未知）';
  const parts = [
    `输入 $${formatPrice(pricing.input)}`,
    `缓存命中 $${formatPrice(pricing.cache_read)}`,
    `输出 $${formatPrice(pricing.output)}`,
  ];
  if (pricing.cache_write > 0) parts.splice(2, 0, `缓存写入 $${formatPrice(pricing.cache_write)}`);
  const source =
    pricing.source === 'models.dev'
      ? `models.dev${pricing.synced_at ? ` · ${pricing.synced_at.slice(0, 10)}` : ''}`
      : '手填';
  return `${parts.join(' · ')} / 百万 token（${source}）`;
}

export function applyPriceMatch(form: ProfileForm, match: PriceMatch, syncedAt = new Date().toISOString()): ProfileForm {
  return {
    ...form,
    price_input: formatPrice(match.cost.input),
    price_output: formatPrice(match.cost.output),
    price_cache_read: formatPrice(match.cost.cache_read),
    price_cache_write: formatPrice(match.cost.cache_write),
    price_source: 'models.dev',
    price_model_key: match.key,
    price_synced_at: syncedAt,
  };
}

/** Hand-editing a price makes the profile manual, so "sync all" leaves it alone. */
export function markManualPrice(form: ProfileForm): ProfileForm {
  return { ...form, price_source: 'manual', price_model_key: '', price_synced_at: '' };
}

export function pricingFromForm(form: ProfileForm): ModelPricing | null {
  const input = parsePrice(form.price_input);
  const output = parsePrice(form.price_output);
  if (input === null && output === null) return null;
  if (input === null || output === null) return null;
  return {
    currency: 'USD',
    input,
    output,
    cache_read: parsePrice(form.price_cache_read) ?? 0,
    cache_write: parsePrice(form.price_cache_write) ?? 0,
    source: form.price_source === 'models.dev' ? 'models.dev' : 'manual',
    model_key: form.price_model_key.trim(),
    synced_at: form.price_synced_at || null,
  };
}

/** `null`/empty means "do not send". JSON literals (objects, arrays, quoted
 * strings, true/false/null) are parsed; anything else stays a plain string. */
export function parseReasoningValue(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^[{["]/.test(trimmed) || /^(true|false|null)$/.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function formatReasoningValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function formFromProfile(profile?: ModelProfile): ProfileForm {
  if (!profile) {
    return {
      name: '',
      base_url: '',
      api_key: '',
      model: '',
      context_window: '200K',
      max_output_tokens: '8192',
      input_types: ['text'],
      reasoning_enabled: true,
      reasoning_parameter: 'reasoning_effort',
      reasoning_default: '',
      reasoning_levels: DEFAULT_LEVELS.map((level) => ({ ...level })),
      price_input: '',
      price_output: '',
      price_cache_read: '',
      price_cache_write: '',
      price_source: 'manual',
      price_model_key: '',
      price_synced_at: '',
    };
  }
  const reasoning = profile.reasoning ?? REASONING_OFF;
  const pricing = profile.pricing ?? null;
  return {
    name: profile.name,
    base_url: profile.base_url,
    api_key: '',
    model: profile.model,
    context_window: formatTokenCount(profile.context_window),
    max_output_tokens: String(profile.max_output_tokens),
    input_types: [...profile.input_types],
    reasoning_enabled: reasoning.levels.length > 0,
    reasoning_parameter: reasoning.parameter || 'reasoning_effort',
    reasoning_default: reasoning.default ?? '',
    reasoning_levels: reasoning.levels.map((level) => ({ name: level.name, value: formatReasoningValue(level.value) })),
    price_input: pricing ? formatPrice(pricing.input) : '',
    price_output: pricing ? formatPrice(pricing.output) : '',
    price_cache_read: pricing ? formatPrice(pricing.cache_read) : '',
    price_cache_write: pricing ? formatPrice(pricing.cache_write) : '',
    price_source: pricing?.source ?? 'manual',
    price_model_key: pricing?.model_key ?? '',
    price_synced_at: pricing?.synced_at ?? '',
  };
}

export function validateProfileForm(form: ProfileForm): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('名称不能为空');
  const url = form.base_url.trim();
  if (!/^https?:\/\//i.test(url)) errors.push('API 地址必须以 http:// 或 https:// 开头');
  else {
    try {
      new URL(url);
    } catch {
      errors.push('API 地址格式不正确');
    }
  }
  if (!form.model.trim()) errors.push('模型 ID 不能为空');
  const context = parseTokenCount(form.context_window);
  if (context === null) errors.push('上下文窗口需要填写数字，或 128K / 1M 这种写法');
  const output = Number.parseInt(form.max_output_tokens, 10);
  if (!Number.isFinite(output) || output <= 0) errors.push('最大输出 token 必须是正整数');
  else if (context !== null && output > context) errors.push('最大输出 token 不能超过上下文窗口');
  if (!form.input_types.length) errors.push('至少选择一种输入类型');
  const priceTexts = [form.price_input, form.price_output, form.price_cache_read, form.price_cache_write];
  if (priceTexts.some((text) => text.trim() && parsePrice(text) === null)) {
    errors.push('单价必须是非负数字（美元 / 百万 token）');
  }
  const hasInputPrice = form.price_input.trim() !== '';
  const hasOutputPrice = form.price_output.trim() !== '';
  if (priceTexts.some((text) => text.trim()) && (!hasInputPrice || !hasOutputPrice)) {
    errors.push('输入和输出单价要一起填，否则算不出成本');
  }
  if (form.reasoning_enabled) {
    if (!form.reasoning_parameter.trim()) errors.push('推理参数名不能为空');
    const names = form.reasoning_levels.map((level) => level.name.trim());
    if (!names.length) errors.push('至少保留一个推理档位');
    if (names.some((name) => !name)) errors.push('推理档位名不能为空');
    if (new Set(names).size !== names.length) errors.push('推理档位名不能重复');
    if (form.reasoning_default && !names.includes(form.reasoning_default)) errors.push('默认档位必须在档位列表中');
  }
  return errors;
}

export function needsKey(form: { hasKey: boolean; baseUrlChanged: boolean; keyInForm: string }): boolean {
  return form.hasKey && form.baseUrlChanged && !form.keyInForm.trim();
}

/** The copy keeps the source name visible but marks it as a draft to rename;
 * the suffix must survive the 60-char name limit. */
export function copyName(name: string): string {
  return `${name.trim().slice(0, 57)} 副本`;
}

/** Everything but the key (never returned by the API) is prefilled. */
export function copyForm(profile: ModelProfile): ProfileForm {
  return { ...formFromProfile(profile), name: copyName(profile.name) };
}

/** Reuse a saved key (copy on save via `copy_key_from`, probe via `id`) only
 * while the API address stays the same and no new key is typed. */
export function reuseKeyId(
  source: { id: string; has_key: boolean; base_url: string } | undefined,
  form: ProfileForm,
): string | undefined {
  if (!source?.has_key || form.api_key.trim()) return undefined;
  if (form.base_url.trim().replace(/\/+$/, '') !== source.base_url) return undefined;
  return source.id;
}

export function profilePayload(form: ProfileForm): Record<string, unknown> {
  const context = parseTokenCount(form.context_window) ?? 200_000;
  const output = Number.parseInt(form.max_output_tokens, 10) || 8_192;
  const reasoning = form.reasoning_enabled
    ? {
        parameter: form.reasoning_parameter.trim() || 'reasoning_effort',
        default: form.reasoning_default || null,
        levels: form.reasoning_levels.map((level) => ({ name: level.name.trim(), value: parseReasoningValue(level.value) })),
      }
    : REASONING_OFF;
  const pricing = pricingFromForm(form);
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    base_url: form.base_url.trim().replace(/\/+$/, ''),
    protocol: 'openai-chat',
    model: form.model.trim(),
    context_window: context,
    max_output_tokens: output,
    input_types: form.input_types,
    reasoning,
    pricing,
  };
  if (form.api_key.trim()) payload.api_key = form.api_key.trim();
  return payload;
}

export function profileOptions(catalog?: ModelCatalog): { value: string; label: string }[] {
  const options = [{ value: '', label: '默认（.env / 未指定）' }];
  for (const profile of catalog?.profiles ?? []) {
    options.push({ value: profile.id, label: `${profile.name} · ${profile.model}` });
  }
  return options;
}

export function profileById(catalog: ModelCatalog | undefined, id: string): ModelProfile | undefined {
  return catalog?.profiles.find((profile) => profile.id === id);
}

export function defaultProfile(catalog?: ModelCatalog): ModelProfile | undefined {
  return catalog?.default ? profileById(catalog, catalog.default) : undefined;
}

export function reasoningLabel(profile: ModelProfile): string {
  const reasoning = profile.reasoning;
  if (!reasoning?.default) return '不注入推理参数';
  const level = reasoning.levels.find((item) => item.name === reasoning.default);
  if (!level || level.value === null) return `${reasoning.default}（不发送）`;
  return `${reasoning.parameter} = ${formatReasoningValue(level.value)}`;
}
