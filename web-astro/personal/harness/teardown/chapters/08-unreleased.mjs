import { section, ev, table, note, ul, stats, analogy } from '../ui.mjs';

export const unreleased = {
  no: '08',
  slug: '08-unreleased',
  nav: '未发布功能',
  kicker: 'flag 背后的东西',
  title: '未发布功能：能证实的、只能看到接线的、以及被夸大的',
  lead:
    '泄露之后，二手文章把 KAIROS、BUDDY、ULTRAPLAN 讲成了「即将上线的大招」。按代码分级看，它们处在完全不同的完成度：有的能跑、有的只剩接线、有的连实现都不在副本里。这一章只写能验证的部分。',
  oneLine: '89 个编译期开关、KAIROS / BUDDY / ULTRAPLAN / undercover 的真实状态。',
  tldr: [
    '代码里共有 89 个不同的 <code>feature()</code> 开关，出现最多的是 KAIROS（约 150 处引用，不同正则口径在 154–156 之间），但这不等于「功能完整」。',
    'BUDDY 是完整可读的彩蛋：基于用户 ID 的确定性抽卡、18 种物种、稀有度与 ASCII 精灵图。',
    'ULTRAPLAN 是可验证的远端计划模式：把 plan 跑在远端会话里，每 3 秒轮询，最长 30 分钟，再把方案「传送」回本地。',
    'KAIROS 就是「assistant mode」：长期在线的会话、<code>claude daemon</code> 常驻进程、以及只当客户端的远端会话三种形态；但它的入口模块不在包里，只能看到接线与状态位。',
    'undercover 模式确实存在且只对内部账号生效：自动检测是否在公开仓库，强制抹掉 AI 署名与模型代号，且没有强制关闭开关。',
  ],
  body: () => `
${section('01', '先看 flag，再看实现', `
  <p><code>feature()</code> 是编译期常量，所以「出现次数」只说明它被多少处代码引用，<b>不说明功能完成度</b>。把三类证据分开看，才不会把「接线」当成「产品」。</p>
  ${table(
    ['证据等级', '含义', '例子'],
    [
      ['实现可读', '有完整逻辑、数据结构、UI', 'BUDDY、undercover、ULTRAPLAN'],
      ['只有接线', '主入口 import 了，但核心文件缺失', 'KAIROS（<code>assistant/index.ts</code> 不在副本）'],
      ['只有命名', '只剩常量、tag、注释', '部分 channels / webhook 子能力'],
    ],
  )}
  ${stats([
    ['89', '不同的 feature 开关', '去重计数'],
    ['≈150', 'KAIROS 引用次数', '最高'],
    ['107', 'TRANSCRIPT_CLASSIFIER', 'auto 模式分类器'],
    ['51 / 46 / 45', 'TEAMMEM / VOICE / BASH_CLASSIFIER', '引用次数'],
  ])}
`)}

${section('02', 'BUDDY：一只确定性的终端宠物', `
  <p>完整度最高、也最像彩蛋。它用 <code>Mulberry32</code> 伪随机数、以用户 ID 加盐做种子 —— 同一个人永远是同一只，换设备也不变。</p>
  ${ev('buddy/companion.ts', '11-27', `// Mulberry32 — tiny seeded PRNG, good enough for picking ducks
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}`)}
  <p>种子里的盐是 <code>'friend-2026-401'</code> —— 指向 2026 年 4 月 1 日，基本可以确认它是愚人节彩蛋演化成的常驻宠物。数据侧有 18 种物种、5 档稀有度（权重 60 / 25 / 10 / 4 / 1，另加 1% 闪光）、6 种眼睛、8 种帽子、五项属性（调试力 / 耐心 / 混乱 / 智慧 / 毒舌）。属性不落盘，每次都按用户 ID 重算。</p>
  <p>提示词里明确写了「它不是 Claude，是一个旁观的观察者」，用户叫它名字时气泡会回话，主模型要让位。</p>
  ${ev('buddy/prompt.ts', '8-12', `A small \${species} named \${name} sits beside the user's input box and occasionally
comments in a speech bubble. You're not \${name} — it's a separate watcher.
When the user addresses \${name} directly (by name), its bubble will answer.`)}
  ${note('', `<b>判断：</b>BUDDY 在外部构建里被 <code>feature('BUDDY')</code> 整段裁掉（每个导出函数开头都有 <code>if (!feature('BUDDY')) return</code>）。它是内部彩蛋，不是「即将发布的功能」。二手文章说它是「愚人节玩笑」也缺乏证据 —— 代码里没有日期逻辑。`)}
`)}

${section('03', 'ULTRAPLAN：把计划跑在远端', `
  <p>这是本副本里最「产品化」的未发布功能：<code>/ultraplan</code> 把 plan 模式搬到远端会话执行，本地每 3 秒轮询一次，等远端批准的 <code>ExitPlanMode</code> 结果，再把方案文本抓回本地。</p>
  ${ev('utils/ultraplan/ccrSession.ts', '1-6、24-26', `// CCR session polling for /ultraplan. Waits for an approved ExitPlanMode
// tool_result, then extracts the plan text. Uses pollRemoteSessionEvents
// (shared with RemoteAgentTask) for pagination + typed SDKMessage[].
const POLL_INTERVAL_MS = 3000
// A 30min poll makes ~600 calls; at any nonzero 5xx rate one blip would kill the run.
const MAX_CONSECUTIVE_FAILURES = 5`, '30 分钟 / 3 秒 ≈ 600 次轮询，所以要有连续失败容忍')}
  ${ul([
    '<b>为什么要远端</b>：计划阶段可能很长（读大量文件、跑探索命令），放到远端不占本地终端，也不打断本地工作。',
    '<b>「传送」机制</b>：方案批准后不是复制文本，而是通过一个哨兵字符串从远端工具结果里刮出来，再在本地重放。',
    '<b>代价</b>：依赖远端会话与网络，30 分钟内网络抖动要靠重试策略兜住。',
  ])}
`)}

${section('04', 'KAIROS：一个名字，三种形态', `
  <p>二手文章把它说成「常驻后台的自主代理」，方向没错但不够准。代码里 KAIROS 是<b>assistant mode 的总开关</b>，共享同一个状态位 <code>kairosActive</code>，有三种用法：</p>
  ${table(
    ['形态', '怎么进', '做什么', '证据'],
    [
      ['会话形态', '<code>--assistant</code> 或设置里 <code>assistant: true</code>', '强制开启 brief 模式、置 <code>kairosActive</code>、初始化常驻团队', '<code>main.tsx:1048-1088</code>'],
      ['进程形态', '<code>claude daemon</code> + <code>--daemon-worker</code>', '长驻 supervisor 把活拆给子进程；cron 任务在其中串行跑', '<code>entrypoints/cli.tsx:97-106、164-177</code>'],
      ['客户端形态', '<code>claude assistant [sessionId]</code>', '本地只做「观看者」：循环在远端跑，本地只收事件、发消息', '<code>main.tsx:3259-3266</code>'],
    ],
  )}
  ${ev('main.tsx', '1049-1057', `if (feature('KAIROS') && (options as {assistant?: boolean}).assistant && assistantModule) {
  assistantModule.markAssistantForced()
}
kairosEnabled = assistantModule.isAssistantForced() || (await kairosGate.isKairosEnabled())
if (kairosEnabled) { opts.brief = true; setKairosActive(true); ... }`, '三条入口殊途同归：打开同一个状态位')}
  <p>但 <code>assistant/index.ts</code> 与 <code>gate.ts</code> 都不在这个副本里，<code>assistant/</code> 下只有一个 <code>sessionHistory.ts</code>。所以「常驻代理具体怎么调度」仍然只能存疑。</p>
  ${note('warn', '<b>结论要说清：</b>「KAIROS 是 assistant mode，且有会话/进程/客户端三种形态」是 A 级（调用点与参数可读）；「它会自己找活干、永远在线」是 C 级（来自二手解读）。')}
`)}

${section('05', 'undercover：真实存在的「隐身模式」', `
  <p>这是泄露里最值得产品与合规同时看的一段。它是内部账号专用（<code>USER_TYPE === 'ant'</code>），<b>默认开启</b>：除非能确证当前仓库在内部白名单里，否则一律按「在公开仓库」处理。</p>
  ${ev('utils/undercover.ts', '7-18', ` * Activation:
 *   - CLAUDE_CODE_UNDERCOVER=1 — force ON (even in internal repos)
 *   - Otherwise AUTO: active UNLESS the repo remote matches the internal
 *     allowlist (INTERNAL_MODEL_REPOS in commitAttribution.ts). Safe default
 *     is ON ...
 *   - There is NO force-OFF. This guards against model codename leaks`)}
  <p>它是「双保险」：一层在代码里<b>把 commit / PR 的署名整体清空</b>（<code>utils/attribution.ts</code>），另一层在提示词里禁止模型写内部信息 —— 内部模型代号（Capybara、Tengu）、未发布版本号、内部仓库名、Slack 频道、<b>「Claude Code」字样与任何 AI 署名</b>，以及 <code>Co-Authored-By</code>；系统提示里的模型名也会被抹掉。提示词给了正反例，要求「像人类开发者那样写提交信息」。</p>
  ${ev('utils/undercover.ts', '31-45', `NEVER include in commit messages or PR descriptions:
- Internal model codenames (animal names like Capybara, Tengu, etc.)
- Unreleased model version numbers (e.g., opus-4-7, sonnet-4-8)
- Internal repo or project names ...
- The phrase "Claude Code" or any mention that you are an AI
- Co-Authored-By lines or any other attribution`)}
  ${note('warn', '<b>产品与合规视角：</b>这个功能的目标是「避免内部信息泄露」，副作用是「让 AI 参与的事实不可见」。它在外部构建里被整段裁掉，所以普通用户不受影响；但这段设计本身值得在任何「AI 代写代码」的产品评审里被讨论。')}
`)}

${section('06', '其余 flag：一句话清单', `
  ${table(
    ['flag', '代码里能看到的', '完成度'],
    [
      ['<code>TRANSCRIPT_CLASSIFIER</code>', 'auto 权限模式与安全分类器', '可用（内部）'],
      ['<code>VOICE_MODE</code>', '语音输入、按键绑定、STT 流', '较完整'],
      ['<code>BRIDGE_MODE</code>', 'IDE / 远程控制桥', '较完整'],
      ['<code>PROACTIVE</code>', '主动建议（Brief 工具等）', '部分'],
      ['<code>TEAMMEM</code>', '团队共享记忆', '部分'],
      ['<code>LODESTONE</code>', '仅见常量与设置项', '存疑'],
      ['<code>CHICAGO_MCP</code>', 'Computer Use 的清理钩子', '部分'],
    ],
  )}
  <p>代码里还留着几张「下一代型号」的名牌：</p>
  ${table(
    ['代号', '代码里的位置', '能确认什么'],
    [
      ['<code>capybara</code>', '<code>utils/model/model.ts</code> 注释（模型名脱敏示例）', '当前内部主力型号的代号'],
      ['<code>numbat</code>', '<code>constants/prompts.ts:402</code> 的 <code>@[MODEL LAUNCH]</code> 标记', '一个尚未发布、待上线时删除专门提示段的型号'],
      ['<code>fennec</code>', '<code>migrations/migrateFennecToOpus.ts</code>', '已下线，迁移脚本把旧别名指到 Opus'],
      ['opus-4-7 / sonnet-4-8', '只在 undercover 的「反例清单」里出现', '不代表已发布，只是禁止写出的示例'],
    ],
  )}
  ${analogy('把 flag 想成装修时的预留管线：有的已经装了龙头（可用），有的只留了接口（接线），有的只在地上画了个圈（命名）。泄露让你看到的是整栋楼的管线图，不是每间房都能住人。')}
`)}
`,
  sources: [
    { label: 'buddy/（companion.ts、prompt.ts、types.ts）', note: '终端宠物' },
    { label: 'utils/ultraplan/ccrSession.ts', note: '远端计划' },
    { label: 'utils/undercover.ts', note: '隐身模式' },
    { label: 'main.tsx、commands.ts', note: 'KAIROS 接线' },
    { label: 'feature() 计数：grep -rho "feature(\'[A-Z_0-9]*\')"', note: '89 个去重' },
  ],
};
