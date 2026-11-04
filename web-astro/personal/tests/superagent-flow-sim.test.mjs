// Requirement 045: the browser replay engine must match the archived Python
// lab rule for rule. The parity test executes the CLI for all eight scenarios
// and compares its JSON with toDict(); when python3 is missing the test is
// skipped with an explicit reason instead of passing silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, admit, replay, ticketStage, toDict } from '../harness/superagent-flow/engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAB = path.resolve(HERE, '../harness/archive/labs/superagent-flow');

const source = (overrides = {}) => ({
  id: 'github',
  kind: 'github',
  allowed: ['alice'],
  bots: ['dependabot[bot]'],
  admission: [
    ['listed_unaddressed', 'inferred'],
    ['unlisted_addressed', 'ignore'],
    ['unlisted_unaddressed', 'ignore'],
  ],
  listening: true,
  ...overrides,
});

const policy = (acceptMode = 'observe') => ({
  version: 1,
  acceptMode,
  rules: ['fix-bug'],
  sources: [source()],
});

const trigger = (overrides = {}) => ({
  id: 't1',
  source: 'github',
  thread: 'issue-1',
  actor: 'alice',
  text: 'hello',
  addressed: false,
  isBot: false,
  isCi: false,
  ...overrides,
});

const ticket = (overrides = {}) => ({
  id: 't-001',
  thread: 'issue-1',
  source: 'github',
  state: 'open',
  mandate: null,
  inputs: [],
  assignments: [],
  reports: [],
  attention: null,
  deliveryFailed: false,
  lastHumanTick: -1,
  prs: [],
  endedReason: null,
  ...overrides,
});

test('eight scenarios are exposed in the archived order', () => {
  assert.deepEqual(
    SCENARIOS.map((scenario) => scenario.id),
    [
      'explicit-request',
      'noise-filter',
      'observe-then-auto',
      'duplicate-accept',
      'resume-followup',
      'policy-change',
      'blocked-recovery',
      'eval-timeout',
    ],
  );
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.title.length > 4, `${scenario.id}: title`);
    assert.ok(scenario.summary.endsWith('。'), `${scenario.id}: summary`);
    assert.ok(scenario.expected.length > 10, `${scenario.id}: expected`);
    assert.ok(scenario.events.length > 0, `${scenario.id}: events`);
    assert.ok(['off', 'observe', 'auto'].includes(scenario.policy.acceptMode), `${scenario.id}: mode`);
    assert.ok(scenario.policy.sources.length > 0, `${scenario.id}: sources`);
  }
});

test('gate answers the five admission cases', () => {
  const base = policy('observe');
  const src = source();

  assert.equal(admit(trigger({ addressed: true }), base, src, false).strength, 'explicit');
  assert.equal(admit(trigger({ addressed: true }), base, src, false).basis, 'explicit');
  assert.equal(admit(trigger({}), base, src, false).strength, 'inferred');
  assert.equal(admit(trigger({}), base, src, false).basis, 'cell');
  assert.equal(admit(trigger({ actor: 'mallory', addressed: true }), base, src, false).strength, null);
  assert.equal(admit(trigger({ actor: 'mallory' }), base, src, false).strength, null);
  assert.match(
    admit(trigger({ actor: 'mallory', addressed: true }), base, src, false).reason,
    /ignore/,
  );
  assert.equal(
    admit(trigger({ isBot: true, actor: 'dependabot[bot]' }), base, src, false).strength,
    'inferred',
  );
  assert.equal(
    admit(trigger({ isBot: true, actor: 'dependabot[bot]' }), base, src, false).basis,
    'bot',
  );
  assert.equal(admit(trigger({ isBot: true, actor: 'renovate[bot]' }), base, src, false).strength, null);
  assert.equal(admit(trigger({ isCi: true }), base, src, false).strength, null);
});

test('accept mode off blocks inferred candidates but keeps explicit ones', () => {
  const off = policy('off');
  const src = source();
  assert.equal(admit(trigger({}), off, src, false).strength, null);
  assert.match(admit(trigger({}), off, src, false).reason, /accept mode is off/);
  assert.equal(admit(trigger({ addressed: true }), off, src, false).strength, 'explicit');
  assert.equal(admit(trigger({ isBot: true, actor: 'dependabot[bot]' }), off, src, false).strength, null);
});

test('a Thread with a Ticket upgrades an allowed follow-up to explicit', () => {
  const base = policy('observe');
  const src = source();
  assert.equal(admit(trigger({}), base, src, true).basis, 'followup');
  assert.equal(admit(trigger({}), base, src, true).strength, 'explicit');
  assert.equal(admit(trigger({ actor: 'mallory' }), base, src, true).strength, 'inferred');
  assert.equal(admit(trigger({ actor: 'mallory' }), policy('off'), src, true).strength, null);
});

test('ticket stages follow the documented order', () => {
  assert.equal(ticketStage(ticket({ state: 'stopped' })), 'stopped');
  assert.equal(ticketStage(ticket({ state: 'ended' })), 'ended');
  assert.equal(ticketStage(ticket({ deliveryFailed: true })), 'person / delivery');
  assert.equal(ticketStage(ticket({ attention: 'question' })), 'person / answer');
  assert.equal(
    ticketStage(ticket({ reports: [{ kind: 'ready', tick: 1 }], assignments: [{ state: 'ended' }] })),
    'person / review',
  );
  assert.equal(
    ticketStage(ticket({ reports: [{ kind: 'blocked', tick: 3 }], lastHumanTick: 2 })),
    'person / blocked',
  );
  assert.equal(
    ticketStage(
      ticket({ reports: [{ kind: 'blocked', tick: 3 }], lastHumanTick: 4, assignments: [{ state: 'running' }] }),
    ),
    'working',
  );
  assert.equal(ticketStage(ticket({})), 'working / queued');
  assert.equal(
    ticketStage(ticket({ reports: [{ kind: 'waiting', tick: 2 }], assignments: [{ state: 'running' }] })),
    'idle',
  );
  assert.equal(ticketStage(ticket({ assignments: [{ state: 'ended' }] })), 'idle');
});

test('replay is deterministic and snapshots bracket every record', () => {
  for (const scenario of SCENARIOS) {
    const first = replay(scenario.id);
    const second = replay(scenario.id);
    assert.deepEqual(toDict(first), toDict(second), `${scenario.id}: deterministic`);
    assert.equal(first.snapshots.length, first.records.length + 1, `${scenario.id}: snapshots`);
    assert.equal(first.snapshots[0].tickets.length, 0, `${scenario.id}: initial snapshot`);
    assert.deepEqual(
      first.snapshots[first.snapshots.length - 1].tickets.map((item) => item.id),
      first.tickets.map((item) => item.id),
      `${scenario.id}: final snapshot`,
    );
    for (const snapshot of first.snapshots) {
      assert.equal(typeof snapshot.tick, 'number');
      assert.ok(Array.isArray(snapshot.messages));
      assert.ok(Array.isArray(snapshot.decisions));
      for (const item of snapshot.tickets) {
        assert.ok(item.stage.length > 0, `${scenario.id}: stage`);
        assert.ok(item.mandate, `${scenario.id}: mandate`);
      }
    }
  }
});

test('scenario outcomes keep the documented highlights', () => {
  const explicit = toDict(replay('explicit-request'));
  assert.match(explicit.final, /tickets=1 open=0/);
  assert.equal(explicit.tickets[0].assignments.length, 2);
  assert.ok(
    !explicit.records.some(
      (record) => record.phase === 'eval' && record.outcome === 'started' && record.key === 't2',
    ),
  );

  const noise = toDict(replay('noise-filter'));
  assert.match(noise.final, /tickets=0/);
  assert.ok(noise.records.some((record) => record.phase === 'source' && record.outcome === 'filtered'));
  assert.ok(noise.records.some((record) => record.phase === 'gate' && record.outcome === 'not-admitted'));

  const observe = toDict(replay('observe-then-auto'));
  assert.ok(
    observe.decisions.some((decision) => decision.kind === 'ignore' && /would accept/.test(decision.reason)),
  );
  assert.ok(observe.decisions.some((decision) => decision.kind === 'accept'));

  const duplicate = toDict(replay('duplicate-accept'));
  assert.equal(duplicate.tickets[0].assignments.length, 1);
  assert.ok(duplicate.records.some((record) => record.outcome === 'duplicate'));
  assert.equal(duplicate.messages.filter((message) => message.kind === 'ack').length, 1);

  const resume = toDict(replay('resume-followup'));
  assert.ok(resume.records.some((record) => record.outcome === 'resumed'));
  assert.ok(resume.records.some((record) => record.outcome === 'handback'));

  const policyChange = toDict(replay('policy-change'));
  assert.ok(policyChange.records.some((record) => record.outcome === 'policy-input'));
  assert.ok(policyChange.records.some((record) => record.outcome === 'discarded'));
  assert.ok(policyChange.records.some((record) => record.outcome === 'revoked'));

  const blocked = toDict(replay('blocked-recovery'));
  assert.equal(blocked.tickets[0].assignments.length, 3);
  assert.ok(blocked.records.some((record) => record.outcome === 'retried'));

  const timeout = toDict(replay('eval-timeout'));
  assert.equal(timeout.problems.length, 1);
  assert.ok(timeout.decisions.some((decision) => decision.kind === 'unavailable'));
  assert.ok(timeout.decisions.some((decision) => decision.kind === 'accept'));
});

function pythonAvailable() {
  try {
    execFileSync('python3', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

test(
  'the JS engine matches the Python CLI for all eight scenarios',
  { skip: pythonAvailable() ? false : 'python3 is not available on this machine' },
  () => {
    for (const scenario of SCENARIOS) {
      const expected = JSON.parse(
        execFileSync('python3', ['-m', 'superagent_flow', '--scenario', scenario.id, '--json'], {
          cwd: LAB,
          encoding: 'utf8',
        }),
      );
      assert.deepEqual(toDict(replay(scenario.id)), expected, `${scenario.id}: parity`);
    }
  },
);
