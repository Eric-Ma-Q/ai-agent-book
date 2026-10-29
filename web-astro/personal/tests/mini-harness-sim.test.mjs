// Requirement 009, step 2/3: the simulator must stay deterministic, cover the
// seven mechanisms and keep the production constants honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OPTIONS,
  EVAL_CASES,
  SCENARIOS,
  SOURCE_DEFAULTS,
  STAGES,
  TOOL_SCHEMAS,
  checkPermission,
  estimateTokens,
  processOutput,
  redact,
  runEvals,
  simulate,
} from '../harness/mini-harness/engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '../harness/archive/labs/mini-harness');

const read = (relative) => readFile(path.join(LAB, relative), 'utf8');

function eventSignature(result) {
  return result.events.map((event) => ({
    id: event.id,
    kind: event.kind,
    stage: event.stage,
    title: event.title,
    tokens: event.snapshot.tokens,
    messages: event.snapshot.messages.length,
  }));
}

test('the workbench exposes seven stages and four runnable scenarios', () => {
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
  );
  for (const stage of STAGES) {
    assert.ok(stage.name.length > 1, `${stage.id}: name`);
    assert.ok(stage.question.endsWith('？'), `${stage.id}: question`);
    assert.ok(stage.file.startsWith('harness/'), `${stage.id}: source file`);
    assert.ok(stage.events.length > 0, `${stage.id}: events`);
  }
  assert.deepEqual(
    SCENARIOS.map((scenario) => scenario.id),
    ['full', 'permission', 'context', 'memory'],
  );
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.task.length > 10, `${scenario.id}: task`);
    assert.ok(scenario.description.length > 20, `${scenario.id}: description`);
    assert.equal(typeof scenario.defaults.contextLimit, 'number');
  }
  assert.equal(DEFAULT_OPTIONS.maxSteps, 25);
  assert.deepEqual(
    TOOL_SCHEMAS.map((tool) => tool.name),
    ['read_file', 'write_file', 'bash', 'explore', 'fetch_external', 'remember'],
  );
});

test('the full scenario stops at ask and changes the ending when approved or denied', () => {
  const pending = simulate({ scenarioId: 'full' });
  assert.ok(pending.pendingAsk, 'full scenario must ask before push');
  assert.equal(pending.pendingAsk.key, 'ask-1');
  assert.equal(pending.pendingAsk.tool, 'bash');
  assert.match(pending.pendingAsk.arguments.command, /git push/);
  assert.equal(pending.summary, null);
  const ask = pending.events[pending.events.length - 1];
  assert.equal(ask.kind, 'permission_ask');
  assert.equal(ask.detail.decision, null);
  assert.equal(ask.index, pending.pendingAsk.eventIndex);

  const approve = simulate({
    scenarioId: 'full',
    decisions: { [pending.pendingAsk.key]: 'approve' },
  });
  const deny = simulate({
    scenarioId: 'full',
    decisions: { [pending.pendingAsk.key]: 'deny' },
  });
  assert.equal(approve.summary.stopped, 'final');
  assert.equal(deny.summary.stopped, 'final');
  assert.match(approve.summary.content, /已推送到 origin\/main/);
  assert.match(deny.summary.content, /推送被拒绝/);
  assert.notDeepEqual(eventSignature(approve), eventSignature(deny));
});

test('the full run covers S1-S5 and S7, spills output, compacts history and keeps a draft', () => {
  const result = simulate({ scenarioId: 'full', decisions: { 'ask-1': 'approve' } });
  const stages = new Set(result.events.map((event) => event.stage));
  for (const stage of ['S1', 'S2', 'S3', 'S4', 'S5', 'S7']) {
    assert.ok(stages.has(stage), `missing stage ${stage}`);
  }
  const kinds = new Set(result.events.map((event) => event.kind));
  for (const kind of [
    'permission_denied',
    'spill',
    'compact_start',
    'compact_result',
    'subagent_final',
    'taint',
    'memory_write',
    'summary',
  ]) {
    assert.ok(kinds.has(kind), `missing event ${kind}`);
  }
  assert.ok(result.summary.artifacts.length >= 1);
  assert.equal(result.summary.memory.outcome, 'draft');
  assert.equal(result.summary.memory.entries, 0);
  assert.equal(result.summary.memory.drafts, 1);
  assert.match(result.summary.taint.join('\n'), /fetch_external/);
  assert.ok(result.summary.steps >= 8);
  assert.ok(result.summary.tokens > 0);
  assert.ok(result.summary.session.count > 10);
  assert.match(result.summary.session.jsonl, /"type":"session_start"/);
  assert.ok(result.workspace['.harness/artifacts/bash-0001.txt']);
});

test('permissions: strict denies rm, open allows it, and ask can be approved', () => {
  const strict = simulate({ scenarioId: 'permission' });
  const denied = strict.events.find((event) => event.kind === 'permission_denied');
  assert.ok(denied);
  assert.match(denied.detail.reason, /禁止递归删除/);

  const approved = simulate({
    scenarioId: 'permission',
    decisions: { 'ask-1': 'approve' },
  });
  const push = approved.events.find(
    (event) =>
      event.kind === 'tool_call' && /git push/.test(event.detail.arguments?.command ?? ''),
  );
  assert.ok(push);
  assert.equal(approved.summary.outcomes.push, 'approved');

  const open = simulate({ scenarioId: 'permission', options: { permissions: 'open' } });
  assert.equal(open.pendingAsk, null);
  assert.equal(open.summary.outcomes.rm, 'executed');
  assert.equal(open.summary.outcomes.push, 'approved');
  assert.ok(!open.events.some((event) => event.kind === 'permission_denied'));
  assert.ok(!open.workspace['build/cache.bin']);

  assert.equal(
    checkPermission('write_file', { path: '../outside.txt' }, { permissions: 'strict' }).verdict,
    'deny',
  );
  assert.equal(
    checkPermission('bash', { command: 'rm -rf build' }, { permissions: 'open' }).verdict,
    'allow',
  );
});

test('compaction is threshold-driven and preserves system, first user and recent tool pairs', () => {
  const on = simulate({ scenarioId: 'context' });
  assert.equal(on.summary.compactions, 1);
  assert.ok(on.events.some((event) => event.kind === 'compact_start'));
  const resultEvent = on.events.find((event) => event.kind === 'compact_result');
  const messages = resultEvent.snapshot.messages;
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /通读仓库说明/);
  assert.ok(messages.some((message) => /<历史摘要>/.test(message.content ?? '')));
  // A tool message must stay directly after its assistant(tool_calls) message.
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role !== 'tool') continue;
    assert.equal(messages[index - 1].role, 'assistant', 'tool message split from assistant');
  }

  const off = simulate({ scenarioId: 'context', options: { contextLimit: 0 } });
  assert.equal(off.summary.compactions, 0);
  assert.ok(!off.events.some((event) => event.kind === 'compact_start'));
});

test('spilling and truncation are mutually exclusive, with spill taking priority', () => {
  const spill = simulate({ scenarioId: 'context', options: { spillChars: 500 } });
  assert.ok(spill.summary.artifacts.length >= 2);
  const artifact = spill.summary.artifacts[0];
  assert.match(artifact.path, /^\.harness\/artifacts\/read_file-\d{4}\.txt$/);
  assert.ok(artifact.content.length > 500);
  assert.ok(spill.events.some((event) => event.kind === 'spill'));
  assert.ok(!spill.events.some((event) => event.kind === 'truncate'));

  const truncate = simulate({ scenarioId: 'context', options: { spillChars: 0 } });
  assert.equal(truncate.summary.artifacts.length, 0);
  assert.ok(truncate.events.some((event) => event.kind === 'truncate'));
  assert.ok(!truncate.events.some((event) => event.kind === 'spill'));

  const processed = processOutput('x'.repeat(120), { spillChars: 50, maxChars: 100 });
  assert.equal(processed.kind, 'spill');
  assert.equal(processed.seq, 1);
  const truncated = processOutput('y'.repeat(120), { spillChars: 0, maxChars: 100 });
  assert.equal(truncated.kind, 'truncate');
  assert.match(truncated.text, /输出已截断/);
});

test('the explore subagent has its own window and only a summary returns to the parent', () => {
  const result = simulate({
    scenarioId: 'context',
    options: { subagent: true, contextLimit: 0 },
  });
  const subEvents = result.events.filter((event) => event.scope === 'subagent');
  assert.ok(subEvents.length >= 5);
  const start = subEvents.find((event) => event.kind === 'subagent_start');
  assert.match(start.detail.prompt, /TODO/);
  const final = subEvents.find((event) => event.kind === 'subagent_final');
  assert.match(final.detail.summary, /TODO/);
  const parentResult = result.events.find(
    (event) => event.kind === 'tool_result' && event.stage === 'S5',
  );
  assert.match(parentResult.summary, /explore 子代理共/);
  assert.ok(!JSON.stringify(parentResult.snapshot.messages).includes('sub_1'));
  assert.equal(result.summary.toolCalls, 4);

  const off = simulate({
    scenarioId: 'context',
    options: { subagent: false, contextLimit: 0 },
  });
  assert.ok(!off.events.some((event) => event.scope === 'subagent'));
  assert.ok(!off.events.some((event) => event.kind === 'subagent_start'));
  assert.equal(off.summary.toolCalls, 4);
});

test('the memory gate writes a draft for tainted sessions unless it is disabled', () => {
  const draft = simulate({ scenarioId: 'memory' });
  assert.equal(draft.summary.memory.outcome, 'draft');
  assert.equal(draft.memory.drafts.length, 1);
  assert.equal(draft.memory.entries.length, 1); // seeded preference, not the new issue
  assert.match(draft.memory.drafts[0].path, /_drafts/);
  assert.match(draft.memory.index, /test-first/);
  assert.ok(!draft.memory.index.includes('issue-42'));

  const formal = simulate({ scenarioId: 'memory', options: { memoryGate: false } });
  assert.equal(formal.summary.memory.outcome, 'memory');
  assert.equal(formal.memory.drafts.length, 0);
  assert.equal(formal.memory.entries.length, 2);
  assert.match(formal.memory.index, /issue-42/);
  assert.match(formal.memory.index, /含外部内容/);
  assert.equal(formal.memory.entries.find((entry) => entry.name === 'issue-42').tainted, true);
});

test('secrets are redacted before a memory or session record is written', () => {
  const result = simulate({ scenarioId: 'full', decisions: { 'ask-1': 'approve' } });
  const memory = result.memory.drafts[0];
  assert.match(memory.content, /token=\[REDACTED\]/);
  assert.doesNotMatch(memory.content, /example-value/);
  assert.doesNotMatch(result.summary.session.jsonl, /example-value/);
  assert.ok(result.summary.session.jsonl.includes('[REDACTED]'));

  const redacted = redact('api_key=sk-demo-1234567890abcdef password=hunter2');
  assert.match(redacted.text, /sk-key/);
  assert.match(redacted.text, /password=\[REDACTED\]/);
  assert.equal(redacted.hits, 2);
  assert.equal(redact(redacted.text).hits, 0);
});

test('the same scenario and decisions produce an identical trace', () => {
  const first = simulate({ scenarioId: 'full', decisions: { 'ask-1': 'approve' } });
  const second = simulate({ scenarioId: 'full', decisions: { 'ask-1': 'approve' } });
  assert.deepEqual(eventSignature(first), eventSignature(second));
  assert.deepEqual(first.summary, second.summary);
  assert.equal(first.events.length, second.events.length);
});

test('the evaluation bench is scripted 5/5 and no-op 0/5', () => {
  assert.equal(EVAL_CASES.length, 5);
  const scripted = runEvals();
  assert.equal(scripted.filter((row) => row.passed).length, 5);
  assert.deepEqual(scripted.map((row) => row.id), ['T1', 'T2', 'T3', 'T4', 'T5']);
  assert.deepEqual(scripted[2].expected, 8);
  assert.deepEqual(scripted[3].expected, [
    { file: 'notes/meeting.md', line: 2 },
    { file: 'notes/plan.md', line: 1 },
    { file: 'notes/plan.md', line: 4 },
  ]);
  const noop = runEvals({ model: 'noop' });
  assert.equal(noop.filter((row) => row.passed).length, 0);
  assert.equal(noop[0].note, 'answer.md 不存在');
  assert.equal(noop[0].steps, 0);
});

test('token estimates use the same character/4 approximation as models.py', () => {
  // Python: len(json.dumps({"role": "user", "content": "你好"}, ensure_ascii=False)) == 33.
  assert.equal(estimateTokens([{ role: 'user', content: '你好' }]), 8);
  assert.equal(estimateTokens([]), 1);
  assert.ok(
    estimateTokens([
      { role: 'system', content: '你是一个谨慎的编码 agent。' },
      { role: 'user', content: '把 retries 从 3 改成 5。' },
    ]) > 8,
  );
});

test('the simulator constants still match the Python lab', async () => {
  const loop = await read('harness/loop.py');
  const models = await read('harness/models.py');
  const compaction = await read('harness/compaction.py');
  const outputs = await read('harness/outputs.py');
  const tools = await read('harness/tools.py');
  const memory = await read('harness/memory.py');

  assert.match(loop, /max_steps: int = 25/);
  assert.match(loop, /max_chars: int = 10_000/);
  assert.match(loop, /spill_chars: int \| None = 2_000/);
  assert.match(loop, /context_token_limit: int = 100_000/);
  assert.match(loop, /compact_keep_last_n: int = 6/);
  assert.match(loop, /subagent_max_steps: int = 8/);
  assert.match(loop, /memory_index_max_lines: int = 50/);
  assert.match(models, /def estimate_tokens/);
  assert.match(models, /total \/\/ 4/);
  assert.match(compaction, /keep_last_n: int = 6/);
  assert.match(outputs, /PREVIEW_LINES = 5/);
  assert.match(outputs, /PREVIEW_CHAR_CAP = 500/);
  assert.match(tools, /READ_DEFAULT_LINES = 200/);
  assert.match(tools, /READ_CHAR_BUDGET = 10_000/);
  assert.match(memory, /MAX_CONTENT_CHARS = 2_000/);
  assert.match(memory, /SUMMARY_CHARS = 60/);

  assert.deepEqual(
    {
      maxSteps: SOURCE_DEFAULTS.maxSteps,
      maxChars: SOURCE_DEFAULTS.maxChars,
      spillChars: SOURCE_DEFAULTS.spillChars,
      contextTokenLimit: SOURCE_DEFAULTS.contextTokenLimit,
      compactKeepLastN: SOURCE_DEFAULTS.compactKeepLastN,
      subagentMaxSteps: SOURCE_DEFAULTS.subagentMaxSteps,
      readDefaultLines: SOURCE_DEFAULTS.readDefaultLines,
      readCharBudget: SOURCE_DEFAULTS.readCharBudget,
      maxContentChars: SOURCE_DEFAULTS.maxContentChars,
      memoryIndexMaxLines: SOURCE_DEFAULTS.memoryIndexMaxLines,
      previewLines: SOURCE_DEFAULTS.previewLines,
      previewCharCap: SOURCE_DEFAULTS.previewCharCap,
    },
    {
      maxSteps: 25,
      maxChars: 10_000,
      spillChars: 2_000,
      contextTokenLimit: 100_000,
      compactKeepLastN: 6,
      subagentMaxSteps: 8,
      readDefaultLines: 200,
      readCharBudget: 10_000,
      maxContentChars: 2_000,
      memoryIndexMaxLines: 50,
      previewLines: 5,
      previewCharCap: 500,
    },
  );
});
