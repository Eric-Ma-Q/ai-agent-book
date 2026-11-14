import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const permission = {
  no: '06',
  slug: '06-permission',
  nav: '权限与沙箱',
  kicker: '权限是一套组合，不是一个弹窗',
  title: '权限与安全：approval、sandbox、execpolicy、network 的组合',
  lead:
    '「能不能跑这条命令」不是一个 yes/no。Codex 把它拆成四层：approval 决定谁批、sandbox 决定能碰什么、execpolicy 决定规则、network proxy 决定能连哪。再往上还有 Guardian 自动审查与「不可信上下文」处理。产品判断是：权限要可组合、可审计，而不是把风险都推给一个确认弹窗。',
  oneLine: '四种 approval、四种 sandbox policy、五种后端、规则与网络代理如何叠加。',
  tldr: [
    'approval 有 untrusted / on-request / granular / never 四种；granular 还能细分 sandbox、rules、skill、permissions、MCP。',
    'sandbox policy 有 danger-full-access / read-only / external-sandbox / workspace-write；后端按平台选 Seatbelt、Seccomp、Windows 受限令牌或 MXC。',
    'execpolicy 给出 allow / prompt / prompt-user / forbidden；网络另有本地代理；Guardian 只有显式选 auto_review 才接管。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>怎样让 Agent 能干活，又不越过文件、命令与网络边界？</div>
${judgment(
  'implementation',
  'Codex 把权限拆成 approval、sandbox、execpolicy、network 与 reviewer 五个可组合面；任何一层都不能单独代表「安全」。',
  'C10-C13',
)}

${section('01', 'approval：谁来决定', `
  <p>approval 不是「开 / 关」，而是四种策略。默认是 on-request，让模型在需要时请求；granular 把请求再拆成 sandbox 升级、规则、skill、request_permissions、MCP elicitation 五类，可以逐类允许或自动拒绝。</p>
  ${table(
    ['模式', '行为', '产品含义'],
    [
      ['untrusted', '除非规则显式允许，否则要批', '项目未受信；公开配置已不再支持该值'],
      ['on-request', '模型决定何时请求', '默认策略'],
      ['granular', '按类别细控', '适合托管 / 企业策略'],
      ['never', '从不询问，失败直接回模型', '无人值守；风险最高'],
    ],
  )}
  ${ev(
    'codex-rs/protocol/src/protocol.rs',
    '1184-1189',
    `#[strum(serialize = "granular")]
Granular(GranularApprovalConfig),

/// Never ask the user to approve commands. Failures are immediately returned
/// to the model, and never escalated to the user for approval.
Never,`,
    link('codex-rs/protocol/src/protocol.rs', 1184, 1189),
    'granular 与 never 的语义',
  )}
`)}

${section('02', 'sandbox policy：能碰什么', `
  <p>approval 决定「要不要问」，sandbox policy 决定「问了之后能做什么」。四种 policy 从完全放开到只读，再到只写 workspace；workspace-write 还会把 <code>.git</code>、<code>.codex</code> 等可提权的路径列为只读子路径。</p>
  ${ev(
    'codex-rs/protocol/src/protocol.rs',
    '1254-1266',
    `pub enum SandboxPolicy {
    /// No restrictions whatsoever. Use with caution.
    #[serde(rename = "danger-full-access")]
    DangerFullAccess,

    /// Read-only access configuration.
    #[serde(rename = "read-only")]
    ReadOnly {
        /// When set to \`true\`, outbound network access is allowed. \`false\` by
        /// default.
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        network_access: bool,
    },`,
    link('codex-rs/protocol/src/protocol.rs', 1254, 1266),
    'policy 从无限制到只读',
  )}
  <p>同一份 <code>WritableRoot</code> 还带 <code>read_only_subpaths</code> 与 <code>protected_metadata_names</code>，用来防止 Agent 通过改 <code>.git/hooks</code> 或配置文件给自己提权。</p>
`)}

${section('03', '后端：同一 policy，不同 OS 实现', `
  <p>policy 是产品语言，后端是平台实现。macOS 用 Seatbelt，Linux 用 Seccomp / Landlock / bwrap 组合，Windows 用受限令牌或 MXC。没有对应后端时可能退化为 <code>None</code>，所以「有 sandbox policy」不等于「一定在沙箱里跑」。</p>
  ${ev(
    'codex-rs/sandboxing/src/manager.rs',
    '49-62',
    `if cfg!(target_os = "macos") {
    Some(SandboxType::MacosSeatbelt)
} else if cfg!(target_os = "linux") {
    Some(SandboxType::LinuxSeccomp)
} else if cfg!(target_os = "windows") {
    if windows_sandbox_enabled {
        Some(SandboxType::WindowsRestrictedToken)
    } else {
        None
    }
} else {
    None
}`,
    link('codex-rs/sandboxing/src/manager.rs', 49, 62),
    '平台到后端的映射',
  )}
  ${ev(
    'codex-rs/protocol/src/sandbox.rs',
    '29-35',
    `pub enum SandboxType {
    None,
    MacosSeatbelt,
    LinuxSeccomp,
    WindowsRestrictedToken,
    WindowsMxc,
}`,
    link('codex-rs/protocol/src/sandbox.rs', 29, 35),
    '五种 type，含 None',
  )}
`)}

${section('04', 'execpolicy：规则先于弹窗', `
  <p>规则文件把「哪些命令前缀可以跑」写成 allow / prompt / prompt-user / forbidden。它解决的是重复审批：同一类命令被允许后，不必每次再问；但 <code>prompt-user</code> 仍要求一次全新的人类决定，不能被自动审查或缓存替代。</p>
  ${ev(
    'codex-rs/execpolicy/src/decision.rs',
    '9-21',
    `pub enum Decision {
    /// Command may run without further approval.
    Allow,
    /// Request approval from the configured reviewer; rejected with \`approval_policy="never"\`.
    Prompt,
    /// Requires a fresh human decision, independent of the configured reviewer.
    #[serde(rename = "prompt-user")]
    PromptUser,
    /// Command is blocked without further consideration.
    Forbidden,
}`,
    link('codex-rs/execpolicy/src/decision.rs', 9, 21),
    '规则四种决策',
  )}
`)}

${section('05', 'network：本地代理也是一层权限', `
  <p>网络访问不是「sandbox 开了就随便连」。Codex 有本地 HTTP / SOCKS5 代理，按 allow / deny 名单与 limited 模式工作；默认监听 127.0.0.1:3128 与 127.0.0.1:8081。</p>
  ${ev(
    'codex-rs/network-proxy/README.md',
    '1-10',
    "# codex-network-proxy\n\n`codex-network-proxy` is Codex's local network policy enforcement proxy. It runs:\n\n- an HTTP proxy (default `127.0.0.1:3128`)\n- a SOCKS5 proxy (default `127.0.0.1:8081`, enabled by default)\n\nOn Windows, managed HTTP listeners prefer ports `3128-3159`, and SOCKS5 listeners prefer ports\n`8081-8112`. An explicitly configured port is attempted first. If every preferred port is occupied,\nthe proxy preserves its existing ephemeral loopback fallback.",
    link('codex-rs/network-proxy/README.md', 1, 10),
    '代理与默认端口',
  )}
`)}

${section('06', 'Guardian：自动审查是 opt-in', `
  <p>Guardian 不是默认接管所有审批。路由函数要求 policy 是 on-request 或 granular，并且 reviewer 是 <code>AutoReview</code>；reviewer 默认是 <code>user</code>。所以「代码里有 Guardian」不等于「线上默认自动审查」。</p>
  ${ev(
    'codex-rs/ext/guardian-reviewer/src/routing.rs',
    '59-67',
    `pub fn routes_approval_policy_to_guardian(
    policy: AskForApproval,
    reviewer: ApprovalsReviewer,
) -> bool {
    matches!(
        policy,
        AskForApproval::OnRequest | AskForApproval::Granular(_)
    ) && reviewer == ApprovalsReviewer::AutoReview
}`,
    link('codex-rs/ext/guardian-reviewer/src/routing.rs', 59, 67),
    '只有 auto_review 才路由',
  )}
  ${note(
    'info',
    'Guardian 的 feature 默认开启，但 reviewer 默认 <code>user</code>；这两个默认值不矛盾，一个是能力，一个是路由选择。',
  )}
`)}

${section('07', '不可信上下文：goal 只当数据', `
  <p>用户目标也会进模型上下文，但 Codex 把它当不可信数据：超过 700 bytes 的目标整体省略，防止截断把「限制」变成「授权」；文本用 JSON 引号包起来，并放在内部上下文标记里。</p>
  ${ev(
    'codex-rs/core/src/context/user_goal.rs',
    '96-104',
    "                if let Some(objective) = objective {\n                    // Preserve the objective as data, including quotes and wrapper-like text.\n                    let objective = serde_json::json!(objective).to_string();\n                    // Even one token per byte leaves room for the wrapper and status below 1K.\n                    if objective.len() <= MAX_OBJECTIVE_BYTES {\n                        text.push_str(&format!(\"User set the goal: {objective}\"));\n                    } else {\n                        text.push_str(\n                            \"User set the goal: [objective omitted; exceeds the evidence limit].\",",
    link('codex-rs/core/src/context/user_goal.rs', 96, 104),
    '超限整体省略，不做半截截断',
  )}
`)}

${section('08', '取舍：可组合，但配置与平台差异大', `
  <p>五层组合能让企业做细粒度策略，也能让个人用户按项目放宽；代价是同一句「允许」在不同平台、不同 approval、不同 network 配置下含义不同。产品文档必须把「谁批、能碰什么、能连哪」分开写。</p>
  <div data-tradeoff>${tradeoff(
    '权限可审计、可逐类收紧；规则能减少重复审批；网络与文件边界分开治理。',
    '组合多、默认值多；平台后端不一致；用户很难从一句「已允许」推断实际边界。',
  )}</div>
`)}
`,
  sources: [
    { label: 'protocol.rs:1184-1189', url: link('codex-rs/protocol/src/protocol.rs', 1184, 1189) },
    { label: 'protocol.rs:1254-1266', url: link('codex-rs/protocol/src/protocol.rs', 1254, 1266) },
    { label: 'sandboxing/manager.rs:49-62', url: link('codex-rs/sandboxing/src/manager.rs', 49, 62) },
    { label: 'protocol/sandbox.rs:29-35', url: link('codex-rs/protocol/src/sandbox.rs', 29, 35) },
    { label: 'execpolicy/decision.rs:9-21', url: link('codex-rs/execpolicy/src/decision.rs', 9, 21) },
    { label: 'network-proxy/README.md:1-10', url: link('codex-rs/network-proxy/README.md', 1, 10) },
    { label: 'guardian-reviewer/routing.rs:59-67', url: link('codex-rs/ext/guardian-reviewer/src/routing.rs', 59, 67) },
    { label: 'context/user_goal.rs:96-104', url: link('codex-rs/core/src/context/user_goal.rs', 96, 104) },
  ],
};
