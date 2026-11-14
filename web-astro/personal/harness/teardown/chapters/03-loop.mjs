import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const loop = {
  no: '03',
  slug: '03-loop',
  nav: '主循环',
  kicker: '一次会话的发动机',
  title: '主循环：一个不肯结束的生成器',
  lead:
    '<code>query.ts</code> 里不到 1,500 行的 <code>queryLoop</code>，是整份代码里最值钱的部分。它要同时处理流式输出、并行工具、用户打断、上下文压缩、API 报错和「什么时候该停」。这一章把它拆成五段来看。',
  oneLine: '为什么是 async generator、工具怎么并行、被打断怎么收场、报错怎么恢复。',
  tldr: [
    '循环是 <code>async function*</code>：边跑边 <code>yield</code> 消息，界面才能实时渲染、用户才能随时打断。',
    '它的返回值只有十来个「终止原因」，每一个都对应产品上一种收场方式（完成、超轮次、被打断、上下文爆了、hook 拦下）。',
    '一轮里的步骤顺序是硬约束：先算工具结果预算 → snip → microcompact → collapse → autocompact → 发请求。顺序换了就会多花一次全量请求。',
    '工具并发不是「全并行」：标记为并发安全的可以并行，不安全的必须独占，而且会堵住后面的队列。',
    '报错不是异常退出：输出被截断会先升到 64k 重试，再不行注入「接着写」的恢复消息，最多 3 次。',
  ],
  body: () => `
${section('01', '为什么是 async generator', `
  <p>普通函数只能「跑完返回」。而 Agent 的一轮里，模型是流式的、工具是渐进的、用户随时可能按 Esc。用生成器把状态挂在函数栈上，就能做到：产出即渲染、随时 <code>return</code> 收场、调用方 <code>break</code> 也能立刻停。</p>
  ${ev('query.ts', '219-231', `export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  const consumedCommandUuids: string[] = []
  const terminal = yield* queryLoop(params, consumedCommandUuids)`, '返回类型 Terminal，产出类型是五类消息')}
  <p>注意第二个类型参数 <code>Terminal</code>：生成器的「返回值」不是消息，而是一个终止原因对象。调用方既能消费过程，也能拿到结局。</p>
  ${analogy('像看直播而不是等录播：主播（模型）边说，你边看，还能中途发弹幕打断；导演（循环）最后给你一张「本场结束原因」的单子。')}
`)}

${section('02', '状态机：7 个转移点，一套状态', `
  <p>循环体不是靠嵌套 if 推进的，而是「每轮开头解构一份 State，需要重来时整体换一份新 State 再 continue」。这样所有恢复路径长得一样，测试也好写。</p>
  ${ev('query.ts', '203-218', `type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  transition: Continue | undefined
}`)}
  <p><code>transition</code> 字段记录了「上一轮为什么继续」，只给测试与埋点用，但它是理解这套状态机的钥匙。全库只有 7 个转移点：6 处显式 <code>continue</code>，加上循环末尾落空重入的普通下一轮。</p>
  ${table(
    ['继续原因', '触发场景', '产品含义'],
    [
      ['<code>next_turn</code>', '本轮有工具调用，结果已回灌', '正常干活（落空重入，无显式 continue）'],
      ['<code>collapse_drain_retry</code>', '服务端报 413，先排空 collapse 队列', '先撞墙再补票'],
      ['<code>reactive_compact_retry</code>', '排空后仍超限，触发被动压缩', '最后一次补救'],
      ['<code>max_output_tokens_escalate</code>', '输出被 8k 上限截断', '同一请求升到 64k 重发'],
      ['<code>max_output_tokens_recovery</code>', '升档后仍被截断', '注入「接着写」消息，最多 3 次'],
      ['<code>token_budget_continuation</code>', '预算续跑', '长任务的燃料补给'],
      ['<code>stop_hook_blocking</code>', 'Stop hook 判定「还没干完」', '外部脚本可以否决「结束」'],
    ],
  )}
`)}

${section('03', '一轮的五段：顺序是硬约束', `
  <p>每轮开头到发请求之间，有一段固定的流水线。注释里写明了为什么必须这个顺序：<b>先做便宜的、无损的，再做贵的、有损的</b>。</p>
  ${ev('query.ts', '412-444', `// Apply microcompact before autocompact
queryCheckpoint('query_microcompact_start')
const microcompactResult = await deps.microcompact(
  messagesForQuery,
  toolUseContext,
  querySource,
)
...
// Project the collapsed context view and maybe commit more collapses.
// Runs BEFORE autocompact so that if collapse gets us under the
// autocompact threshold, autocompact is a no-op and we keep granular
// context instead of a single summary.`)}
  ${ul([
    '<b>工具结果预算</b>：按字符/ token 上限替换超大结果（落盘 + 引用），不动对话结构；',
    '<b>snip</b>：剪掉最早的历史片段（有损但便宜）；',
    '<b>microcompact</b>：只清「可重取」的工具结果（读文件、跑命令的输出），保留结构；',
    '<b>context collapse</b>：把中间一段折叠成摘要，但保留原始历史用于回放；',
    '<b>autocompact</b>：真正的「把整段历史压成一份摘要」，最贵、信息损失最大，所以放最后。',
  ])}
  ${note('good', '<b>这条顺序为什么值钱：</b>很多 Agent 一超限就直接总结，结果把「刚才读过的文件内容」也总结没了。Claude Code 的做法是先用「可重取的结果」腾地方 —— 文件还能再读，摘要就回不来了。')}
`)}

${section('04', '工具并发：三种状态，一条规则', `
  <p>模型一次可以吐出多个 <code>tool_use</code>。执行器把它们排进队列，用一条规则决定谁能跑：</p>
  ${ev('services/tools/StreamingToolExecutor.ts', '124-131', `private canExecuteTool(isConcurrencySafe: boolean): boolean {
  const executingTools = this.tools.filter(t => t.status === 'executing')
  return (
    executingTools.length === 0 ||
    (isConcurrencySafe && executingTools.every(t => t.isConcurrencySafe))
  )
}`)}
  <p>翻译成人话：<b>没有人在跑 → 谁都能跑；有人在跑 → 只有「并发安全」的能插队，且正在跑的全部也得是并发安全的</b>。一旦遇到不安全的工具（比如写文件、跑命令），队列后面的全部等着 —— 因为顺序本身就是语义。</p>
  <p>非流式路径（关闭流式执行时）走另一套编排：先把连续的安全调用合并成批，批内并发（默认上限 <b>10</b>），批与批之间串行。判定失败一律按「不安全」处理 —— <b>fail-closed</b>。</p>
  ${ev('services/tools/StreamingToolExecutor.ts', '44-48', ` * Executes tools as they stream in with concurrency control.
 * - Concurrent-safe tools can execute in parallel with other concurrent-safe tools
 * - Non-concurrent tools must execute alone (exclusive access)
 * - Results are buffered and emitted in the order tools were received`)}
  ${tradeoff(
    '读文件、搜索这类操作可以几个一起跑，等模型说完时结果已经回来了，感知延迟接近「并行」。',
    '写操作必须独占，长任务里会出现「一个慢命令堵住后面所有工具」；所以它把 Bash 放进后台任务来绕开（见第 07 章）。',
  )}
`)}

${section('05', '被打断时怎么收场', `
  <p>用户按 Esc 时，<code>abortController</code> 触发。麻烦在于：模型可能已经吐出 3 个 <code>tool_use</code>，但一个 <code>tool_result</code> 都还没回。如果直接退出，下一轮请求会因为「tool_use 没有配对的 tool_result」被 API 拒绝。</p>
  ${ev('query.ts', '1015-1026', `if (toolUseContext.abortController.signal.aborted) {
  if (streamingToolExecutor) {
    // Consume remaining results - executor generates synthetic tool_results for
    // aborted tools since it checks the abort signal in executeTool()
    for await (const update of streamingToolExecutor.getRemainingResults()) {
      if (update.message) {
        yield update.message
      }
    }
  } else {
    yield* yieldMissingToolResultBlocks(assistantMessages, 'Interrupted by user')
  }`)}
  <p>做法是<b>补齐</b>：给每个没跑完的工具造一条错误结果（<code>user_interrupted</code> / <code>sibling_error</code> / <code>streaming_fallback</code> 三种理由），保证消息序列永远合法。还有一个细节：工具可以声明自己被中断时的行为是 <code>cancel</code> 还是 <code>block</code> —— 后者允许「先让我把这个命令跑完」。</p>
  ${table(
    ['中断来源', '谁触发的', '工具结果的写法', '用户看到什么'],
    [
      ['<code>user_interrupted</code>', '用户 Esc / 新消息抢占', '<code>REJECT_MESSAGE</code>', '「User rejected tool use」'],
      ['<code>sibling_error</code>', '同批某个工具报错', '「Cancelled: parallel tool call X errored」', '其余工具一起取消'],
      ['<code>streaming_fallback</code>', '流式失败切备用模型', '「tool execution discarded」', '这一批作废重来'],
    ],
  )}
`)}

${section('06', '报错恢复：三次机会与一次升档', `
  <p>输出被截断（<code>max_output_tokens</code>）是最常见的「假失败」。它的处理分两级：</p>
  ${ev('query.ts', '1185-1205', `if (
  capEnabled &&
  maxOutputTokensOverride === undefined &&
  !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
) {
  logEvent('tengu_max_tokens_escalate', {
    escalatedTo: ESCALATED_MAX_TOKENS,
  })`, 'ESCALATED_MAX_TOKENS = 64_000（utils/context.ts:25）')}
  ${ev('query.ts', '1219-1227', `if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
  const recoveryMessage = createUserMessage({
    content:
      \`Output token limit hit. Resume directly — no apology, no recap of what you were doing. \` +
      \`Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.\`,
    isMeta: true,
  })`, 'MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3（query.ts:164）')}
  <p>这段恢复提示值得抄进任何长任务 Agent：<b>不要道歉、不要复述、从断点接上、把剩下的活切小</b>。它解决的是模型被截断后常见的「礼貌性重述」浪费。</p>
  ${stats([
    ['3', '输出截断后的恢复次数上限', 'query.ts:164'],
    ['64,000', '升档后的输出上限', 'utils/context.ts:25'],
    ['3', '连续压缩失败熔断阈值', 'autoCompact.ts:70'],
    ['10', '工具批的并发上限', 'toolOrchestration.ts'],
  ])}
`)}

${section('07', '十种收场方式', `
  <p><code>Terminal</code> 的取值就是产品行为的清单。把它列全，你会发现「结束」远不止一种：</p>
  ${table(
    ['reason', '含义', '谁会看到'],
    [
      ['<code>completed</code>', '正常完成（模型不再调用工具）', '所有人'],
      ['<code>max_turns</code>', '达到轮次上限', '脚本 / SDK 调用方'],
      ['<code>aborted_streaming</code>', '流式阶段被打断', '按 Esc 的用户'],
      ['<code>aborted_tools</code>', '工具执行阶段被打断', '同上'],
      ['<code>hook_stopped</code>', 'hook 主动终止', '配置了 hook 的团队'],
      ['<code>stop_hook_prevented</code>', 'Stop hook 不允许结束', '同上'],
      ['<code>prompt_too_long</code>', '压缩后仍然超限', '所有人（罕见）'],
      ['<code>model_error</code>', 'API 错误重试耗尽', '所有人'],
      ['<code>blocking_limit</code>', '上下文到硬上限', '所有人'],
      ['<code>image_error</code>', '图片处理失败', '贴图的用户'],
    ],
  )}
  ${note('', '<b>产品视角：</b>这份清单可以直接当「Agent 会话状态机」的需求文档用。大多数自研 Agent 只有「成功 / 报错」两态，所以一断线就只剩重开。')}
`)}
`,
  sources: [
    { label: 'query.ts（1,729 行）', note: '主循环、压缩链、错误恢复' },
    { label: 'services/tools/StreamingToolExecutor.ts（530 行）', note: '并发与中断' },
    { label: 'query/transitions.ts', note: '副本缺失此文件，终止原因从 query.ts 的 return 语句归纳' },
  ],
};
