import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cacheRate,
  configDiff,
  diffMessages,
  fmtMoney,
  fmtMs,
  fmtNum,
  fmtRate,
  fmtValue,
  groupRun,
  overrides,
  prettyJson,
  seenToolContent,
  segmentShares,
} from '../client/lab/model.ts';

const sys = { role: 'system', content: '系统' };
const user = { role: 'user', content: '问题' };
const call = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'search_book', arguments: '{}' } }] };

const events = [
  { seq: 0, type: 'run_start', run_id: 'r', question: '问题', config: {}, config_hash: 'h' },
  { seq: 1, type: 'info', turn: 0, kind: 'memory_recalled', detail: { items: [] } },
  { seq: 2, type: 'llm_request', turn: 1, purpose: 'agent', messages: [sys, user], segments: { system: 10, user: 2 } },
  { seq: 3, type: 'llm_response', turn: 1, purpose: 'agent', message: call, usage: { prompt_tokens: 12 }, retries: [] },
  { seq: 4, type: 'tool_call', turn: 1, call_id: 'c1', name: 'search_book', args: '{}', result: '{"results":[]}', truncated: false, duration_ms: 3 },
  { seq: 6, type: 'llm_request', turn: 2, purpose: 'agent', messages: [sys, user, call, { role: 'tool', tool_call_id: 'c1', content: '（工具结果已省略）' }], segments: {} },
  { seq: 5, type: 'info', turn: 2, kind: 'compressed', detail: {} },
  { seq: 7, type: 'gate', action_id: 'a1', kind: 'insert', payload: {}, status: 'pending' },
  { seq: 8, type: 'llm_response', turn: 2, purpose: 'agent', message: { role: 'assistant', content: '答' }, usage: {}, retries: [] },
  { seq: 9, type: 'gate', action_id: 'a1', kind: 'insert', payload: {}, status: 'approved' },
  { seq: 10, type: 'run_end', status: 'ok', answer: '答', citations: [], citation_check: {}, totals: {} },
];

test('groups events into turns in sequence order', () => {
  const view = groupRun(events);
  assert.equal(view.start.question, '问题');
  assert.equal(view.end.status, 'ok');
  assert.deepEqual(view.turns.map((t) => t.turn), [1, 2]);
  assert.equal(view.turns[0].calls[0].response.usage.prompt_tokens, 12);
  assert.equal(view.turns[0].tools[0].name, 'search_book');
  assert.equal(view.turns[1].infos[0].kind, 'compressed');
  assert.equal(view.preInfos[0].kind, 'memory_recalled');
});

test('later gate events replace earlier ones for the same action', () => {
  const view = groupRun(events);
  assert.equal(view.gates.length, 1);
  assert.equal(view.gates[0].status, 'approved');
});

test('pairs summary and agent calls within a turn by purpose', () => {
  const view = groupRun([
    { seq: 0, type: 'llm_request', turn: 3, purpose: 'summary', messages: [], segments: {} },
    { seq: 1, type: 'llm_response', turn: 3, purpose: 'summary', usage: {}, retries: [] },
    { seq: 2, type: 'llm_request', turn: 3, purpose: 'agent', messages: [], segments: {} },
  ]);
  const [summary, agent] = view.turns[0].calls;
  assert.equal(summary.purpose, 'summary');
  assert.ok(summary.response);
  assert.equal(agent.response, undefined);
});

test('finds what the model actually saw for a tool result', () => {
  const view = groupRun(events);
  assert.equal(seenToolContent(view, view.turns[0].tools[0]), '（工具结果已省略）');
  const unseen = { ...view.turns[0].tools[0], call_id: 'zzz' };
  assert.equal(seenToolContent(view, unseen), undefined);
});

test('segment shares drop zeros and keep a fixed order', () => {
  const { total, parts } = segmentShares({ tool: 30, system: 60, user: 10, assistant: 0 });
  assert.equal(total, 100);
  assert.deepEqual(parts.map((p) => p.key), ['system', 'user', 'tool']);
  assert.equal(parts[0].label, '系统提示');
  assert.equal(parts[0].share, 0.6);
  assert.deepEqual(segmentShares(undefined), { total: 0, parts: [] });
});

test('diffs consecutive turns message by message', () => {
  const prev = [sys, user];
  const cur = [sys, { role: 'user', content: '改了' }, call];
  const diff = diffMessages(prev, cur);
  assert.deepEqual(diff.items.map((i) => i.status), ['same', 'changed', 'added']);
  assert.equal(diff.firstChange, 1);
  assert.equal(diff.removed, 0);
  assert.equal(diffMessages(cur, cur).firstChange, -1);
  assert.deepEqual(diffMessages(undefined, [sys]).items.map((i) => i.status), ['added']);
  const shrunk = diffMessages([sys, user, call], [sys, user]);
  assert.equal(shrunk.removed, 1);
  assert.equal(shrunk.firstChange, 2);
});

test('config diff and overrides', () => {
  assert.deepEqual(configDiff({ a: 1, t: ['x'] }, { a: 1, t: ['x', 'y'], b: true }), [
    { key: 't', a: ['x'], b: ['x', 'y'] },
    { key: 'b', a: undefined, b: true },
  ]);
  assert.deepEqual(overrides({ a: 1, b: false, t: ['x'] }, { a: 1, b: true, t: ['x'] }), { b: true });
});

test('formatters show unknown values honestly', () => {
  assert.equal(fmtNum(null), '未知');
  assert.equal(fmtNum(12345), '12,345');
  assert.equal(fmtMs(850), '850 ms');
  assert.equal(fmtMs(2150), '2.1 s');
  assert.equal(fmtMs(undefined), '未知');
  assert.equal(fmtMoney(0), '$0');
  assert.equal(fmtMoney(0.0012), '$0.0012');
  assert.equal(fmtMoney(0.073), '$0.073');
  assert.equal(fmtMoney(null), '未知');
  assert.equal(fmtRate(0.537), '54%');
  assert.equal(fmtRate(null), '未知');
  assert.equal(cacheRate(200, 50), 0.25);
  assert.equal(cacheRate(200, null), null);
  assert.equal(cacheRate(0, 0), null);
  assert.equal(fmtValue(true), '开');
  assert.equal(fmtValue(['a', 'b']), 'a, b');
  assert.equal(fmtValue(undefined), '（默认）');
});

test('pretty prints JSON tool results and leaves other text alone', () => {
  assert.equal(prettyJson('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyJson('plain'), 'plain');
});

test('describes FastAPI validation errors readably', async () => {
  const { describeDetail } = await import('../client/lab/api.ts');
  assert.equal(describeDetail([{ loc: ['body', 'label'], msg: 'Input should be a valid string' }]), 'label：Input should be a valid string');
  assert.equal(describeDetail('Not Found'), 'Not Found');
});

test('builds the chapter jump list with per-chapter change counts', async () => {
  const { chapterNav } = await import('../client/lab/model.ts');
  const groups = [
    { chapter: 1, title: '第 1 章 · 上下文消融', summary: '', fields: [{ name: 'drop_history', label: '' }, { name: 'drop_tool_results', label: '' }] },
    { chapter: 9, title: '第 9 章 · 持续进化', summary: '', fields: [{ name: 'learned_rules', label: '' }] },
  ];
  const pages = [
    { chapter: 7, title: '第 7 章 · Agent 的评估', href: '#/evals', tab: '评估' },
    { chapter: 9, title: '第 9 章 · 持续进化', href: '#/rules', tab: '规则' },
  ];
  assert.deepEqual(chapterNav(groups, { drop_tool_results: true, model: 'x' }, pages), [
    { key: 'group-1', label: '第 1 章', title: '第 1 章 · 上下文消融', changed: 1 },
    { key: 'page-7', label: '第 7 章 · 评估', title: '第 7 章 · Agent 的评估（「评估」页）', changed: 0, href: '#/evals' },
    { key: 'group-9', label: '第 9 章', title: '第 9 章 · 持续进化', changed: 0, page: { href: '#/rules', tab: '规则' } },
  ]);
  assert.deepEqual(chapterNav(groups, {}).map((item) => item.key), ['group-1', 'group-9']);
  assert.deepEqual(chapterNav([], {}), []);
});

test('keeps reviewer calls in the main turns and splits sub-agents out', async () => {
  const { groupRun, agentLabel } = await import('../client/lab/model.ts');
  const req = (seq, turn, purpose, agent) => ({ type: 'llm_request', seq, turn, purpose, agent, messages: [], segments: {} });
  const res = (seq, turn, purpose, agent) => ({ type: 'llm_response', seq, turn, purpose, agent, usage: {}, retries: [] });
  const events = [
    { type: 'run_start', seq: 0, run_id: 'r', question: 'q', config: {}, config_hash: 'h' },
    req(1, 1, 'agent'),
    res(2, 1, 'agent'),
    { type: 'info', seq: 3, turn: 1, kind: 'subagent_start', agent: 'main', detail: { agent: 'sub-1' } },
    req(4, 1, 'agent', 'sub-1'),
    res(5, 1, 'agent', 'sub-1'),
    { type: 'tool_call', seq: 6, turn: 1, agent: 'sub-1', call_id: 's1', name: 'search_book', args: '{}', result: '[]', truncated: false, duration_ms: 1 },
    req(7, 2, 'agent', 'sub-1'),
    res(8, 2, 'agent', 'sub-1'),
    { type: 'tool_call', seq: 9, turn: 1, agent: 'main', call_id: 'd1', name: 'delegate', args: '{}', result: '要点', truncated: false, duration_ms: 1 },
    req(10, 2, 'agent', 'main'),
    res(11, 2, 'agent', 'main'),
    req(12, 2, 'review', 'reviewer'),
    res(13, 2, 'review', 'reviewer'),
    { type: 'info', seq: 14, turn: 2, kind: 'review_verdict', agent: 'reviewer', detail: { verdict: 'pass', issues: [] } },
  ];
  const view = groupRun(events);
  assert.deepEqual(view.turns.map((t) => t.turn), [1, 2]);
  assert.deepEqual(view.turns[1].calls.map((c) => [c.purpose, Boolean(c.response)]), [['agent', true], ['review', true]]);
  assert.deepEqual(view.turns[0].tools.map((t) => t.name), ['delegate']);
  assert.deepEqual(Object.keys(view.subagents), ['sub-1']);
  const sub = view.subagents['sub-1'];
  assert.deepEqual(sub.turns.map((t) => [t.turn, t.calls.length, t.tools.length]), [[1, 1, 1], [2, 1, 0]]);
  assert.deepEqual(groupRun([]).subagents, {});
  assert.equal(agentLabel('main'), '主 Agent');
  assert.equal(agentLabel('reviewer'), '审核者');
  assert.equal(agentLabel('sub-2'), '子 Agent 2');
  assert.equal(agentLabel('other'), 'other');
});

test('finds the sub-agent that ran for a delegate call', async () => {
  const { subagentForCall } = await import('../client/lab/model.ts');
  const turn = {
    turn: 1,
    calls: [],
    tools: [],
    infos: [
      { type: 'info', turn: 1, kind: 'subagent_start', detail: { agent: 'sub-1', call_id: 'd1' } },
      { type: 'info', turn: 1, kind: 'subagent_start', detail: { agent: 'sub-2', call_id: 'd2' } },
      { type: 'info', turn: 1, kind: 'subagent_end', detail: { agent: 'sub-2', call_id: 'd9' } },
    ],
  };
  assert.equal(subagentForCall(turn, 'd2'), 'sub-2');
  assert.equal(subagentForCall(turn, 'd9'), undefined);
});
