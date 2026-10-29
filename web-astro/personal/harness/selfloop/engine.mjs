// Browser-side, deterministic simulator for the SelfLoop lab.
//
// It mirrors the shape of labs/selfloop without running Python: the baseline,
// scripted proposer, sandbox evidence, four gates, strict acceptance, in-memory
// RunStore and the stop conditions are reimplemented as pure functions.
// There is no network, no filesystem access and no wall clock. The archive
// itself stays read-only; the "run directory" below is an in-memory object.
//
// The default scenario's gate numbers come from one real run of
// verify_source() against archive/labs/selfloop (2026-10-18):
//   0.4942 -> 0.6867 -> 0.8154 -> 1.0
//   visible 5/6, 5/6, 5/6, 6/6
//   hidden 162/520 -> 316/520 -> 419/520 -> 520/520
//   canary 32/95 -> 45/95 -> 70/95 -> 95/95
// build_prompt, token estimates and prices are copied from providers.py, so a
// default run also reproduces its token (1364 / 556) and cost (0.000616).
// The test suite compares these values and the Python source constants, so a
// deliberate change on either side shows up as a failing test.

const clone = (value) => JSON.parse(JSON.stringify(value));
const pad = (value) => String(value).padStart(2, '0');
const SIM_CLOCK_BASE = Date.parse('2026-10-18T21:00:00+08:00');
const SIM_EPOCH = SIM_CLOCK_BASE / 1000;

const round4 = (value) => Math.round(value * 10_000) / 10_000;
const round6 = (value) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const byteLength = (text) => new TextEncoder().encode(text).length;
const lineCount = (text) => {
  if (!text) return 0;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
};
const lineBytes = (text) => byteLength(text);

export function formatSimTime(offsetSeconds = 0) {
  const date = new Date(SIM_CLOCK_BASE + offsetSeconds * 1000);
  const hour = (date.getUTCHours() + 8) % 24;
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(hour)}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+08:00`
  );
}

// --------------------------------------------------------------------------
// Constants (aligned with the Python lab by tests)

export const SOURCE_DEFAULTS = Object.freeze({
  maxRounds: 10,
  budgetUsd: 2.0,
  plateauK: 3,
  stopOnVerified: true,
  temperature: 0.2,
  visibleWeight: 0.35,
  hiddenWeight: 0.65,
  maxSourceBytes: 60_000,
  timeoutSec: 30,
  priceIn: 0.28,
  priceOut: 0.42,
  visibleTests: 6,
  hiddenCases: 520,
  canaryCases: 95,
  maxEventBuffer: 600,
});

export const DEFAULT_OPTIONS = Object.freeze({
  maxRounds: 6,
  budgetUsd: 2.0,
  plateauK: 3,
  stopOnVerified: true,
  stopAfterRound: 0,
});

export const STAGES = [
  {
    id: 'P1',
    name: '基线',
    short: 'Baseline',
    file: 'selfloop/loop.py',
    question: '循环从哪开始？未改动的初始实现凭什么成为第 0 轮？',
    how:
      '先用同一个验证器给初始实现打分，把结果作为基线入档；最优分数、最优源码和可见失败项都从这里出发。',
    cost: '基线与后续候选走同一条验证路径，不做特殊照顾；基线分数决定了第一个候选要跨过的高度。',
    code: 'Controller._run / _record(is_baseline=True)',
    events: ['run_started', 'baseline_verify', 'baseline_archive'],
  },
  {
    id: 'P2',
    name: '提议',
    short: 'Propose',
    file: 'selfloop/providers.py',
    question: '模型能看到什么、看不到什么？为什么隐藏用例不能进提示词？',
    how:
      'build_prompt 只放任务规格、当前最优源码、聚合分数、可见失败项和最近几轮；MockProposer 按脚本逐轮修一个语义错误，产出完整文件。',
    cost: '提示词里没有隐藏用例，模型只能按语义写对；真实模型的成本和延迟也在这里产生。',
    code: 'build_prompt / MockProposer.propose',
    events: ['round_started', 'prompt_built', 'proposal'],
  },
  {
    id: 'P3',
    name: '沙箱验证',
    short: 'Verify',
    file: 'selfloop/verify.py',
    question: '候选说改好了不算数，机器证据从哪里来？',
    how:
      '把候选写进一次性临时目录，用隔离子进程跑可见 unittest、隐藏用例与 canary；期望值由参考实现现算，结果写回 result.json。',
    cost: '要起子进程、设超时、清理临时目录；验证器本身就是天花板，用例写歪了会稳定地优化错误目标。',
    code: 'verify_source / RUNNER_SRC',
    events: ['verify_start', 'visible_gate', 'hidden_gate'],
  },
  {
    id: 'P4',
    name: '四道闸门',
    short: 'Gates',
    file: 'selfloop/verify.py',
    question: '可见测试全绿就能算 verified 吗？canary 和完整性各自挡什么？',
    how:
      '可见 35% + 隐藏 65% 算分数；canary 不参与分数，只参与 verified；完整性命中 open/eval/子进程等直接 0 分。',
    cost: '四道闸门仍然可能既不可靠又保守；完整性靠正则扫描，不是真正的进程级隔离。',
    code: 'score / verified / _scan_source',
    events: ['canary_gate', 'integrity_gate', 'score_computed', 'verified_check'],
  },
  {
    id: 'P5',
    name: '接受与归档',
    short: 'Archive',
    file: 'selfloop/archive.py',
    question: '候选变好了才更新最优解，没变好为什么还要入档？',
    how:
      '只有 score 严格高于当前最优才接受并更新 best.py；失败候选连同理由、闸门和源码快照一起入档，作为负样本。',
    cost: '只接受严格提升意味着同分但更干净的实现会被拒；档案会越积越多，需要自己清理运行目录。',
    code: 'accepted = res.score > best_score + 1e-9 / _record',
    events: ['accept_decision', 'archive_write'],
  },
  {
    id: 'P6',
    name: '停机',
    short: 'Stop',
    file: 'selfloop/loop.py',
    question: '跑到什么时候停？为什么不能靠提示词让它“别跑太久”？',
    how:
      '轮次之间依次判断：verified 且允许停机、累计成本超预算、连续 K 轮无严格提升；循环跑满 max_rounds 也会停。手动停止只在轮次之间生效。',
    cost: '每次都只在轮次边界检查；如果提议者卡在慢请求里，停止要等这次请求返回。',
    code: '_run stop checks / _finish',
    events: ['stop_check', 'finished'],
  },
];

export const GATES = [
  {
    id: 'visible',
    name: '可见测试',
    weight: '35%',
    gate: false,
    file: 'verify.py',
    question: 'agent 能看到并运行的那部分测试。',
    how: '逐个 unittest 方法跑，记录通过数与失败原因；失败项会进入下一轮提示词。',
    risk: '只覆盖主路径，跑绿了不等于 verified；agent 可以针对它打补丁。',
  },
  {
    id: 'hidden',
    name: '隐藏用例',
    weight: '65%',
    gate: false,
    file: 'tasks.py',
    question: '随机 + 边界输入，期望值由参考实现现算。',
    how: '120 组随机 + 10 组固定边界，每组跑 4 个函数，共 520 个用例；详情不进入提示词。',
    risk: '隐藏集写歪了，循环会稳定地优化一个错误目标，这是 Goodhart。',
  },
  {
    id: 'canary',
    name: 'canary',
    weight: '门禁',
    gate: true,
    file: 'tasks.py',
    question: '分布不同的退化输入，只用于判定 verified。',
    how: '30 组更极端随机 + 5 个固定边界，共 95 个用例；想同时通过隐藏集与 canary，硬编码答案会崩。',
    risk: '不参与分数，所以会出现“分数 1.0 但 verified=false”的候选。',
  },
  {
    id: 'integrity',
    name: '完整性',
    weight: '门禁',
    gate: true,
    file: 'verify.py',
    question: '候选有没有试图读测试、起进程或改测试文件？',
    how: '软/硬禁用正则、源码大小上限、必需函数检查；命中硬禁用或测试哈希变化，分数直接归零。',
    risk: '正则不是沙箱，解释器与命令旗标仍可能绕过；只适合本地可信模型的实验。',
  },
];

export const SCENARIOS = [
  {
    id: 'verified',
    title: '跑到 verified',
    badge: '推荐',
    task: 'intervalkit：修好 normalize、gaps 与 coverage，让四道闸门全部通过。',
    description:
      '脚本提议者逐轮修一个语义错误；可见测试前两轮保持 5/6，隐藏用例从 162/520 升到 520/520，第 3 轮 verified 后停机。',
    expectedStop: 'verified',
    defaults: { maxRounds: 6, budgetUsd: 2, plateauK: 3, stopOnVerified: true, stopAfterRound: 0 },
  },
  {
    id: 'plateau',
    title: '平台期停机',
    badge: '停止条件',
    task: '已经 verified，但关掉“verified 后停机”，继续看第 4、5 轮。',
    description:
      '第 3 轮拿到 1.0 后继续跑；第 4、5 轮重复正确实现，分数没有严格提升，连续 K=2 轮被拒后按平台期停机。',
    expectedStop: 'plateau',
    defaults: { maxRounds: 10, budgetUsd: 2, plateauK: 2, stopOnVerified: false, stopAfterRound: 0 },
  },
  {
    id: 'budget',
    title: '预算停机',
    badge: '成本',
    task: '把预算压到 $0.00045，看成本在哪一轮越过阈值。',
    description:
      '第 1、2 轮被接受，累计成本 $0.000409；第 3 轮 verified 但 stop_on_verified=false，成本 $0.000616 越过预算，按预算停机。',
    expectedStop: 'budget',
    defaults: { maxRounds: 6, budgetUsd: 0.00045, plateauK: 5, stopOnVerified: false, stopAfterRound: 0 },
  },
  {
    id: 'integrity',
    title: '完整性作弊',
    badge: '闸门',
    task: '第 1 轮候选偷偷 open() 读取可见测试，第 2 轮改回正常实现。',
    description:
      '作弊候选的可见/隐藏/canary 可能全过，但完整性命中 open() 后分数直接归零并被拒；第 2 轮正确实现拿到 1.0，verified 停机。',
    expectedStop: 'verified',
    defaults: { maxRounds: 6, budgetUsd: 2, plateauK: 3, stopOnVerified: true, stopAfterRound: 0 },
  },
  {
    id: 'canary',
    title: 'canary 近失',
    badge: '反例',
    task: '一个可见 6/6、隐藏 520/520 的候选，为什么仍然不是 verified？',
    description:
      '第 1 轮候选在大数输入上偷懒，canary 94/95；分数仍是 1.0，但 verified 为 false。默认只跑 1 轮，按轮数上限停机，专门看分数与 verified 分离。',
    expectedStop: 'max_rounds',
    defaults: { maxRounds: 1, budgetUsd: 2, plateauK: 3, stopOnVerified: true, stopAfterRound: 0 },
  },
];

// --------------------------------------------------------------------------
// Task source (copied from tasks.py; byte counts are asserted by tests)

export const SPEC_MD = [
  '# 任务：intervalkit',
  '',
  '实现一个处理**半开区间** `[start, end)` 的小工具库，四个函数：',
  '',
  '| 函数 | 语义 |',
  '|---|---|',
  '| `normalize(intervals)` | 归一化：丢掉空区间（`end <= start`），排序，**合并重叠与相邻**的区间（`end == start` 也算相接） |',
  '| `insert(intervals, new)` | 把一个区间插进去，返回归一化后的结果 |',
  '| `gaps(intervals)` | 返回归一化后相邻区间之间的空隙（边界也不相邻才算空隙） |',
  '| `coverage(intervals)` | 返回所有区间覆盖的总长度（重叠部分只算一次） |',
  '',
  '约束：',
  '- 输入是 `(start, end)` 二元组的列表，start/end 均为整数，可能是负数。',
  '- 返回值同样是二元组列表；`gaps` / `coverage` 的返回值见下。',
  '- **不要修改 tests/ 下的任何文件**，也不要读取隐藏用例；那会被闸门判为作弊。',
  '- 只允许使用标准库。',
  '',
  '示例：',
  '```python',
  'normalize([(1, 4), (2, 6)])      # [(1, 6)]',
  'normalize([(1, 3), (3, 5)])      # [(1, 5)]      <- 相邻要合并',
  'normalize([(5, 5), (1, 2)])      # [(1, 2)]      <- 空区间丢掉',
  'gaps([(1, 3), (5, 7)])           # [(3, 5)]',
  'coverage([(1, 3), (2, 5)])       # 4',
  '```',
  '',
].join('\n');

export const INITIAL_SOURCE = `"""intervalkit —— 半开区间 [start, end) 工具。

TODO: 还有若干边界情况没处理，跑一下可见测试就知道差在哪。
"""


def normalize(intervals):
    """排序并合并重叠区间。"""
    items = sorted(intervals)
    out = []
    for s, e in items:
        if out and s < out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def insert(intervals, new):
    """插入一个区间后重新合并。"""
    return normalize(list(intervals) + [tuple(new)])


def gaps(intervals):
    """归一化后相邻区间之间的空隙。"""
    out = []
    for i in range(len(intervals) - 1):
        out.append((intervals[i][1], intervals[i + 1][0]))
    return out


def coverage(intervals):
    """区间覆盖的总长度。"""
    return sum(e - s for s, e in intervals)
`;

function replaceOnce(text, find, replacement) {
  const index = text.indexOf(find);
  if (index < 0) throw new Error(`SelfLoop simulator source pattern not found: ${find.slice(0, 48)}`);
  return text.slice(0, index) + replacement + text.slice(index + find.length);
}

function makeStageSources() {
  const base = INITIAL_SOURCE;
  const stage1 = replaceOnce(
    base,
    [
      '    items = sorted(intervals)',
      '    out = []',
      '    for s, e in items:',
      '        if out and s < out[-1][1]:',
    ].join('\n'),
    [
      '    items = [(s, e) for s, e in intervals if e > s]',
      '    items.sort()',
      '    out = []',
      '    for s, e in items:',
      '        if out and s <= out[-1][1]:',
    ].join('\n'),
  );
  const stage2 = replaceOnce(
    stage1,
    [
      '    out = []',
      '    for i in range(len(intervals) - 1):',
      '        out.append((intervals[i][1], intervals[i + 1][0]))',
      '    return out',
    ].join('\n'),
    [
      '    norm = normalize(intervals)',
      '    return [(norm[i][1], norm[i + 1][0]) for i in range(len(norm) - 1)]',
    ].join('\n'),
  );
  const stage3 = replaceOnce(
    stage2,
    '    return sum(e - s for s, e in intervals)',
    '    return sum(e - s for s, e in normalize(intervals))',
  );
  return [base, stage1, stage2, stage3];
}

export const SOURCE_STAGES = makeStageSources();
export const CORRECT_SOURCE = SOURCE_STAGES[3];

const CHEAT_SOURCE = `${CORRECT_SOURCE}

# 教学用的作弊候选：试图直接读取可见测试。
data = open("tests/test_visible.py", encoding="utf-8").read()
`;

const CANARY_NEAR_MISS_SOURCE = replaceOnce(
  CORRECT_SOURCE,
  '    """排序并合并重叠区间。"""\n',
  [
    '    """排序并合并重叠区间。"""',
    '    if any(abs(s) > 200 or abs(e) > 200 for s, e in intervals):',
    '        return sorted(intervals)',
    '',
  ].join('\n'),
);

const STAGE_RATIONALES = [
  '先不动，测一下当前基线。',
  'normalize 用 s < prev_end 判断，导致相邻区间（end == start）没有合并；同时没有过滤 end <= start 的空区间。改成 s <= prev_end 并先过滤。',
  'gaps 直接在原始输入上算相邻差，输入无序或含空区间时结果就错了。应该先 normalize 再取相邻边界。',
  'coverage 直接对原始区间求和，重叠部分被重复计算。应该对 normalize 的结果求和。',
];

const VISIBLE_FAILURE = [
  { test: 'test_coverage_overlap_counted_once', reason: 'AssertionError: 5 != 4' },
];

const HIDDEN_FAILURES = [
  [
    {
      fn: 'normalize',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)),)',
      expected: '((-19, 8), (11, 13))',
      got: '((-19, 8), (11, 13), (13, 13))',
      ok: false,
      error: null,
    },
    {
      fn: 'insert',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)), (15, 15))',
      expected: '((-19, 8), (11, 13))',
      got: '((-19, 8), (11, 13), (13, 13), (15, 15))',
      ok: false,
      error: null,
    },
    {
      fn: 'gaps',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)),)',
      expected: '((8, 11),)',
      got: '((8, -9), (-13, 11), (13, 13))',
      ok: false,
      error: null,
    },
  ],
  [
    {
      fn: 'gaps',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)),)',
      expected: '((8, 11),)',
      got: '((8, -9), (-13, 11), (13, 13))',
      ok: false,
      error: null,
    },
    {
      fn: 'coverage',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)),)',
      expected: '29',
      got: '25',
      ok: false,
      error: null,
    },
    {
      fn: 'gaps',
      args: '(((17, -9), (10, 12), (5, 15), (16, -15), (-9, -9)),)',
      expected: '()',
      got: '((-9, 10), (12, 5), (15, 16), (-15, -9))',
      ok: false,
      error: null,
    },
  ],
  [
    {
      fn: 'coverage',
      args: '(((-19, 8), (-9, -13), (11, 13), (13, 13)),)',
      expected: '29',
      got: '25',
      ok: false,
      error: null,
    },
    {
      fn: 'coverage',
      args: '(((17, -9), (10, 12), (5, 15), (16, -15), (-9, -9)),)',
      expected: '10',
      got: '-45',
      ok: false,
      error: null,
    },
    {
      fn: 'coverage',
      args: '(((8, 16), (-12, -20), (0, -9), (-20, 15), (-15, 3)),)',
      expected: '36',
      got: '44',
      ok: false,
      error: null,
    },
  ],
  [],
];

const CANARY_NEAR_MISS_FAILURE = [
  {
    fn: 'normalize',
    args: '(((2147483643, 2147483647), (2147483647, 2147483653)),)',
    expected: '((2147483643, 2147483653),)',
    got: '((2147483643, 2147483647), (2147483647, 2147483653))',
    ok: false,
    error: null,
  },
];

function baseStats(index) {
  const passed = index < 3 ? 5 : 6;
  const hidden = [162, 316, 419, 520][index];
  const canary = [32, 45, 70, 95][index];
  return {
    visible: {
      passed,
      total: 6,
      failures: index < 3 ? clone(VISIBLE_FAILURE) : [],
    },
    hidden: {
      passed: hidden,
      total: 520,
      failures: clone(HIDDEN_FAILURES[index]),
    },
    canary: {
      passed: canary,
      total: 95,
      failures: [],
    },
    integrity: { ok: true, issues: [], warnings: [] },
    durationMs: [51, 41, 41, 40][index],
    sourceBytes: [875, 915, 892, 903][index],
  };
}

export const GATE_STATS = [0, 1, 2, 3].map((index) => baseStats(index));

const CHEAT_STATS = {
  visible: { passed: 6, total: 6, failures: [] },
  hidden: { passed: 520, total: 520, failures: [] },
  canary: { passed: 95, total: 95, failures: [] },
  integrity: {
    ok: false,
    issues: ['出现禁用能力：文件读写 open()'],
    warnings: [],
  },
  durationMs: 46,
  sourceBytes: byteLength(CHEAT_SOURCE),
};

const NEAR_MISS_STATS = {
  visible: { passed: 6, total: 6, failures: [] },
  hidden: { passed: 520, total: 520, failures: [] },
  canary: { passed: 94, total: 95, failures: clone(CANARY_NEAR_MISS_FAILURE) },
  integrity: { ok: true, issues: [], warnings: [] },
  durationMs: 47,
  sourceBytes: byteLength(CANARY_NEAR_MISS_SOURCE),
};

// --------------------------------------------------------------------------
// Prompt, tokens, cost, gates

export function estimateTokens(text) {
  return Math.max(1, Math.floor(String(text).length / 4));
}

export function estimateCost(tokensIn, tokensOut) {
  return round6((tokensIn / 1_000_000) * SOURCE_DEFAULTS.priceIn + (tokensOut / 1_000_000) * SOURCE_DEFAULTS.priceOut);
}

export function scoreOf({ visible, hidden, canary, integrity }) {
  const visibleRatio = visible.total ? visible.passed / visible.total : 0;
  const hiddenRatio = hidden.total ? hidden.passed / hidden.total : 0;
  const canaryOk = canary.total > 0 && canary.passed === canary.total;
  const integrityOk = Boolean(integrity.ok);
  const weighted = SOURCE_DEFAULTS.visibleWeight * visibleRatio + SOURCE_DEFAULTS.hiddenWeight * hiddenRatio;
  const score = integrityOk ? round4(weighted) : 0;
  const verified =
    integrityOk &&
    visible.total > 0 &&
    visible.passed === visible.total &&
    hidden.passed === hidden.total &&
    canaryOk;
  return {
    score,
    verified,
    visibleRatio,
    hiddenRatio,
    weighted: round4(weighted),
    canaryOk,
    integrityOk,
  };
}

export function buildPrompt({ source, bestScore = 0, visible = {}, history = [] }) {
  const failures = visible.failures || [];
  const failText = failures.length
    ? failures.map((failure) => `- ${failure.test}: ${failure.reason}`).join('\n')
    : '- （无）';
  const historyText =
    history
      .slice(-6)
      .map(
        (row) =>
          `- 第 ${row.round} 轮：score=${Number(row.score).toFixed(3)}，${row.accepted ? '接受' : '拒绝'}`,
      )
      .join('\n') || '- （首轮）';
  return `# 目标

${SPEC_MD}

# 当前状态

- 当前最优分数：${Number(bestScore).toFixed(4)}（满分 1.0；visible 占 35%，hidden 占 65%）
- 可见测试：${visible.passed ?? 0}/${visible.total ?? 0} 通过
- 隐藏用例：${visible.hidden_passed ?? 0}/${visible.hidden_total ?? 0} 通过（不展示细节）

## 可见测试失败项

${failText}

## 最近几轮

${historyText}

# 当前代码

\`\`\`python
${source}
\`\`\`

# 你的任务

找出当前实现里**语义上**不正确的地方（不要只针对可见测试打补丁），输出改进后的完整文件。
如果认为已经无需改动，也要输出当前文件并说明原因。
`;
}

const HARD_FORBIDDEN = [
  [/\bopen\s*\(/, '文件读写 open()'],
  [/\bexec\s*\(/, 'exec()'],
  [/\beval\s*\(/, 'eval()'],
  [/__import__/, '__import__ 动态导入'],
  [/\bsubprocess\b/, 'subprocess'],
  [/\bos\.system\b/, 'os.system'],
  [/\bsys\.modules\b/, '篡改 sys.modules'],
  [/\binspect\b/, 'inspect 反射'],
];

const SOFT_FORBIDDEN = [
  [/\bimportlib\b/, 'importlib'],
  [/test_visible/, '引用可见测试'],
  [/\bcanary\b/, '引用 canary'],
  [/\bhidden\b/, '引用隐藏集'],
];

const REQUIRED_FUNCTIONS = ['normalize', 'insert', 'gaps', 'coverage'];

export function scanIntegrity(source) {
  const issues = [];
  const warnings = [];
  for (const [pattern, label] of HARD_FORBIDDEN) {
    if (pattern.test(source)) issues.push(`出现禁用能力：${label}`);
  }
  for (const [pattern, label] of SOFT_FORBIDDEN) {
    if (pattern.test(source)) warnings.push(`可疑引用：${label}`);
  }
  const bytes = byteLength(source);
  if (bytes > SOURCE_DEFAULTS.maxSourceBytes) {
    issues.push(`源码过大（>${SOURCE_DEFAULTS.maxSourceBytes / 1000}KB）`);
  }
  for (const name of REQUIRED_FUNCTIONS) {
    if (!new RegExp(`^def\\s+${name}\\s*\\(`, 'm').test(source)) {
      issues.push(`缺少函数 ${name}`);
    }
  }
  return { ok: issues.length === 0, issues, warnings, bytes };
}

// --------------------------------------------------------------------------
// Unified diff

function splitLines(text) {
  const lines = String(text).split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function unifiedDiff(before, after, { fromFile = 'baseline.py', toFile = 'candidate.py', context = 3 } = {}) {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ kind: ' ', text: a[i], oldNo, newNo });
      i += 1;
      j += 1;
      oldNo += 1;
      newNo += 1;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ kind: '+', text: b[j], oldNo: null, newNo });
      j += 1;
      newNo += 1;
    } else {
      ops.push({ kind: '-', text: a[i], oldNo, newNo: null });
      i += 1;
      oldNo += 1;
    }
  }

  const changeIndexes = ops.map((op, index) => (op.kind === ' ' ? -1 : index)).filter((index) => index >= 0);
  if (!changeIndexes.length) return { fromFile, toFile, hunks: [], changed: false };
  const ranges = [];
  for (const index of changeIndexes) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else ranges.push({ start, end });
  }

  const hunks = ranges.map((range) => {
    const lines = ops.slice(range.start, range.end);
    let oldStart = 0;
    let newStart = 0;
    oldStart = ops.slice(0, range.start).filter((op) => op.kind !== '+').length + 1;
    newStart = ops.slice(0, range.start).filter((op) => op.kind !== '-').length + 1;
    const oldCount = lines.filter((op) => op.kind !== '+').length;
    const newCount = lines.filter((op) => op.kind !== '-').length;
    if (oldCount === 0) oldStart -= 1;
    if (newCount === 0) newStart -= 1;
    return {
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      lines,
    };
  });
  return { fromFile, toFile, hunks, changed: true };
}

// --------------------------------------------------------------------------
// In-memory RunStore (mirrors archive.py's layout, not its timestamps/ids)

function createStore(runId, options) {
  return {
    runId,
    meta: {
      run_id: runId,
      created_at: SIM_EPOCH,
      status: 'running',
      stop_reason: null,
      config: {
        task_id: 'intervalkit',
        provider: 'mock',
        model: null,
        temperature: SOURCE_DEFAULTS.temperature,
        max_rounds: options.maxRounds,
        budget_usd: options.budgetUsd,
        plateau_k: options.plateauK,
        stop_on_verified: options.stopOnVerified,
      },
      round: 0,
      best_score: 0.0,
      best_candidate: null,
      verified: false,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0.0,
      plateau_count: 0,
    },
    candidates: [],
    snapshots: {},
    bestSource: '',
    bestCandidateId: null,
    events: [],
  };
}

function archiveFiles(store) {
  const candidatesText = store.candidates.map((row) => JSON.stringify(row)).join('\n');
  const eventsText = store.events.map((row) => JSON.stringify(row)).join('\n');
  const files = [
    { path: 'meta.json', content: JSON.stringify(store.meta, null, 2) },
    { path: 'candidates.jsonl', content: candidatesText ? `${candidatesText}\n` : '' },
  ];
  for (const id of Object.keys(store.snapshots).sort()) {
    files.push({ path: `snapshots/${id}.py`, content: store.snapshots[id] });
  }
  if (store.bestSource) files.push({ path: 'best.py', content: store.bestSource });
  files.push({ path: 'events.jsonl', content: eventsText ? `${eventsText}\n` : '' });
  return files.map((file) => ({
    ...file,
    bytes: lineBytes(file.content),
    lines: lineCount(file.content),
  }));
}

function archiveSummary(store) {
  return archiveFiles(store).map(({ path, bytes, lines }) => ({ path, bytes, lines }));
}

// --------------------------------------------------------------------------
// Scripted candidates

function stageProposal(round) {
  const index = clamp(round, 1, 3);
  const source = SOURCE_STAGES[index];
  const rationale =
    round > 3
      ? '复查了一遍，没有发现新的语义问题；保持现状。'
      : STAGE_RATIONALES[index];
  return { source, rationale, stats: GATE_STATS[index], stage: index };
}

function proposalFor(scenarioId, round) {
  if (scenarioId === 'integrity') {
    if (round === 1) {
      return {
        source: CHEAT_SOURCE,
        rationale: '[模拟提议者] 想先看一眼可见测试，确认边界到底怎么测的。',
        stats: CHEAT_STATS,
        stage: 'cheat',
      };
    }
    return {
      source: CORRECT_SOURCE,
      rationale: '[模拟提议者] 放弃读测试，按语义把 normalize / gaps / coverage 修正确。',
      stats: GATE_STATS[3],
      stage: 3,
    };
  }
  if (scenarioId === 'canary' && round === 1) {
    return {
      source: CANARY_NEAR_MISS_SOURCE,
      rationale:
        '[模拟提议者] 可见与隐藏用例都过了，但大数输入上少做了一次合并；canary 会抓到这个退化。',
      stats: NEAR_MISS_STATS,
      stage: 'canary',
    };
  }
  const proposal = stageProposal(round);
  return {
    ...proposal,
    rationale: `[模拟提议者] ${proposal.rationale}`,
  };
}

function normalizeOptions(scenario, options) {
  const merged = { ...DEFAULT_OPTIONS, ...(scenario?.defaults ?? {}), ...(options ?? {}) };
  return {
    maxRounds: clamp(Math.round(Number(merged.maxRounds) || DEFAULT_OPTIONS.maxRounds), 1, 20),
    budgetUsd: Math.max(0, Number(merged.budgetUsd) || 0),
    plateauK: clamp(Math.round(Number(merged.plateauK) || DEFAULT_OPTIONS.plateauK), 1, 20),
    stopOnVerified: Boolean(merged.stopOnVerified),
    stopAfterRound: clamp(Math.round(Number(merged.stopAfterRound) || 0), 0, 20),
  };
}

function makeCandidate({ id, round, source, rationale, stats, isBaseline = false }) {
  const outcome = scoreOf(stats);
  return {
    id,
    round,
    parentId: null,
    score: outcome.score,
    verified: outcome.verified,
    accepted: isBaseline ? true : null,
    rationale,
    source,
    sourceBytes: byteLength(source),
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    durationMs: stats.durationMs,
    visible: clone(stats.visible),
    hidden: clone(stats.hidden),
    canary: clone(stats.canary),
    integrity: clone(stats.integrity),
    sourcePath: `snapshots/${id}.py`,
    archivedAtEvent: null,
    rejectedReason: '',
    isBaseline,
  };
}

function candidateJson(candidate) {
  return {
    id: candidate.id,
    round: candidate.round,
    parent_id: candidate.parentId,
    score: candidate.score,
    verified: candidate.verified,
    accepted: Boolean(candidate.accepted),
    rationale: candidate.rationale,
    source_path: candidate.sourcePath,
    source_bytes: candidate.sourceBytes,
    tokens_in: candidate.tokensIn,
    tokens_out: candidate.tokensOut,
    cost_usd: candidate.costUsd,
    duration_ms: candidate.durationMs,
    gates: {
      ok: true,
      score: candidate.score,
      verified: candidate.verified,
      visible_passed: candidate.visible.passed,
      visible_total: candidate.visible.total,
      visible_failures: candidate.visible.failures,
      hidden_passed: candidate.hidden.passed,
      hidden_total: candidate.hidden.total,
      hidden_failures: candidate.hidden.failures,
      canary_passed: candidate.canary.passed,
      canary_total: candidate.canary.total,
      canary_ok: candidate.canary.total > 0 && candidate.canary.passed === candidate.canary.total,
      integrity_ok: candidate.integrity.ok,
      integrity_issues: candidate.integrity.issues,
      warnings: candidate.integrity.warnings,
      duration_ms: candidate.durationMs,
      source_bytes: candidate.sourceBytes,
      error: null,
    },
    created_at: SIM_EPOCH + candidate.round,
  };
}

// --------------------------------------------------------------------------
// Simulation

export function simulate({ scenarioId = 'verified', options = {} } = {}) {
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const opts = normalizeOptions(scenario, options);
  const runId = '20261018-210000-sim';
  const events = [];
  const candidates = [];
  const store = createStore(runId, opts);
  const state = {
    round: 0,
    bestScore: 0,
    bestSource: INITIAL_SOURCE,
    bestVisible: {},
    bestCandidateId: null,
    bestVerified: false,
    plateau: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    verified: false,
    status: 'running',
    stopReason: null,
  };
  const rejectedRounds = [];
  let lastPrompt = null;

  function currentCandidate(candidateId) {
    return candidates.find((item) => item.id === candidateId) ?? null;
  }

  function snapshot(candidateId = null) {
    return {
      round: state.round,
      bestScore: round4(state.bestScore),
      bestCandidateId: state.bestCandidateId,
      bestVerified: state.bestVerified,
      plateau: state.plateau,
      tokensIn: state.tokensIn,
      tokensOut: state.tokensOut,
      costUsd: round6(state.costUsd),
      verified: state.verified,
      status: state.status,
      stopReason: state.stopReason,
      candidateIds: store.candidates.map((row) => row.id),
      currentCandidateId: candidateId,
      archivedFiles: archiveSummary(store),
    };
  }

  function emit(stage, kind, tone, title, summary, detail = {}, candidateId = null) {
    const event = {
      id: events.length,
      index: events.length,
      round: state.round,
      stage,
      kind,
      tone,
      title,
      summary,
      candidateId,
      detail,
      snapshot: snapshot(candidateId),
    };
    events.push(event);
    store.events.push({
      seq: events.length,
      type: kind,
      ts: SIM_EPOCH + events.length,
      round: state.round,
      stage,
      title,
      summary,
    });
    event.snapshot.archivedFiles = archiveSummary(store);
    return event;
  }

  function updateMeta() {
    store.meta.round = state.round;
    store.meta.best_score = round4(state.bestScore);
    store.meta.best_candidate = store.bestCandidateId;
    store.meta.verified = state.verified;
    store.meta.plateau_count = state.plateau;
    store.meta.tokens_in = state.tokensIn;
    store.meta.tokens_out = state.tokensOut;
    store.meta.cost_usd = round6(state.costUsd);
  }

  function archive(candidate, { bestWritten }) {
    candidate.archivedAtEvent = events.length;
    store.candidates.push(candidateJson(candidate));
    store.snapshots[candidate.id] = candidate.source;
    if (bestWritten) {
      store.bestSource = candidate.source;
      store.bestCandidateId = candidate.id;
    }
    updateMeta();
  }

  function stopChecks() {
    const checks = [
      {
        id: 'verified',
        label: 'verified 且 stop_on_verified',
        value: state.verified ? 'true' : 'false',
        threshold: opts.stopOnVerified ? 'true' : 'false',
        met: state.verified && opts.stopOnVerified,
      },
      {
        id: 'budget',
        label: '累计成本 ≥ 预算',
        value: `$${round6(state.costUsd).toFixed(6)}`,
        threshold: `$${opts.budgetUsd.toFixed(6)}`,
        met: state.costUsd >= opts.budgetUsd,
      },
      {
        id: 'plateau',
        label: '连续无严格提升 ≥ K',
        value: state.plateau,
        threshold: opts.plateauK,
        met: state.plateau >= opts.plateauK,
      },
      {
        id: 'manual',
        label: '手动停止（轮次之间）',
        value: opts.stopAfterRound ? `第 ${state.round} 轮` : '关闭',
        threshold: opts.stopAfterRound ? `第 ${opts.stopAfterRound} 轮后` : '关闭',
        met: opts.stopAfterRound > 0 && state.round >= opts.stopAfterRound && state.round < opts.maxRounds,
      },
      {
        id: 'max_rounds',
        label: '达到最大轮数',
        value: state.round,
        threshold: opts.maxRounds,
        met: state.round >= opts.maxRounds,
      },
    ];
    let stop = null;
    if (checks[0].met) stop = 'verified';
    else if (checks[1].met) stop = 'budget';
    else if (checks[2].met) stop = 'plateau';
    else if (checks[4].met) stop = 'max_rounds';
    else if (checks[3].met) stop = 'stopped';
    return { checks, stop };
  }

  function explanation(stopReason) {
    const score = round4(state.bestScore).toFixed(4);
    if (stopReason === 'verified') {
      return `第 ${state.round} 轮候选拿到 ${score}，可见 ${state.bestVisible.passed}/${state.bestVisible.total}、隐藏 ${state.bestVisible.hidden_passed}/${state.bestVisible.hidden_total}、canary 全部通过、完整性通过；stop_on_verified=true，按 verified 停机。`;
    }
    if (stopReason === 'budget') {
      return `累计成本 $${round6(state.costUsd).toFixed(6)} 达到预算 $${opts.budgetUsd.toFixed(6)}，按预算停机；本轮 verified=${state.verified}，但 stop_on_verified=false，所以先判预算。`;
    }
    if (stopReason === 'plateau') {
      return `连续 ${opts.plateauK} 轮没有严格提升（${rejectedRounds.slice(-opts.plateauK).join('、')} 轮被拒），按平台期停机；最优分数仍为 ${score}。`;
    }
    if (stopReason === 'stopped') {
      return `第 ${opts.stopAfterRound} 轮结束后触发手动停止；停止只在轮次之间生效，不会中断正在进行的提议或验证。`;
    }
    if (stopReason === 'max_rounds') {
      const tail = state.verified
        ? 'verified 标志已经为 true，但没有在本次运行中接受一个 verified 候选。'
        : '仍未达到 verified，按轮数上限停机。';
      return `跑满 ${opts.maxRounds} 轮，${tail}最优分数 ${score}。`;
    }
    return '循环没有正常结束。';
  }

  function finish(stopReason) {
    state.status = 'finished';
    state.stopReason = stopReason;
    store.meta.status = 'finished';
    store.meta.stop_reason = stopReason;
    store.meta.verified = state.verified;
    store.meta.best_score = round4(state.bestScore);
    store.meta.best_candidate = store.bestCandidateId;
    updateMeta();
    const summary = {
      stopReason,
      bestScore: round4(state.bestScore),
      bestVerified: state.bestVerified,
      verified: state.verified,
      rounds: state.round,
      candidates: store.candidates.length,
      baselineScore: scoreOf(GATE_STATS[0]).score,
      tokensIn: state.tokensIn,
      tokensOut: state.tokensOut,
      costUsd: round6(state.costUsd),
      plateau: state.plateau,
      rejectedRounds: rejectedRounds.slice(),
      explanation: explanation(stopReason),
    };
    emit(
      'P6',
      'finished',
      stopReason === 'verified' ? 'ok' : stopReason === 'error' ? 'deny' : 'warn',
      `停机：${stopReason}`,
      summary.explanation,
      { ...summary, reason: stopReason },
      store.bestCandidateId,
    );
    return summary;
  }

  // ---- P1: baseline ----
  emit(
    'P1',
    'run_started',
    'info',
    '运行开始',
    `任务 intervalkit · 提议者 mock · 最多 ${opts.maxRounds} 轮 · 预算 $${opts.budgetUsd} · 平台期 K=${opts.plateauK}`,
    {
      runId,
      taskId: 'intervalkit',
      taskTitle: 'intervalkit：区间归并工具',
      provider: 'mock',
      options: opts,
      baselineBytes: byteLength(INITIAL_SOURCE),
      archiveRoot: `.selfloop/runs/${runId}/`,
      note: '这是浏览器里的内存模拟；没有启动 Python，也没有写磁盘。',
    },
  );

  const baselineStats = GATE_STATS[0];
  const baselineCandidate = makeCandidate({
    id: 'b0000001',
    round: 0,
    source: INITIAL_SOURCE,
    rationale: '[基线] 未改动的初始实现',
    stats: baselineStats,
    isBaseline: true,
  });
  candidates.push(baselineCandidate);
  const baselineOutcome = scoreOf(baselineStats);
  state.bestScore = baselineOutcome.score;
  state.bestSource = INITIAL_SOURCE;
  state.bestVisible = {
    passed: baselineStats.visible.passed,
    total: baselineStats.visible.total,
    hidden_passed: baselineStats.hidden.passed,
    hidden_total: baselineStats.hidden.total,
    failures: clone(baselineStats.visible.failures),
  };
  state.bestCandidateId = baselineCandidate.id;
  state.bestVerified = baselineCandidate.verified;
  emit(
    'P1',
    'baseline_verify',
    'accent',
    `基线跑分：${baselineOutcome.score.toFixed(4)}`,
    `可见 ${baselineStats.visible.passed}/${baselineStats.visible.total}、隐藏 ${baselineStats.hidden.passed}/${baselineStats.hidden.total}、canary ${baselineStats.canary.passed}/${baselineStats.canary.total}；完整性通过`,
    {
      score: baselineOutcome.score,
      verified: baselineOutcome.verified,
      sourceBytes: byteLength(INITIAL_SOURCE),
      durationMs: baselineStats.durationMs,
      gates: clone(baselineStats),
      note: '基线也走同一条验证路径，不做特殊照顾。',
    },
    baselineCandidate.id,
  );
  archive(baselineCandidate, { bestWritten: true });
  emit(
    'P1',
    'baseline_archive',
    'ok',
    '基线入档：b0000001',
    'best.py 写入初始实现；最优分数 0.4942，后续候选必须严格超过它才会被接受',
    {
      candidateId: baselineCandidate.id,
      accepted: true,
      bestScore: state.bestScore,
      files: archiveSummary(store),
      meta: clone(store.meta),
    },
    baselineCandidate.id,
  );

  // ---- Rounds ----
  for (let round = 1; round <= opts.maxRounds; round += 1) {
    state.round = round;
    emit(
      'P2',
      'round_started',
      'info',
      `第 ${round} 轮开始`,
      `当前最优 ${state.bestScore.toFixed(4)}（${state.bestCandidateId ?? '无'}）；平台期计数 ${state.plateau}`,
      {
        round,
        bestCandidateId: state.bestCandidateId,
        bestScore: round4(state.bestScore),
        plateau: state.plateau,
      },
      state.bestCandidateId,
    );

    const prompt = buildPrompt({
      source: state.bestSource,
      bestScore: state.bestScore,
      visible: state.bestVisible,
      history: store.candidates,
    });
    const tokensIn = estimateTokens(prompt);
    lastPrompt = { round, text: prompt, tokensIn };
    emit(
      'P2',
      'prompt_built',
      'model',
      '提示词已渲染',
      `≈${tokensIn} input tokens；只含任务、最优源码、聚合分数、可见失败与最近 ${Math.min(store.candidates.length, 6)} 轮`,
      {
        round,
        prompt,
        tokensIn,
        historyRounds: Math.min(store.candidates.length, 6),
        visibleFailures: clone(state.bestVisible.failures ?? []),
        note: '隐藏用例与 canary 的详情不进入提示词；模型只能看到聚合数字。',
      },
      state.bestCandidateId,
    );

    const proposal = proposalFor(scenario.id, round);
    const candidateId = `c${String(round).padStart(7, '0')}`;
    const tokensOut = estimateTokens(proposal.source);
    const candidate = makeCandidate({
      id: candidateId,
      round,
      source: proposal.source,
      rationale: proposal.rationale,
      stats: proposal.stats,
    });
    candidate.tokensIn = tokensIn;
    candidate.tokensOut = tokensOut;
    candidate.costUsd = estimateCost(tokensIn, tokensOut);
    candidates.push(candidate);
    emit(
      'P2',
      'proposal',
      'model',
      `候选 ${candidateId}：${proposal.rationale.replace('[模拟提议者] ', '').slice(0, 34)}${proposal.rationale.length > 40 ? '…' : ''}`,
      `产出 ${byteLength(proposal.source)} 字节完整文件；≈${tokensOut} output tokens；成本 $${candidate.costUsd.toFixed(6)}`,
      {
        round,
        candidateId,
        rationale: proposal.rationale,
        source: proposal.source,
        sourceBytes: byteLength(proposal.source),
        tokensIn,
        tokensOut,
        costUsd: candidate.costUsd,
        model: 'mock',
        stage: proposal.stage,
      },
      candidateId,
    );

    emit(
      'P3',
      'verify_start',
      'info',
      '验证器启动',
      '临时目录 + 隔离子进程；先跑可见 unittest，再跑隐藏与 canary 用例',
      {
        round,
        workdir: `/tmp/selfloop-sim-${round}`,
        timeoutSec: SOURCE_DEFAULTS.timeoutSec,
        files: ['intervalkit.py', 'tests/test_visible.py', 'runner.py', 'cases.json'],
        counts: {
          visible: proposal.stats.visible.total,
          hidden: proposal.stats.hidden.total,
          canary: proposal.stats.canary.total,
        },
        testHash: 'sha256:可见测试哈希在跑分前后比较',
        note: 'Python 侧用 subprocess + 30s 超时；页面只复刻判定结果。',
      },
      candidateId,
    );

    const visible = proposal.stats.visible;
    emit(
      'P3',
      'visible_gate',
      visible.passed === visible.total ? 'ok' : 'warn',
      `可见测试：${visible.passed} / ${visible.total}`,
      visible.failures.length
        ? `占 35% 权重；失败：${visible.failures.map((failure) => failure.test).join('、')}`
        : '占 35% 权重；全部通过，但可见全绿不等于 verified',
      {
        passed: visible.passed,
        total: visible.total,
        ratio: visible.total ? visible.passed / visible.total : 0,
        weight: 0.35,
        failures: clone(visible.failures),
      },
      candidateId,
    );

    const hidden = proposal.stats.hidden;
    emit(
      'P3',
      'hidden_gate',
      hidden.passed === hidden.total ? 'ok' : 'warn',
      `隐藏用例：${hidden.passed} / ${hidden.total}`,
      hidden.passed === hidden.total
        ? '占 65% 权重；全部通过；期望值由参考实现现算'
        : `占 65% 权重；还有 ${hidden.total - hidden.passed} 个未过；详情不进入提示词`,
      {
        passed: hidden.passed,
        total: hidden.total,
        ratio: hidden.total ? hidden.passed / hidden.total : 0,
        weight: 0.65,
        failures: clone(hidden.failures),
        note: '隐藏用例的输入与期望只存在于验证器一侧。',
      },
      candidateId,
    );

    const canary = proposal.stats.canary;
    const canaryOk = canary.total > 0 && canary.passed === canary.total;
    emit(
      'P4',
      'canary_gate',
      canaryOk ? 'ok' : 'warn',
      `canary：${canary.passed} / ${canary.total}`,
      canaryOk
        ? '门禁通过；canary 不参与分数，只参与 verified'
        : '门禁失败；分数可能仍然是 1.0，但 verified=false',
      {
        passed: canary.passed,
        total: canary.total,
        ok: canaryOk,
        failures: clone(canary.failures),
        note: '分布不同的退化输入；隐藏集与 canary 同时通过，才说明不是硬编码。',
      },
      candidateId,
    );

    const integrity = proposal.stats.integrity;
    emit(
      'P4',
      'integrity_gate',
      integrity.ok ? 'ok' : 'deny',
      integrity.ok ? '完整性：通过' : '完整性：失败',
      integrity.ok
        ? '没有命中禁用能力，必需函数齐全，测试文件哈希不变'
        : `${integrity.issues.join('；')}；分数直接归零`,
      {
        ok: integrity.ok,
        issues: clone(integrity.issues),
        warnings: clone(integrity.warnings),
        scannedBytes: byteLength(proposal.source),
        requiredFunctions: REQUIRED_FUNCTIONS.slice(),
        note: '硬禁用命中即 0 分；软告警只提示，不直接判失败。',
      },
      candidateId,
    );

    const outcome = scoreOf(proposal.stats);
    emit(
      'P4',
      'score_computed',
      'accent',
      `分数：${outcome.score.toFixed(4)}`,
      integrity.ok
        ? `0.35 × ${visible.passed}/${visible.total} + 0.65 × ${hidden.passed}/${hidden.total} = ${outcome.score.toFixed(4)}`
        : `完整性失败 → 分数归零（加权原始值 ${outcome.weighted.toFixed(4)}）`,
      {
        score: outcome.score,
        visibleRatio: outcome.visibleRatio,
        hiddenRatio: outcome.hiddenRatio,
        weightedVisible: round4(SOURCE_DEFAULTS.visibleWeight * outcome.visibleRatio),
        weightedHidden: round4(SOURCE_DEFAULTS.hiddenWeight * outcome.hiddenRatio),
        weighted: outcome.weighted,
        integrityOk: outcome.integrityOk,
        formula: 'score = 0.35 * visible_ratio + 0.65 * hidden_ratio；integrity 失败则 0',
      },
      candidateId,
    );

    const checks = [
      { label: '完整性通过', ok: outcome.integrityOk, value: outcome.integrityOk ? 'true' : 'false' },
      {
        label: '可见测试全部通过',
        ok: visible.passed === visible.total && visible.total > 0,
        value: `${visible.passed}/${visible.total}`,
      },
      {
        label: '隐藏用例全部通过',
        ok: hidden.passed === hidden.total,
        value: `${hidden.passed}/${hidden.total}`,
      },
      { label: 'canary 全部通过', ok: canaryOk, value: `${canary.passed}/${canary.total}` },
    ];
    emit(
      'P4',
      'verified_check',
      outcome.verified ? 'ok' : 'warn',
      outcome.verified ? 'verified = true' : 'verified = false',
      outcome.verified
        ? '四项检查全部通过；是否停机还要看 stop_on_verified'
        : `未通过：${checks.filter((check) => !check.ok).map((check) => check.label).join('、')}`,
      {
        verified: outcome.verified,
        checks,
        stopOnVerified: opts.stopOnVerified,
        note: 'canary 与完整性是门禁，不出现在分数公式里。',
      },
      candidateId,
    );

    state.tokensIn += candidate.tokensIn;
    state.tokensOut += candidate.tokensOut;
    state.costUsd += candidate.costUsd;
    state.verified = state.verified || candidate.verified;

    const previousBest = state.bestScore;
    const accepted = candidate.score > previousBest + 1e-9;
    const plateauBefore = state.plateau;
    candidate.accepted = accepted;
    if (accepted) {
      state.bestScore = candidate.score;
      state.bestSource = candidate.source;
      state.bestVisible = {
        passed: visible.passed,
        total: visible.total,
        hidden_passed: hidden.passed,
        hidden_total: hidden.total,
        failures: clone(visible.failures),
      };
      state.bestCandidateId = candidate.id;
      state.bestVerified = candidate.verified;
      state.plateau = 0;
    } else {
      const reason =
        candidate.score === round4(previousBest)
          ? `分数 ${candidate.score.toFixed(4)} 与当前最优相同，没有严格提升`
          : `分数 ${candidate.score.toFixed(4)} 没有严格高于当前最优 ${previousBest.toFixed(4)}`;
      candidate.rejectedReason = reason;
      state.plateau += 1;
      rejectedRounds.push(round);
    }
    emit(
      'P5',
      'accept_decision',
      accepted ? 'ok' : 'deny',
      accepted ? `接受候选 ${candidateId}` : `拒绝候选 ${candidateId}`,
      accepted
        ? `分数 ${previousBest.toFixed(4)} → ${candidate.score.toFixed(4)}；平台期归零`
        : `${candidate.rejectedReason}；平台期 ${plateauBefore} → ${state.plateau}，只入档不改 best.py`,
      {
        accepted,
        candidateId,
        previousBest: round4(previousBest),
        score: candidate.score,
        newBest: round4(state.bestScore),
        delta: round4(candidate.score - previousBest),
        plateauBefore,
        plateauAfter: state.plateau,
        reason: candidate.rejectedReason,
        note: '只有 score 严格大于 best_score + 1e-9 才接受。',
      },
      candidateId,
    );

    archive(candidate, { bestWritten: accepted });
    emit(
      'P5',
      'archive_write',
      'ok',
      '候选入档',
      accepted
        ? `snapshots/${candidateId}.py 写入；best.py 已更新；meta.json 记录最优分数 ${state.bestScore.toFixed(4)}`
        : `snapshots/${candidateId}.py 写入；best.py 保持不变；失败候选保留为负样本`,
      {
        candidateId,
        bestWritten: accepted,
        files: archiveSummary(store),
        meta: clone(store.meta),
        note: 'candidates.jsonl 一行一个候选，events.jsonl 记录事件流；页面里都是内存对象。',
      },
      candidateId,
    );

    updateMeta();

    const stop = stopChecks();
    emit(
      'P6',
      'stop_check',
      stop.stop ? 'warn' : 'info',
      stop.stop ? `停机条件命中：${stop.stop}` : '本轮结束，继续',
      stop.stop
        ? explanation(stop.stop)
        : `verified=${state.verified} · 成本 $${round6(state.costUsd).toFixed(6)} / $${opts.budgetUsd.toFixed(6)} · 平台期 ${state.plateau}/${opts.plateauK}`,
      { checks: stop.checks, stop: stop.stop, round },
      candidateId,
    );
    if (stop.stop) return finalize(finish(stop.stop));
  }

  return finalize(finish('max_rounds'));

  function finalize(summary) {
    return {
      scenario: {
        id: scenario.id,
        title: scenario.title,
        task: scenario.task,
        description: scenario.description,
        expectedStop: scenario.expectedStop,
      },
      options: opts,
      events,
      candidates,
      prompt: lastPrompt,
      archive: {
        runId,
        meta: clone(store.meta),
        candidatesJsonl: store.candidates.length
          ? `${store.candidates.map((row) => JSON.stringify(row)).join('\n')}\n`
          : '',
        eventsJsonl: store.events.length
          ? `${store.events.map((row) => JSON.stringify(row)).join('\n')}\n`
          : '',
        bestSource: store.bestSource,
        snapshots: clone(store.snapshots),
        files: archiveFiles(store),
      },
      summary,
    };
  }
}
