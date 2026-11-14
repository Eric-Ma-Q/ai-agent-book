// Fixed evidence anchor for the Codex teardown. Every page link must use this SHA.
export const SHA = '8703d32bd0ea5cf26768859a3dd476df906ba053';
export const RETRIEVED = '2026-11-09';
export const COMMIT_AT = '2026-11-09T03:58:05Z';

/** GitHub permalink to a file and optional line range. */
export const link = (path, start, end) =>
  `https://github.com/openai/codex/blob/${SHA}/${path}#L${start}${end ? `-L${end}` : ''}`;

export const STATS = [
  ['10,168', '文件', 'os.walk 排除 .git'],
  ['5,927', 'Rust 文件', 'codex-rs'],
  ['2,314,917', 'Rust 行', '逐文件 splitlines 累加'],
  ['651 / 276,232', 'core 文件 / 行', 'codex-rs/core/src'],
  ['168', 'workspace 条目', '含测试支持目录'],
  ['186 / 74', 'RPC / experimental', 'client_request_definitions!'],
];

export const READING_PATHS = [
  {
    title: '产品经理',
    body: '先读 01、02、03、06、09、10。抓住「运行时与表面分开」「权限是组合」「哪些差异只是实现不同」。',
  },
  {
    title: '工程师',
    body: '先读 02、03、04、05、08。循环、工具暴露、上下文预算、协议层，决定 Agent 能不能跑长任务。',
  },
  {
    title: '安全 / 合规',
    body: '先读 01、06、07、09。看 approval、sandbox、execpolicy、网络代理与不可验证边界。',
  },
];

/**
 * Difference ledger. `kind` is one of:
 * shared | implementation | new-surface | unverifiable.
 * The wording never claims industry-first; it only describes this SHA.
 */
export const DIFFERENCES = [
  {
    id: 'C04-C05',
    question: 'Agent 怎么跑起来',
    codex: 'Rust `SessionTask` + `run_turn` + sampling / tool loop',
    cc: 'TypeScript async generator `queryLoop`',
    kind: 'shared',
    note: '共有机制，结构不同',
  },
  {
    id: 'C06',
    question: '用户中途插话怎么办',
    codex: 'input queue + steering 优先',
    cc: '中断与继续由生成器和状态机处理',
    kind: 'implementation',
    note: '实现差异',
  },
  {
    id: 'C07-C08',
    question: '工具直接给模型，还是让模型写代码',
    codex: 'direct / deferred / code mode / hidden 四象限',
    cc: '工具池、并发安全标记、工具搜索',
    kind: 'implementation',
    note: '问题相同；暴露矩阵与 code mode 在本副本更显式',
  },
  {
    id: 'C09',
    question: '长命令怎么跑',
    codex: 'unified exec：PTY、可复用进程、`write_stdin`',
    cc: 'Bash 工具与后台任务',
    kind: 'implementation',
    note: '共有问题；Codex 把 PTY 会话做成一等工具',
  },
  {
    id: 'C15',
    question: '上下文怎么压缩',
    codex: '90% 派生上限 + 65% 条件异步预跑 + 20k 摘要',
    cc: '多段压缩流水线与 autocompact 公式',
    kind: 'implementation',
    note: '共有问题；异步预跑是明显实现差异',
  },
  {
    id: 'C10-C13',
    question: '权限怎么裁',
    codex: '4 approval + 4 sandbox policy + 5 sandbox type + execpolicy + network proxy',
    cc: '多模式权限裁决、分类器、沙箱边界',
    kind: 'implementation',
    note: '共有问题；跨平台沙箱与网络代理更外显',
  },
  {
    id: 'C17-C18',
    question: '子 Agent 怎么管',
    codex: 'role + spawn / wait / send / close / resume + V1 6 / V2 4（含 root）',
    cc: '子 Agent、任务、swarm 后端',
    kind: 'implementation',
    note: '共有问题；message board 与 role 是本副本新增协调面',
  },
  {
    id: 'C14',
    question: '项目指令放哪',
    codex: '发现向上找根，最终按 user → thread → 根→cwd 拼接',
    cc: '`CLAUDE.md` 类项目指令',
    kind: 'shared',
    note: '共有问题，文件名与发现规则不同',
  },
  {
    id: 'C16',
    question: '记忆放哪',
    codex: '会话外两阶段管线：rollout 抽取 + 全局合并；默认关闭',
    cc: '会话内多层记忆',
    kind: 'implementation',
    note: '实现差异；不能断言谁更好',
  },
  {
    id: 'C21',
    question: '多端怎么复用',
    codex: 'app-server JSON-RPC 作为共同协议；daemon 服务桌面/移动',
    cc: '039 副本未见对应协议层',
    kind: 'new-surface',
    note: '本副本可证的新增面；不写无法证伪的最高级判断',
  },
  {
    id: 'C01-C22',
    question: '仓库边界',
    codex: 'CLI / 协议 / 沙箱在本仓库；App / Cloud / 模型不在',
    cc: '039 是泄露源码，不能按官方仓库复核',
    kind: 'unverifiable',
    note: '不可验证：材料性质不同',
  },
];
