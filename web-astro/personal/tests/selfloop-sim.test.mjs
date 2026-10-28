// Requirement 014: the SelfLoop simulator must stay deterministic, match the
// archived Python lab's gate story and keep the production constants honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORRECT_SOURCE,
  DEFAULT_OPTIONS,
  GATE_STATS,
  GATES,
  INITIAL_SOURCE,
  SCENARIOS,
  SOURCE_DEFAULTS,
  SOURCE_STAGES,
  STAGES,
  buildPrompt,
  estimateCost,
  estimateTokens,
  formatSimTime,
  scanIntegrity,
  scoreOf,
  simulate,
  unifiedDiff,
} from '../harness/selfloop/engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '../harness/archive/labs/selfloop');
const read = (relative) => readFile(path.join(LAB, relative), 'utf8');

function eventSignature(result) {
  return result.events.map((event) => ({
    index: event.index,
    round: event.round,
    stage: event.stage,
    kind: event.kind,
    title: event.title,
    candidateId: event.candidateId,
    bestScore: event.snapshot.bestScore,
    costUsd: event.snapshot.costUsd,
    candidateIds: event.snapshot.candidateIds,
  }));
}

test('six phases, five scenarios and four gates are exposed', () => {
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  );
  for (const stage of STAGES) {
    assert.ok(stage.name.length > 1, `${stage.id}: name`);
    assert.ok(stage.question.endsWith('？'), `${stage.id}: question`);
    assert.match(stage.file, /^selfloop\//, `${stage.id}: source file`);
    assert.ok(stage.events.length > 0, `${stage.id}: events`);
  }
  assert.deepEqual(
    SCENARIOS.map((scenario) => scenario.id),
    ['verified', 'plateau', 'budget', 'integrity', 'canary'],
  );
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.task.length > 10, `${scenario.id}: task`);
    assert.ok(scenario.description.length > 20, `${scenario.id}: description`);
    assert.ok(scenario.expectedStop.length > 0, `${scenario.id}: expected stop`);
    assert.equal(typeof scenario.defaults.maxRounds, 'number');
  }
  assert.deepEqual(
    GATES.map((gate) => gate.id),
    ['visible', 'hidden', 'canary', 'integrity'],
  );
  assert.equal(GATES[0].weight, '35%');
  assert.equal(GATES[1].weight, '65%');
  assert.equal(GATES[2].gate, true);
  assert.equal(GATES[3].gate, true);
  assert.equal(DEFAULT_OPTIONS.stopAfterRound, 0);
});

test('the recommended scenario reproduces the archived 0.4942 -> 1.0 run', () => {
  const result = simulate({ scenarioId: 'verified' });
  assert.equal(result.summary.stopReason, 'verified');
  assert.equal(result.summary.bestScore, 1);
  assert.equal(result.summary.verified, true);
  assert.equal(result.summary.bestVerified, true);
  assert.equal(result.summary.rounds, 3);
  assert.equal(result.summary.candidates, 4);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.score),
    [0.4942, 0.6867, 0.8154, 1],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.visible.passed),
    [5, 5, 5, 6],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.hidden.passed),
    [162, 316, 419, 520],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.canary.passed),
    [32, 45, 70, 95],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.accepted),
    [true, true, true, true],
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.verified),
    [false, false, false, true],
  );
  // Visible tests stay 5/6 for two improving rounds: green tests are not the gate.
  assert.equal(result.candidates[1].visible.passed, 5);
  assert.equal(result.candidates[2].visible.passed, 5);
  assert.ok(result.candidates[2].hidden.passed > result.candidates[1].hidden.passed);

  const stages = new Set(result.events.map((event) => event.stage));
  for (const stage of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
    assert.ok(stages.has(stage), `missing stage ${stage}`);
  }
  const kinds = new Set(result.events.map((event) => event.kind));
  for (const kind of [
    'run_started',
    'baseline_verify',
    'baseline_archive',
    'round_started',
    'prompt_built',
    'proposal',
    'verify_start',
    'visible_gate',
    'hidden_gate',
    'canary_gate',
    'integrity_gate',
    'score_computed',
    'verified_check',
    'accept_decision',
    'archive_write',
    'stop_check',
    'finished',
  ]) {
    assert.ok(kinds.has(kind), `missing event ${kind}`);
  }
  assert.equal(result.events.at(-1).kind, 'finished');
  assert.equal(result.events.at(-1).detail.reason, 'verified');
});

test('prompt tokens, output tokens and cost match MockProposer', () => {
  const result = simulate({ scenarioId: 'verified' });
  const prompts = result.events.filter((event) => event.kind === 'prompt_built');
  assert.deepEqual(
    prompts.map((event) => event.detail.tokensIn),
    [444, 460, 460],
  );
  assert.deepEqual(
    result.candidates.slice(1).map((candidate) => candidate.tokensOut),
    [188, 183, 185],
  );
  assert.equal(result.summary.tokensIn, 1364);
  assert.equal(result.summary.tokensOut, 556);
  assert.equal(result.summary.costUsd, 0.000616);
  for (const candidate of result.candidates.slice(1)) {
    assert.equal(candidate.costUsd, estimateCost(candidate.tokensIn, candidate.tokensOut));
  }
  assert.equal(estimateTokens('x'.repeat(9)), 2);
  assert.equal(estimateTokens(''), 1);
  assert.equal(estimateCost(444, 188), 0.000203);
});

test('build_prompt only sees the task, best source, aggregate scores and visible failures', () => {
  const prompt = buildPrompt({
    source: INITIAL_SOURCE,
    bestScore: 0.4942,
    visible: {
      passed: 5,
      total: 6,
      hidden_passed: 162,
      hidden_total: 520,
      failures: [{ test: 'test_coverage_overlap_counted_once', reason: 'AssertionError: 5 != 4' }],
    },
    history: [{ round: 0, score: 0.4942, accepted: true }],
  });
  assert.match(prompt, /^# 目标/);
  assert.match(prompt, /intervalkit/);
  assert.match(prompt, /- 当前最优分数：0\.4942/);
  assert.match(prompt, /- 可见测试：5\/6 通过/);
  assert.match(prompt, /- 隐藏用例：162\/520 通过（不展示细节）/);
  assert.match(prompt, /- test_coverage_overlap_counted_once: AssertionError: 5 != 4/);
  assert.match(prompt, /- 第 0 轮：score=0\.494，接受/);
  assert.match(prompt, /# 当前代码/);
  assert.match(prompt, /def normalize\(intervals\):/);
  assert.doesNotMatch(prompt, /expected.*got/);
  assert.ok(prompt.endsWith('如果认为已经无需改动，也要输出当前文件并说明原因。\n'));
});

test('plateau stops after K rejected rounds', () => {
  const result = simulate({ scenarioId: 'plateau' });
  assert.equal(result.summary.stopReason, 'plateau');
  assert.equal(result.summary.bestScore, 1);
  assert.equal(result.summary.rounds, 5);
  assert.equal(result.summary.plateau, 2);
  assert.deepEqual(result.summary.rejectedRounds, [4, 5]);
  const lastTwo = result.candidates.slice(-2);
  assert.deepEqual(
    lastTwo.map((candidate) => candidate.accepted),
    [false, false],
  );
  assert.deepEqual(
    lastTwo.map((candidate) => candidate.score),
    [1, 1],
  );
  assert.match(result.summary.explanation, /连续 2 轮没有严格提升/);
  assert.match(result.summary.explanation, /4、5 轮被拒/);
});

test('budget stops when cumulative cost crosses the threshold', () => {
  const result = simulate({ scenarioId: 'budget' });
  assert.equal(result.summary.stopReason, 'budget');
  assert.equal(result.summary.rounds, 3);
  assert.ok(result.summary.costUsd >= 0.00045);
  assert.ok(result.summary.costUsd < 0.0007);
  assert.equal(result.summary.verified, true);
  assert.match(result.summary.explanation, /预算/);
  const stopEvent = result.events.find((event) => event.kind === 'stop_check' && event.detail.stop);
  const budgetCheck = stopEvent.detail.checks.find((check) => check.id === 'budget');
  assert.equal(budgetCheck.met, true);
});

test('max_rounds and manual stop are separate endings', () => {
  const capped = simulate({
    scenarioId: 'verified',
    options: { maxRounds: 2, stopOnVerified: false, plateauK: 5, budgetUsd: 2, stopAfterRound: 0 },
  });
  assert.equal(capped.summary.stopReason, 'max_rounds');
  assert.equal(capped.summary.rounds, 2);
  assert.equal(capped.summary.verified, false);
  assert.match(capped.summary.explanation, /跑满 2 轮/);

  const stopped = simulate({
    scenarioId: 'verified',
    options: { stopAfterRound: 1, stopOnVerified: false, maxRounds: 6 },
  });
  assert.equal(stopped.summary.stopReason, 'stopped');
  assert.equal(stopped.summary.rounds, 1);
  assert.match(stopped.summary.explanation, /第 1 轮结束后触发手动停止/);
});

test('integrity zeros a cheating candidate and the next clean round recovers', () => {
  const result = simulate({ scenarioId: 'integrity' });
  assert.equal(result.summary.stopReason, 'verified');
  assert.equal(result.summary.rounds, 2);
  const cheat = result.candidates[1];
  assert.equal(cheat.score, 0);
  assert.equal(cheat.verified, false);
  assert.equal(cheat.accepted, false);
  assert.equal(cheat.integrity.ok, false);
  assert.match(cheat.integrity.issues.join('\n'), /open\(\)/);
  assert.deepEqual(
    [cheat.visible.passed, cheat.hidden.passed, cheat.canary.passed],
    [6, 520, 95],
  );
  const clean = result.candidates[2];
  assert.equal(clean.score, 1);
  assert.equal(clean.verified, true);
  assert.equal(clean.accepted, true);

  const scan = scanIntegrity(CORRECT_SOURCE);
  assert.equal(scan.ok, true);
  assert.deepEqual(scan.issues, []);
  const cheatScan = scanIntegrity(CORRECT_SOURCE + '\ndata = open("tests/test_visible.py").read()\n');
  assert.equal(cheatScan.ok, false);
  assert.match(cheatScan.issues.join('\n'), /文件读写 open\(\)/);
  const soft = scanIntegrity(CORRECT_SOURCE.replace('def gaps(intervals):', 'import importlib\ndef gaps(intervals):'));
  assert.equal(soft.ok, true);
  assert.match(soft.warnings.join('\n'), /importlib/);
  const missing = scanIntegrity('def normalize(x):\n    return x\n');
  assert.equal(missing.ok, false);
  assert.match(missing.issues.join('\n'), /缺少函数/);
  const huge = scanIntegrity(`${CORRECT_SOURCE}\n# ${'x'.repeat(60_001)}\n`);
  assert.equal(huge.ok, false);
  assert.match(huge.issues.join('\n'), /源码过大/);
});

test('canary is a gate: score 1.0 can still be unverified', () => {
  const result = simulate({ scenarioId: 'canary' });
  assert.equal(result.summary.stopReason, 'max_rounds');
  assert.equal(result.summary.bestScore, 1);
  assert.equal(result.summary.verified, false);
  assert.equal(result.summary.bestVerified, false);
  const candidate = result.candidates[1];
  assert.equal(candidate.score, 1);
  assert.equal(candidate.verified, false);
  assert.equal(candidate.accepted, true);
  assert.equal(candidate.visible.passed, 6);
  assert.equal(candidate.hidden.passed, 520);
  assert.equal(candidate.canary.passed, 94);
  assert.equal(candidate.canary.total, 95);
  assert.equal(candidate.canary.failures.length, 1);
  const score = scoreOf(candidate);
  assert.equal(score.score, 1);
  assert.equal(score.verified, false);
});

test('score and verified follow the Python formula', () => {
  assert.equal(scoreOf(GATE_STATS[0]).score, 0.4942);
  assert.equal(scoreOf(GATE_STATS[3]).score, 1);
  assert.equal(scoreOf(GATE_STATS[3]).verified, true);
  assert.equal(scoreOf({ ...GATE_STATS[3], integrity: { ok: false, issues: [], warnings: [] } }).score, 0);
  assert.equal(
    scoreOf({
      ...GATE_STATS[3],
      visible: { passed: 0, total: 0, failures: [] },
    }).verified,
    false,
  );
  assert.equal(
    scoreOf({
      ...GATE_STATS[3],
      canary: { passed: 94, total: 95, failures: [] },
    }).verified,
    false,
  );
  assert.equal(
    scoreOf({
      ...GATE_STATS[3],
      hidden: { passed: 519, total: 520, failures: [] },
    }).verified,
    false,
  );
});

test('the same input produces an identical trace', () => {
  const first = simulate({ scenarioId: 'verified' });
  const second = simulate({ scenarioId: 'verified' });
  assert.deepEqual(eventSignature(first), eventSignature(second));
  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(
    first.candidates.map((candidate) => [candidate.id, candidate.score, candidate.accepted]),
    second.candidates.map((candidate) => [candidate.id, candidate.score, candidate.accepted]),
  );
  assert.equal(first.events.length, second.events.length);
  assert.deepEqual(first.archive.files, second.archive.files);
});

test('events carry contiguous indexes and inspectable snapshots', () => {
  const result = simulate({ scenarioId: 'verified' });
  const ids = new Set(result.candidates.map((candidate) => candidate.id));
  result.events.forEach((event, index) => {
    assert.equal(event.index, index);
    assert.equal(event.id, index);
    assert.ok(event.snapshot);
    assert.ok(Array.isArray(event.snapshot.archivedFiles));
    assert.ok(Array.isArray(event.snapshot.candidateIds));
    assert.equal(new Set(event.snapshot.candidateIds).size, event.snapshot.candidateIds.length);
    if (event.candidateId) assert.ok(ids.has(event.candidateId), `${event.kind}: candidate id`);
    for (const id of event.snapshot.candidateIds) assert.ok(ids.has(id), `${event.kind}: archived id`);
  });
  assert.equal(result.events[0].snapshot.bestScore, 0);
  assert.equal(result.events[1].snapshot.bestScore, 0.4942);
  assert.equal(result.events.at(-1).snapshot.stopReason, 'verified');
  assert.equal(formatSimTime(0), '2026-10-18T21:00:00+08:00');
});

test('the in-memory archive mirrors archive.py layout', () => {
  const result = simulate({ scenarioId: 'verified' });
  const paths = result.archive.files.map((file) => file.path);
  assert.deepEqual(paths, [
    'meta.json',
    'candidates.jsonl',
    'snapshots/b0000001.py',
    'snapshots/c0000001.py',
    'snapshots/c0000002.py',
    'snapshots/c0000003.py',
    'best.py',
    'events.jsonl',
  ]);
  assert.equal(result.archive.meta.status, 'finished');
  assert.equal(result.archive.meta.stop_reason, 'verified');
  assert.equal(result.archive.meta.best_score, 1);
  assert.equal(result.archive.meta.best_candidate, 'c0000003');
  assert.equal(result.archive.meta.verified, true);
  assert.equal(result.archive.meta.config.max_rounds, 6);
  assert.equal('api_key' in result.archive.meta.config, false);
  assert.equal(result.archive.bestSource, CORRECT_SOURCE);
  assert.equal(result.archive.snapshots.c0000003, CORRECT_SOURCE);
  assert.equal(result.archive.candidatesJsonl.trim().split('\n').length, 4);
  assert.ok(result.archive.candidatesJsonl.endsWith('\n'));
  assert.equal(result.archive.eventsJsonl.trim().split('\n').length, result.events.length);
  assert.ok(result.archive.eventsJsonl.endsWith('\n'));
  const best = result.archive.files.find((file) => file.path === 'best.py');
  assert.equal(best.content, CORRECT_SOURCE);
  assert.ok(best.bytes > 0);
  assert.ok(best.lines > 0);
});

test('source stages and gate stats are the ones the Python verifier produced', () => {
  assert.deepEqual(
    SOURCE_STAGES.map((source) => new TextEncoder().encode(source).length),
    [875, 915, 892, 903],
  );
  assert.deepEqual(
    SOURCE_STAGES.map((source) => source.length),
    [715, 755, 732, 743],
  );
  assert.deepEqual(
    GATE_STATS.map((stats) => stats.sourceBytes),
    [875, 915, 892, 903],
  );
  assert.equal(CORRECT_SOURCE, SOURCE_STAGES[3]);
  assert.equal(GATE_STATS[3].visible.total, 6);
  assert.equal(GATE_STATS[3].hidden.total, 520);
  assert.equal(GATE_STATS[3].canary.total, 95);
});

test('unified diffs mark additions and deletions without mutating inputs', () => {
  const before = 'def a():\n    return 1\n\ndef b():\n    return 2\n';
  const after = 'def a():\n    return 1\n\ndef b():\n    return 3\n';
  const diff = unifiedDiff(before, after, { fromFile: 'baseline.py', toFile: 'c1.py' });
  assert.equal(diff.fromFile, 'baseline.py');
  assert.equal(diff.toFile, 'c1.py');
  assert.equal(diff.changed, true);
  assert.equal(diff.hunks.length, 1);
  assert.match(diff.hunks[0].header, /^@@ -\d+,\d+ \+\d+,\d+ @@$/);
  const kinds = diff.hunks[0].lines.map((line) => line.kind);
  assert.ok(kinds.includes('-'));
  assert.ok(kinds.includes('+'));
  assert.ok(kinds.includes(' '));
  assert.ok(diff.hunks[0].lines.some((line) => line.kind === '-' && line.text.includes('return 2')));
  assert.ok(diff.hunks[0].lines.some((line) => line.kind === '+' && line.text.includes('return 3')));
  assert.equal(unifiedDiff(before, before).changed, false);
  assert.equal(before, 'def a():\n    return 1\n\ndef b():\n    return 2\n');
});

test('the simulator constants still match the Python lab', async () => {
  const loop = await read('selfloop/loop.py');
  const providers = await read('selfloop/providers.py');
  const verify = await read('selfloop/verify.py');
  const tasks = await read('selfloop/tasks.py');

  assert.match(loop, /max_rounds: int = 10/);
  assert.match(loop, /budget_usd: float = 2\.0/);
  assert.match(loop, /plateau_k: int = 3/);
  assert.match(loop, /stop_on_verified: bool = True/);
  assert.match(loop, /res\.score > self\.state\.best_score \+ 1e-9/);
  assert.match(loop, /self\._finish\("verified"\)/);
  assert.match(loop, /self\._finish\("budget"\)/);
  assert.match(loop, /self\._finish\("plateau"\)/);
  assert.match(loop, /self\._finish\("max_rounds"\)/);
  assert.match(loop, /self\._finish\("stopped"\)/);
  assert.match(providers, /PRICE_IN = float\(os\.environ\.get\("SELFLOOP_PRICE_IN", "0\.28"\)\)/);
  assert.match(providers, /PRICE_OUT = float\(os\.environ\.get\("SELFLOOP_PRICE_OUT", "0\.42"\)\)/);
  assert.match(providers, /tin = max\(1, len\(prompt\) \/\/ 4\)/);
  assert.match(providers, /tout = max\(1, len\(source\) \/\/ 4\)/);
  assert.match(verify, /0\.35 \* vis_ratio \+ 0\.65 \* hid_ratio/);
  assert.match(verify, /MAX_SOURCE_BYTES = 60_000/);
  assert.match(verify, /timeout: float = 30\.0/);
  assert.match(verify, /文件读写 open\(\)/);
  assert.match(verify, /篡改 sys\.modules/);
  assert.match(tasks, /n_sets: int = 120/);
  assert.match(tasks, /for _ in range\(30\)/);

  assert.deepEqual(
    {
      maxRounds: SOURCE_DEFAULTS.maxRounds,
      budgetUsd: SOURCE_DEFAULTS.budgetUsd,
      plateauK: SOURCE_DEFAULTS.plateauK,
      stopOnVerified: SOURCE_DEFAULTS.stopOnVerified,
      visibleWeight: SOURCE_DEFAULTS.visibleWeight,
      hiddenWeight: SOURCE_DEFAULTS.hiddenWeight,
      maxSourceBytes: SOURCE_DEFAULTS.maxSourceBytes,
      timeoutSec: SOURCE_DEFAULTS.timeoutSec,
      priceIn: SOURCE_DEFAULTS.priceIn,
      priceOut: SOURCE_DEFAULTS.priceOut,
      visibleTests: SOURCE_DEFAULTS.visibleTests,
      hiddenCases: SOURCE_DEFAULTS.hiddenCases,
      canaryCases: SOURCE_DEFAULTS.canaryCases,
    },
    {
      maxRounds: 10,
      budgetUsd: 2,
      plateauK: 3,
      stopOnVerified: true,
      visibleWeight: 0.35,
      hiddenWeight: 0.65,
      maxSourceBytes: 60_000,
      timeoutSec: 30,
      priceIn: 0.28,
      priceOut: 0.42,
      visibleTests: 6,
      hiddenCases: 520,
      canaryCases: 95,
    },
  );
  assert.equal(SOURCE_DEFAULTS.hiddenCases, 120 * 4 + 10 * 4);
  assert.equal(SOURCE_DEFAULTS.canaryCases, 30 * 3 + 5);
});
