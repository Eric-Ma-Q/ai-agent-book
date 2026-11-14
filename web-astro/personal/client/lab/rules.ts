// "规则" tab (F20, chapter 9): learned-rule versions, which one is active,
// self-improvement candidates with their gate results, and rollback.
import { el } from '../dom';
import { labApi } from './api';
import { interval } from './evals';
import { fmtRate } from './model';
import { badge, button, notice, section } from './ui';

type Version = { version: string; rules: string[]; created_at?: string; source?: string; evidence?: Record<string, unknown>; status?: string };
type RulesState = { active_version?: string | null; versions: Version[] };
type GateSide = { passed?: number; trials?: number; pass_rate?: number; wilson?: number[] } | null | undefined;
type Candidate = {
  candidate_id: string;
  rules: string[];
  created_at?: string;
  status: string;
  source_eval?: string;
  failures?: number | unknown[];
  proposal?: { raw?: string; rules_added?: string[] };
  version?: string | null;
  gate?: {
    eval_id?: string;
    passed: boolean;
    reasons?: string[];
    baseline?: GateSide;
    candidate?: GateSide;
    comparison?: { verdict?: string; p_value?: number } | null;
  };
};

const CANDIDATE_STATUS: Record<string, string> = { passed: '门禁通过，待采用', rejected: '门禁拒绝', adopted: '已采用' };

function evalLink(id: string) {
  const link = el('a', '', id);
  link.href = `#/eval/${id}`;
  return link;
}

function sideText(label: string, value: GateSide) {
  if (!value) return `${label} 未知`;
  const rate = value.pass_rate ?? (value.trials ? (value.passed ?? 0) / value.trials : undefined);
  const count = value.trials !== undefined ? `（${value.passed ?? 0}/${value.trials}）` : '';
  return `${label} ${fmtRate(rate)}${count} ${interval(value.wilson)}`.trim();
}

const when = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');

function evidence(value?: Record<string, unknown>) {
  if (!value || !Object.keys(value).length) return null;
  const box = el('p', 'lab-muted');
  for (const [key, item] of Object.entries(value)) {
    if (key.endsWith('eval_id') && typeof item === 'string') {
      const link = el('a', '', item);
      link.href = `#/eval/${item}`;
      box.append(`${key}：`, link, '  ');
    } else box.append(`${key}：${typeof item === 'object' ? JSON.stringify(item) : String(item)}  `);
  }
  return box;
}

function versionCard(version: Version, active: boolean, reload: () => void) {
  const card = el('article', `lab-rule${active ? ' lab-rule--active' : ''}`);
  const head = el('div', 'lab-action-head', el('strong', '', `版本 ${version.version}`), active ? badge('ok', '当前生效') : badge(version.status ?? 'inactive', version.status ?? '未生效'));
  head.append(el('span', 'lab-muted', `${when(version.created_at)} ${version.source ?? ''}`));
  card.append(head);
  card.append(version.rules.length ? el('ol', 'lab-rule-list', ...version.rules.map((rule) => el('li', '', rule))) : el('p', 'lab-muted', '（空规则集：不注入任何规则）'));
  const ev = evidence(version.evidence);
  if (ev) card.append(ev);
  if (!active) {
    const error = el('p', 'lab-error');
    error.hidden = true;
    const activate = button('设为生效（回滚到此版本）', 'lab-btn lab-btn--small', async () => {
      activate.disabled = true;
      try {
        await labApi(`/rules/${encodeURIComponent(version.version)}/activate`, {});
        reload();
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        activate.disabled = false;
      }
    });
    card.append(activate, error);
  }
  return card;
}

function candidateCard(candidate: Candidate, reload: () => void) {
  const gate = candidate.gate;
  const card = el('article', `lab-rule lab-rule--candidate`);
  const statusKind = candidate.status === 'passed' ? 'pending' : candidate.status === 'adopted' ? 'ok' : 'error';
  const head = el(
    'div',
    'lab-action-head',
    el('strong', '', `候选 ${candidate.candidate_id}`),
    badge(statusKind, CANDIDATE_STATUS[candidate.status] ?? candidate.status),
    el('span', 'lab-muted', when(candidate.created_at)),
  );
  card.append(head);
  const meta = el('p', 'lab-muted');
  if (candidate.source_eval) meta.append('来源评估 ', evalLink(candidate.source_eval), '  ');
  const failures = Array.isArray(candidate.failures) ? candidate.failures.length : candidate.failures;
  if (failures !== undefined) meta.append(`失败试验 ${failures} 条  `);
  if (candidate.version) meta.append(`已成为版本 ${candidate.version}`);
  if (meta.childNodes.length) card.append(meta);
  const added = new Set(candidate.proposal?.rules_added ?? []);
  card.append(
    el('ol', 'lab-rule-list', ...candidate.rules.map((rule) => el('li', added.has(rule) ? 'lab-rule-new' : '', rule, added.has(rule) ? el('span', 'lab-diff-tag', '新增') : ''))),
  );
  if (candidate.proposal?.raw) {
    const raw = el('details', 'lab-details', el('summary', '', '模型的改进提案原文'));
    const text = el('pre', 'lab-pre lab-pre--small');
    text.textContent = candidate.proposal.raw;
    raw.append(text);
    card.append(raw);
  }
  if (gate) {
    const gateLine = el('div', 'lab-chips', gate.passed ? badge('ok', '门禁通过') : badge('error', '门禁拒绝'));
    gateLine.append(el('span', 'lab-chip-static', sideText('基线', gate.baseline)), el('span', 'lab-chip-static', sideText('候选', gate.candidate)));
    if (gate.eval_id) gateLine.append(el('span', 'lab-muted', '门禁评估 '), evalLink(gate.eval_id));
    card.append(gateLine);
    if (gate.comparison?.verdict) card.append(el('p', 'lab-muted', `配对检验：${gate.comparison.verdict}${gate.comparison.p_value !== undefined ? `（p = ${gate.comparison.p_value.toFixed(3)}）` : ''}`));
    if (gate.reasons?.length) card.append(el('ul', 'lab-info-items', ...gate.reasons.map((r) => el('li', '', r))));
  }
  if (candidate.status === 'passed') {
    const error = el('p', 'lab-error');
    error.hidden = true;
    const adopt = button('采用为新版本', 'lab-btn lab-btn--primary lab-btn--small', async () => {
      adopt.disabled = true;
      try {
        await labApi(`/rules/candidates/${encodeURIComponent(candidate.candidate_id)}/adopt`, {});
        reload();
      } catch (err) {
        error.hidden = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        adopt.disabled = false;
      }
    });
    card.append(adopt, error);
  }
  return card;
}

export function mountRules(host: HTMLElement) {
  const versionsBox = el('div', '', el('p', 'lab-muted', '正在加载……'));
  const candidatesBox = el('div', '', el('p', 'lab-muted', '正在加载……'));
  host.append(
    section('学习规则', el('p', 'lab-field-help', '从失败中学到的规则只有在通过回归集和配对检验门禁后才会生效；运行时打开「使用学习规则」开关才会注入。每个版本都可以回滚。'), versionsBox),
    section('自我改进候选', el('p', 'lab-field-help', '在评估报告页点「从失败中改进」（或在命令行运行 improve）生成候选：模型根据失败试验提出规则，再用回归集和配对检验做门禁评估。只有通过门禁的候选才能采用。'), candidatesBox),
  );
  const load = () => {
    labApi<RulesState>('/rules')
      .then((state) => {
        if (!state.versions.length) versionsBox.replaceChildren(el('p', 'lab-muted', '还没有学习规则。'));
        else versionsBox.replaceChildren(...[...state.versions].reverse().map((v) => versionCard(v, v.version === state.active_version, load)));
      })
      .catch((error) => versionsBox.replaceChildren(notice(error, '学习规则')));
    labApi<Candidate[]>('/rules/candidates')
      .then((items) =>
        candidatesBox.replaceChildren(...(items.length ? items.map((item) => candidateCard(item, load)) : [el('p', 'lab-muted', '还没有候选。')])),
      )
      .catch((error) => candidatesBox.replaceChildren(notice(error, '自我改进')));
  };
  load();
  return () => undefined;
}
