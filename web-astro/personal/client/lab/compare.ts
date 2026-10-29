// "对比" tab (F14): the same question under two configs, side by side.
import { el } from '../dom';
import { labApi } from './api';
import { createKnobForm, type KnobForm } from './knobs-form';
import { configDiff, fmtMoney, fmtMs, fmtNum, fmtRate, fmtValue, groupRun, STATUS_LABELS } from './model';
import { createRunView } from './run-view';
import type { LabEvent } from './types';
import { button, knobCatalog, modelProfiles, notice } from './ui';

const PRESETS: { label: string; values: Record<string, unknown> }[] = [
  { label: '第 1 章：去掉工具结果', values: { drop_tool_results: true } },
  { label: '第 1 章：去掉工具定义', values: { drop_tool_definitions: true } },
  { label: '第 2 章：破坏前缀缓存', values: { stable_prefix: false } },
  { label: '第 2 章：状态栏', values: { status_bar: true } },
  { label: '第 3 章：混合检索', values: { retrieval: 'hybrid' } },
  { label: '第 4 章：10 个干扰工具', values: { distractor_tools: 10 } },
  { label: '第 10 章：子 Agent（不共享上下文）', values: { subagent: 'isolated' } },
  { label: '第 10 章：审核者（带核对证据）', values: { reviewer: 'evidence' } },
];

function metrics(events: LabEvent[]) {
  const end = groupRun(events).end;
  const t = (end?.totals ?? {}) as Record<string, unknown>;
  const c = end?.citation_check ?? {};
  return [
    ['状态', end ? STATUS_LABELS[end.status] ?? end.status : '运行中'],
    ['轮数', fmtNum(t.turns)],
    ['工具调用', fmtNum(t.tool_calls)],
    ['输入 token', fmtNum(t.prompt_tokens)],
    ['缓存命中率', fmtRate(t.cache_hit_rate)],
    ['输出 token', fmtNum(t.completion_tokens)],
    ['模型耗时', fmtMs(t.latency_ms)],
    ['参考价成本（假设）', fmtMoney(t.reference_cost)],
    ['引用核对通过', end ? `${c.verified ?? 0}/${c.total ?? 0}` : '—'],
  ];
}

export function mountCompare(host: HTMLElement) {
  const question = el('textarea', 'lab-input lab-question');
  question.rows = 2;
  question.placeholder = '同一个问题，用两套配置各跑一次';
  question.value = 'Agent 的核心公式是什么？三个组成部分分别起什么作用？';
  const forms: KnobForm[] = [];
  const columns = el('div', 'lab-compare-forms');
  const diffBox = el('div', 'lab-compare-diff');
  const table = el('div', 'lab-compare-table');
  const views = [0, 1].map(() => createRunView({ compact: true, empty: '运行后在这里显示这套配置的轨迹。' }));
  const finished: (LabEvent[] | undefined)[] = [undefined, undefined];
  const error = el('p', 'lab-error');
  error.hidden = true;

  const showDiff = () => {
    if (forms.length < 2) return;
    const diff = configDiff(forms[0].values(), forms[1].values());
    diffBox.replaceChildren(
      diff.length
        ? el('ul', 'lab-diff-list', ...diff.map((d) => el('li', '', el('code', '', d.key), `：A = ${fmtValue(d.a)}，B = ${fmtValue(d.b)}`)))
        : el('p', 'lab-muted', '两套配置完全相同——这样的对比只能看到随机波动。'),
    );
  };

  const showTable = () => {
    const rows = [metrics(finished[0] ?? []), metrics(finished[1] ?? [])];
    const grid = el('table', 'lab-table-compact');
    grid.append(el('tr', '', el('th', '', ''), el('th', '', 'A'), el('th', '', 'B')));
    rows[0].forEach(([label], index) => grid.append(el('tr', '', el('th', '', label), el('td', '', rows[0][index][1]), el('td', '', rows[1][index][1]))));
    table.replaceChildren(grid);
  };
  views.forEach((view, index) =>
    view.onEnd((events) => {
      finished[index] = events;
      showTable();
    }),
  );

  Promise.all([knobCatalog(), modelProfiles().catch(() => ({ version: 1, default: null, profiles: [], warnings: [] }))])
    .then(([catalog, models]) => {
      ['A', 'B'].forEach((name, index) => {
        const form = createKnobForm(catalog, models.profiles, index === 1 ? PRESETS[0].values : {});
        form.onChange(showDiff);
        forms.push(form);
        const col = el('div', 'lab-compare-col', el('h3', 'lab-h3', `配置 ${name}`));
        if (index === 1) {
          col.append(el('div', 'lab-examples', ...PRESETS.map((preset) => button(preset.label, 'lab-chip', () => form.set(preset.values)))));
        }
        const details = el('details', 'lab-knob-wrap', el('summary', '', '开关'), form.element);
        details.open = index === 1;
        col.append(form.nav, details);
        columns.append(col);
      });
      showDiff();
    })
    .catch((err) => columns.append(notice(err, '开关')));

  const runButton = button('同时运行两套配置', 'lab-btn lab-btn--primary', async () => {
    const text = question.value.trim();
    if (!text || forms.length < 2) return;
    runButton.disabled = true;
    error.hidden = true;
    finished.fill(undefined);
    table.replaceChildren();
    try {
      const { run_ids } = await labApi<{ run_ids: string[] }>('/compare', {
        question: text,
        configs: forms.map((form) => form.overrides()),
      });
      showTable();
      await Promise.all(views.map((view, index) => view.load(run_ids[index])));
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      runButton.disabled = false;
    }
  });

  host.append(
    el(
      'div',
      'lab-compare',
      el('div', 'lab-ask-form', question, columns, el('h3', 'lab-h3', '两套配置的差异'), diffBox, el('div', 'lab-ask-row', el('span', 'lab-spacer'), runButton), error),
      table,
      el('div', 'lab-compare-runs', el('div', 'lab-compare-run', el('h3', 'lab-h3', 'A'), views[0].element), el('div', 'lab-compare-run', el('h3', 'lab-h3', 'B'), views[1].element)),
    ),
  );
  return () => views.forEach((view) => view.destroy());
}
