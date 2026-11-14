import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const context = {
  no: '05',
  slug: '05-context',
  nav: '上下文与记忆',
  kicker: '压缩是产品功能，不是补丁',
  title: '上下文与记忆：90% 是派生上限，65% 是条件预跑',
  lead:
    '长任务最怕两件事：上下文突然爆掉，和压缩时用户干等。Codex 把压缩拆成几条路径：模型元数据给出 90% 的派生上限，配置可以更小；异步压缩在 65% 左右预跑，但只在特定开关与 provider 能力下成立。记忆则被放到会话外，做成两阶段离线管线，且默认关闭。',
  oneLine: 'AGENTS.md 的发现与排列、90% / 65% 的真实条件、两阶段记忆的默认状态。',
  tldr: [
    'AGENTS.md 发现时从 cwd 向上找项目根，最终排列是 user → thread → 项目根→cwd，不是「从根往下找」。',
    '90% 是 <code>resolved_context_window</code> 的派生上限，实际取 <code>min(模型元数据的 auto_compact_token_limit, 90%)</code>；不是无条件硬阈值。',
    '65% 的分母是完整 <code>resolved_context_window</code>，且要 AsyncCompaction、remote compaction V2、未开 TokenBudget 才预跑。',
    '记忆是会话外两阶段管线，feature 默认关闭；读不到「某个账号已开启」的结论。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>长任务怎样不爆上下文，又怎样让压缩不打断用户？</div>
${judgment(
  'implementation',
  '压缩在 Codex 里是产品功能：有派生上限、有后台预跑、有摘要预算；记忆则被移到会话外，做成可关闭的离线管线。',
  'C15-C16',
)}

${section('01', 'AGENTS.md：发现向上，排列向下', `
  <p>模块注释把两件事写在一起，容易读混：<b>发现</b>是从 cwd 向上找项目根；<b>最终排列</b>是从项目根到 cwd。代码先向上收集目录，再 <code>reverse()</code>，所以并发探测不会打乱最终顺序。</p>
  ${ev(
    'codex-rs/core/src/agents_md.rs',
    '10-18',
    `//! 1.  Determine the project root by walking upwards from the current working
//!     directory until a configured \`project_root_markers\` entry is found.
//!     When \`project_root_markers\` is unset, the default marker list is used
//!     (\`.git\`). If no marker is found, only the current working directory is
//!     considered. An empty marker list disables parent traversal.
//! 2.  Collect every \`AGENTS.md\` found from the project root down to the
//!     current working directory (inclusive) and concatenate their contents in
//!     that order.
//! 3.  We do **not** walk past the project root.`,
    link('codex-rs/core/src/agents_md.rs', 10, 18),
    '发现向上、排列向下，两件事分开',
  )}
  <p>最终文本还包含 host 提供的 user 与 thread 指令：<code>legacy_text()</code> 先写 user、再写 thread、最后写项目 entries。因此页面上的「项目指令」只是最后一层，不是全部。</p>
  ${ev(
    'codex-rs/core/src/agents_md.rs',
    '388-399',
    `for instructions in self
    .user_instructions
    .iter()
    .chain(self.thread_instructions.iter())
{
    if has_previous {
        output.push_str("\\n\\n");
    }
    output.push_str(&instructions.text);
    has_previous = true;
}
for entry in &self.entries {`,
    link('codex-rs/core/src/agents_md.rs', 388, 399),
    'user → thread → 项目 entries',
  )}
  <p>预算默认 32 KiB（<code>AGENTS_MD_MAX_BYTES</code>），超过会截断并给出 warning；它是项目文档预算，不等于整个 system prompt 的预算。</p>
`)}

${section('02', '90%：派生上限，不是通用硬阈值', `
  <p><code>auto_compact_token_limit()</code> 先算 <code>resolved_context_window * 9 / 10</code>，再和模型元数据里的 <code>config_limit</code> 取 <code>min</code>。如果配置更小，配置优先；如果配置更大，被 90% 截住。它是一条派生上限，不是「所有模型到 90% 必然压缩」的硬阈值。</p>
  ${ev(
    'codex-rs/protocol/src/openai_models.rs',
    '579-590',
    `pub fn auto_compact_token_limit(&self) -> Option<i64> {
    let context_limit = self
        .resolved_context_window()
        .map(|context_window| (context_window * 9) / 10);
    let config_limit = self.auto_compact_token_limit;
    if let Some(context_limit) = context_limit {
        return Some(
            config_limit.map_or(context_limit, |limit| std::cmp::min(limit, context_limit)),
        );
    }
    config_limit
}`,
    link('codex-rs/protocol/src/openai_models.rs', 579, 590),
    '90% 与 config 取 min',
  )}
  <p>另外还有独立的 full context 上限与 <code>model_auto_compact_token_limit_scope</code>（Total / BodyAfterPrefix），所以「90%」不能脱离 scope 与模型元数据单独引用。</p>
`)}

${section('03', '65%：分母、开关与适用路径', `
  <p>异步压缩的判定是 <code>active_context_tokens * 100 &lt; resolved_context_window * threshold</code>，分母是完整上下文窗口，不是 90% 上限。并且在进入这段之前，已经要求 AsyncCompaction 开启、provider 支持 remote compaction V2、未开 TokenBudget。</p>
  ${ev(
    'codex-rs/core/src/session/async_compaction.rs',
    '70-83',
    `|| (matches!(phase, CompactionPhase::PostTurn)
    && token_status.turn_end_compaction_threshold_reached)
|| step_context
    .settings
    .model_info
    .resolved_context_window()
    .is_none_or(|limit| {
        i128::from(token_status.active_context_tokens) * 100
            < i128::from(limit)
                * i128::from(turn_context.config.async_compaction_threshold_percent)
    })
{
    return;
}`,
    link('codex-rs/core/src/session/async_compaction.rs', 70, 83),
    '分母是 resolved_context_window',
  )}
  ${table(
    ['条件', '代码位置', '不满足时'],
    [
      ['AsyncCompaction 开启', '<code>enabled()</code>', '不预跑，走前台压缩'],
      ['provider 支持 remote compaction V2', '<code>remote_compaction</code>', '不预跑'],
      ['未开 TokenBudget', '<code>Feature::TokenBudget</code>', '不预跑'],
      ['达到 65% 阈值', '<code>async_compaction_threshold_percent</code>，可配置', '继续前台采样'],
    ],
  )}
  ${note(
    'warn',
    '不要写「65% 一定触发压缩」。它是异步预跑的起点，不是主循环的强制终止条件；分母与开关都要一起写。',
  )}
`)}

${section('04', '记忆：会话外的两阶段管线', `
  <p>记忆不在主对话里「顺手记一笔」。它由启动任务异步跑两个阶段：Phase 1 从 rollout 抽取结构化记忆，Phase 2 合并到文件工作区，再跑一个受限的 consolidation 子 Agent。feature 默认关闭。</p>
  ${ev(
    'codex-rs/memories/README.md',
    '29-38',
    `## When it runs

The pipeline is triggered when a root session starts, and only if:

- the session is not ephemeral
- the memory feature is enabled
- the session is not a sub-agent session
- the state DB is available

It runs asynchronously in the background and executes two phases in order: Phase 1, then Phase 2.`,
    link('codex-rs/memories/README.md', 29, 38),
    '启动时异步跑两阶段',
  )}
  ${ev(
    'codex-rs/features/src/lib.rs',
    '1446-1450',
    "        id: Feature::MemoryTool,\n        key: \"memories\",\n        stage: Stage::Stable,\n        default_enabled: false,\n    },",
    link('codex-rs/features/src/lib.rs', 1446, 1450),
    'memory feature 默认关闭',
  )}
  <p>读路径还有独立的上下文上限：<code>MemoryContextFragment</code> 把注入文本截到 8,900 bytes，避免记忆把当前请求撑爆。它是「读进来的记忆」的上限，不是记忆库的总大小。</p>
`)}

${section('05', '取舍：更少中断，更多后台与摘要损失', `
  <p>派生上限 + 异步预跑能把压缩从「用户等待」挪到「后台准备」，但摘要一定丢信息，后台请求也会花钱；记忆把上下文搬到会话外，能跨会话复用，却引入抽取质量、保留策略与隐私边界。</p>
  <div data-tradeoff>${tradeoff(
    '长任务更少被上下文打断；压缩可以提前准备；记忆可跨会话复用。',
    '摘要损失不可逆；异步压缩有条件与成本；记忆默认关闭，开启后还要治理质量与保留。',
  )}</div>
`)}
`,
  sources: [
    { label: 'agents_md.rs:10-18', url: link('codex-rs/core/src/agents_md.rs', 10, 18) },
    { label: 'agents_md.rs:388-399', url: link('codex-rs/core/src/agents_md.rs', 388, 399) },
    { label: 'openai_models.rs:579-590', url: link('codex-rs/protocol/src/openai_models.rs', 579, 590) },
    { label: 'async_compaction.rs:70-83', url: link('codex-rs/core/src/session/async_compaction.rs', 70, 83) },
    { label: 'memories/README.md:29-38', url: link('codex-rs/memories/README.md', 29, 38) },
    { label: 'features/src/lib.rs:1446-1450', url: link('codex-rs/features/src/lib.rs', 1446, 1450) },
    { label: 'context/memory.rs:45', url: link('codex-rs/core/src/context/memory.rs', 45, 45) },
  ],
};
