// Requirement 013: pure helpers for the model selector. Kept free of DOM and
// API imports so `node --test` can load it directly.
import type { ModelCatalog, ModelProfile } from '../settings/model-profiles.ts';

export type ModelChoice = {
  value: string;
  label: string;
  meta: string;
  isDefault: boolean;
  hasKey: boolean;
  profile: ModelProfile | null;
};

export function formatContext(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value % 1_000 === 0) return `${value / 1_000}K`;
  return String(value);
}

export function modelChoices(catalog?: ModelCatalog | null): ModelChoice[] {
  const profiles = catalog?.profiles ?? [];
  const defaultProfile = profiles.find((profile) => profile.id === catalog?.default) ?? null;
  return [
    {
      value: '',
      label: '默认模型',
      meta: defaultProfile ? `${defaultProfile.name} · ${defaultProfile.model}` : '.env 默认',
      isDefault: true,
      hasKey: defaultProfile?.has_key ?? true,
      profile: defaultProfile,
    },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
      meta: `${profile.model} · ${formatContext(profile.context_window) || '上下文未知'}`,
      isDefault: profile.id === catalog?.default,
      hasKey: profile.has_key,
      profile,
    })),
  ];
}

export function filterModelChoices(choices: ModelChoice[], query: string): ModelChoice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return choices;
  return choices.filter((choice) =>
    [choice.value, choice.label, choice.meta, choice.profile?.model]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle),
  );
}

export function resolveModelChoice(choices: ModelChoice[], saved: string): string {
  return choices.some((choice) => choice.value === saved) ? saved : '';
}

export function modelButtonLabel(choice: ModelChoice | undefined): string {
  if (!choice) return '默认模型';
  if (choice.value === '') return choice.profile?.name ?? '默认模型';
  return choice.label;
}

export function formatUsage(usage: { prompt_tokens?: number | null; completion_tokens?: number | null }): string {
  const parts = [];
  if (Number.isFinite(usage.prompt_tokens)) {
    parts.push(`${(usage.prompt_tokens as number).toLocaleString('en-US')} in`);
  }
  if (Number.isFinite(usage.completion_tokens)) {
    parts.push(`${(usage.completion_tokens as number).toLocaleString('en-US')} out`);
  }
  return parts.join(' · ');
}

export function formatCost(cost: number | null | undefined): string {
  if (cost === null || cost === undefined) return '成本未知';
  if (!Number.isFinite(cost)) return '成本未知';
  if (cost === 0) return '$0';
  return `$${cost.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (!Number.isFinite(ms)) return '';
  return `${((ms as number) / 1000).toFixed(1)} 秒`;
}

export function resumeSignalsFromStorage(check: unknown, plan: unknown) {
  if (!Array.isArray(check) || !Array.isArray(plan)) return null;
  if (check.length !== 10 || plan.length < 1 || plan.length > 30) return null;
  if (!check.every((item) => typeof item === 'boolean')) return null;
  if (!plan.every((item) => typeof item === 'boolean')) return null;
  return {
    selfCheck: check.filter(Boolean).length,
    planDone: plan.filter(Boolean).length,
    planTotal: plan.length,
  };
}
