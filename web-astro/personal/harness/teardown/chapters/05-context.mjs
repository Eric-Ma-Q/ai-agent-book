import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const ctx = {
  no: '05',
  slug: '05-context',
  nav: '上下文',
  kicker: '记忆、压缩与预算',
  title: '上下文：一台会自己整理行李的机器',
  lead:
    '上下文窗口是 Agent 最贵的资源。Claude Code 没有「超了就总结」这一招，而是排了一条五段流水线，从最便宜、最无损的处理开始，一级一级往下退。这一章讲清这条流水线的顺序、阈值和代价。',
  oneLine: '五段压缩流水线、autocompact 公式、记忆三层与后台整理。',
  tldr: [
    '压缩按代价排序：工具结果预算 → snip → microcompact → context collapse → autocompact。能重取的就清，不能重取的才摘要。',
    'autocompact 的阈值不是百分比，是绝对 token：<code>窗口 − 2 万（摘要预留）− 1.3 万（缓冲）</code>。200k 的模型约在 167k 触发（≈93%）。',
    'microcompact 有两种触发：空闲 60 分钟后的「旧结果清空」，以及只改服务端缓存、不动本地消息的 cache editing。',
    '摘要 prompt 固定九段，其中「所有用户消息」必须完整保留 —— 用户的每次纠正都是后续行为的约束。',
    '压缩可能失败：连续 3 次失败就熔断，本会话不再尝试，避免「压缩 → 仍然超长 → 再压缩」的死循环。',
  ],
  body: () => `
${section('01', '先看整体：五段流水线', `
  <p>每轮发请求前，消息数组会被这条流水线依次处理。注释里写得很清楚：<b>能叠加，不互斥</b>。</p>
  ${ev('query.ts', '379-467', `messagesForQuery = await applyToolResultBudget(...)   // 1 结果预算
...snipCompactIfNeeded(messagesForQuery)                 // 2 剪历史
...deps.microcompact(messagesForQuery, ...)              // 3 清旧工具结果
...contextCollapse.applyCollapsesIfNeeded(...)            // 4 折叠成摘要
...deps.autocompact(messagesForQuery, ...)                // 5 整段摘要`, '五个调用点，顺序硬编码')}
  ${table(
    ['闸门', '触发', '保留什么', '丢掉什么', '代价'],
    [
      ['结果预算', '单条消息的结果总量超 20 万字符', '结构、路径、预览', '超大正文（落盘）', '几乎为零'],
      ['snip', '历史累积到阈值（flag 控制）', '受保护尾部 + 可引用消息', '最早的历史片段', '低（可再生）'],
      ['microcompact', '空闲 60 分钟 / 缓存编辑阈值', '最近 5 条结果 + 结构', '旧工具结果正文', '中（要重读）'],
      ['context collapse', '有效窗口 90% 提交 / 95% 阻塞（仅注释可见）', '细粒度消息 + 阶段摘要', '中间一段原文', '中高'],
      ['autocompact', '有效窗口 − 1.3 万', '摘要 + 最近若干条', '其余全部', '最高（不可逆）'],
    ],
  )}
  ${note('', '<b>数据来源说明：</b>collapse 的 90% / 95% 只出现在 <code>autoCompact.ts</code> 的注释里 —— 它的实现模块不在本副本中，这两个百分比未经代码验证；其余四道闸门的阈值都能在实现里读到。')}
  ${analogy('像出差打包：先扔掉酒店一次性的东西（可重取的工具结果），再压缩衣服（折叠摘要），最后才考虑只带一套换洗（整段摘要）。顺序反了，就会把还要用的东西先扔了。')}
`)}

${section('02', '顺序为什么不能换', `
  ${ul([
    '<b>预算必须在 microcompact 之前</b>：缓存编辑按 <code>tool_use_id</code> 记账，内容先被清空的话，「这条结果是否已经发过」的判断就和实际字节对不上。',
    '<b>snip 必须在 autocompact 之前，而且要把「省下多少」传下去</b>：token 计数读的是尾部那条消息的 usage，snip 之后它没变，计数看不见节省；先压缩就会按虚高的数字触发，把刚剪完的会话又整体摘要一次。',
    '<b>collapse 必须在 autocompact 之前</b>：collapse 若能压回阈值以下，autocompact 就成了空操作，于是保留了细粒度上下文而不是一条大摘要。',
    '<b>autocompact 在 collapse 开启时被主动禁用</b>：两者都在 93% 附近抢触发，autocompact 会赢，然后把 collapse 正要保住的细节「核平」。',
  ])}
  ${note('good', '<b>可迁移结论：</b>压缩不是单一策略，而是一组<b>有序的、代价递增的</b>策略。先问「这份信息能不能重新拿到」，再问「能不能摘要」。')}
`)}

${section('03', 'autocompact 的阈值可以手算', `
  ${ev('services/compact/autoCompact.ts', '33-49、72-75', `const reservedTokensForSummary = Math.min(
  getMaxOutputTokensForModel(model),
  MAX_OUTPUT_TOKENS_FOR_SUMMARY,   // 20_000
)
let contextWindow = getContextWindowForModel(model, getSdkBetas())
...
return contextWindow - reservedTokensForSummary

// 阈值
const autocompactThreshold = effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS  // 13_000`)}
  <p>以 200k 窗口、输出上限 ≥20k 的模型为例：</p>
  ${stats([
    ['200,000', '上下文窗口', '默认值'],
    ['−20,000', '给摘要预留的输出', 'p99.99 实测 17,387'],
    ['=180,000', '有效窗口', '压缩请求能用的量'],
    ['−13,000', '安全缓冲', '留给系统提示与工具'],
    ['=167,000', '触发线（≈93%）', '到这儿就开始摘要'],
  ])}
  <p>另外两条线：预警线 = 阈值 − 2 万；阻塞线 = 有效窗口 − 3 千（到这条线就直接报错，给用户留出手动 <code>/compact</code> 的余地）。</p>
`)}

${section('04', 'microcompact：两种「清旧账」', `
  <p>这是最容易被误解的一环。本版本里它<b>没有</b>「按 token 阈值清空旧结果」的旧路径（源码直接写着 legacy 路径已删除），只剩两种：</p>
  ${table(
    ['模式', '什么时候', '改什么', '为什么省'],
    [
      ['时间触发', '距上一条回复 ≥ 60 分钟，且存在可清结果', '本地把旧结果正文换成 <code>[Old tool result content cleared]</code>', '缓存已过期，反正要重传，先把体积压小'],
      ['cache editing', '工具调用数达阈值（flag 配置）', '<b>不动本地消息</b>，只发「删除这些缓存片段」的指令', '前缀字节不变，KV 缓存仍然命中'],
    ],
  )}
  ${ev('services/compact/microCompact.ts', '261-270', `// 时间模式命中时短路返回，跳过 cached MC：
// editing assumes the cache is hot, and we just established it is cold.`)}
  ${tradeoff(
    '长会话里工具输出占大头，清掉它们能撑很久，而且模型需要时可以重新读文件。',
    '模型会看到一堆「已清空」的占位符，必须靠系统提示里那段说明才知道要重新读；清空时机判断错了（缓存还热）就白花一次全量重传。',
  )}
`)}

${section('05', '摘要 prompt：为什么固定九段', `
  <p>整段压缩不是「帮我总结一下」，而是一份带编号的结构化模板。九段固定，其中第 6 段要求<b>列出所有用户消息</b>。</p>
  ${ev('services/compact/prompt.ts', '68-76', `1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created...
4. Errors and fixes: ...
5. Problem Solving: ...
6. All user messages: List ALL user messages that are not tool results...
7. Pending Tasks: ...
8. Current Work: ...
9. Optional Next Step: ...`)}
  <p>先让模型写一段 <code>&lt;analysis&gt;</code> 草稿，再把草稿丢掉、只留 <code>&lt;summary&gt;</code>。这个「先想后写」的结构在压缩里同样有效：草稿提高了摘要的召回，但不占最终上下文。</p>
  ${note('', '<b>为什么保留全部用户消息：</b>用户在第三轮说过「不要用 emoji」，如果压缩时丢了，后面就会重犯。工具结果可以重取，<b>用户的原话不能</b>。')}
`)}

${section('06', '记忆：三层文件 + 三个后台代理', `
  <p>CLAUDE.md 按「离代码越近越优先」加载，共四层：企业托管 → 用户 → 项目（含 <code>.claude/rules/*.md</code>）→ 本地（<code>CLAUDE.local.md</code>）。<code>@include</code> 支持嵌套，但有深度上限与防环集合。</p>
  ${table(
    ['机制', '谁在写', '什么时候跑', '产出'],
    [
      ['SessionMemory', 'forked 子代理', '每 1 万 token 初始化，之后每 5 千 token 且工具调用 ≥3 次', '会话级 markdown，压缩时优先用它代替整段摘要'],
      ['extractMemories', 'forked 子代理', '一轮正常结束后，按会话节流', '把值得记的偏好写进记忆目录'],
      ['autoDream', 'forked 子代理', '距上次 ≥24 小时且新增 ≥5 个会话', '把散落记忆蒸馏回主题文件与 MEMORY.md'],
    ],
  )}
  <p>三个代理都只在主线程收尾时触发，且都被排除在「自动压缩」的适用对象之外 —— 否则它们压缩自己，会形成自锁。</p>
  ${stats([
    ['4 层', 'CLAUDE.md 优先级', '企业/用户/项目/本地'],
    ['200 行 / 25KB', 'MEMORY.md 硬上限', 'memdir.ts:35-38'],
    ['5 个', '单轮最多注入的相关记忆', 'findRelevantMemories.ts:20'],
    ['1 秒', '附件收集总超时', 'attachments.ts:767'],
  ])}
`)}

${section('07', '附件：把「可能要用的」推迟到用的时候', `
  <p>每轮会并发收集一批「附件」：@ 提到的文件、IDE 里选中的代码、变更过的文件、诊断信息、待办提醒、技能列表……全部包在 <code>maybe(label, fn)</code> 里，单个失败不影响其他，整体 1 秒超时。</p>
  ${ul([
    '<b>去重</b>：记忆文件用「已加载路径集合」判重，而不是靠 100 条 LRU 的文件读取缓存 —— 注释点名后者在忙会话里会掉条目，导致同一份 CLAUDE.md 被反复注入。',
    '<b>预算</b>：单个记忆文件最多 200 行 / 4KB（注释给算式：5 × 4KB ≈ 20KB/轮）；相关记忆全会话累计 60KB 就停止预取。',
    '<b>延迟</b>：相关记忆与技能发现改成「预取」，在模型流式输出时并行跑，等工具结束时再取结果 —— 不阻塞首字。',
  ])}
  ${note('good', '<b>可迁移结论：</b>上下文成本要按「每轮固定开销」算。一个 4KB 的 CLAUDE.md 看着不大，乘上 50 轮就是 200KB。')}
`)}

${section('08', '失败模式：压缩本身也会翻车', `
  ${table(
    ['失败', '代码里的防护', '数字'],
    [
      ['压缩后仍超限，反复压缩', '连续失败计数，达阈值熔断', '3 次（注释：1,279 个会话曾连续失败 50+ 次，每天浪费约 25 万次调用）'],
      ['压缩请求自身过长（PTL）', '按报错的 token 缺口砍掉最旧的整轮，最多重试', '3 次'],
      ['压缩流式中断', '有限重试，避免无限等待', '2 次'],
      ['压缩把细节抹掉', '摘要写 <code>transcriptPath</code>，提示去读完整记录；保留段原样附在后面', '—'],
      ['缓存失效被误报', '压缩后显式重置缓存检测基线', '—'],
    ],
  )}
  ${ev('services/compact/autoCompact.ts', '67-70', `// Stop trying autocompact after this many consecutive failures.
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`, '这条注释是「为什么要熔断」的最好说明')}
`)}
`,
  sources: [
    { label: 'services/compact/（autoCompact、microCompact、compact、prompt）', note: '阈值、模板、失败处理' },
    { label: 'query.ts 压缩链调用点', note: '顺序与行号' },
    { label: 'utils/claudemd.ts、memdir/、utils/attachments.ts', note: '记忆层级与附件预算' },
  ],
};
