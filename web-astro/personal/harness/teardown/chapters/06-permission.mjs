import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const permission = {
  no: '06',
  slug: '06-permission',
  nav: '权限',
  kicker: '从弹窗到流水线',
  title: '权限：每一次「能不能做」都有固定答案',
  lead:
    'Agent 产品最难的一课是「让它敢做，又不让它乱做」。Claude Code 的做法不是加弹窗，而是把审批做成一条固定顺序的流水线：规则、工具自检、模式、分类器、熔断，各就各位。',
  oneLine: '五种对外模式、十一步裁决、AI 分类器、沙箱边界与熔断。',
  tldr: [
    '对外只有五种权限模式；<code>auto</code> 要构建开关打开才存在，它用 AI 分类器替代弹窗，连续被拒 3 次或累计 20 次就退回「每次都问」。',
    '裁决顺序写死在代码里：deny 规则 → 工具自检 → 模式 → 允许规则 → 转成 ask。deny 永远优先，连绕过模式也绕不过。',
    '<code>dontAsk</code> 模式把所有「要问」直接变成「拒绝」—— 这是无头场景（CI）唯一可行的语义。',
    'OS 级沙箱不在 CLI 本体里，而是外部的 <code>@anthropic-ai/sandbox-runtime</code>；开沙箱后，Bash 可以「自动放行但受限执行」。',
    '企业侧可以从服务端下发策略，直接禁用远端会话、远程控制等功能 —— 代码里是 <code>isPolicyAllowed()</code> 这类开关。',
  ],
  body: () => `
${section('01', '五种对外模式，一种内部模式', `
  <p>模式决定的不是「能不能用工具」，而是「拿不准的时候怎么办」。命令行与设置只认五个对外模式；<code>auto</code> 要 <code>feature('TRANSCRIPT_CLASSIFIER')</code> 构建设置才存在，<code>bubble</code> 只活在类型层（子 Agent 把请求冒泡给父终端），不接受配置。</p>
  ${table(
    ['模式', '拿不准时', '典型使用者', '备注'],
    [
      ['<code>default</code>', '问用户', '所有人', '默认档'],
      ['<code>plan</code>', '只读探索，不改文件', '复杂任务开工前', '计划模式下禁止写'],
      ['<code>acceptEdits</code>', '文件编辑自动通过', '信任度高的日常开发', '命令仍要问'],
      ['<code>bypassPermissions</code>', '全部放行', '容器 / 一次性环境', '危险路径仍会拦（安全兜底）'],
      ['<code>dontAsk</code>', '直接拒绝', 'CI、无头脚本', '「问不了」就等价于「不行」'],
      ['<code>auto</code>', 'AI 分类器判定', '内部（ant）', '外部映射为 default'],
    ],
  )}
  ${ev('types/permissions.ts', '16-38', `export const EXTERNAL_PERMISSION_MODES = [
  'acceptEdits', 'bypassPermissions', 'default', 'dontAsk', 'plan',
] as const
export type InternalPermissionMode = ExternalPermissionMode | 'auto' | 'bubble'`, 'bubble 不在 INTERNAL_PERMISSION_MODES 里')}
  ${ev('utils/permissions/PermissionMode.ts', '41-98', `auto: {
  title: 'Auto mode',
  shortTitle: 'Auto',
  symbol: '⏵⏵',
  color: 'warning' as ModeColorKey,
  external: 'default' as ExternalPermissionMode,
},`, 'auto 模式对外的映射是 default —— 外部用户看到的是「询问」，不是「自动」')}
  ${analogy('像公司门禁：员工卡（规则）、楼层权限（模式）、保安复核（分类器）、以及「连续刷不开就叫人」（熔断）。四层各管一段，不是重复。')}
`)}

${section('02', '一次工具调用的十一步', `
  <p>这段代码的编号注释可以直接当规范读。<b>顺序本身就是安全边界</b>：把 deny 放在最前，是为了让任何后面的「放行」都不能翻案。</p>
  ${table(
    ['步骤', '检查什么', '结果'],
    [
      ['1a', '整工具被 deny 规则命中', '拒绝，终止'],
      ['1b', '整工具有 ask 规则', '转 ask（沙箱可自动放行的 Bash 除外）'],
      ['1c', '工具自己的 <code>checkPermissions()</code>', 'allow / deny / ask / passthrough'],
      ['1d', '工具明确拒绝', '拒绝，终止'],
      ['1e', '工具声明「必须人工交互」', '即使绕过模式也要问'],
      ['1f', '内容级 ask 规则（如 <code>Bash(npm publish:*)</code>）', '优先于绕过模式'],
      ['1g', '安全路径检查（.git/、.claude/、shell 配置）', '绕过模式下也要问'],
      ['2a', '模式是否允许（含 plan 模式下继承 bypass）', '允许，终止'],
      ['2b', '整工具被 allow 规则命中', '允许，终止'],
      ['3', '以上都不确定（passthrough）', '转成 ask'],
      ['4', 'ask 之后：dontAsk / auto / 交互处理器', '拒绝 / 分类器 / 弹窗'],
    ],
  )}
  ${ev('utils/permissions/permissions.ts', '1174-1186', `// 1. Check if the tool is denied
// 1a. Entire tool is denied
const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
if (denyRule) {
  return {
    behavior: 'deny',
    decisionReason: { type: 'rule', rule: denyRule },
    message: \`Permission to use \${tool.name} has been denied.\`,
  }
}`, 'deny 永远第一步')}
  ${note('good', '<b>可迁移结论：</b>审批顺序要写成显式的编号步骤，并有测试覆盖每一步。否则加一个新功能时，很容易把「deny 优先」破坏掉。')}
`)}

${section('03', 'auto 模式：用模型审模型', `
  <p><code>auto</code> 把「问用户」换成「问一个分类器」。分类器看到的是工具给它的精简输入（<code>toAutoClassifierInput()</code>），而不是完整文件内容 —— 既省 token，也避免把代码送进判定请求。</p>
  ${ev('utils/permissions/denialTracking.ts', '12-16', `export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20,
} as const`, '连续 3 次或累计 20 次被拒，退回人工确认')}
  <p>还有一个容易被忽略的细节：进入 auto 模式时，代码会把「等价于任意代码执行」的允许规则<b>剥掉</b>。比如 <code>Bash(python:*)</code> —— 允许它等于允许一切，分类器也就形同虚设。</p>
  ${ev('utils/permissions/dangerousPatterns.ts', '3-8', ` * An allow rule like \`Bash(python:*)\` or \`PowerShell(node:*)\` lets the model
 * run arbitrary code via that interpreter, bypassing the auto-mode classifier.
 * These lists feed the isDangerous{Bash,PowerShell}Permission predicates in
 * permissionSetup.ts, which strip such rules at auto-mode entry.`)}
  ${tradeoff(
    '日常操作不用每次点确认，长任务不会被人肉审批卡死。',
    '分类器会犯错：既可能放过危险命令，也可能误拒正常操作；所以要有「连续被拒就退回人工」的熔断，以及随时可切的模式。',
  )}
`)}

${section('04', '沙箱：不在这个仓库里', `
  <p>一个常见误解是「Claude Code 自带 OS 级沙箱」。源码给出的答案是：CLI 只做适配层，真正的隔离来自外部包 <code>@anthropic-ai/sandbox-runtime</code>（macOS 用 seatbelt，Linux 用 bubblewrap）。</p>
  ${ev('utils/sandbox/sandbox-adapter.ts', '1-20', `/**
 * Adapter layer that wraps @anthropic-ai/sandbox-runtime with Claude CLI-specific integrations.
 * This file provides the bridge between the external sandbox-runtime package and Claude CLI's
 * settings system, tool integration, and additional features.
 */
import type { ... } from '@anthropic-ai/sandbox-runtime'
import { SandboxManager as BaseSandboxManager, ... } from '@anthropic-ai/sandbox-runtime'`)}
  ${ul([
    '<b>沙箱开启后</b>，Bash 可以配置成「被沙箱包裹就自动放行」（<code>isAutoAllowBashIfSandboxed</code>）—— 用隔离换掉逐条确认；',
    '<b>被排除的命令</b>（需要网络、需要写系统目录）仍然要遵守 ask 规则；',
    '<b>依赖检查</b>：Linux/WSL 缺 bubblewrap 时给出安装提示，而不是静默降级。',
  ])}
  ${note('warn', '<b>结论：</b>如果你要抄它的安全模型，抄的是「权限流水线 + 外部沙箱适配」这个分层，而不是某个内置沙箱实现 —— 后者需要你自己接 OS 能力。')}
`)}

${section('05', '规则语法与作用域', `
  <p>规则是三态：<code>allow</code> / <code>deny</code> / <code>ask</code>，写进设置文件后按作用域合并：企业托管 → 用户 → 项目 → 本地 → 会话。语法上有几个必须知道的形状：</p>
  ${table(
    ['写法', '含义', '坑'],
    [
      ['<code>Bash(git:*)</code>', '所有以 git 开头的命令', '前缀匹配，不是正则'],
      ['<code>Bash(npm publish:*)</code>', '精确到子命令', '内容级 ask 优先于绕过模式'],
      ['<code>mcp__github</code>', '整个 MCP 服务器的工具', '等价于 <code>mcp__github__*</code>'],
      ['<code>Read(./src/**)</code>', '路径 glob', '越界与符号链接另有校验'],
    ],
  )}
  <p>规则被覆盖时，代码会主动检测「影子规则」并提示（<code>shadowedRuleDetection</code>）—— 因为一条被上层覆盖的 allow 规则，会让用户以为自己放行了，其实没有。</p>
`)}

${section('06', '企业控制面与紧急开关', `
  <p>两个独立通道：<b>策略限制</b>（能用什么功能）与<b>托管设置</b>（默认配置长什么样）。策略是「缺省即允许」的白名单式模型：只有被明确 block 的 key 才会拒绝。</p>
  ${ev('services/policyLimits/types.ts', '5-10', ` * Only blocked policies are included. If a policy key is absent, it's allowed.
restrictions: z.record(z.string(), z.object({ allowed: z.boolean() }))`)}
  <p>实际用到的 key 比如 <code>allow_remote_sessions</code>、<code>allow_remote_control</code>、<code>allow_product_feedback</code> —— 企业可以直接关掉「远程会话」这类能力，而不需要发版。</p>
  ${ev('utils/permissions/bypassPermissionsKillswitch.ts', '26-38', `export async function checkAndDisableBypassPermissionsIfNeeded(...) {
  // Check if bypassPermissions should be disabled based on Statsig gate
  // Do this only once, before the first query...
  const shouldDisable = await shouldDisableBypassPermissions()
  if (!shouldDisable) return
  setAppState(prev => ({ ...prev, toolPermissionContext: createDisabledBypassPermissionsContext(...) }))`, '启动时拉一次 gate，命中就把「绕过模式」从选项里拿掉')}
  ${note('', '<b>产品含义：</b>「安全」在这里是一个可远程调整的策略面，而不是一个写死的开关。好处是能应急；代价是用户看到的可用功能可能在某天突然消失。')}
`)}

${section('07', '三个容易误解的细节', `
  ${table(
    ['误解', '代码事实', '证据'],
    [
      ['hook 允许就等于放行', 'PreToolUse hook 的 allow 只是「不反对」，之后仍要过 deny / ask 规则；命中照样拒绝或弹窗', '<code>toolHooks.ts</code> 的 <code>checkRuleBasedPermissions</code>'],
      ['Bash 语义分类器在跑', '本构建里 <code>BASH_CLASSIFIER</code> 是 stub：<code>isClassifierPermissionsEnabled()</code> 恒 false', '<code>bashClassifier.ts</code>'],
      ['沙箱默认开着', '沙箱默认关闭（<code>sandbox.enabled ?? false</code>），开了才转调外部包，Linux 还需 bwrap/socat', '<code>sandbox-adapter.ts:459-467</code>'],
    ],
  )}
  <p>auto 模式的分类器调用也有明确参数：温度固定 0（要可复现），输出上限 4096 token，模型优先取内部配置、否则用主循环模型。它<b>不是</b>在规则层判断，而是一次独立的侧查询。</p>
`)}

${section('08', '这套设计的三条硬规则', `
  ${ul([
    '<b>拒绝不可被绕过</b>：deny 在第一步，连 <code>bypassPermissions</code> 都翻不了案；',
    '<b>不确定就降级</b>：分类器连续被拒就退回人工，而不是继续自动放行；',
    '<b>危险先于便利</b>：<code>.git/</code>、shell 配置文件这类路径，在任何模式下都要确认。',
  ])}
  ${stats([
    ['5 + 1', '对外模式 + auto', 'bubble 仅类型'],
    ['11', '裁决步骤（含子步）', 'permissions.ts 注释编号'],
    ['3 / 20', '连续 / 累计拒绝熔断', 'denialTracking.ts'],
    ['3', '策略 key 示例', 'remote sessions/control/feedback'],
  ])}
`)}
`,
  sources: [
    { label: 'utils/permissions/permissions.ts（52KB）', note: '裁决流水线' },
    { label: 'utils/permissions/PermissionMode.ts', note: '模式枚举' },
    { label: 'utils/sandbox/sandbox-adapter.ts', note: '外部沙箱适配' },
    { label: 'services/policyLimits/、bypassPermissionsKillswitch.ts', note: '企业策略与紧急开关' },
  ],
};
