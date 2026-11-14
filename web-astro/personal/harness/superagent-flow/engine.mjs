// Browser-side, deterministic replay of the superagent-flow lab.
//
// This mirrors archive/labs/superagent-flow/superagent_flow without running
// Python: the same eight scenarios, the same Source -> Intake -> Gate -> Eval
// -> Ticket -> Executor -> Channel rules, the same logical clock (the event
// index) and the same record strings. The archive stays untouched.
//
// One addition serves the workbench: after every record the engine stores a
// deep snapshot of tickets, decisions, messages and problems, so the page can
// show the state at that tick without replaying from the start.
//
// tests/superagent-flow-sim.test.mjs runs the Python CLI for all eight
// scenarios and compares its JSON with toDict() from this file, so a rule
// change on either side shows up as a failing test instead of a silent drift.

const clone = (value) => JSON.parse(JSON.stringify(value));

export const CITE_FLOW = 'docs/001-domain.md §Flow';
export const CITE_CONCEPTS = 'docs/001-domain.md §Concepts';
export const CITE_TWO_PATHS = 'docs/002-authorization.md §Two paths for a Trigger';
export const CITE_STRENGTH = 'docs/002-authorization.md §Strength';
export const CITE_ADMISSION = 'docs/002-authorization.md §Admission';
export const CITE_ACCEPT_MODE = 'docs/002-authorization.md §Accept mode and rules';
export const CITE_ROUTING = 'docs/002-authorization.md §Routing candidates';
export const CITE_POLICY = 'docs/002-authorization.md §Policy version';
export const CITE_RESUME = 'docs/002-authorization.md §Resume and stop';
export const CITE_REVALIDATION = 'docs/002-authorization.md §Revalidation before resume';
export const CITE_EVAL_END = 'docs/002-authorization.md §When Eval does not finish';
export const CITE_STAGES = 'docs/003-execution.md §Ticket stages';
export const CITE_EXECUTOR = 'docs/003-execution.md §The Executor';
export const CITE_RECOVERY = 'docs/003-execution.md §Failure and recovery';
export const CITE_OWN_JUDGEMENT = '本实验判断';

export const PHASES = [
  {
    id: 'source',
    name: 'Source',
    question: '这条消息为什么在进入领域之前就被丢掉？',
    note: '自身机器人的消息、监听范围外的消息在 Source 侧过滤，重启也无法补回。',
  },
  {
    id: 'intake',
    name: 'Intake',
    question: '消息怎么归并到 Thread，又分到哪条路径？',
    note: 'Trigger 按幂等键去重，归并到 Thread；订阅扇出只送上下文，其余排队等 Eval。',
  },
  {
    id: 'gate',
    name: 'Gate',
    question: '谁可以启动工作，强度是显式还是推断？',
    note: '名单、点名、机器人名单与准入表决定强度；off 档下推断候选直接拒绝。',
  },
  {
    id: 'eval',
    name: 'Eval',
    question: '这一批 Trigger 该不该开新工作？',
    note: '显式候选可直接接单；推断候选逐条规则评估；超时重排两次，第三次记 unavailable。',
  },
  {
    id: 'decision',
    name: 'Decision',
    question: '最后接单、忽略还是停止？',
    note: 'Decision 记录结论与依据；observe 下的正向评估只记 would accept。',
  },
  {
    id: 'ticket',
    name: 'Ticket',
    question: '工单、Mandate 与订阅怎么建立和恢复？',
    note: 'accept 原子创建 Ticket + Mandate + Assignment + 订阅；结束后恢复要重校验。',
  },
  {
    id: 'executor',
    name: 'Executor',
    question: '这次执行由哪个 Assignment 承担？',
    note: 'Assignment 独立于 Ticket 走 pending -> running -> ended；重试会新开一个。',
  },
  {
    id: 'report',
    name: 'Report',
    question: 'Executor 的报告把工单推到哪个阶段？',
    note: 'progress / waiting / ready / blocked / failed / dropped，阶段判定按固定顺序。',
  },
  {
    id: 'channel',
    name: 'Channel',
    question: '回执与最终通知发给谁？',
    note: '接单回执先于结果；GitHub 不重复发 PR 结果，聊天渠道收一条最终通知。',
  },
  {
    id: 'policy',
    name: 'Policy',
    question: '策略变更影响哪些在办工单与 Eval？',
    note: '在办工单收一条输入、不停；进行中的 Eval 被丢弃重排；恢复时按新策略重校验。',
  },
];

const STAGE_ORDER = [
  'person / delivery',
  'person / answer',
  'person / review',
  'person / blocked',
  'person / failed',
  'working / queued',
  'idle',
  'working',
];

export const STAGE_ROWS = [
  ['stopped', 'Ticket 被人的 stop 终止', 'ticket.state === "stopped"'],
  ['ended', 'Ticket 已结束', 'ticket.state === "ended"'],
  ['person / delivery', '回执没有送达，等人处理', 'delivery_failed'],
  ['person / answer', 'Executor 在等人回答', 'attention 非空'],
  ['person / review', 'PR 已开，等人审阅', '最后一条 Report 是 ready'],
  ['person / blocked', '阻塞且人还没回应', '最后 Report 是 blocked，且 lastHumanTick <= report.tick'],
  ['person / failed', '失败且人还没回应', '最后 Report 是 failed，且 lastHumanTick <= report.tick'],
  ['working / queued', '还没有 Assignment，或它尚未启动', '无 Assignment 或 state === "pending"'],
  ['idle', '等下一轮输入', '最后 Report 是 waiting，或 Assignment 已 ended'],
  ['working', 'Executor 正在执行', '以上都不匹配'],
];

const OWN_BOT = 'dsh-superagent[bot]';
const NOT_ADMITTED = 'not-admitted';
const EVAL_TICKS = 2;

const ADMISSION = [
  ['listed_unaddressed', 'inferred'],
  ['unlisted_addressed', 'ignore'],
  ['unlisted_unaddressed', 'ignore'],
];

function makeSource({
  allowed = ['alice'],
  bots = ['dependabot[bot]'],
  listening = true,
  admission = ADMISSION,
} = {}) {
  return {
    id: 'github',
    kind: 'github',
    allowed: [...allowed],
    bots: [...bots],
    admission: admission.map(([key, value]) => [key, value]),
    listening,
  };
}

function makePolicy({ version = 1, mode = 'observe', rules = ['fix-bug'], source } = {}) {
  return {
    version,
    acceptMode: mode,
    rules: [...rules],
    sources: [source ?? makeSource()],
  };
}

function makeTrigger(id, thread, actor, text, { addressed = false, bot = false, ci = false } = {}) {
  return {
    kind: 'trigger',
    data: {
      trigger: {
        id,
        source: 'github',
        thread,
        actor,
        text,
        addressed,
        isBot: bot,
        isCi: ci,
      },
    },
  };
}

const report = (ticket, kind, text = '', pr = null) => ({
  kind: 'report',
  data: { ticket, kind, text, pr },
});
const prEvent = (ticket, pr, state) => ({ kind: 'pr', data: { ticket, pr, state } });
const tick = () => ({ kind: 'tick', data: {} });
const policyEvent = (policy, affected = null) => ({
  kind: 'policy',
  data: { policy, affected },
});

export const SCENARIOS = [
  {
    id: 'explicit-request',
    title: '名单内点名：从 Issue 评论到合并',
    summary: '一个人点名 Agent 请求修改，工单建立、执行、审阅、合并结束。',
    policy: makePolicy(),
    events: [
      makeTrigger('t1', 'issue-12', 'alice', 'The login redirect loops on Safari.', {
        addressed: true,
      }),
      report('t-001', 'progress', 'reproduced on main'),
      report('t-001', 'ready', 'opened pull request #31', 31),
      makeTrigger('t2', 'issue-12', 'alice', 'Please also cover the logout case.'),
      report('t-001', 'ready', 'updated pull request #31', 31),
      prEvent('t-001', 31, 'merged'),
    ],
    assessments: {},
    expected: '1 ticket, ended; 1 ack; no Eval after the follow-up',
  },
  {
    id: 'noise-filter',
    title: '噪声：什么在进入领域之前就被丢掉了',
    summary: '自身消息、未登记的机器人、名单外的人与 CI，各自停在不同层。',
    policy: makePolicy({ mode: 'off', rules: ['fix-ci'] }),
    events: [
      makeTrigger('n1', 'issue-9', OWN_BOT, 'my own comment', { addressed: true, bot: true }),
      makeTrigger('n2', 'issue-9', 'dependabot[bot]', 'bump lodash', {
        addressed: true,
        bot: true,
      }),
      makeTrigger('n3', 'issue-9', 'mallory', 'hello there'),
      makeTrigger('n4', 'issue-9', 'mallory', 'please fix this', { addressed: true }),
      makeTrigger('n5', 'issue-9', '', 'CI failed on main', { ci: true }),
      makeTrigger('n6', 'issue-9', 'alice', 'just chatting'),
    ],
    assessments: {},
    expected: '0 tickets; every Trigger filtered or not admitted',
  },
  {
    id: 'observe-then-auto',
    title: 'observe 到 auto：同一条规则，两种结果',
    summary: '推断候选在 observe 下只记录 would accept，切到 auto 后才真正接单。',
    policy: makePolicy({ mode: 'observe', rules: ['fix-ci'] }),
    events: [
      makeTrigger('t1', 'issue-7', 'dependabot[bot]', 'CI failed on main', {
        addressed: true,
        bot: true,
      }),
      policyEvent(makePolicy({ version: 2, mode: 'auto', rules: ['fix-ci'] }), []),
      makeTrigger('t2', 'issue-7', 'dependabot[bot]', 'CI still failing', {
        addressed: true,
        bot: true,
      }),
      report('t-001', 'ready', 'opened pull request #44', 44),
      prEvent('t-001', 44, 'merged'),
    ],
    assessments: {
      t1: { positive: true, rules: ['fix-ci'] },
      t2: { positive: true, rules: ['fix-ci'] },
    },
    expected: '1 ticket, ended; decisions: ignore would-accept then accept',
  },
  {
    id: 'duplicate-accept',
    title: '重复：同一个 Trigger 只能变成一个工单',
    summary: 'Source 重复投递同一个事件时，第二次只记 duplicate，不再扇出或接单。',
    policy: makePolicy(),
    events: [
      makeTrigger('t1', 'issue-3', 'alice', 'Fix the typo in the footer.', { addressed: true }),
      makeTrigger('t1', 'issue-3', 'alice', 'Fix the typo in the footer.', { addressed: true }),
      report('t-001', 'ready', 'opened pull request #5', 5),
      prEvent('t-001', 5, 'merged'),
    ],
    assessments: {},
    expected: '1 ticket, 1 Assignment, 1 ack; second delivery is duplicate',
  },
  {
    id: 'resume-followup',
    title: '恢复：结束后再说话，不重新评估',
    summary: '合并后的 Thread 上，人的消息沿用同一 Mandate 恢复；范围外的请求才 handback 重评。',
    policy: makePolicy(),
    events: [
      makeTrigger('t1', 'issue-8', 'alice', 'The export crashes on large files.', {
        addressed: true,
      }),
      report('t-001', 'ready', 'opened pull request #12', 12),
      prEvent('t-001', 12, 'merged'),
      makeTrigger('t2', 'issue-8', 'alice', 'Please also update the docs.'),
      report('t-001', 'ready', 'opened pull request #13', 13),
      makeTrigger('t3', 'issue-8', 'mallory', 'Please also refactor the billing service.'),
      {
        kind: 'handback',
        data: { ticket: 't-001', trigger: 't3', reason: 'outside the Ticket scope' },
      },
      prEvent('t-001', 13, 'merged'),
    ],
    assessments: { t3: { positive: false, reason: 'no enabled rule matched' } },
    expected: '1 ticket, resumed once and ended; 1 ignore after handback',
  },
  {
    id: 'policy-change',
    title: '策略变更：在办工单收通知，恢复时重校验',
    summary: '规则被禁用后，进行中的 Eval 重排，在办工单不停；结束后恢复才被撤销。',
    policy: makePolicy({ mode: 'auto', rules: ['fix-ci', 'fix-bug'] }),
    events: [
      makeTrigger('t1', 'issue-2', 'dependabot[bot]', 'CI failed on main', {
        addressed: true,
        bot: true,
      }),
      report('t-001', 'progress', 'triaging the failure'),
      makeTrigger('t2', 'issue-3', 'dependabot[bot]', 'CI failed on another branch', {
        addressed: true,
        bot: true,
      }),
      policyEvent(makePolicy({ version: 2, mode: 'auto', rules: ['fix-bug'] }), ['t-001']),
      report('t-001', 'ready', 'opened pull request #20', 20),
      prEvent('t-001', 20, 'merged'),
      makeTrigger('t3', 'issue-2', 'mallory', 'Still red?'),
    ],
    assessments: {
      '1:t2': { timeout: true },
      t1: { positive: true, rules: ['fix-ci'] },
      t3: { positive: false, reason: 'no enabled rule matched' },
    },
    expected: '1 ticket, ended; policy input delivered; resume revoked; Eval requeued',
  },
  {
    id: 'blocked-recovery',
    title: '阻塞与重试：人的一句话怎么把工单拉回 working',
    summary: 'blocked 后停止自动投递，人的消息唤醒；失败后重试新开 Assignment。',
    policy: makePolicy(),
    events: [
      makeTrigger('t1', 'issue-5', 'alice', 'Payments fail for EU cards.', { addressed: true }),
      report('t-001', 'progress', 'found the failing branch'),
      report('t-001', 'blocked', 'need database credentials'),
      makeTrigger('t2', 'issue-5', 'alice', 'Credentials added, please continue.'),
      report('t-001', 'failed', 'model provider returned 500'),
      { kind: 'retry', data: { ticket: 't-001' } },
      report('t-001', 'ready', 'opened pull request #9', 9),
      prEvent('t-001', 9, 'merged'),
    ],
    assessments: {},
    expected: '1 ticket, ended; 3 Assignments; stages blocked -> working -> failed -> working',
  },
  {
    id: 'eval-timeout',
    title: 'Eval 超时：第三次才记 unavailable',
    summary: '两次超时把 Trigger 重新排队，第三次记 unavailable 并留下问题；后来的事件重新开始。',
    policy: makePolicy({ mode: 'auto', rules: ['fix-ci'] }),
    events: [
      makeTrigger('t1', 'issue-1', 'dependabot[bot]', 'CI failed on main', {
        addressed: true,
        bot: true,
      }),
      tick(),
      tick(),
      tick(),
      tick(),
      tick(),
      tick(),
      makeTrigger('t2', 'issue-1', 'dependabot[bot]', 'CI still failing', {
        addressed: true,
        bot: true,
      }),
      report('t-001', 'ready', 'opened pull request #7', 7),
      prEvent('t-001', 7, 'merged'),
    ],
    assessments: {
      '1:t1': { timeout: true },
      t2: { positive: true, rules: ['fix-ci'] },
    },
    expected: '1 problem (unavailable); later Trigger accepts; 1 ticket, ended',
  },
];

const BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

// ---------------------------------------------------------------------------
// Rules, ported from the Python modules one for one.

function cell(source, name) {
  for (const [key, value] of source.admission) {
    if (key === name) return value;
  }
  return 'ignore';
}

function fromCell(cellName, label, policy) {
  if (cellName === 'ignore') {
    return {
      strength: null,
      basis: NOT_ADMITTED,
      reason: `${label} cell is ignore`,
      source: CITE_ADMISSION,
    };
  }
  if (cellName === 'explicit') {
    return {
      strength: 'explicit',
      basis: 'cell',
      reason: `${label} cell is explicit`,
      source: CITE_ADMISSION,
    };
  }
  if (policy.acceptMode === 'off') {
    return {
      strength: null,
      basis: NOT_ADMITTED,
      reason: `${label} cell is inferred, accept mode is off`,
      source: CITE_ACCEPT_MODE,
    };
  }
  return {
    strength: 'inferred',
    basis: 'cell',
    reason: `${label} cell is inferred`,
    source: CITE_ADMISSION,
  };
}

export function admit(trigger, policy, source, threadHasTicket) {
  if (trigger.isBot) {
    if (!source.bots.includes(trigger.actor)) {
      return {
        strength: null,
        basis: NOT_ADMITTED,
        reason: 'bot is not on the Source bot list',
        source: CITE_ADMISSION,
      };
    }
    if (policy.acceptMode === 'off') {
      return {
        strength: null,
        basis: NOT_ADMITTED,
        reason: 'inferred candidate, accept mode is off',
        source: CITE_ACCEPT_MODE,
      };
    }
    return { strength: 'inferred', basis: 'bot', reason: 'bot on the bot list', source: CITE_STRENGTH };
  }

  if (trigger.isCi) {
    return fromCell(cell(source, 'unlisted_unaddressed'), 'unlisted_unaddressed', policy);
  }

  const onList = source.allowed.includes(trigger.actor);
  if (onList && trigger.addressed) {
    return {
      strength: 'explicit',
      basis: 'explicit',
      reason: 'allowed person addresses the agent',
      source: CITE_STRENGTH,
    };
  }

  if (threadHasTicket) {
    if (onList) {
      return {
        strength: 'explicit',
        basis: 'followup',
        reason: 'allowed person follows up on a Thread with a Ticket',
        source: CITE_STRENGTH,
      };
    }
    if (cell(source, 'unlisted_addressed') === 'explicit') {
      return fromCell('explicit', 'unlisted_addressed', policy);
    }
    if (policy.acceptMode === 'off') {
      return {
        strength: null,
        basis: NOT_ADMITTED,
        reason: 'inferred follow-up, accept mode is off',
        source: CITE_ACCEPT_MODE,
      };
    }
    return {
      strength: 'inferred',
      basis: 'followup',
      reason: 'unlisted person follows up on a Thread with a Ticket',
      source: CITE_TWO_PATHS,
    };
  }

  if (onList) return fromCell(cell(source, 'listed_unaddressed'), 'listed_unaddressed', policy);
  if (trigger.addressed) return fromCell(cell(source, 'unlisted_addressed'), 'unlisted_addressed', policy);
  return fromCell(cell(source, 'unlisted_unaddressed'), 'unlisted_unaddressed', policy);
}

export function ticketStage(ticket) {
  if (ticket.state === 'stopped') return 'stopped';
  if (ticket.state === 'ended') return 'ended';

  const lastReport = ticket.reports.length ? ticket.reports[ticket.reports.length - 1] : null;

  if (ticket.deliveryFailed) return 'person / delivery';
  if (ticket.attention) return 'person / answer';
  if (lastReport && lastReport.kind === 'ready') return 'person / review';
  if (
    lastReport &&
    (lastReport.kind === 'blocked' || lastReport.kind === 'failed') &&
    ticket.lastHumanTick <= lastReport.tick
  ) {
    return `person / ${lastReport.kind}`;
  }

  const lastAssignment = ticket.assignments.length
    ? ticket.assignments[ticket.assignments.length - 1]
    : null;
  if (lastAssignment === null || lastAssignment.state === 'pending') return 'working / queued';
  if ((lastReport && lastReport.kind === 'waiting') || lastAssignment.state === 'ended') return 'idle';
  return 'working';
}

function filterReason(trigger, source) {
  if (!source.listening) return 'Source is off';
  if (trigger.source !== source.id) return 'outside the Source listening scope';
  if (trigger.isBot && trigger.actor === OWN_BOT) return 'the bot own message';
  return null;
}

function fanOutTargets(tickets, thread, trigger) {
  const targets = [];
  for (const ticket of tickets) {
    if (!ticket.subscriptions.includes(thread)) continue;
    if (ticket.state === 'stopped') continue;
    if (ticket.state === 'ended' && (trigger.isBot || trigger.isCi)) continue;
    targets.push(ticket);
  }
  return targets;
}

function needsEval(trigger, delivered) {
  if (trigger.isBot || trigger.isCi) return true;
  return delivered.length === 0;
}

function mergeBatch(thread) {
  const batch = [...thread.queue];
  thread.queue = [];
  return batch;
}

function assess(entry, policy) {
  if (entry.fail) return { positive: false, rules: [], reason: 'assessment failed' };
  const requested = [...(entry.rules ?? [])];
  const matched = requested.filter((rule) => policy.rules.includes(rule));
  if (entry.positive && matched.length) {
    return { positive: true, rules: matched, reason: `matched rule(s): ${matched.join(', ')}` };
  }
  if (entry.positive) return { positive: false, rules: [], reason: 'no enabled rule matched' };
  return { positive: false, rules: [], reason: entry.reason ?? 'no enabled rule matched' };
}

function decide(entry, policy) {
  if (entry.decision === 'stop') return { kind: 'stop', rules: [], reason: 'a person asked to stop' };
  const result = assess(entry, policy);
  if (result.positive) {
    if (policy.acceptMode === 'auto') return { kind: 'accept', rules: result.rules, reason: result.reason };
    return { kind: 'ignore', rules: result.rules, reason: `${result.reason} (would accept)` };
  }
  return { kind: 'ignore', rules: [], reason: result.reason };
}

function createTicket(ticketId, thread, trigger, strength, basis, rules, policy) {
  return {
    id: ticketId,
    thread,
    source: trigger.source,
    state: 'open',
    mandate: {
      policyVersion: policy.version,
      strength,
      basis,
      rules: [...rules],
      sender: trigger.actor,
      source: trigger.source,
      scope: thread,
    },
    origin: trigger.id,
    subscriptions: [thread],
    inputs: [trigger.id],
    assignments: [],
    reports: [],
    attention: null,
    deliveryFailed: false,
    lastHumanTick: -1,
    prs: [],
    endedReason: null,
  };
}

function startAssignment(ticket) {
  const number = ticket.assignments.length + 1;
  const assignment = {
    id: `a-${ticket.id.split('-').pop()}-${number}`,
    state: 'pending',
    endedReason: null,
  };
  ticket.assignments.push(assignment);
  assignment.state = 'running';
  return assignment;
}

function canRetry(ticket) {
  return ['person / delivery', 'person / blocked', 'person / failed'].includes(ticketStage(ticket));
}

function applyReport(ticket, item) {
  ticket.reports.push(item);
  if (!ticket.assignments.length) return;
  const assignment = ticket.assignments[ticket.assignments.length - 1];
  if (assignment.state === 'ended') return;
  if (['ready', 'blocked', 'failed', 'dropped'].includes(item.kind)) {
    assignment.state = 'ended';
    assignment.endedReason = item.kind;
  } else {
    assignment.state = 'running';
  }
}

function endTicket(ticket, reason) {
  ticket.state = 'ended';
  ticket.endedReason = reason;
  const last = ticket.assignments[ticket.assignments.length - 1];
  if (last && last.state !== 'ended') {
    last.state = 'ended';
    last.endedReason = 'ticket ended';
  }
}

function stopTicket(ticket) {
  ticket.state = 'stopped';
  ticket.endedReason = 'stopped by a person';
}

function rulesEnabled(mandate, policy) {
  return mandate.rules.every((rule) => policy.rules.includes(rule));
}

function revalidate(ticket, policy, source) {
  const mandate = ticket.mandate;
  if (!mandate) return [false, 'no Mandate'];
  if (!ticket.subscriptions.includes(ticket.thread)) {
    return [false, 'the Source no longer listens to the Thread'];
  }
  if (!source.listening) return [false, 'the Source is off'];

  if (mandate.basis === 'explicit' || mandate.basis === 'followup') {
    return [true, 'explicit follow-up Mandate passes'];
  }

  if (mandate.basis === 'bot') {
    if (!source.bots.includes(mandate.sender)) return [false, 'the bot left the Source bot list'];
    if (policy.acceptMode !== 'auto') return [false, 'accept mode is no longer auto'];
    if (!rulesEnabled(mandate, policy)) return [false, 'a matched rule is no longer enabled'];
    return [true, 'bot Mandate still holds'];
  }

  if (mandate.basis === 'cell') {
    const admissionCell = cell(source, 'unlisted_addressed');
    if (mandate.strength === 'explicit' && admissionCell !== 'explicit') {
      return [false, 'the admission cell no longer grants explicit strength'];
    }
    if (mandate.strength === 'inferred' && policy.acceptMode !== 'auto') {
      return [false, 'accept mode is no longer auto'];
    }
    if (!rulesEnabled(mandate, policy)) return [false, 'a matched rule is no longer enabled'];
    return [true, 'admission cell Mandate still holds'];
  }

  if (mandate.basis === 'inferred') {
    if (!source.allowed.includes(mandate.sender)) return [false, 'the sender left the allowed list'];
    if (policy.acceptMode !== 'auto') return [false, 'accept mode is no longer auto'];
    if (!rulesEnabled(mandate, policy)) return [false, 'a matched rule is no longer enabled'];
    return [true, 'inferred Mandate still holds'];
  }

  if (!source.allowed.includes(mandate.sender)) return [false, 'the sender left the allowed list'];
  return [true, 'Mandate still holds'];
}

function resumeTicket(ticket, trigger, policy, source, currentTick) {
  if (ticket.state !== 'ended') return [false, 'the Ticket is not ended', CITE_RESUME];
  if (ticket.endedReason === 'stopped by a person') return [false, 'the Ticket was stopped', CITE_RESUME];
  if (trigger.isBot || trigger.isCi) {
    return [false, 'bots and CI do not wake an ended Ticket', CITE_RESUME];
  }
  const [ok, reason] = revalidate(ticket, policy, source);
  if (!ok) return [false, reason, CITE_REVALIDATION];

  ticket.state = 'open';
  ticket.endedReason = null;
  ticket.inputs.push(trigger.id);
  ticket.lastHumanTick = currentTick;
  return [true, reason, CITE_RESUME];
}

function sendMessage(messages, ticket, source, kind, text, currentTick) {
  const message = {
    ticket: ticket.id,
    conversation: ticket.thread,
    kind,
    text,
    state: source.listening ? 'sent' : 'dropped',
    tick: currentTick,
  };
  messages.push(message);
  return message;
}

function sendAck(messages, ticket, source, currentTick) {
  return sendMessage(messages, ticket, source, 'ack', `Accepted as ${ticket.id}.`, currentTick);
}

function sendFinal(messages, ticket, source, currentTick) {
  if (source.kind !== 'feishu') return null;
  return sendMessage(
    messages,
    ticket,
    source,
    'final',
    `Work item ${ticket.id} ended: ${ticket.endedReason ?? 'done'}.`,
    currentTick,
  );
}

// ---------------------------------------------------------------------------
// The engine.

class Engine {
  constructor(scenario) {
    this.scenario = scenario;
    this.policy = scenario.policy;
    this.tick = 0;
    this.records = [];
    this.snapshots = [];
    this.sources = new Map(this.policy.sources.map((source) => [source.id, source]));
    this.triggers = new Map();
    this.gates = new Map();
    this.threads = new Map();
    this.tickets = new Map();
    this.messages = [];
    this.problems = [];
    this.decisions = [];
    this.seen = new Set();
    this.accepted = new Map();
    this.ticketSeq = 0;
    this.decisionSeq = 0;
  }

  record(phase, key, outcome, detail, source) {
    this.records.push({ tick: this.tick, phase, key, outcome, detail, source });
    this.snapshots.push(this.snapshot());
  }

  snapshot() {
    const tickets = [...this.tickets.values()]
      .slice()
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((ticket) => ({
        id: ticket.id,
        thread: ticket.thread,
        source: ticket.source,
        state: ticket.state,
        stage: ticketStage(ticket),
        endedReason: ticket.endedReason,
        mandate: ticket.mandate ? clone(ticket.mandate) : null,
        inputs: [...ticket.inputs],
        assignments: ticket.assignments.map((item) => ({ ...item })),
        reports: ticket.reports.map((item) => ({ ...item })),
        prs: ticket.prs.map((item) => ({ ...item })),
        attention: ticket.attention,
        deliveryFailed: ticket.deliveryFailed,
        lastHumanTick: ticket.lastHumanTick,
      }));
    return {
      tick: this.tick,
      policy: clone(this.policy),
      tickets,
      messages: clone(this.messages),
      decisions: clone(this.decisions),
      problems: clone(this.problems),
    };
  }

  source(sourceId) {
    const source = this.sources.get(sourceId);
    if (!source) throw new Error(`unknown Source: ${sourceId}`);
    return source;
  }

  thread(key) {
    if (!this.threads.has(key)) {
      this.threads.set(key, {
        key,
        triggers: [],
        ticketIds: [],
        queue: [],
        running: null,
        decisions: [],
      });
    }
    return this.threads.get(key);
  }

  ticket(ticketId) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error(`unknown Ticket: ${ticketId}`);
    return ticket;
  }

  decision(thread, kind, strength, rules, batch, reason) {
    this.decisionSeq += 1;
    const decision = {
      id: `d-${String(this.decisionSeq).padStart(3, '0')}`,
      thread: thread.key,
      kind,
      strength,
      rules: [...rules],
      triggers: [...batch],
      reason,
    };
    this.decisions.push(decision);
    thread.decisions.push(decision.id);
    this.record('decision', decision.id, kind, reason, CITE_ROUTING);
    return decision;
  }

  run() {
    this.snapshots.push(this.snapshot());
    for (const event of this.scenario.events) {
      this.tick += 1;
      this.dispatch(event);
      this.expire();
    }
    const tickets = [...this.tickets.values()]
      .slice()
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const open = tickets.filter((ticket) => ticket.state === 'open').length;
    return {
      scenario: this.scenario.id,
      title: this.scenario.title,
      policy: this.policy,
      records: this.records,
      snapshots: this.snapshots,
      tickets,
      messages: this.messages,
      problems: this.problems,
      decisions: this.decisions,
      final: `tickets=${tickets.length} open=${open} messages=${this.messages.length} problems=${this.problems.length}`,
    };
  }

  dispatch(event) {
    const handler = this[`on_${event.kind}`];
    if (!handler) throw new Error(`unknown event kind: ${event.kind}`);
    handler.call(this, event.data);
  }

  on_tick() {}

  on_trigger(data) {
    this.receive(data.trigger);
  }

  on_report(data) {
    const ticket = this.ticket(data.ticket);
    if (ticket.state !== 'open') {
      this.record('report', ticket.id, 'ignored', 'the Ticket is not open', CITE_EXECUTOR);
      return;
    }
    const item = {
      kind: data.kind,
      text: data.text ?? '',
      tick: this.tick,
      pr: data.pr ?? null,
    };
    applyReport(ticket, item);
    if (item.kind === 'ready' && item.pr !== null) this.trackPr(ticket, item.pr);
    this.record(
      'report',
      ticket.id,
      item.kind,
      `${item.text || item.kind} (stage: ${ticketStage(ticket)})`,
      CITE_EXECUTOR,
    );
  }

  on_pr(data) {
    const ticket = this.ticket(data.ticket);
    const existing = ticket.prs.find((item) => item.id === data.pr);
    if (existing) existing.state = data.state;
    else ticket.prs.push({ id: data.pr, state: data.state });
    this.record('report', ticket.id, `pr-${data.state}`, `pull request #${data.pr}`, CITE_EXECUTOR);
    if (ticket.prs.length && ticket.prs.every((item) => item.state === 'merged' || item.state === 'closed')) {
      this.end(ticket, data.state);
    }
  }

  on_retry(data) {
    const ticket = this.ticket(data.ticket);
    if (!canRetry(ticket)) {
      this.record('executor', ticket.id, 'retry-refused', `stage: ${ticketStage(ticket)}`, CITE_EXECUTOR);
      return;
    }
    startAssignment(ticket);
    this.record('executor', ticket.id, 'retried', `new Assignment (stage: ${ticketStage(ticket)})`, CITE_EXECUTOR);
  }

  on_handback(data) {
    const ticket = this.ticket(data.ticket);
    const reason = data.reason ?? 'outside the Ticket scope';
    this.record('ticket', ticket.id, 'handback', reason, CITE_TWO_PATHS);
    const trigger = this.triggers.get(data.trigger);
    const source = this.source(trigger.source);
    const result = admit(trigger, this.policy, source, this.threadHasTicket(this.thread(ticket.thread)));
    this.gates.set(data.trigger, result);
    if (!result.strength) {
      this.record('gate', data.trigger, 'not-admitted', result.reason, result.source);
      return;
    }
    this.record('gate', data.trigger, result.strength, result.reason, result.source);
    const thread = this.thread(ticket.thread);
    thread.queue.push(data.trigger);
    this.record('intake', data.trigger, 'requeued', 'handed back for a fresh Eval', CITE_TWO_PATHS);
    this.startEval(thread);
  }

  on_delivery_fail(data) {
    const ticket = this.ticket(data.ticket);
    ticket.deliveryFailed = true;
    this.record('executor', ticket.id, 'delivery-failed', `stage: ${ticketStage(ticket)}`, CITE_STAGES);
  }

  on_stop(data) {
    const ticket = this.ticket(data.ticket);
    stopTicket(ticket);
    this.record('ticket', ticket.id, 'stopped', 'a person stopped the Ticket', CITE_RESUME);
  }

  on_policy(data) {
    this.changePolicy(data.policy, data.affected ?? null);
  }

  receive(trigger) {
    const source = this.source(trigger.source);
    const reason = filterReason(trigger, source);
    if (reason) {
      this.record('source', trigger.id, 'filtered', reason, CITE_FLOW);
      return;
    }
    if (this.seen.has(trigger.id)) {
      this.record('intake', trigger.id, 'duplicate', 'Trigger already recorded', CITE_CONCEPTS);
      return;
    }

    this.seen.add(trigger.id);
    this.triggers.set(trigger.id, trigger);
    const thread = this.thread(trigger.thread);
    thread.triggers.push(trigger.id);
    this.record('intake', trigger.id, 'stored', `Thread ${thread.key}`, CITE_FLOW);

    const targets = fanOutTargets(
      thread.ticketIds.map((ticketId) => this.tickets.get(ticketId)),
      thread.key,
      trigger,
    );
    const delivered = [];
    for (const ticket of targets) {
      if (ticket.state === 'ended') {
        const [ok, why, cite] = resumeTicket(ticket, trigger, this.policy, source, this.tick);
        if (!ok) {
          this.record('ticket', ticket.id, 'revoked', why, CITE_REVALIDATION);
          continue;
        }
        this.record('ticket', ticket.id, 'resumed', why, CITE_RESUME);
      } else {
        ticket.inputs.push(trigger.id);
      }
      delivered.push(ticket);
      this.record(
        'intake',
        trigger.id,
        'fanned-out',
        `to ${ticket.id} (stage: ${ticketStage(ticket)})`,
        CITE_TWO_PATHS,
      );
      this.wake(ticket, trigger);
    }

    if (!needsEval(trigger, delivered)) {
      this.record(
        'intake',
        trigger.id,
        'no-eval',
        'the message belongs to its Ticket Executor',
        CITE_TWO_PATHS,
      );
      return;
    }

    const result = admit(trigger, this.policy, source, this.threadHasTicket(thread));
    this.gates.set(trigger.id, result);
    if (!result.strength) {
      this.record('gate', trigger.id, 'not-admitted', result.reason, result.source);
      return;
    }
    this.record('gate', trigger.id, result.strength, result.reason, result.source);
    thread.queue.push(trigger.id);
    this.record('intake', trigger.id, 'queued', `Thread ${thread.key}`, CITE_TWO_PATHS);
    this.startEval(thread);
  }

  threadHasTicket(thread) {
    return thread.ticketIds.some((ticketId) => this.tickets.get(ticketId).state !== 'stopped');
  }

  wake(ticket, trigger) {
    if (trigger.isBot || trigger.isCi) return;
    ticket.lastHumanTick = this.tick;
    if (ticket.attention) {
      ticket.attention = null;
      this.record('ticket', ticket.id, 'answered', 'Attention cleared', CITE_STAGES);
    }
    const last = ticket.assignments.length ? ticket.assignments[ticket.assignments.length - 1] : null;
    if (!last || last.state === 'ended') {
      startAssignment(ticket);
      this.record('executor', ticket.id, 'woken', `new Assignment (stage: ${ticketStage(ticket)})`, CITE_EXECUTOR);
    }
  }

  assessment(signature) {
    const keyed = `${this.policy.version}:${signature}`;
    if (Object.prototype.hasOwnProperty.call(this.scenario.assessments, keyed)) {
      return this.scenario.assessments[keyed];
    }
    return this.scenario.assessments[signature] ?? {};
  }

  startEval(thread, retries = 0) {
    if (thread.running || !thread.queue.length) return;
    const batch = mergeBatch(thread);
    const signature = batch.join(',');
    const run = {
      thread: thread.key,
      batch,
      deadline: this.tick + EVAL_TICKS,
      retries,
      entry: this.assessment(signature),
    };
    thread.running = run;
    this.record('eval', signature, 'started', `policy v${this.policy.version}`, CITE_ACCEPT_MODE);
    if (run.entry.timeout) return;
    this.resolve(thread, run);
  }

  resolve(thread, run) {
    thread.running = null;
    const strengths = run.batch.map((triggerId) => this.gates.get(triggerId));
    if (strengths.every((result) => result && result.strength === 'explicit')) {
      this.decision(thread, 'accept', 'explicit', [], run.batch, 'explicit candidate routed');
      this.accept(thread, run.batch, 'explicit', 'explicit', []);
      this.advance(thread);
      return;
    }

    const { kind, rules, reason } = decide(run.entry, this.policy);
    const strength = 'inferred';
    const basis = strengths.find((result) => result && result.strength === 'inferred')?.basis ?? 'inferred';
    this.decision(thread, kind, strength, rules, run.batch, reason);
    if (kind === 'accept') this.accept(thread, run.batch, strength, basis, rules);
    else if (kind === 'stop') this.stopThread(thread, run.batch);
    this.advance(thread);
  }

  advance(thread) {
    if (!thread.running && thread.queue.length) this.startEval(thread);
  }

  expire() {
    for (const thread of [...this.threads.values()]) {
      const run = thread.running;
      if (!run || this.tick < run.deadline) continue;
      run.retries += 1;
      if (run.retries >= 3) {
        thread.running = null;
        this.decisionSeq += 1;
        const decision = {
          id: `d-${String(this.decisionSeq).padStart(3, '0')}`,
          thread: thread.key,
          kind: 'unavailable',
          strength: 'inferred',
          rules: [],
          triggers: run.batch,
          reason: 'Eval expired three times',
        };
        this.decisions.push(decision);
        thread.decisions.push(decision.id);
        this.problems.push({ thread: thread.key, triggers: run.batch, reason: 'Eval unavailable' });
        this.record('eval', run.batch.join(','), 'unavailable', 'expired three times', CITE_EVAL_END);
        this.advance(thread);
        continue;
      }
      thread.queue = [...run.batch, ...thread.queue];
      thread.running = null;
      this.record(
        'eval',
        run.batch.join(','),
        'expired',
        `requeued, retry ${run.retries}`,
        CITE_EVAL_END,
      );
      this.startEval(thread, run.retries);
    }
  }

  accept(thread, batch, strength, basis, rules) {
    for (const triggerId of batch) {
      if (this.accepted.has(triggerId)) {
        this.record(
          'decision',
          this.accepted.get(triggerId),
          'duplicate-accept',
          `Trigger ${triggerId} already created a Ticket`,
          CITE_CONCEPTS,
        );
        return;
      }
    }

    const trigger = this.triggers.get(batch[0]);
    this.ticketSeq += 1;
    const ticketId = `t-${String(this.ticketSeq).padStart(3, '0')}`;
    const ticket = createTicket(ticketId, thread.key, trigger, strength, basis, rules, this.policy);
    this.tickets.set(ticketId, ticket);
    thread.ticketIds.push(ticketId);
    for (const triggerId of batch) this.accepted.set(triggerId, ticketId);
    this.record(
      'ticket',
      ticketId,
      'created',
      `mandate v${ticket.mandate.policyVersion} ${ticket.mandate.strength} rules=${
        ticket.mandate.rules.join(',') || '-'
      } (stage: ${ticketStage(ticket)})`,
      CITE_CONCEPTS,
    );
    startAssignment(ticket);
    this.record(
      'executor',
      ticketId,
      'started',
      `session worker-${ticketId}, stage: ${ticketStage(ticket)}`,
      CITE_EXECUTOR,
    );
    const source = this.source(ticket.source);
    const message = sendAck(this.messages, ticket, source, this.tick);
    this.record('channel', ticketId, message.state, `ack: ${message.text}`, CITE_CONCEPTS);
  }

  stopThread(thread) {
    for (const ticketId of thread.ticketIds) {
      const ticket = this.tickets.get(ticketId);
      if (ticket.state === 'open') {
        stopTicket(ticket);
        this.record('ticket', ticket.id, 'stopped', 'a person asked to stop', CITE_RESUME);
      }
    }
  }

  end(ticket, reason) {
    endTicket(ticket, reason);
    this.record('ticket', ticket.id, 'ended', `reason: ${reason}`, CITE_EXECUTOR);
    const source = this.source(ticket.source);
    const message = sendFinal(this.messages, ticket, source, this.tick);
    if (message) this.record('channel', ticket.id, message.state, `final: ${message.text}`, CITE_CONCEPTS);
  }

  trackPr(ticket, prId) {
    const existing = ticket.prs.find((item) => item.id === prId);
    if (existing) {
      existing.state = 'open';
      return;
    }
    ticket.prs.push({ id: prId, state: 'open' });
  }

  changePolicy(policy, affected) {
    const old = this.policy;
    this.policy = policy;
    this.sources = new Map(policy.sources.map((source) => [source.id, source]));
    this.record(
      'policy',
      `v${policy.version}`,
      'changed',
      `mode=${policy.acceptMode} rules=${policy.rules.join(',') || '-'}`,
      CITE_POLICY,
    );

    const targets = affected === null ? this.affected(old, policy) : affected;
    for (const ticketId of targets) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket || ticket.state !== 'open') continue;
      ticket.inputs.push(`policy-changed:${policy.version}`);
      this.record('ticket', ticket.id, 'policy-input', `policy v${policy.version} delivered`, CITE_POLICY);
    }

    for (const thread of [...this.threads.values()]) {
      const run = thread.running;
      if (!run) continue;
      thread.queue = [...run.batch, ...thread.queue];
      thread.running = null;
      this.record('eval', run.batch.join(','), 'discarded', 'Policy version changed', CITE_POLICY);
      this.startEval(thread);
    }
  }

  affected(oldPolicy, newPolicy) {
    const targets = [];
    for (const ticket of this.tickets.values()) {
      if (ticket.state !== 'open' || !ticket.mandate) continue;
      const mandate = ticket.mandate;
      const source = newPolicy.sources.find((item) => item.id === ticket.source);
      if (!source) {
        targets.push(ticket.id);
        continue;
      }
      if (mandate.rules.some((rule) => !newPolicy.rules.includes(rule))) {
        targets.push(ticket.id);
      } else if (
        ['inferred', 'bot', 'cell'].includes(mandate.basis) &&
        oldPolicy.acceptMode === 'auto' &&
        newPolicy.acceptMode !== 'auto'
      ) {
        targets.push(ticket.id);
      } else if (!source.allowed.includes(mandate.sender) && mandate.basis !== 'bot') {
        targets.push(ticket.id);
      }
    }
    return targets;
  }
}

export function replay(scenarioId) {
  const scenario = BY_ID.get(scenarioId);
  if (!scenario) throw new Error(`unknown scenario: ${scenarioId}`);
  return new Engine(scenario).run();
}

export function toDict(result) {
  return {
    scenario: result.scenario,
    title: result.title,
    policy: {
      version: result.policy.version,
      accept_mode: result.policy.acceptMode,
      rules: [...result.policy.rules],
    },
    records: result.records.map((record) => ({
      tick: record.tick,
      phase: record.phase,
      key: record.key,
      outcome: record.outcome,
      detail: record.detail,
      source: record.source,
    })),
    tickets: result.tickets.map((ticket) => ({
      id: ticket.id,
      thread: ticket.thread,
      state: ticket.state,
      stage: ticketStage(ticket),
      ended_reason: ticket.endedReason,
      mandate: ticket.mandate
        ? {
            policy_version: ticket.mandate.policyVersion,
            strength: ticket.mandate.strength,
            basis: ticket.mandate.basis,
            rules: [...ticket.mandate.rules],
            sender: ticket.mandate.sender,
            source: ticket.mandate.source,
            scope: ticket.mandate.scope,
          }
        : null,
      inputs: [...ticket.inputs],
      assignments: ticket.assignments.map((item) => ({
        id: item.id,
        state: item.state,
        ended_reason: item.endedReason,
      })),
      prs: ticket.prs.map((item) => ({ ...item })),
    })),
    messages: result.messages.map((message) => ({ ...message })),
    problems: clone(result.problems),
    decisions: result.decisions.map((decision) => ({
      id: decision.id,
      thread: decision.thread,
      kind: decision.kind,
      strength: decision.strength,
      rules: [...decision.rules],
      triggers: [...decision.triggers],
      reason: decision.reason,
    })),
    final: result.final,
  };
}

export { STAGE_ORDER };
