import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const surface = {
  no: '08',
  slug: '08-surface',
  nav: '产品表面',
  kicker: '协议层为什么值得单独存在',
  title: '产品表面：thread / turn / item 比 UI 更长寿',
  lead:
    '如果只有 CLI，UI 与运行时可以糊在一起。但 Codex 还要服务 TUI、exec、桌面、移动与 SDK，于是把会话抽象成 thread / turn / item，用 JSON-RPC 暴露成 app-server。协议层让多端共享运行时，也把「兼容」变成长期成本。',
  oneLine: '186 个请求、thread / turn 模型、daemon 与 in-process 客户端的分工。',
  tldr: [
    'app-server 协议有 186 个请求方法，其中 74 个是 variant 级 experimental；实验面很大。',
    'TUI / exec 用 in-process 客户端；桌面 / 移动通过 daemon；TS SDK 走 CLI JSONL，Python SDK 走 app-server。',
    '协议把多端复用变成现实，也把「方法稳定性、能力协商、daemon 生命周期」变成新产品面。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>为什么不能让每个表面直接调 core，而要单独维护一个 app-server？</div>
${judgment(
  'new-surface',
  '在本副本里，app-server 是 TUI、exec、桌面、移动与 SDK 的共同协议层；这是 039 材料里没有展开的新增面，但不代表其他产品没有类似层。',
  'C21',
)}

${section('01', '协议面：186 个请求，74 个 experimental', `
  <p>协议定义不是几个枚举，而是一整张请求表。静态计数得到 186 个请求方法，其中 74 个带 variant 级 experimental 标记。这个比例说明：它既要支撑稳定客户端，也承载大量仍在演进的会话能力。</p>
  ${ev(
    'codex-rs/app-server-protocol/src/protocol/common.rs',
    '522-530',
    `client_request_definitions! {
    Initialize => "initialize" {
        params: v1::InitializeParams,
        serialization: None,
        response: v1::InitializeResponse,
    },

    #[experimental("server/diagnostics")]
    /// Read content-free, process-local diagnostics.`,
    link('codex-rs/app-server-protocol/src/protocol/common.rs', 522, 530),
    '请求表从一个宏开始',
  )}
  <p>方法多不是优点本身；它意味着客户端必须做能力协商，文档也要区分稳定与实验。</p>
`)}

${section('02', 'thread / turn：会话不是一条日志', `
  <p>协议把会话拆成 thread、turn、item。turn 有明确的完成 / 中断 / 失败 / 进行中状态；客户端可以订阅事件，也可以按 thread 历史回读。这样 UI 不必理解 core 的内部状态，只需要消费协议对象。</p>
  ${ev(
    'codex-rs/app-server-protocol/src/protocol/v2/turn.rs',
    '34-41',
    `pub enum TurnStatus {
    Completed,
    Interrupted,
    Failed,
    InProgress,
}`,
    link('codex-rs/app-server-protocol/src/protocol/v2/turn.rs', 34, 41),
    'turn 的四种状态',
  )}
  ${table(
    ['对象', '回答什么', '客户端怎么用'],
    [
      ['thread', '一段可持续的会话', '列表、恢复、归档、分裂'],
      ['turn', '一次用户输入触发的执行', '订阅事件、取消、读 usage'],
      ['item', '消息 / 工具调用 / 文件变更', '渲染时间线、定位审批'],
    ],
  )}
`)}

${section('03', '连接方式：in-process、daemon、SDK 不是同一条路', `
  <p>TUI 与 exec 用 in-process app-server 客户端，省掉进程边界；桌面 / 移动通过 daemon 连远程 app-server；TypeScript SDK 拉起 CLI 交换 JSONL，Python SDK 则直接跑 app-server。把它们都说成「走同一个协议」会掩盖传输差异。</p>
  ${ev(
    'codex-rs/app-server-client/README.md',
    '3-11',
    `Shared in-process app-server client used by conversational CLI surfaces:

- \`codex-exec\`
- \`codex-tui\`

## Purpose

This crate centralizes startup and lifecycle management for an in-process
\`codex-app-server\` runtime, so CLI clients do not need to duplicate:`,
    link('codex-rs/app-server-client/README.md', 3, 11),
    'TUI / exec 是 in-process 客户端',
  )}
  ${ev(
    'codex-rs/app-server-daemon/README.md',
    '1-9',
    `# codex-app-server-daemon

> \`codex-app-server-daemon\` is experimental and its lifecycle contract may
> change while the remote-management flow is still being developed.

\`codex-app-server-daemon\` backs the machine-readable \`codex app-server\`
lifecycle commands used by remote clients such as the desktop and mobile apps.
It is intended for Codex instances launched over SSH, including fresh developer
machines that should expose app-server with \`remote_control\` enabled.`,
    link('codex-rs/app-server-daemon/README.md', 1, 9),
    '桌面 / 移动通过 daemon',
  )}
`)}

${section('04', '取舍：协议复用，还是表面各自为政', `
  <p>协议层让多端共享 thread / turn / item，也让「会话恢复、审批、usage、文件变更」有一套共同语义；代价是协议要长期兼容，experimental 方法要协商，daemon 还要处理升级、重启与远程控制。</p>
  <div data-tradeoff>${tradeoff(
    '多端共享运行时与事件模型；新增表面不必重写 core 集成。',
    '协议兼容成本高；实验方法多；daemon 生命周期成为新的故障面。',
  )}</div>
  ${note(
    'info',
    '不要把「有 app-server」写成「所有端都走远程进程」。in-process、daemon、CLI JSONL、SDK 封装是四种不同传输。',
  )}
`)}
`,
  sources: [
    { label: 'app-server-protocol/common.rs:522-530', url: link('codex-rs/app-server-protocol/src/protocol/common.rs', 522, 530) },
    { label: 'app-server-protocol/v2/turn.rs:34-41', url: link('codex-rs/app-server-protocol/src/protocol/v2/turn.rs', 34, 41) },
    { label: 'app-server-client/README.md:3-11', url: link('codex-rs/app-server-client/README.md', 3, 11) },
    { label: 'app-server-daemon/README.md:1-9', url: link('codex-rs/app-server-daemon/README.md', 1, 9) },
    { label: 'sdk/typescript/README.md:5', url: link('sdk/typescript/README.md', 5, 5) },
  ],
};
