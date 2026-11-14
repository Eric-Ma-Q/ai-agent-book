import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const agents = {
  no: '07',
  slug: '07-agents',
  nav: '多 Agent',
  kicker: 'spawn 不是难点，协调才是',
  title: '多 Agent：角色、并发上限、消息板与受限 review',
  lead:
    '多 Agent 最容易写成「模型可以再叫一个模型」。真正难的是：子 Agent 用什么角色、最多开几个、怎么等、怎么传消息、什么时候回收。Codex 把这些问题拆成 role、spawn / wait / send / close / resume、并发上限与 message board；V1 与 V2 的上限还不是同一个数。',
  oneLine: 'V1 默认 6 线程、V2 默认 4 个并发线程（含 root），以及 role、消息板与 review 的边界。',
  tldr: [
    'V1 默认 6 线程、嵌套深度 1；V2 默认 4 个并发线程（含 root，spawn 槽位按代码折算为 3），且 V2 feature 默认关闭。',
    'spawn 只是入口；wait / send / close / resume 才是把子 Agent 变成可管理任务的部分。',
    'message board 提供频道 / 帖子 / 订阅；review 是受限子 Agent，禁 web search、禁 collab、approval=Never。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>什么时候该开子 Agent，开了之后怎么不让它失控？</div>
${judgment(
  'implementation',
  '多 Agent 的产品难点不在 spawn，而在角色、并发上限、消息与回收；Codex 把这些做成一组工具与一个消息板。',
  'C17-C18',
)}

${section('01', '先分清 V1 与 V2 的上限', `
  <p>两个默认值经常被合并成一个「6 线程」。实际代码里，V1 的 <code>agent_max_threads</code> 默认是 6；V2 的 <code>max_concurrent_threads_per_session</code> 默认是 4，且在折算 spawn 槽位时减 1（把 root 算进并发）。V2 feature 默认关闭。</p>
  ${ev(
    'codex-rs/core/src/config/mod.rs',
    '270-280',
    `pub(crate) const DEFAULT_AGENT_MAX_THREADS: Option<usize> = Some(6);
pub(crate) const DEFAULT_MULTI_AGENT_V2_MAX_CONCURRENT_THREADS_PER_SESSION: usize = 4;
pub(crate) const DEFAULT_MULTI_AGENT_V2_MIN_WAIT_TIMEOUT_MS: i64 = 10_000;
pub(crate) const DEFAULT_MULTI_AGENT_V2_MAX_WAIT_TIMEOUT_MS: i64 = 3600 * 1000;
pub(crate) const DEFAULT_MULTI_AGENT_V2_DEFAULT_WAIT_TIMEOUT_MS: i64 = 30_000;
const DEFAULT_MULTI_AGENT_V2_TOOL_NAMESPACE: &str = "collaboration";

pub(crate) const HARD_MIN_MULTI_AGENT_V2_TIMEOUT_MS: i64 = 0;
pub(crate) const HARD_MAX_MULTI_AGENT_V2_TIMEOUT_MS: i64 =
    DEFAULT_MULTI_AGENT_V2_MAX_WAIT_TIMEOUT_MS;
pub(crate) const DEFAULT_AGENT_MAX_DEPTH: i32 = 1;`,
    link('codex-rs/core/src/config/mod.rs', 270, 280),
    'V1 6 + 深度 1；V2 4',
  )}
  ${ev(
    'codex-rs/core/src/config/mod.rs',
    '1763-1772',
    "        match multi_agent_version {\n            MultiAgentVersion::V2 => Some(\n                self.multi_agent_v2\n                    .max_concurrent_threads_per_session\n                    .saturating_sub(1),\n            ),\n            MultiAgentVersion::Disabled | MultiAgentVersion::V1 => {\n                self.agent_max_threads.or(DEFAULT_AGENT_MAX_THREADS)\n            }\n        }",
    link('codex-rs/core/src/config/mod.rs', 1763, 1772),
    'V2 把 root 从并发里扣掉',
  )}
  ${table(
    ['版本', '默认上限', '深度', '默认开关', '适用'],
    [
      ['V1', '6 线程', '<code>agent_max_depth=1</code>', '<code>multi_agent</code> deprecated 但默认开', '旧版协作工具'],
      ['V2', '4 个并发线程（含 root，spawn 槽 3）', '以并发上限为主', '<code>multi_agent_v2</code> 默认关', '新协作命名空间'],
    ],
  )}
`)}

${section('02', 'depth 检查：超过就拒绝', `
  <p>V1 的 spawn 会算 child depth，超过 <code>agent_max_depth</code> 直接拒绝。这个检查是「防止无限套娃」的硬边界，不是 UI 提示。</p>
  ${ev(
    'codex-rs/core/src/agent/registry.rs',
    '92-97',
    "pub(crate) fn next_thread_spawn_depth(session_source: &SessionSource) -> i32 {\n    session_depth(session_source).saturating_add(1)\n}\n\npub(crate) fn exceeds_thread_spawn_depth_limit(depth: i32, max_depth: i32) -> bool {\n    depth > max_depth",
    link('codex-rs/core/src/agent/registry.rs', 92, 97),
    'depth +1 后与上限比较',
  )}
`)}

${section('03', '消息板：协作不只有 spawn', `
  <p>spawn 之后，子 Agent 需要收消息、发进度、被回收。message board 把频道、帖子、订阅与通知做成共享设施，支持本地、内存、远端三种后端；它不是「再开一个模型」，而是协作状态层。</p>
  ${ev(
    'codex-rs/agent-message-board-host/src/lib.rs',
    '1-6',
    `//! Supplies board host capabilities through the public Core runtime interfaces.
//!
//! The extension owns backend construction, storage and tool registration. This adapter
//! selects configuration and supplies host capabilities. It never starts or restores
//! recipients during lookup. Notifications use ordinary agent-message scheduling.
//! Permanent board deletion uses the thread store's existing host cleanup callback.`,
    link('codex-rs/agent-message-board-host/src/lib.rs', 1, 6),
    '消息板是 host 能力，不是 prompt 技巧',
  )}
  ${note(
    'info',
    '消息板是否启用、用本地还是远端后端，取决于 feature 与配置；代码里有能力，不等于某个账号默认开启。',
  )}
`)}

${section('04', 'review：一个受限子 Agent', `
  <p>review 不是「再问主 Agent 一遍」。它启动一个子会话，禁 web search、禁 collab、禁 V2，把 approval 固定为 Never，再套 review rubric。这样 review 只能读代码、给结论，不能自己再开 Agent 或联网。</p>
  ${ev(
    'codex-rs/core/src/tasks/review.rs',
    '108-120',
    `if let Err(err) = sub_agent_config
    .web_search_mode
    .set(WebSearchMode::Disabled)
{
    panic!("by construction Constrained<WebSearchMode> must always support Disabled: {err}");
}
let _ = sub_agent_config.features.disable(Feature::Collab);
let _ = sub_agent_config.features.disable(Feature::MultiAgentV2);

// Set explicit review rubric for the sub-agent
sub_agent_config.base_instructions = Some(crate::REVIEW_PROMPT.to_string());
sub_agent_config.base_instructions_provenance = Some(BaseInstructionsProvenance::Custom);
sub_agent_config.permissions.approval_policy = Constrained::allow_only(AskForApproval::Never);`,
    link('codex-rs/core/src/tasks/review.rs', 108, 120),
    'review 子 Agent 的能力被收窄',
  )}
`)}

${section('05', '取舍：并行收益，协调成本', `
  <p>多 Agent 能把「查资料、改代码、跑测试」并行；代价是 token 成本翻倍、消息顺序难保证、子 Agent 可能互相踩文件，还要处理超时、回收与权限继承。V1 与 V2 的默认值不同，也说明这不是一个已经稳定的产品面。</p>
  <div data-tradeoff>${tradeoff(
    '任务可并行、review 可隔离、长任务可拆给不同角色。',
    '并发与成本上升；消息与文件冲突需要额外协调；V1/V2 两套语义增加理解成本。',
  )}</div>
`)}
`,
  sources: [
    { label: 'config/mod.rs:270-280', url: link('codex-rs/core/src/config/mod.rs', 270, 280) },
    { label: 'config/mod.rs:1759-1772', url: link('codex-rs/core/src/config/mod.rs', 1763, 1772) },
    { label: 'agent/registry.rs:92-97', url: link('codex-rs/core/src/agent/registry.rs', 92, 97) },
    { label: 'agent-message-board-host/lib.rs:1-6', url: link('codex-rs/agent-message-board-host/src/lib.rs', 1, 6) },
    { label: 'tasks/review.rs:106-120', url: link('codex-rs/core/src/tasks/review.rs', 108, 120) },
  ],
};
