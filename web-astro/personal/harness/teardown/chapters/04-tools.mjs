import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const tools = {
  no: '04',
  slug: '04-tools',
  nav: '工具系统',
  kicker: '模型能碰到世界的全部方式',
  title: '工具：一个接口，四十七个槽位',
  lead:
    '工具是 Agent 与世界的唯一接口。Claude Code 把「一只手」定义成一个 47 字段的对象 —— 从输入 schema、权限自检、并发安全，到终端里怎么画、失败时怎么解释。这一章讲清这个契约，以及它为什么值得抄。',
  oneLine: '47 个字段的契约、两级结果预算、工具搜索与 MCP 并入。',
  tldr: [
    '<code>Tool</code> 不只是一个函数：它自带 schema、权限判断、并发声明、结果上限、终端渲染，甚至给安全分类器看的摘要。',
    '注册表里共 54 个工具名，默认常开 19 个；其余按编译期开关（16）、环境变量（5）、账号类型（4）、运行时开关（10）分层打开。',
    '工具结果超过阈值会落盘：单工具硬上限 5 万字符，单条消息内全部结果合计 20 万字符；模型只看到 2KB 预览 + 文件路径。',
    '工具太多会挤占上下文：超过窗口 10% 就启用「工具搜索」，把冷门工具的 schema 延后加载。',
    'MCP 工具按 <code>mcp__server__tool</code> 命名，权限规则可以直接按服务器前缀整组放行或拒绝。',
  ],
  body: () => `
${section('01', '一个工具，47 个槽位', `
  <p><code>Tool.ts</code> 里的类型定义是整份代码最值得当「接口设计教材」看的部分：47 个字段（33 个可选、14 个必填），把一只手的全部行为拆成互不依赖的小方法，其中 14 个字段专门负责 UI 渲染。</p>
  ${table(
    ['槽位组', '代表字段', '解决什么问题'],
    [
      ['身份', '<code>name</code>、<code>aliases</code>、<code>searchHint</code>', '重命名兼容、工具搜索的关键词'],
      ['输入', '<code>inputSchema</code>（Zod）、<code>inputJSONSchema</code>', '模型输出必须能验证；MCP 用 JSON Schema'],
      ['执行', '<code>call()</code>、<code>validateInput()</code>', '真正干活；先校验再跑'],
      ['权限', '<code>checkPermissions()</code>、<code>requiresUserInteraction()</code>', '工具自己最懂自己的风险'],
      ['上下文经济', '<code>maxResultSizeChars</code>、<code>shouldDefer</code>、<code>alwaysLoad</code>', '别让一次输出撑爆窗口'],
      ['并发', '<code>isConcurrencySafe()</code>、<code>interruptBehavior()</code>', '能不能并行、被打断时听谁的'],
      ['渲染', '<code>renderToolUseMessage</code>、<code>getActivityDescription</code>', '终端里怎么显示「正在干什么」'],
      ['安全', '<code>toAutoClassifierInput()</code>、<code>isReadOnly()</code>', '给自动审批分类器看的精简输入'],
    ],
  )}
  ${ev('Tool.ts', 'Tool 类型（节选）', `isConcurrencySafe(input): boolean
isEnabled(): boolean
isReadOnly(input): boolean
/** Defaults to false. Only set when the tool performs irreversible operations. */
isDestructive?(input): boolean
/** 'cancel' — stop and discard; 'block' — keep running, the new message waits */
interruptBehavior?(): 'cancel' | 'block'`)}
  ${note('good', '<b>为什么把渲染放进工具：</b>每种工具的「进度」长得完全不同 —— Bash 要显示行尾输出、Edit 要显示 diff、Agent 要显示子任务树。集中式渲染会变成巨型 switch；放进工具后，新增工具不需要改 UI。')}
`)}

${section('02', '到底有多少只手', `
  <p><code>tools/</code> 目录有 43 个条目（含 <code>shared/</code>、<code>utils.ts</code>），但注册表 <code>getAllBaseTools()</code> 里真正默认常开的是 19 个。其余按条件注册：</p>
  ${table(
    ['分组', '默认常开', '条件注册（举例）'],
    [
      ['文件', 'Read、Edit、Write、NotebookEdit', 'LSP（<code>ENABLE_LSP_TOOL</code>）'],
      ['搜索', 'Glob、Grep（内嵌 rg 时移除）', 'ToolSearch（超阈值时）'],
      ['执行', 'Bash', 'PowerShell（Windows）、REPL（内部）'],
      ['网络', 'WebFetch、WebSearch', 'WebBrowser（flag）'],
      ['任务', 'TodoWrite、TaskStop、TaskOutput', 'TaskCreate/Get/Update/List（Todo v2）'],
      ['协作', 'Agent、SendMessage、AskUserQuestion', 'TeamCreate/Delete（swarm）、ListPeers'],
      ['其他', 'Skill、EnterPlanMode、ExitPlanMode、Brief、MCP 资源读取', 'Config/Tungsten（内部）、cron、Monitor、Sleep'],
    ],
  )}
  ${ev('tools.ts', '193-205', `export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // Ant-native builds have bfs/ugrep embedded in the bun binary (same ARGV0
    // trick as ripgrep). When available, find/grep in Claude's shell are aliased
    // to these fast tools, so the dedicated Glob/Grep tools are unnecessary.
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),`, '连「要不要暴露 Glob/Grep」都做了运行时判断')}
  ${analogy('像瑞士军刀：出厂只装 19 件常用工具，其余刀片按需卡上去；装太多会让刀变厚（上下文变贵）。')}
`)}

${section('03', '结果预算：十万字符之后会发生什么', `
  <p>一次 <code>cat</code> 大文件、一次全量测试输出，都可能把上下文一次性打满。做法是给每个工具设上限，超了就<b>落盘</b>，模型只拿到预览与路径，需要时再读。注意有一条<b>系统级硬顶</b>：工具自己声明的值只能更低，不能更高（<code>min(声明值, 50000)</code>）。
  ${ev('Tool.ts', 'maxResultSizeChars 注释', `/**
 * Maximum size in characters for tool result before it gets persisted to disk.
 * When exceeded, the result is saved to a file and Claude receives a preview
 * with the file path instead of the full content.
 *
 * Set to Infinity for tools whose output must never be persisted (e.g. Read,
 * where persisting creates a circular Read→file→Read loop...)
 */`)}
  ${stats([
    ['50,000', '单工具字符硬上限（系统级）', 'toolLimits.ts:13'],
    ['200,000', '单条消息内结果合计上限', 'toolLimits.ts:49'],
    ['2,000', '落盘后的预览字节数', 'toolResultStorage.ts:109'],
    ['∞', 'Read 不落盘（防循环）', 'FileReadTool.ts:342'],
  ])}
  ${tradeoff(
    '上下文不被单次输出撑爆，长任务能继续；模型仍可通过路径回读。',
    '多一次「读文件」往返，且模型可能忘记自己只看到预览 —— 所以预览里带 <code>&lt;persisted-output&gt;</code> 标记。',
  )}
`)}

${section('04', '工具搜索：把冷门工具藏起来', `
  <p>MCP 接三个服务器，工具描述就可能吃掉几千 token。默认模式下（环境变量未设）工具搜索就是开的：仓库里有 26 个内置工具显式标了 <code>shouldDefer: true</code>，MCP 工具一律延后加载。只有当配置成 <code>auto:N</code> 时，阈值才是「上下文窗口的 N%」（默认 10%）。</p>
  ${ev('utils/toolSearch.ts', '47-49', `* Can be overridden via ENABLE_TOOL_SEARCH=auto:N where N is 0-100.
const DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE = 10 // 10%`, '阈值按上下文窗口百分比算，可被环境变量覆盖')}
  ${ev('Tool.ts', 'shouldDefer / alwaysLoad 注释', `/** When true, this tool is deferred (sent with defer_loading: true) and requires
 *  ToolSearch to be used before it can be called. */
readonly shouldDefer?: boolean
/** When true, this tool is never deferred — its full schema appears in the
 *  initial prompt even when ToolSearch is enabled. */`)}
  <p>代价也很真实：这是一项 API 侧的 beta 能力（<code>tool_reference</code> 内容块），第三方网关常直接 400；代码里专门为此写了一长段降级判断，还留了 issue 编号。连 <code>haiku</code> 这类不支持该能力的模型也被排除在自动模式外。</p>
`)}

${section('05', '权限在工具侧：四种回答', `
  <p>全局权限引擎会先查规则，再把决定权交给工具自己的 <code>checkPermissions()</code>。工具只能回答四件事：</p>
  ${table(
    ['回答', '含义', '典型场景'],
    [
      ['<code>allow</code>', '我认为这个输入没问题', '<b>默认实现</b>：交给上层规则判断'],
      ['<code>ask</code>', '需要用户确认', '写文件、危险命令'],
      ['<code>deny</code>', '明确拒绝', '命中禁止路径（.git/、shell 配置）'],
      ['<code>passthrough</code>', '我不判断，交给上层', '少数工具；最终会被改写成 ask'],
    ],
  )}
  ${ev('utils/permissions/permissions.ts', '1195-1206', `let toolPermissionResult: PermissionResult = {
  behavior: 'passthrough',
  message: createPermissionRequestMessage(tool.name),
}
try {
  const parsedInput = tool.inputSchema.parse(input)
  toolPermissionResult = await tool.checkPermissions(parsedInput, context)
} catch (e) { ... }`, 'schema 解析失败就不问工具，直接 passthrough → 最终变成 ask')}
  ${ev('Tool.ts', '757-769', `const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: unknown) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: (input, _ctx?) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),`, '默认「允许」不是放行，而是「交给通用权限系统」')}
  ${note('', '<b>设计要点：</b>工具自己判断「具体输入」的风险，比全局规则更准（<code>rm -rf /</code> 与 <code>ls</code> 都是 Bash）。但工具不能推翻 deny 规则 —— 顺序在第 06 章。')}
`)}

${section('06', 'MCP：外部工具怎么并进来', `
  <p>MCP 工具在运行时被包成普通 <code>Tool</code>，命名规则是 <code>mcp__&lt;server&gt;__&lt;tool&gt;</code>。这让权限规则可以整组生效：</p>
  ${ev('utils/permissions/permissions.ts', '247-259', `// MCP tools are matched by their fully qualified mcp__server__tool name. In
// addition a rule "mcp__server1" matches every tool from server1, and the
// wildcard "mcp__server1__*" does the same.`)}
  ${ul([
    '<b>鉴权</b>：OAuth 流程由 <code>McpAuthTool</code> 与 <code>services/mcp</code> 处理，token 存本机；',
    '<b>降级</b>：连接失败不影响主流程，工具从池里移除并提示；',
    '<b>控制上下文</b>：MCP 工具默认参与「工具搜索」的按需加载，可用 <code>_meta[&quot;anthropic/alwaysLoad&quot;]</code> 强制常驻。',
  ])}
  ${note('good', '<b>可迁移结论：</b>把「外部工具」和「内置工具」放在同一个接口下，是这套设计最省事的地方 —— 权限、渲染、预算、并发全部自动继承。')}
`)}
`,
  sources: [
    { label: 'Tool.ts（792 行）', note: '工具契约' },
    { label: 'tools.ts（389 行）', note: '注册表与过滤' },
    { label: 'utils/toolResultStorage.ts、utils/toolSearch.ts', note: '结果预算与按需加载' },
    { label: 'utils/permissions/permissions.ts', note: 'MCP 命名与规则匹配' },
  ],
};
