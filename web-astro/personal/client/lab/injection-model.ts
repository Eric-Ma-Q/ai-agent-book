// Pure logic for the prompt-injection lab (requirement 033). No DOM imports,
// so node --test can load it directly.
import type { SecurityCatalog, SecurityCell, SecurityReport, SecurityTrial } from './types.ts';

export const TERMINAL = new Set(['done', 'cancelled', 'failed', 'interrupted']);
export const isTerminal = (status: string) => TERMINAL.has(status);

export const VERDICT_LABELS: Record<string, string> = {
  secret_leaked: '密钥泄露',
  no_secret_leak: '未泄露',
  unauthorized_write: '越权写入',
  write_blocked: '写入被拦截',
  write_not_called: '未调用写入',
  unauthorized_email: '越权外发',
  email_blocked: '外发被拦截',
  email_not_called: '未外发',
  memory_not_poisoned: '记忆未污染',
  skipped: '已跳过',
  error: '执行出错',
};

export const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  done: '已完成',
  cancelled: '已取消',
  failed: '失败',
  interrupted: '已中断',
  ok: '完成',
  max_turns: '达到最大轮数',
  budget_exceeded: '超出预算',
  skipped: '已跳过',
  error: '出错',
};

export type Selection = { attacks: string[]; defenses: string[]; trials: number };

export type Estimate = {
  total: number;
  calls: number;
  warning: boolean;
  error: string | null;
};

/** 一次 trial 的模型调用上限：记忆注入两轮，其他一轮；每轮 6 步。 */
function callsPerTrial(catalog: SecurityCatalog, attackId: string, limits = 6): number {
  return attackId === 'memory' ? limits * 2 : limits;
}

export function estimateSelection(catalog: SecurityCatalog, selection: Selection): Estimate {
  const total = selection.attacks.length * selection.defenses.length * selection.trials;
  const calls = selection.attacks.reduce(
    (sum, attackId) => sum + callsPerTrial(catalog, attackId, catalog.limits.max_steps_per_turn) * selection.defenses.length * selection.trials,
    0,
  );
  let error: string | null = null;
  if (!selection.attacks.length) error = '至少选择一个攻击场景';
  else if (!selection.defenses.length) error = '至少选择一个防御配置';
  else if (selection.trials < 1 || selection.trials > catalog.limits.max_trials_per_cell) error = `试验次数应在 1–${catalog.limits.max_trials_per_cell} 之间`;
  else if (total > catalog.limits.max_total_trials) error = `一次实验最多 ${catalog.limits.max_total_trials} 次试验，当前 ${total} 次`;
  return { total, calls, warning: total > 24, error };
}

/** 矩阵按目录顺序排列，只保留报告里实际选中的攻击/防御。 */
export function matrixRows(report: SecurityReport, catalog: SecurityCatalog) {
  const attacks = catalog.attacks.filter((attack) => report.selection.attacks.includes(attack.id));
  const defenses = catalog.defenses.filter((defense) => report.selection.defenses.includes(defense.id));
  return attacks.map((attack) => ({
    attack,
    cells: defenses.map((defense) => ({
      defense,
      cell: report.cells.find((item) => item.attack === attack.id && item.defense === defense.id),
    })),
  }));
}

export function fmtPercent(value?: number | null): string {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';
}

/** 成功率越高越危险：提示注入实验里“成功”指攻击得手。 */
export function rateTone(value?: number | null): 'none' | 'low' | 'mid' | 'high' | 'critical' {
  if (typeof value !== 'number') return 'none';
  if (value < 0.01) return 'low';
  if (value < 0.34) return 'mid';
  if (value < 0.67) return 'high';
  return 'critical';
}

export function cellLabel(cell?: SecurityCell): string {
  if (!cell || cell.done === 0) return '—';
  return `${cell.successes}/${cell.done}`;
}

export function cellState(cell?: SecurityCell): string {
  if (!cell) return '未开始';
  if (cell.done === 0) return cell.skipped ? `已跳过 ${cell.skipped}` : '未开始';
  if (cell.done < cell.trials) return `进行中 ${cell.done}/${cell.trials}${cell.skipped ? `，跳过 ${cell.skipped}` : ''}`;
  if (cell.errors === cell.done) return '全部出错';
  return `完成 ${cell.done}/${cell.trials}`;
}

export function overallRate(report: SecurityReport): number | null {
  const results = report.cells.flatMap((cell) => cell.results).filter((trial) => trial.status !== 'skipped');
  if (!results.length) return null;
  return results.filter((trial) => trial.success).length / results.length;
}

export function isZeroResult(report: SecurityReport): boolean {
  if (report.status !== 'done') return false;
  const results = report.cells.flatMap((cell) => cell.results).filter((trial) => trial.status !== 'skipped');
  return results.length > 0 && results.every((trial) => !trial.success && trial.status !== 'error');
}

export function evidenceLines(trial: SecurityTrial): string[] {
  const lines: string[] = [];
  const evidence = trial.evidence ?? {};
  if (typeof evidence.secret_fragment === 'string') lines.push(`命中密钥片段：${evidence.secret_fragment}`);
  if (typeof evidence.path === 'string') lines.push(`写入路径：${evidence.path}`);
  if (typeof evidence.to === 'string') lines.push(`收件人：${evidence.to}`);
  if (typeof evidence.blocked === 'boolean') lines.push(evidence.blocked ? '执行层已拦截' : '执行层未拦截');
  if (typeof evidence.memory_poisoned === 'boolean') lines.push(evidence.memory_poisoned ? '记忆已被污染' : '记忆未被污染');
  return lines;
}

export function trialSummary(trial: SecurityTrial): string {
  const verdict = VERDICT_LABELS[trial.verdict] ?? trial.verdict;
  return `第 ${trial.trial} 次 · ${trial.success ? '攻击得手' : '攻击未得手'} · ${verdict}`;
}

/** 当前矩阵是否还有进行中的格子。 */
export function hasRunningCells(report: SecurityReport): boolean {
  return report.cells.some((cell) => cell.done + (cell.skipped ?? 0) < cell.trials);
}


/** Markdown copy of the matrix; no full answers or traces. */
export function reportMarkdown(report: SecurityReport, catalog: SecurityCatalog): string {
  const rows = matrixRows(report, catalog);
  const defenses = rows[0]?.cells.map((entry) => entry.defense) ?? [];
  const lines = [
    `# 提示注入攻防实验 ${report.campaign_id}`,
    '',
    `- 模型：${report.model?.model ?? '未知'}`,
    `- 温度：${report.model?.temperature ?? '未知'}`,
    `- 每格试验：${report.selection.trials}`,
    `- 状态：${report.status}`,
    '',
    `| 攻击 \\ 防御 | ${defenses.map((defense) => `${defense.name}（${defense.id}）`).join(' | ')} |`,
    `|---|${defenses.map(() => '---').join('|')}|`,
  ];
  for (const row of rows) {
    const cells = row.cells.map(({ cell }) => `${cellLabel(cell)} ${fmtPercent(cell?.success_rate)}`);
    lines.push(`| ${row.attack.name} | ${cells.join(' | ')} |`);
  }
  lines.push('', '成功率越低越安全；数字为「攻击得手次数 / 已完成试验」。');
  return lines.join('\n');
}
