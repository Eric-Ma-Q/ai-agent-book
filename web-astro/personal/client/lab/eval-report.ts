// One evaluation report (#/eval/<id>): per-arm statistics, the A/B verdict
// and every trial, each linking to its run.
import { el } from '../dom';
import { labApi } from './api';
import { interval } from './evals';
import { fmtMoney, fmtMs, fmtNum, fmtRate, isActive, STATUS_LABELS } from './model';
import { badge, button, notice, stat, timeOfRunId } from './ui';

type Verifier = { type: string; passed: boolean; detail?: string | null };
type Trial = { trial: number; run_id: string; passed: boolean; status: string; cost?: number | null; latency_ms?: number | null; verifiers?: Verifier[] };
type TaskResult = { task_id: string; kind: string; tags?: string[]; trials: Trial[] };
type Summary = {
  trials: number;
  passed: number;
  pass_rate: number;
  wilson?: number[];
  bootstrap?: number[];
  pass_hat_k?: Record<string, number>;
  cost_per_success?: number | null;
  reference_cost_per_success?: number | null;
  latency_p50_ms?: number | null;
  latency_p95_ms?: number | null;
  statuses?: Record<string, number>;
  by_kind?: Record<string, { passed: number; trials: number }>;
  regressions_failed?: string[];
};
type Arm = { name: string; config: Record<string, unknown>; config_hash: string; summary?: Summary; tasks?: TaskResult[] };
type Report = {
  eval_id: string;
  label?: string | null;
  suite: string;
  created_at?: string;
  finished_at?: string | null;
  status: string;
  progress?: { done: number; total: number };
  arms: Arm[];
  comparison?: { pairs: number; a_only: number; b_only: number; p_value: number; delta_pass_rate: number; verdict: string } | null;
  reference_price?: string;
  rescored_from?: string;
  aborted_reason?: string;
};

const VERDICTS: Record<string, string> = { better: 'B 显著变好', worse: 'B 显著变差', inconclusive: '无法区分（差异可能只是随机波动）' };

function armCard(arm: Arm) {
  const s = arm.summary;
  const card = el('article', 'lab-arm', el('h3', 'lab-h3', `配置 ${arm.name}`), el('p', 'lab-muted', `配置哈希 ${arm.config_hash}`));
  if (!s) return card;
  card.append(
    el(
      'div',
      'lab-stats',
      stat('通过率', `${fmtRate(s.pass_rate)}（${s.passed}/${s.trials}）`),
      stat('Wilson 95% 区间', interval(s.wilson), '把每次试验当作独立样本的区间'),
      stat('按任务 bootstrap 区间', interval(s.bootstrap), '同一任务的多次试验不独立，按任务重抽样更保守'),
      stat('每次成功成本', fmtMoney(s.cost_per_success)),
      stat('每次成功参考价成本（假设）', fmtMoney(s.reference_cost_per_success)),
      stat('延迟 P50 / P95', `${fmtMs(s.latency_p50_ms)} / ${fmtMs(s.latency_p95_ms)}`),
    ),
  );
  if (s.pass_hat_k) {
    card.append(
      el('p', 'lab-field-help', 'pass^k：同一任务连续 k 次都通过的比例，衡量稳定性（τ-bench）。'),
      el('div', 'lab-chips', ...Object.entries(s.pass_hat_k).map(([k, v]) => el('span', 'lab-chip-static', `pass^${k} = ${fmtRate(v)}`))),
    );
  }
  if (s.statuses) card.append(el('div', 'lab-chips', ...Object.entries(s.statuses).map(([k, v]) => el('span', 'lab-chip-static', `${STATUS_LABELS[k] ?? k} ${v}`))));
  if (s.by_kind) {
    const table = el('table', 'lab-table-compact', el('tr', '', el('th', '', '任务类型'), el('th', '', '通过'), el('th', '', '通过率')));
    Object.entries(s.by_kind).forEach(([kind, v]) =>
      table.append(el('tr', '', el('td', '', kind), el('td', 'lab-num', `${v.passed}/${v.trials}`), el('td', 'lab-num', fmtRate(v.trials ? v.passed / v.trials : null)))),
    );
    card.append(table);
  }
  if (s.regressions_failed?.length) {
    card.append(el('div', 'lab-notice lab-notice--error', el('strong', '', '回归失败：'), s.regressions_failed.join('、')));
  }
  return card;
}

function trialDot(trial: Trial) {
  const link = el('a', `lab-dot ${trial.passed ? 'lab-dot--pass' : 'lab-dot--fail'}`, trial.passed ? '✓' : '✗');
  link.href = `#/run/${trial.run_id}`;
  const lines = [`第 ${trial.trial} 次 · ${STATUS_LABELS[trial.status] ?? trial.status} · ${fmtMs(trial.latency_ms)}`];
  (trial.verifiers ?? []).forEach((v) => lines.push(`${v.passed ? '✓' : '✗'} ${v.type}${v.detail ? `：${v.detail}` : ''}`));
  link.title = lines.join('\n');
  return link;
}

function promoteButton(trial: Trial) {
  const node = button('＋回归', 'lab-btn lab-btn--tiny', async () => {
    node.disabled = true;
    try {
      const data = await labApi<{ task_id: string }>('/evals/promote', { run_id: trial.run_id });
      node.textContent = `已加入 ${data.task_id}`;
    } catch (error) {
      node.replaceWith(notice(error, '回归集'));
    }
  });
  node.title = '把这次失败的运行加入回归集，以后每次评估都会运行';
  return node;
}

function tasksTable(report: Report) {
  const table = el('table', 'lab-table');
  table.append(el('tr', '', el('th', '', '任务'), el('th', '', '类型'), ...report.arms.map((arm) => el('th', '', `配置 ${arm.name}`))));
  const ids = [...new Set(report.arms.flatMap((arm) => (arm.tasks ?? []).map((t) => t.task_id)))];
  for (const id of ids) {
    const first = report.arms.flatMap((arm) => arm.tasks ?? []).find((t) => t.task_id === id)!;
    const row = el('tr', '', el('td', 'lab-task-id', id, ...(first.tags?.length ? [el('span', 'lab-muted', ` ${first.tags.join(' ')}`)] : [])), el('td', 'lab-muted', first.kind));
    for (const arm of report.arms) {
      const task = (arm.tasks ?? []).find((t) => t.task_id === id);
      const cell = el('td', 'lab-dots');
      task?.trials.forEach((trial) => {
        cell.append(trialDot(trial));
        if (!trial.passed) cell.append(promoteButton(trial));
      });
      row.append(cell);
    }
    table.append(row);
  }
  return el('div', 'lab-table-wrap', table);
}

function improveButton(evalId: string) {
  const result = el('span', 'lab-muted');
  const node = button('从失败中改进', 'lab-btn lab-btn--small', async () => {
    node.disabled = true;
    try {
      await labApi('/rules/improve', { eval_id: evalId });
      result.replaceChildren('已在后台开始：生成候选规则并跑门禁评估，完成后到 ', Object.assign(el('a', '', '「规则」页'), { href: '#/rules' }), ' 查看。');
    } catch (error) {
      result.replaceChildren(notice(error, '自我改进'));
      node.disabled = false;
    }
  });
  node.title = '让模型根据这次评估的失败试验提出规则，再用回归集和配对检验做门禁';
  return el('div', 'lab-ask-row', node, result);
}

function rescoreButton(evalId: string) {
  const result = el('span', 'lab-muted');
  const node = button('用当前验证器重新评分', 'lab-btn lab-btn--small', async () => {
    node.disabled = true;
    try {
      const data = await labApi<{ eval_id: string }>(`/evals/${encodeURIComponent(evalId)}/rescore`, {});
      const link = Object.assign(el('a', '', '查看新报告'), { href: `#/eval/${data.eval_id}` });
      result.replaceChildren('已生成新报告（原报告保持不变）：', link);
    } catch (error) {
      result.replaceChildren(notice(error, '重新评分'));
      node.disabled = false;
    }
  });
  node.title = '验证器校准后，用当前的任务定义重新判定这次评估保存的轨迹，不再调用模型';
  return el('div', 'lab-ask-row', node, result);
}

function render(report: Report) {
  const box = el('div', 'lab-report');
  const head = el('header', 'lab-run-head', el('p', 'lab-run-question', report.label || `评估 ${report.eval_id}`));
  const meta = el('div', 'lab-run-meta', badge(report.status), el('span', '', `任务集 ${report.suite}`), el('span', 'lab-muted', `开始 ${timeOfRunId(report.eval_id)}`));
  if (report.progress) meta.append(el('span', '', `进度 ${fmtNum(report.progress.done)}/${fmtNum(report.progress.total)}`));
  if (report.rescored_from) {
    const source = Object.assign(el('a', '', report.rescored_from), { href: `#/eval/${report.rescored_from}` });
    meta.append(el('span', 'lab-muted', '重新评分自 ', source));
  }
  head.append(meta);
  if (report.aborted_reason) head.append(el('p', 'lab-notice lab-notice--error', report.aborted_reason));
  box.append(head);
  const failed = report.arms.some((arm) => (arm.summary ? arm.summary.passed < arm.summary.trials : false));
  if (report.status === 'done' && failed) box.append(improveButton(report.eval_id));
  if (report.status === 'done') box.append(rescoreButton(report.eval_id));
  if (report.comparison) {
    const c = report.comparison;
    box.append(
      el(
        'div',
        `lab-verdict lab-verdict--${c.verdict}`,
        el('strong', '', VERDICTS[c.verdict] ?? c.verdict),
        el('span', '', `通过率变化 ${c.delta_pass_rate >= 0 ? '+' : ''}${(c.delta_pass_rate * 100).toFixed(1)} 个百分点 · McNemar p = ${c.p_value.toFixed(3)}`),
        el('span', 'lab-muted', `配对 ${c.pairs} 组：只有 A 通过 ${c.a_only}，只有 B 通过 ${c.b_only}`),
      ),
    );
  }
  box.append(el('div', 'lab-arms', ...report.arms.map(armCard)));
  if (report.reference_price) box.append(el('p', 'lab-field-help', report.reference_price));
  box.append(el('h3', 'lab-h3', '逐任务结果（点 ✓/✗ 查看那次运行）'), tasksTable(report));
  return box;
}

export function mountEvalReport(host: HTMLElement, evalId: string) {
  const back = el('a', 'lab-back', '← 评估记录');
  back.href = '#/evals';
  const body = el('div', '', el('p', 'lab-muted', '正在加载……'));
  host.append(back, body);
  let timer = 0;
  const load = async () => {
    try {
      const report = await labApi<Report>(`/evals/${encodeURIComponent(evalId)}`);
      body.replaceChildren(render(report));
      if (isActive(report.status)) timer = window.setTimeout(load, 3000);
    } catch (error) {
      body.replaceChildren(notice(error, '评估报告'));
    }
  };
  void load();
  return () => clearTimeout(timer);
}
