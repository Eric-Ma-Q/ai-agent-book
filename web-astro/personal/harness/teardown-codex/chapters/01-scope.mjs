import { section, ev, table, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const scope = {
  no: '01',
  slug: '01-scope',
  nav: '取证边界',
  kicker: '先划清能证明什么',
  title: '取证边界：官方仓库让哪些判断变硬，让哪些判断变软',
  lead:
    'Codex 不是泄露材料，而是官方 Apache-2.0 仓库。好处是客户端、协议和运行时能逐行复核；代价是桌面 App、云端服务与模型服务不在仓库里，很多「线上怎样」的问题只能标不可验证。这一章先把边界画出来，后面九章才不会越界。',
  oneLine: '开源仓库能证明什么、不能证明什么，以及为什么「不在仓库」不等于「源码状态已确认」。',
  tldr: [
    '能读到的是本地运行时与协议：CLI、TUI、exec、app-server、沙箱、工具、记忆、多 Agent。',
    '读不到的是桌面 App、Codex Web / Cloud、模型服务与 IDE 扩展的内部实现；它们只能标 D 级。',
    '「不在本仓库」不等于「源码状态已确认」或「没有」，更不等于「线上默认开启」；证据等级必须跟着材料走。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>这份公开仓库，究竟能支撑哪些产品判断？</div>
${judgment(
  'implementation',
  '材料从「泄露副本」换成「官方仓库」，证据更硬，但覆盖面更窄：本地运行时与协议可证，服务端与 App 不可证。',
  'C01',
)}

${section('01', '三种入口，不是三种实现', `
  <p>README 把 Codex CLI、桌面 App、Codex Web 并列成三种入口。这个并列很容易被读成「同一套实现有三种壳」，但仓库实际只覆盖第一种：CLI 在本机跑，App 与 Web 是另外的入口。</p>
  ${ev(
    'README.md',
    '1-8',
    `<p><strong>Codex CLI</strong> is a coding agent from OpenAI that runs locally on your computer.</p>
...
If you want the desktop app experience, run <code>codex app</code> or visit the Codex App page.
If you are looking for the cloud-based agent from OpenAI, Codex Web, go to chatgpt.com/codex.</p>`,
    link('README.md', 1, 8),
    '三种入口并列；仓库只覆盖 CLI',
  )}
  <p>所以「Codex 怎么工作」这个问题必须先限定对象：本专题讲的是仓库里的 CLI / 运行时 / app-server，不把 App 与 Web 的行为算进来。</p>
`)}

${section('02', '仓库里真正能读到的四层', `
  <p>把仓库按职责切开，能看到四层不同的东西：本地运行时、交互表面、协议层、平台能力。它们不是同一个「产品壳」的四种写法。</p>
  ${table(
    ['层', '代表目录', '能回答的问题'],
    [
      ['运行时', '<code>codex-rs/core</code>', '一轮怎么跑、工具怎么执行、上下文怎么压缩、权限怎么裁'],
      ['表面', '<code>codex-rs/tui</code>、<code>exec</code>、<code>cli</code>', '用户从哪个入口进来、事件怎么显示'],
      ['协议', '<code>app-server</code>、<code>app-server-protocol</code>', '多端如何共享 thread / turn / item'],
      ['平台能力', '<code>sandboxing</code>、<code>network-proxy</code>、<code>memories</code>', '跨平台隔离、网络策略、记忆管线'],
    ],
  )}
  <p>这四层都能在固定 SHA 里指到文件，因此可以写 A 级证据；但它们仍然只说明「代码这样组织」，不说明「某个账号一定开启」。</p>
`)}

${section('03', '仓库外：只能看到客户端行为', `
  <p>桌面 App 在仓库里只留下安装器与下载地址；Codex Web / Cloud 只有客户端；IDE 扩展只有外链；模型服务只有 API 客户端。对这些部分，页面只能写「客户端怎么调用」，不能写「服务端怎么实现」。</p>
  ${ev(
    'codex-rs/cli/src/desktop_app/mac.rs',
    '10-12',
    `const CODEX_DMG_URL_ARM64: &str = "https://persistent.oaistatic.com/codex-app-prod/Codex.dmg";
const CODEX_DMG_URL_X64: &str =
    "https://persistent.oaistatic.com/codex-app-prod/Codex-latest-x64.dmg";`,
    link('codex-rs/cli/src/desktop_app/mac.rs', 10, 12),
    '仓库只负责下载 / 安装 App，不含 App 源码',
  )}
  ${ev(
    'codex-rs/cloud-client/README.md',
    '1-5',
    `# Codex cloud client
Reusable Rust client for native ThreadService gRPC over HTTP/2, with no TUI,
conventional app-server or private monorepo dependency. This slice supports
\`Resume\` and live \`Attach\`.`,
    link('codex-rs/cloud-client/README.md', 1, 5),
    '只有客户端 crate；服务端不在仓库',
  )}
`)}

${section('04', '取舍：更硬的证据，换更窄的覆盖面', `
  <p>官方仓库让「代码怎么组织」变得可复核，也让「线上怎么表现」更难回答。页面如果为了完整而补服务端细节，就会把 A 级材料写成 D 级猜测；反过来，如果只写仓库里有什么，又会变成代码导读。折中办法是每章都先限定问题，再给判断。</p>
  <div data-tradeoff>${tradeoff(
    '每条关键判断都能回到固定 SHA 的 <code>path:line</code>，读者可以自己复核。',
    '桌面 App、Cloud、模型服务的内部行为无法验证；跨产品差异只能比较两边都有材料的部分。',
  )}</div>
`)}
`,
  sources: [
    { label: 'README.md:1-8', url: link('README.md', 1, 8), note: '三种入口' },
    { label: 'LICENSE:1-2', url: link('LICENSE', 1, 2), note: 'Apache-2.0' },
    { label: 'desktop_app/mac.rs:10-12', url: link('codex-rs/cli/src/desktop_app/mac.rs', 10, 12), note: 'App 安装器' },
    { label: 'cloud-client/README.md:1-5', url: link('codex-rs/cloud-client/README.md', 1, 5), note: '仅客户端' },
  ],
};
