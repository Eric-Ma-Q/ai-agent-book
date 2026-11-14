import { section, table, note, tradeoff, quiz, ul, ol, judgment } from '../ui.mjs';

export const lessons = {
  no: '10',
  slug: '10-lessons',
  nav: '结论与自测',
  kicker: '哪些能搬走，哪些不能',
  title: '结论：搬协议分层、权限组合与压缩条件，不搬仓库外能力',
  lead:
    '读完十章，最容易带走的是功能名词；真正能迁移的是结构判断：运行时与表面分开、工具暴露可计算、权限是组合、压缩有派生上限与条件、记忆是离线管线。这一章把可迁移、不可迁移与风险分开，再用 8 道自测检查是否真的读懂。',
  oneLine: '10 条可迁移结论、5 条搬不走、6 条风险与 8 道自测。',
  tldr: [
    '可迁移的是分层、矩阵、条件与取舍；不可迁移的是仓库外服务、平台后端与模型能力。',
    '所有「默认值」都要和 feature gate 一起读；代码里有能力，不等于线上已开启。',
    '自测不是背数字，而是能否用证据解释「为什么这样设计、付出什么代价」。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>这份拆解里，哪些结论能用到自己的 Agent 产品，哪些只能留在 Codex？</div>

${judgment(
  'implementation',
  '可迁移的是分层、矩阵、条件与取舍；不可迁移的是仓库外服务、平台后端与模型能力。',
  'C01-C22',
)}

${section('01', '10 条可迁移结论', `
  <ol>
    <li>先分「运行时 / 协议 / 表面」，再决定要不要多端；单端产品不必先造 app-server。</li>
    <li>工具面要做暴露矩阵：直接、延迟、代码调用、隐藏，不是一张无限长的函数表。</li>
    <li>长命令要做会话，不是一次性进程；但要给进程数、输出与超时上限。</li>
    <li>权限拆成 approval、sandbox、规则、网络四层；任何一层都不能单独代表安全。</li>
    <li>沙箱是平台相关能力；macOS / Linux / Windows 的后端不同，不能写成一套。</li>
    <li>压缩阈值要写清分母、scope 与开关；90% 是派生上限，65% 是条件预跑。</li>
    <li>项目指令要区分「发现方向」与「最终排列」；预算只约束项目文档，不约束全部上下文。</li>
    <li>记忆放到会话外，先做抽取与合并，再谈跨会话复用；默认关闭是合理起点。</li>
    <li>多 Agent 先解决并发、消息与回收，再谈「让模型自己组队」。</li>
    <li>差异判断分四类；材料不足时写「不可验证」，不写「没有」或无法证伪的最高级判断。</li>
  </ol>
`)}

${section('02', '5 条搬不走', `
  ${ul([
    '<b>仓库外服务</b>：桌面 App、Codex Web / Cloud、模型服务的内部实现不在仓库，无法复制。',
    '<b>平台沙箱后端</b>：Seatbelt、Landlock、Windows 受限令牌是 OS 能力，换平台要重做。',
    '<b>code mode 宿主</b>：需要独立的 JS 运行时与嵌套工具调度，不是加一个 prompt 就行。',
    '<b>两阶段记忆的质量</b>：抽取、合并、保留策略需要真实数据与评估，代码只是一半。',
    '<b>协议生态</b>：app-server 的价值来自多客户端；单产品复制一套协议，收益有限。',
  ])}
`)}

${section('03', '6 条风险', `
  ${table(
    ['风险', '表现', '怎么防'],
    [
      ['把 feature gate 当默认', 'memory / V2 / code mode 代码存在，但默认关闭', '每个机制同时写默认值与开启条件'],
      ['把协议当稳定 API', '74 个 variant 级 experimental', '客户端做能力协商，页面标实验面'],
      ['沙箱平台差异', '同一 policy 在不同 OS 后端不同', '按平台写边界，不写「统一沙箱」'],
      ['记忆质量与隐私', '抽取可能错、保留可能过期', '默认关闭、可审计、可删除'],
      ['多 Agent 成本', '并发翻倍、消息与文件冲突', '先限制并发与深度，再做协调'],
      ['证据不对称', '用 039 的缺失推断 Claude Code 没有', '只比较两边都有材料的问题'],
    ],
  )}
`)}

${section('04', '8 道自测', `
  ${quiz('为什么 Codex 要把 app-server 单独抽出来？', '因为 TUI / exec / 桌面 / 移动 / SDK 需要共享 thread / turn / item 与会话生命周期；代价是协议兼容与 daemon 运维。')}
  ${quiz('TUI 和桌面 App 连接 app-server 的方式一样吗？', '不一样。TUI / exec 用 in-process 客户端；桌面 / 移动通过 daemon 连远程 app-server；TS SDK 又走 CLI JSONL。')}
  ${quiz('90% 是什么？', '<code>resolved_context_window</code> 的派生上限，实际取 <code>min(config_limit, 90%)</code>；不是所有模型到 90% 必然压缩的硬阈值。')}
  ${quiz('65% 的分母是什么？', '完整 <code>resolved_context_window</code>，不是 90% 上限；而且只在 AsyncCompaction、remote compaction V2、未开 TokenBudget 时预跑。')}
  ${quiz('V1 和 V2 的默认并发上限分别是多少？', 'V1 默认 6 线程、深度 1；V2 默认 4 个并发线程（含 root，spawn 槽位按代码折算为 3），V2 feature 默认关闭。')}
  ${quiz('AGENTS.md 是向上找还是向下找？', '发现时从 cwd 向上找项目根；最终排列是 user → thread → 项目根→cwd。')}
  ${quiz('Guardian 默认会自动审查吗？', '不会。Guardian 能力默认开启，但 reviewer 默认 <code>user</code>；只有显式 <code>auto_review</code> 且 policy 为 on-request / granular 才路由。')}
  ${quiz('为什么不能把仓库里没有的 App / Cloud 写成「源码已确认不公开」？', '因为「不在仓库」只能推出「内部实现不可验证」，不能推出「源码是否公开」「有没有」或「线上行为」。')}
`)}

${section('05', '一周行动清单', `
  ${ol([
    '选一个真实用户问题，写成「用户问题 → 产品判断 → 机制 → 取舍」四行。',
    '为每条判断标 A/B/C/D；A 级必须能指到文件与行号。',
    '把「默认值」和「feature gate」分两列，避免把实验能力写成线上默认。',
    '画一张工具暴露矩阵，删掉不需要直接给模型的工具。',
    '把权限拆成 approval / sandbox / 规则 / 网络四层，逐层写边界。',
    '用 8 道自测检查：能否不看页面复述条件与代价。',
  ])}
  <div data-tradeoff>${tradeoff(
    '按这套方法，产出的不是功能清单，而是可复核、可取舍的产品判断。',
    '它不能替代真实用户测试与线上数据；代码证据只能说明实现，不说明价值。',
  )}</div>
  ${note('info', '读完不要记住「Codex 有 186 个 RPC」。要记住：为什么需要协议层、为什么权限要组合、为什么压缩阈值必须带条件。')}
`)}
`,
  sources: [
    { label: '01 取证边界', url: '01-scope.html' },
    { label: '05 上下文与记忆', url: '05-context.html' },
    { label: '06 权限与沙箱', url: '06-permission.html' },
    { label: '09 差异判断', url: '09-difference.html' },
  ],
};
