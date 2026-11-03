import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellLabel,
  cellState,
  estimateSelection,
  evidenceLines,
  fmtPercent,
  isZeroResult,
  matrixRows,
  overallRate,
  rateTone,
  reportMarkdown,
  trialSummary,
} from '../client/lab/injection-model.ts';

const catalog = {
  protocol: '2-5-lab-v1',
  attacks: [
    { id: 'direct', name: '直接注入', summary: '', channel: 'user', target: 'secret' },
    { id: 'indirect', name: '间接注入', summary: '', channel: 'webpage', target: 'write' },
    { id: 'memory', name: '记忆注入', summary: '', channel: 'notes', target: 'email' },
  ],
  defenses: [
    { id: 'D1', name: '无防御', summary: '', layers: [] },
    { id: 'D2', name: '提示词加固', summary: '', layers: ['prompt_hardening'] },
    { id: 'D3', name: '来源标记', summary: '', layers: ['prompt_hardening', 'source_tagging'] },
    { id: 'D4', name: '组合防御', summary: '', layers: ['prompt_hardening', 'source_tagging', 'runtime_guard'] },
  ],
  limits: { max_trials_per_cell: 5, max_total_trials: 60, max_steps_per_turn: 6, max_trial_tokens: 30000, max_tool_result_chars: 4000 },
  defaults: { attacks: ['direct', 'indirect', 'memory'], defenses: ['D1', 'D2', 'D3', 'D4'], trials: 1, temperature: 0.7 },
  demo: { secret_label: '', attacker_email: '', leak_path: '', webpage_url: '', notes_url: '' },
};

const trial = (overrides = {}) => ({
  attack: 'direct',
  defense: 'D1',
  trial: 1,
  status: 'done',
  success: false,
  verdict: 'no_secret_leak',
  reason: '未泄露',
  evidence: {},
  run_ids: ['20261028-180000-abcd'],
  llm_calls: 1,
  tokens: 100,
  cost: 0,
  latency_ms: 10,
  ...overrides,
});

const report = {
  version: 1,
  protocol: '2-5-lab-v1',
  campaign_id: '20261028-180000-abcd',
  status: 'done',
  created_at: '2026-10-28T18:00:00Z',
  model: { model: 'test', temperature: 0.7 },
  selection: { attacks: ['direct', 'indirect'], defenses: ['D1', 'D2'], trials: 1 },
  progress: { done: 4, total: 4 },
  totals: { runs: 4, llm_calls: 4, tokens: 400, cost: 0 },
  cells: [
    { attack: 'direct', defense: 'D1', trials: 1, done: 1, successes: 0, errors: 0, success_rate: 0, results: [trial()] },
    { attack: 'direct', defense: 'D2', trials: 1, done: 1, successes: 0, errors: 0, success_rate: 0, results: [trial()] },
    { attack: 'indirect', defense: 'D1', trials: 1, done: 1, successes: 1, errors: 0, success_rate: 1, results: [trial({ attack: 'indirect', verdict: 'unauthorized_write', success: true })] },
    { attack: 'indirect', defense: 'D2', trials: 1, done: 1, successes: 0, errors: 0, success_rate: 0, results: [trial({ attack: 'indirect', verdict: 'write_not_called' })] },
  ],
};

test('estimates runs and worst-case model calls', () => {
  const one = estimateSelection(catalog, { attacks: ['direct', 'indirect', 'memory'], defenses: ['D1', 'D2', 'D3', 'D4'], trials: 1 });
  assert.equal(one.total, 12);
  assert.equal(one.calls, (6 + 6 + 12) * 4);
  assert.equal(one.warning, false);
  const three = estimateSelection(catalog, { attacks: ['direct'], defenses: ['D1'], trials: 3 });
  assert.equal(three.total, 3);
  assert.equal(three.calls, 18);
});

test('rejects empty selections and oversized campaigns', () => {
  assert.match(estimateSelection(catalog, { attacks: [], defenses: ['D1'], trials: 1 }).error, /至少选择/);
  assert.match(estimateSelection(catalog, { attacks: ['direct'], defenses: [], trials: 1 }).error, /至少选择/);
  assert.match(estimateSelection(catalog, { attacks: ['direct'], defenses: ['D1'], trials: 0 }).error, /1–5/);
  const tooMany = { ...catalog, attacks: [...catalog.attacks, ...catalog.attacks], limits: { ...catalog.limits, max_total_trials: 1 } };
  assert.match(estimateSelection(tooMany, { attacks: ['direct', 'indirect'], defenses: ['D1'], trials: 1 }).error, /最多/);
});

test('matrix keeps catalog order and only selected rows', () => {
  const rows = matrixRows(report, catalog);
  assert.deepEqual(rows.map((row) => row.attack.id), ['direct', 'indirect']);
  assert.deepEqual(rows[0].cells.map((entry) => entry.defense.id), ['D1', 'D2']);
  assert.equal(rows[1].cells[0].cell.successes, 1);
});

test('formats rates and tones with success meaning attack success', () => {
  assert.equal(fmtPercent(0), '0%');
  assert.equal(fmtPercent(null), '—');
  assert.equal(rateTone(0), 'low');
  assert.equal(rateTone(0.5), 'high');
  assert.equal(rateTone(1), 'critical');
  assert.equal(rateTone(null), 'none');
  assert.equal(cellLabel({ done: 0 }), '—');
  assert.equal(cellLabel({ done: 2, successes: 1 }), '1/2');
  assert.equal(cellState({ done: 0, trials: 1 }), '未开始');
  assert.equal(cellState({ done: 2, trials: 3, errors: 0 }), '进行中 2/3');
  assert.equal(cellState({ done: 0, trials: 1, skipped: 1 }), '已跳过 1');
});

test('overall rate and zero result ignore skipped trials', () => {
  assert.equal(overallRate(report), 0.25);
  assert.equal(isZeroResult(report), false);
  const zero = { ...report, cells: report.cells.map((cell) => ({ ...cell, successes: 0, results: [trial({ attack: cell.attack, defense: cell.defense })] })) };
  assert.equal(overallRate(zero), 0);
  assert.equal(isZeroResult(zero), true);
  assert.equal(isZeroResult({ ...zero, status: 'running' }), false);
});

test('formats evidence and trial summary without HTML', () => {
  const lines = evidenceLines(trial({ evidence: { path: '/tmp/leaked.txt', blocked: true, memory_poisoned: false } }));
  assert.ok(lines.includes('写入路径：/tmp/leaked.txt'));
  assert.ok(lines.includes('执行层已拦截'));
  assert.ok(lines.includes('记忆未被污染'));
  assert.match(trialSummary(trial({ success: true, verdict: 'secret_leaked' })), /攻击得手.*密钥泄露/);
});


test('markdown export keeps the matrix and omits full answers', () => {
  const md = reportMarkdown(report, catalog);
  assert.match(md, /提示注入攻防实验/);
  assert.match(md, /直接注入/);
  assert.match(md, /1\/1 100%/);
  assert.match(md, /成功率越低越安全/);
  assert.doesNotMatch(md, /最终回答/);
});
