// "评估" tab: start an evaluation (single config or A/B), the list with
// progress, and the pass-rate trend across evaluations.
import { el } from '../dom';
import { labApi } from './api';
import { createKnobForm, type KnobForm } from './knobs-form';
import { fmtMoney, fmtMs, fmtRate, isActive, STATUS_LABELS } from './model';
import { trendGeometry, type TrendPoint } from './trend-geom';
import { badge, button, knobCatalog, modelProfiles, notice, section, timeOfRunId } from './ui';

type Suite = { name: string; task_count: number; kinds?: Record<string, number> };
type EvalItem = {
  eval_id: string;
  label?: string | null;
  suite: string;
  created_at?: string | null;
  status: string;
  progress?: { done: number; total: number };
  arms?: { name: string; pass_rate?: number | null; wilson?: number[] | null }[];
};
type Trend = TrendPoint & {
  eval_id: string;
  created_at?: string;
  label?: string | null;
  model?: string | null;
  config_hash?: string;
  cost_per_success?: number | null;
  latency_p95_ms?: number | null;
};

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const node = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
};

export const interval = (w?: number[] | null) => (w && w.length === 2 ? `[${fmtRate(w[0])}, ${fmtRate(w[1])}]` : '');

function trendChart(points: Trend[]) {
  const box = { width: 640, height: 220, pad: 28 };
  const geo = trendGeometry(points, box);
  const chart = svg('svg', { viewBox: `0 0 ${box.width} ${box.height}`, class: 'lab-trend', role: 'img' });
  chart.setAttribute('aria-label', '历次评估的通过率趋势');
  geo.ticks.forEach((tick) => {
    chart.append(svg('line', { x1: box.pad, x2: box.width - box.pad, y1: tick.y, y2: tick.y, class: 'lab-trend-grid' }));
    const label = svg('text', { x: 4, y: tick.y + 4, class: 'lab-trend-tick' });
    label.textContent = `${tick.value * 100}%`;
    chart.append(label);
  });
  if (geo.band) chart.append(svg('path', { d: geo.band, class: 'lab-trend-band' }));
  chart.append(svg('path', { d: geo.line, class: 'lab-trend-line' }));
  geo.coords.forEach((c, i) => {
    const link = svg('a', { href: `#/eval/${points[i].eval_id}` });
    const dot = svg('circle', { cx: c.x, cy: c.y, r: 4.5, class: 'lab-trend-dot' });
    const title = svg('title', {});
    const p = points[i];
    title.textContent = `${p.label ?? p.eval_id}：${fmtRate(p.pass_rate)} ${interval(p.wilson as number[])}，模型 ${p.model ?? ''}`;
    dot.append(title);
    link.append(dot);
    chart.append(link);
  });
  return chart;
}

function startForm(suites: Suite[], forms: KnobForm[], onStarted: (id: string) => void) {
  const suite = el('select', 'lab-input');
  suites.forEach((s) => suite.append(new Option(`${s.name}（${s.task_count} 个任务）`, s.name)));
  const trials = el('input', 'lab-input lab-input--num');
  trials.type = 'number';
  trials.min = '1';
  trials.max = '10';
  trials.value = '3';
  const label = el('input', 'lab-input');
  label.placeholder = '标签，例如「基线」';
  const ab = el('input');
  ab.type = 'checkbox';
  const replay = el('input');
  replay.type = 'checkbox';
  const formB = el('details', 'lab-knob-wrap', el('summary', '', '配置 B'), forms[1].element);
  formB.hidden = true;
  const summaryA = el('summary', '', '配置');
  ab.addEventListener('change', () => {
    formB.hidden = !ab.checked;
    summaryA.textContent = ab.checked ? '配置 A' : '配置';
    replay.disabled = ab.checked;
    if (ab.checked) replay.checked = false;
  });
  const error = el('p', 'lab-error');
  error.hidden = true;
  const start = button('开始评估', 'lab-btn lab-btn--primary', async () => {
    start.disabled = true;
    error.hidden = true;
    const base: Record<string, unknown> = { suite: suite.value, trials: Number(trials.value) || 1 };
    if (label.value.trim()) base.label = label.value.trim();
    try {
      const data = ab.checked
        ? await labApi<{ eval_id: string }>('/evals/ab', { ...base, configs: [forms[0].overrides(), forms[1].overrides()] })
        : await labApi<{ eval_id: string }>('/evals', { ...base, config: forms[0].overrides(), replay: replay.checked });
      onStarted(data.eval_id);
    } catch (err) {
      error.hidden = false;
      error.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      start.disabled = false;
    }
  });
  return el(
    'div',
    'lab-eval-form',
    el('div', 'lab-eval-row', el('label', 'lab-field', el('span', 'lab-field-label', '任务集'), suite), el('label', 'lab-field', el('span', 'lab-field-label', '每个任务重复次数'), trials), el('label', 'lab-field', el('span', 'lab-field-label', '标签'), label)),
    el('div', 'lab-eval-row', el('label', 'lab-check', ab, 'A/B 对比（两套配置跑同一任务集，做配对检验）'), el('label', 'lab-check', replay, '用录制的响应回放（零成本，只对单配置有效）')),
    el('details', 'lab-knob-wrap', summaryA, forms[0].element),
    formB,
    el('div', 'lab-ask-row', el('span', 'lab-spacer'), start),
    error,
  );
}

function evalRow(item: EvalItem) {
  const link = el('a', '', item.label || item.eval_id);
  link.href = `#/eval/${item.eval_id}`;
  const progress = el('progress', 'lab-progress');
  progress.max = item.progress?.total || 1;
  progress.value = item.progress?.done ?? 0;
  const arms = (item.arms ?? []).map((arm) => `${arm.name} ${fmtRate(arm.pass_rate)} ${interval(arm.wilson)}`).join(' · ');
  return el(
    'tr',
    '',
    el('td', 'lab-nowrap', timeOfRunId(item.eval_id)),
    el('td', '', link),
    el('td', 'lab-muted', item.suite),
    el('td', '', badge(item.status, STATUS_LABELS[item.status] ?? item.status)),
    el('td', '', progress, el('span', 'lab-muted', ` ${item.progress?.done ?? 0}/${item.progress?.total ?? '?'}`)),
    el('td', '', arms),
  );
}

export function mountEvals(host: HTMLElement) {
  const formBox = el('div', '', el('p', 'lab-muted', '正在加载……'));
  const listBox = el('div', '', el('p', 'lab-muted', '正在加载……'));
  const trendBox = el('div', '', el('p', 'lab-muted', '正在加载……'));
  host.append(section('启动评估', formBox), section('评估记录', listBox), section('通过率趋势', trendBox));
  let timer = 0;

  Promise.all([labApi<Suite[]>('/evals/suites'), knobCatalog(), modelProfiles().catch(() => ({ version: 1, default: null, profiles: [], warnings: [] }))])
    .then(([suites, catalog, models]) => {
      const forms = [createKnobForm(catalog, models.profiles), createKnobForm(catalog, models.profiles)];
      formBox.replaceChildren(startForm(suites, forms, (id) => (location.hash = `#/eval/${id}`)));
    })
    .catch((error) => formBox.replaceChildren(notice(error, '评估')));

  const loadList = async () => {
    try {
      const items = await labApi<EvalItem[]>('/evals');
      if (!items.length) listBox.replaceChildren(el('p', 'lab-muted', '还没有评估记录。'));
      else {
        const table = el('table', 'lab-table');
        table.append(el('tr', '', ...['时间', '评估', '任务集', '状态', '进度', '通过率与 95% 区间'].map((h) => el('th', '', h))));
        items.forEach((item) => table.append(evalRow(item)));
        listBox.replaceChildren(el('div', 'lab-table-wrap', table));
      }
      if (items.some((item) => isActive(item.status))) timer = window.setTimeout(loadList, 4000);
    } catch (error) {
      listBox.replaceChildren(notice(error, '评估'));
    }
  };
  void loadList();

  labApi<Trend[]>('/evals/trend')
    .then((points) => {
      if (!points.length) {
        trendBox.replaceChildren(el('p', 'lab-muted', '完成至少一次评估后会显示趋势。'));
        return;
      }
      const latest = points[points.length - 1];
      trendBox.replaceChildren(
        trendChart(points),
        el('p', 'lab-field-help', `阴影是 Wilson 95% 区间。最近一次：${fmtRate(latest.pass_rate)} ${interval(latest.wilson as number[])}，每次成功成本 ${fmtMoney(latest.cost_per_success)}，P95 ${fmtMs(latest.latency_p95_ms)}。只有同一模型、同一任务集的点才可比较。`),
      );
    })
    .catch((error) => trendBox.replaceChildren(notice(error, '趋势')));

  return () => clearTimeout(timer);
}
