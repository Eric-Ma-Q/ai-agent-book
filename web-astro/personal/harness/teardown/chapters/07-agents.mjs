import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const agents = {
  no: '07',
  slug: '07-agents',
  nav: '多 Agent',
  kicker: '分身的边界与代价',
  title: '多 Agent：什么时候开分身，分身听谁的',
  lead:
    '「多 Agent」很容易被讲成架构图，但代码里它其实是三个不同的东西：一次性的子 Agent、可后台运行的任务、以及共享一个终端的队友。三者的隔离程度、权限来源、失败方式都不一样。',
  oneLine: '子 Agent 契约、七种任务类型、swarm 三种后端与协调者模式。',
  tldr: [
    '<code>Agent</code> 工具的输入只有五个参数：说明、提示词、子类型、模型、是否后台。默认子类型是通用型。',
    '任务系统有七种类型：本地命令、本地 Agent、远端 Agent、进程内队友、本地工作流、MCP 监控、Dream（记忆整理）。',
    '子 Agent 可以继承父级上下文（fork），也可以全新开始；工具集按定义裁剪，权限模式跟随父级或 Agent 定义。',
    'swarm（队友）不是「多线程」，而是真的开终端窗格：支持进程内、tmux、iTerm2 三种后端，靠文件邮箱通信。',
    '协调者模式与 fork 互斥：协调者会换掉整套内置 Agent 名单，自己当调度员。',
  ],
  body: () => `
${section('01', '三个东西，别混为一谈', `
  ${table(
    ['形态', '怎么起', '活多久', '上下文', '典型用途'],
    [
      ['子 Agent', '<code>Agent</code> 工具', '一次调用内', '全新或 fork 父对话', '搜索、探索、独立验证'],
      ['后台任务', '<code>run_in_background</code>', '跨轮次，可断线恢复', '独立', '长命令、远端跑批'],
      ['队友（swarm）', '<code>TeamCreate</code> + 窗格', '整个团队会话', '共享团队目录与邮箱', '并行改不同模块'],
    ],
  )}
  ${analogy('外包、夜班、和开分部：外包干完就交付（子 Agent）；夜班明天还在（后台任务）；开分部要租办公室、拉专线、还要同步权限（swarm）。')}
`)}

${section('02', '子 Agent 的参数表', `
  ${ev('tools/AgentTool/AgentTool.tsx', '82-93', `const baseInputSchema = lazySchema(() => z.object({
  description: z.string(),
  prompt: z.string(),
  subagent_type: z.string().optional().describe('The type of specialized agent to use for this task'),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
  run_in_background: z.boolean().optional(),
}))`, '参数少是刻意的：子 Agent 的复杂度应该来自它的定义，而不是调用参数')}
  <p>除这五个基础字段，还有 <code>name</code>（可被 <code>SendMessage</code> 寻址）、<code>team_name</code>、<code>mode</code>（teammate 的权限模式）、<code>isolation</code>（worktree / remote）、<code>cwd</code>。其中 <code>run_in_background</code> 与 <code>cwd</code> 会按开关从 schema 里 <b><code>.omit()</code> 掉</b> —— 模型「看不见」这两个参数，而不是传了被忽略。</p>
  ${ev('tools/AgentTool/AgentTool.tsx', '110-125', `const schema = feature('KAIROS') ? fullInputSchema() : fullInputSchema().omit({ cwd: true })
return isBackgroundTasksDisabled || isForkSubagentEnabled()
  ? schema.omit({ run_in_background: true })
  : schema`, '同一个工具，在不同构建里有不同的参数表')}
  <p>内置 Agent 有六种：通用型、探索型、计划型、验证型、Claude Code 使用指南、状态栏配置。探索与计划两种受一个 A/B 门控制，说明「要不要给模型配专家」本身也在被实验。</p>
  ${table(
    ['内置 Agent', '职责', '工具边界'],
    [
      ['general-purpose', '默认子类型，什么都能干', '继承父级可用工具'],
      ['explore', '只读探索代码库，对外默认用 haiku', '禁用 Edit / Write / NotebookEdit'],
      ['plan', '出方案，不动手', '复用 explore 的工具集'],
      ['verification', '后台独立验证改动，产出 PASS / FAIL / PARTIAL', '禁用改文件，只读 + 跑测试'],
      ['claude-code-guide', '回答「这个功能怎么用」', '文档与帮助'],
      ['statusline-setup', '配置状态栏', '设置文件'],
    ],
  )}
  ${note('good', `<b>可迁移结论：</b>给子 Agent 定义「角色 + 工具禁用清单 + 模型档位」，比在 prompt 里写「你是一个只读的探索者」可靠得多。注意它的只读是靠 <code>disallowedTools</code> 实现的，而不是靠权限模式；对外用户的探索 Agent 还会降级到 haiku —— <b>用便宜模型干搜索，是成本设计的一部分</b>。`)}
`)}

${section('03', '隔离：继承什么，不继承什么', `
  <p>这里最容易出安全事故，而代码的答案比想象中复杂：<b>上下文可以继承，工具池会被重新组装，deny 规则照旧，但 Agent 定义可以自带更高的权限模式</b>。</p>
  ${ul([
    '<b>上下文</b>：fork 模式下子 Agent 继承父级完整对话与逐字节相同的系统提示；普通子 Agent 只拿到 prompt 与必要附件。',
    '<b>工具</b>：不是父级工具池的子集，而是用 <code>assembleToolPool()</code> 重新组装 —— 注释明说它「不受父级工具限制影响」。',
    `<b>权限</b>：规则（deny / ask / allow）随权限上下文继承，deny 仍在第一步生效；但模式取 <code>agent.permissionMode ?? 'acceptEdits'</code>。`,
    '<b>结果</b>：回灌的是子 Agent 的<b>最终文本全文</b>，不是摘要；过程消息不进父级上下文。',
  ])}
  ${ev('tools/AgentTool/AgentTool.tsx', '568-577', `assembleToolPool({
  ...parentContext.toolPermissionContext,
  mode: agent.permissionMode ?? 'acceptEdits',
})
// 注释原文：subagents "aren't affected by the parent's tool restrictions"`, '父级当前能用的工具不继承，但规则继承')}
  ${note('warn', `<b>一个真实的安全边界：</b>Agent 定义的 frontmatter 可以写 <code>permissionMode: bypassPermissions</code>，子 Agent 就会以绕过模式启动。deny 规则仍然拦得住，但「父级当前是 default、子级却是 bypass」这件事在设计上是被允许的 —— 使用第三方 Agent 定义前必须读它这一行。`)}
  ${tradeoff(
    '子 Agent 的过程不占父级上下文：一个「找代码」任务可能读 20 个文件，父级只收到最终结论全文。',
    '最终文本可能很长且丢细节；父级无法审计子 Agent 读过什么，除非翻它的 transcript；权限模式可被定义抬高。',
  )}
`)}

${section('04', '任务系统：七种类型，五个状态', `
  ${ev('Task.ts', '8-21', `export type TaskType =
  | 'local_bash'
  | 'local_agent'
  | 'remote_agent'
  | 'in_process_teammate'
  | 'local_workflow'
  | 'monitor_mcp'
  | 'dream'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed'`)}
  <p>把「任务」抽成统一类型，带来三个直接好处：UI 只需要一套任务面板；<code>TaskOutput</code> 可以增量读任意任务的输出；进程重启后能按 transcript 恢复未完成的任务。这也是为什么长任务不会因为关掉终端就全丢。</p>
  ${table(
    ['类型', '干什么', '谁能起'],
    [
      ['<code>local_bash</code>', '后台跑命令', 'Bash 工具（<code>run_in_background</code>）'],
      ['<code>local_agent</code>', '后台跑子 Agent', 'Agent 工具'],
      ['<code>remote_agent</code>', '在远端环境跑 Agent', '云会话 / RemoteTrigger'],
      ['<code>in_process_teammate</code>', '同进程里的队友', 'TeamCreate（进程内后端）'],
      ['<code>local_workflow</code>', '多步工作流脚本', 'Workflow 工具（flag）'],
      ['<code>monitor_mcp</code>', '监控 MCP 事件', 'Monitor 工具（flag）'],
      ['<code>dream</code>', '后台整理记忆', 'autoDream'],
    ],
  )}
`)}

${section('05', 'swarm：真的开窗格', `
  <p>队友模式的实现比想象中「土」但有效：它真的调 <code>tmux</code> 或 iTerm2 开窗格，每个队友是一个独立的 Claude 进程，靠<b>文件邮箱</b>通信。没有消息总线，没有共享内存。</p>
  ${ev('utils/swarm/constants.ts', '1-16', `export const TEAM_LEAD_NAME = 'team-lead'
export const SWARM_SESSION_NAME = 'claude-swarm'
export const SWARM_VIEW_WINDOW_NAME = 'swarm-view'
export const TMUX_COMMAND = 'tmux'
...
export function getSwarmSocketName(): string {
  return \`claude-swarm-\${process.pid}\`
}`, '独立 socket + 带 PID 的会话名，避免和用户自己的 tmux 打架')}
  ${table(
    ['后端', '怎么跑', '优点', '限制'],
    [
      ['进程内', '同一进程里起 runner', '快、无终端依赖', '不能开后台 Agent；权限要回问 leader'],
      ['tmux', '开 tmux 窗格', '独立进程、可观察', '需要 tmux；窗口管理麻烦'],
      ['iTerm2', '开 iTerm2 分屏', 'macOS 体验好', '仅 macOS + iTerm2'],
    ],
  )}
  <p>权限是这里最微妙的部分：进程内队友遇到需要审批的操作，会<b>把请求发到 leader 的邮箱</b>，然后每 500ms 轮询自己的邮箱等答复。leader 不在或界面不可用时，还有一条降级路径。</p>
  ${ev('utils/swarm/inProcessRunner.ts', '124-126', ` * Falls back to the mailbox system when the bridge is unavailable:
 * sends a permission request to the leader's inbox, waits for the response
 * in the teammate's own mailbox.`)}
  ${note('', `<b>一个实现缺口：</b><code>tasks.ts</code> 的注册表没有登记 <code>in_process_teammate</code>，所以 <code>TaskStop</code> 对队友会返回 <code>unsupported_type</code>；界面上的「停」是绕过注册表直接调 <code>kill()</code> 的。这类不一致正是「先有 UI 后有统一模型」的痕迹。`)}
`)}

${section('06', '协调者模式：换一套班子', `
  <p>协调者模式（<code>COORDINATOR_MODE</code>）不是「多一个 Agent」，而是<b>换掉内置 Agent 名单</b>：开启后 <code>getBuiltInAgents()</code> 返回的是协调者专用的 worker 集合，主 Agent 变成调度员。它与 fork 互斥 —— 两者都想当「唯一的编排者」。</p>
  ${ev('tools/AgentTool/builtInAgents.ts', '38-46', `// Use lazy require inside the function body to avoid circular dependency
// issues at module init time. The coordinatorMode module depends on tools
if (feature('COORDINATOR_MODE')) {
  if (isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)) {
    const { getCoordinatorAgents } = require('../../coordinator/workerAgent.js')
`, '用一个环境变量切换整套班子')}
  <p>与它相对的 fork 模式则相反：不换班子，而是让子 Agent <b>继承父级完整消息、逐字节相同的系统提示与工具表</b>，权限模式用 <code>bubble</code>（把审批冒泡回父终端），默认 <code>maxTurns: 200</code>。为了让缓存命中，fork 会把父级所有未完成的 <code>tool_use</code> 统一回一个占位结果。</p>
  ${note('', '<b>产品视角：</b>「多 Agent」不是越多越好。协调者模式存在的理由，是把「拆任务、分派、汇总」从主循环里拿出来，交给一个专职角色 —— 代价是多一层上下文传递；fork 的代价则是上下文翻倍。')}
`)}

${section('07', '失败模式：分身最容易在哪里翻车', `
  ${table(
    ['失败', '代码里的表现', '设计上的应对'],
    [
      ['队友再开后台任务', '进程内队友调 <code>run_in_background: true</code> 直接抛错', '明确禁止，避免任务树无限深'],
      ['权限请求没人接', 'leader 界面不可用', '降级到邮箱轮询'],
      ['子 Agent 卡死', '任务一直 running', '<b>只对 shell 有 45 秒检测；子 Agent 没有看门狗</b>'],
      ['上下文爆炸', '子 Agent 读太多文件', '工具结果预算 + 只回灌结论'],
      ['结果丢失', '后台任务跨重启', 'transcript 落盘，按 <code>TaskOutput</code> 增量读'],
      ['前台任务拖住整轮', '子 Agent 一直不返回', '可选「120 秒后自动转后台」'],
    ],
  )}
  ${stats([
    ['7', '任务类型', 'Task.ts'],
    ['3', 'swarm 后端', '进程内 / tmux / iTerm2'],
    ['6', '内置 Agent', '含 2 个受 A/B 门控制'],
    ['500ms', '队友邮箱轮询间隔', 'inProcessRunner.ts'],
  ])}
`)}
`,
  sources: [
    { label: 'tools/AgentTool/（AgentTool.tsx、runAgent.ts、builtInAgents.ts、forkSubagent.ts）', note: '子 Agent 契约' },
    { label: 'Task.ts、tasks/', note: '任务类型与生命周期' },
    { label: 'utils/swarm/（constants.ts、backends/、inProcessRunner.ts）', note: '队友与邮箱' },
    { label: 'coordinator/coordinatorMode.js', note: '协调者模式' },
  ],
};
