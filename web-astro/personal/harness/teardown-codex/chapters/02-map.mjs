import { section, ev, table, note, tradeoff, judgment, statStrip } from '../ui.mjs';
import { link } from '../data.mjs';

export const map = {
  no: '02',
  slug: '02-map',
  nav: '产品地图',
  kicker: '运行时与表面分开',
  title: '产品地图：CLI 只是其中一个客户端',
  lead:
    '第一次读 Codex 仓库，最容易把 CLI 当成全部。实际上 CLI 只是入口之一：TUI 与 exec 在进程内使用 app-server 客户端，桌面与移动通过 daemon 连远程 app-server，TypeScript SDK 又走 CLI 的 JSONL。理解「运行时 / 协议 / 表面」三层，后面的循环、工具与权限才有位置。',
  oneLine: 'TUI、exec、桌面、移动与 SDK 为什么能共用一套运行时。',
  tldr: [
    'CLI 是入口，不是运行时；运行时在 <code>codex-rs/core</code>，协议层在 <code>app-server</code>。',
    'TUI 与 exec 用 in-process app-server 客户端；桌面 / 移动通过 daemon；TS SDK 走 CLI JSONL。',
    '这套分层的收益是多端复用，代价是协议兼容、实验面与生命周期复杂度。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>一个本地 CLI，为什么会长出 app-server、daemon 和 SDK 这么多入口？</div>
${judgment(
  'implementation',
  'Codex 把「运行时」与「表面」拆开：core 负责 agent，app-server 负责协议，TUI / exec / App / SDK 只消费协议。',
  'C21',
)}

${section('01', '一张图：谁在跑，谁在连', `
  <p>把入口按「是否拥有运行时」分开，关系会清楚很多：TUI 与 exec 是进程内的 app-server 客户端；桌面 / 移动通过 daemon 连远程 app-server；TypeScript SDK 则拉起 CLI，交换 JSONL 事件。</p>
  ${table(
    ['入口', '运行时在哪', '连接方式', '证据'],
    [
      ['TUI', '本进程', 'in-process app-server client', '<code>app-server-client/README.md:3-11</code>'],
      ['exec', '本进程', 'in-process app-server client', '同上'],
      ['桌面 / 移动', '本机或远端', 'app-server daemon + remote control', '<code>app-server-daemon/README.md:6-9</code>'],
      ['TypeScript SDK', '子进程 CLI', 'stdin / stdout JSONL', '<code>sdk/typescript/README.md:5</code>'],
      ['Python SDK', '子进程 / app-server', '协议封装', '<code>sdk/python/tests/test_app_server_run.py:138</code>'],
    ],
  )}
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
    'TUI / exec 不直接跑 core，而是走 app-server 客户端',
  )}
`)}

${section('02', 'CLI 的命令面：入口很多，职责不同', `
  <p>CLI 同时承担交互入口、非交互执行、会话管理、App 安装器和协议服务。把它们混成一个「大命令」，就会误以为所有能力都在同一个进程里。</p>
  ${ev(
    'codex-rs/cli/src/main.rs',
    '171-179',
    `    /// [experimental] Run the app server or related tooling.
    AppServer(AppServerCommand),

    /// [experimental] Manage the app-server daemon with remote control enabled.
    RemoteControl(RemoteControlCommand),

    /// Launch the Desktop app (opens the app installer if missing).
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    App(app_cmd::AppCommand),`,
    link('codex-rs/cli/src/main.rs', 171, 179),
    'app-server、remote-control、App 安装器是并列子命令',
  )}
  <p>注意 <code>App</code> 只负责安装 / 打开桌面 App；它不把 App 的内部实现带进仓库。这也是第 01 章边界的具体体现。</p>
`)}

${section('03', '代码地图：先看职责，不看目录数量', `
  <p>仓库很大，但产品相关的职责可以压成六块。数字只用来判断体量，不用来证明重要性。</p>
  ${statStrip([
    ['5,927', 'codex-rs Rust 文件', '逐文件遍历'],
    ['2,314,917', 'codex-rs Rust 行', 'splitlines 累加'],
    ['651 / 276,232', 'core 文件 / 行', '运行时主体'],
  ])}
  ${table(
    ['目录', '职责', '读它的理由'],
    [
      ['<code>core</code>', 'session、turn、工具、上下文、权限、review', '产品行为的主战场'],
      ['<code>app-server</code>', 'JSON-RPC、thread / turn、客户端生命周期', '多端复用的协议层'],
      ['<code>sandboxing</code>', 'Seatbelt / Landlock / Windows 后端', '权限不只靠弹窗'],
      ['<code>network-proxy</code>', 'HTTP / SOCKS5 策略代理', '网络访问也是权限面'],
      ['<code>memories</code>', '两阶段记忆管线', '会话外上下文'],
      ['<code>cloud-*</code>', 'Cloud 客户端', '只能看客户端，服务端不可验证'],
    ],
  )}
  ${ev(
    'codex-rs/Cargo.toml',
    '1-2',
    `[workspace]
members = [`,
    link('codex-rs/Cargo.toml', 1, 2),
    '168 个 workspace 条目（含测试支持目录）',
  )}
`)}

${section('04', '取舍：复用协议，还是让每个表面各跑一套', `
  <p>让 TUI、exec、桌面、移动、SDK 共用 app-server，能把「会话、工具、权限、压缩」集中在一处；代价是协议要背兼容债，实验能力要通过 capability 协商，daemon 还要处理重启、升级与远程控制。</p>
  <div data-tradeoff>${tradeoff(
    '多端共享同一套 thread / turn / item 语义，运行时只维护一份。',
    '协议层要持续兼容；experimental 方法多，客户端要做能力协商；daemon 生命周期成为新的故障面。',
  )}</div>
  ${note(
    'info',
    '不要把「有 app-server」写成「所有端都走同一个进程」。TUI / exec 是 in-process 客户端，桌面 / 移动才通过 daemon；TS SDK 又是 CLI JSONL。',
  )}
`)}
`,
  sources: [
    { label: 'app-server-client/README.md:3-11', url: link('codex-rs/app-server-client/README.md', 3, 11) },
    { label: 'app-server-daemon/README.md:6-9', url: link('codex-rs/app-server-daemon/README.md', 6, 9) },
    { label: 'cli/src/main.rs:171-179', url: link('codex-rs/cli/src/main.rs', 171, 179) },
    { label: 'sdk/typescript/README.md:5', url: link('sdk/typescript/README.md', 5, 5) },
    { label: 'Cargo.toml:1-2', url: link('codex-rs/Cargo.toml', 1, 2) },
  ],
};
