// The end of a run: status, rendered answer with checked citations, totals.
import { el } from '../dom';
import { renderMarkdown } from './markdown';
import { CITATION_LABELS, STATUS_LABELS, agentLabel, fmtMoney, fmtMs, fmtNum, fmtRate } from './model';
import type { RunEnd } from './types';
import { badge, rich, stat } from './ui';

const REFERENCE_HINT = '按假设的参考单价（输入 $3、缓存命中 $0.3、输出 $15 / 百万 token）计算，仅用于学习成本分析';

function citationSummary(end: RunEnd) {
  const c = end.citation_check ?? {};
  const box = el('div', 'lab-cite-summary', el('strong', '', `引用 ${c.total ?? 0} 条`));
  for (const [status, label] of Object.entries(CITATION_LABELS)) {
    const n = c[status] ?? 0;
    if (n || status === 'verified') box.append(el('span', `lab-cite-count lab-cite--${status}`, `${label} ${n}`));
  }
  const bad = end.citations.filter((item) => item.status !== 'verified');
  if (bad.length) {
    box.append(
      el(
        'ul',
        'lab-cite-bad',
        ...bad.map((item) =>
          el('li', '', el('span', `lab-cite-count lab-cite--${item.status}`, CITATION_LABELS[item.status] ?? item.status), ` ch${item.chapter}#${item.section_id ?? ''}：${item.quote}`),
        ),
      ),
    );
  }
  return box;
}

function totals(t: Record<string, unknown>) {
  const grid = el(
    'div',
    'lab-stats',
    stat('轮数', fmtNum(t.turns)),
    stat('模型调用', fmtNum(t.llm_calls)),
    stat('工具调用', fmtNum(t.tool_calls)),
    stat('输入 token', fmtNum(t.prompt_tokens)),
    stat('缓存命中', `${fmtNum(t.cached_tokens)}（${fmtRate(t.cache_hit_rate)}）`),
    stat('输出 token', fmtNum(t.completion_tokens)),
    stat('推理 token', fmtNum(t.reasoning_tokens)),
    stat('模型耗时', fmtMs(t.latency_ms)),
    stat('成本', fmtMoney(t.cost)),
    stat('参考价成本（假设）', fmtMoney(t.reference_cost), REFERENCE_HINT),
  );
  const unknown = t.unknown_usage as Record<string, number> | undefined;
  if (unknown && Object.keys(unknown).length) {
    grid.append(el('p', 'lab-field-help', `部分调用没有返回这些用量字段（按次数）：${JSON.stringify(unknown)}，合计里没有计入。`));
  }
  return grid;
}

type AgentTotals = { llm_calls?: number; prompt_tokens?: number; cached_tokens?: number; completion_tokens?: number; reference_cost?: number | null };

/** Chapter 10: who spent what. Only present when more than one agent took part. */
function byAgent(t: Record<string, unknown>) {
  const rows = Object.entries((t.by_agent ?? {}) as Record<string, AgentTotals>);
  if (!rows.length) return null;
  const table = el('table', 'lab-table-compact lab-by-agent');
  table.append(el('tr', '', ...['Agent', '模型调用', '输入 token', '缓存命中', '输出 token', '参考价成本'].map((h) => el('th', '', h))));
  for (const [agent, row] of rows) {
    table.append(
      el(
        'tr',
        '',
        el('th', '', agentLabel(agent)),
        ...[fmtNum(row.llm_calls), fmtNum(row.prompt_tokens), fmtNum(row.cached_tokens), fmtNum(row.completion_tokens), fmtMoney(row.reference_cost)].map((v) => el('td', '', v)),
      ),
    );
  }
  return el('div', 'lab-by-agent-wrap', el('h4', 'lab-h4', '各 Agent 用量'), table);
}

export function resultBlock(end: RunEnd) {
  const box = el('section', `lab-result lab-result--${end.status}`);
  box.append(el('div', 'lab-result-head', el('h3', 'lab-h3', '结果'), badge(end.status, STATUS_LABELS[end.status] ?? end.status)));
  if (end.error) box.append(el('p', 'lab-error', end.error));
  if (end.answer) box.append(rich(renderMarkdown(end.answer, { citations: end.citations }), 'lab-rich lab-answer'));
  else if (end.status === 'ok') box.append(el('p', 'lab-muted', '（模型返回了空回答）'));
  box.append(citationSummary(end), totals(end.totals ?? {}));
  const agents = byAgent(end.totals ?? {});
  if (agents) box.append(agents);
  return box;
}
