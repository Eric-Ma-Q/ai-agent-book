import { section, ev, table, note, ul, stats, cards, analogy, tradeoff } from '../ui.mjs';

export const map = {
  no: '02',
  slug: '02-map',
  nav: '代码地图',
  kicker: '分层、入口与三种产品形态',
  title: '先看地图：谁在指挥谁',
  lead:
    '51 万行不是均匀分布的。五个目录装下了大部分复杂度：<code>utils/</code>、<code>components/</code>、<code>commands/</code>、<code>tools/</code>、<code>services/</code>。搞清楚它们的职责边界，后面每一章才不会读丢。',
  oneLine: '目录分工、启动链、REPL / 无头 / SDK 三种形态。',
  tldr: [
    '入口极薄：<code>entrypoints/cli.tsx</code> 只做参数与模式判断，真正的装配在 <code>main.tsx</code>（4,683 行）。',
    '同一个内核跑三种形态：交互式 REPL、无头 <code>print</code>（给脚本/CI）、SDK（给外部程序）。',
    '<code>components/</code> 389 个文件说明：终端 UI 不是附属品，它和内核一样重。',
    '复杂度集中在 <code>utils/</code>（564 个文件），这是「Agent 运行时」的真相：大量小机制，而不是一个大循环。',
    '89 个编译期开关 + 164 个账号分支意味着：你读到的代码是所有版本的并集。',
  ],
  body: () => `
${section('01', '五个目录，五种职责', `
  <p>下面这张表是本地副本的实测文件数（<code>find &lt;dir&gt; -type f | wc -l</code>）。注意 <code>tools/</code> 只有 184 个文件，却撑起全部对外能力；而 <code>utils/</code> 有 564 个，是真正的「运行时」。</p>
  ${table(
    ['目录', '文件数', '职责', '一句话理解'],
    [
      ['<code>utils/</code>', '564', '底层机制：消息、token、权限、shell、会话落盘、更新', '发动机与管线'],
      ['<code>components/</code>', '389', 'Ink/React 终端组件：消息流、输入框、对话框、状态栏', '仪表盘与中控台'],
      ['<code>commands/</code>', '207', '斜杠命令实现（101 个命令目录 + 共享模块）', '快捷键面板'],
      ['<code>tools/</code>', '184', '模型可调用的工具，一个目录一个工具', '机械臂'],
      ['<code>services/</code>', '130', 'API、压缩、MCP、遥测、OAuth、插件、策略', '外部世界的接口'],
      ['<code>hooks/</code>', '104', 'React hooks + 权限处理器 + 工具执行编排', '神经中枢'],
      ['<code>ink/</code>', '96', '自维护的终端渲染器（Ink 分支）', '显示驱动'],
      ['<code>bridge/</code>', '31', 'IDE / 远程会话桥接', '对外插口'],
      ['<code>skills/</code>', '20', 'Skill 的发现与加载', '可插拔知识'],
      ['<code>tasks/</code>', '12', '后台任务类型与生命周期', '排班表'],
      ['<code>buddy/</code>', '6', '彩蛋：终端宠物（见第 08 章）', '吉祥物'],
      ['<code>coordinator/</code>', '1', '协调者模式的上下文拼装', '工头'],
    ],
  )}
  ${note('', '<b>读法建议：</b>不要从 <code>main.tsx</code> 顺着读，会淹死。按「一次会话」的路径读：入口 → <code>QueryEngine</code> → <code>query.ts</code> → <code>StreamingToolExecutor</code> → 具体工具。这条链只有五个文件。')}
`)}

${section('02', '启动链：为什么入口这么薄', `
  <p><code>entrypoints/cli.tsx</code> 的第一屏就是性能优化：在加载重模块之前先打点、并行启动 MDM 读取与钥匙串预取。这段注释直接说明了动机 —— 把 135ms 的 import 时间和 65ms 的钥匙串读取藏到并行里。</p>
  ${ev('main.tsx', '1-12', `// These side-effects must run before all other imports:
// 1. profileCheckpoint marks entry before heavy module evaluation begins
// 2. startMdmRawRead fires MDM subprocesses (plutil/reg query) so they run in
//    parallel with the remaining ~135ms of imports below
// 3. startKeychainPrefetch fires both macOS keychain reads (OAuth + legacy API
//    key) in parallel — isRemoteManagedSettingsEligible() otherwise reads them
//    sequentially via sync spawn inside applySafeConfigEnvironmentVariables()
//    (~65ms on every macOS startup)`)}
  ${analogy('像赛车进站：不是等车停稳再分工，而是车还在滑行时，换胎、加油、擦镜片已经同时开始了。')}
  <p>这种「启动即并行」的写法在 CLI 产品里很典型：用户对「按下回车到出现光标」的容忍度只有几百毫秒，而 Agent 启动要读设置、读钥匙串、拉远端策略、预热模型能力表。Claude Code 的选择是<b>把能并行的全部提前</b>，把不能并行的延后到首次使用时。</p>
`)}

${section('03', '一个内核，三种产品形态', `
  <p>同一套 <code>query.ts</code> + 工具 + 权限，被包成三种对外形态。这解释了为什么它能同时是「终端工具」「CI 里的命令」和「别人产品里的引擎」。</p>
  ${table(
    ['形态', '入口', '典型场景', '交互假设'],
    [
      ['交互式 REPL', '<code>screens/REPL.tsx</code>（5,005 行）', '人在终端里边看边改', '有键盘、有确认弹窗、可中断'],
      ['无头 / 打印', '<code>cli/print.ts</code>（5,594 行）', '脚本、CI、批处理', '无交互，权限必须预先裁决'],
      ['SDK', '<code>entrypoints/sdk/</code>、<code>agentSdkTypes.ts</code>', '被别的程序调用', '结构化消息流，不做渲染'],
    ],
  )}
  ${ev('entrypoints/', '目录结构', `agentSdkTypes.ts   cli.tsx   init.ts   mcp.ts   sandboxTypes.ts   sdk/`, 'SDK 类型单独成文件，说明它是正式对外契约')}
  ${tradeoff(
    '一套内核三处复用，行为一致，测试只需覆盖一份逻辑。',
    '无头模式没有「问用户」这条退路，所有权限必须在事前表达清楚；这也是 <code>dontAsk</code> 模式存在的原因（见第 06 章）。',
  )}
`)}

${section('04', '体量与依赖：它其实是个前端项目', `
  <p>把 import 语句数一遍，会发现最常出现的不是 HTTP 客户端，而是 React —— 756 次；<code>bun:bundle</code> 被 import 196 次（其中 <code>feature()</code> 共出现 941 处）；<code>@anthropic-ai/sdk</code> 135 次；<code>zod/v4</code> 125 次。终端 UI 用 React 写、用自维护的 Ink 渲染，是这份代码最反直觉的工程决策之一。</p>
  ${stats([
    ['756', 'React import 次数', '含 components/hooks'],
    ['389', '界面组件文件', 'components/'],
    ['941', 'feature() 调用点', 'bun:bundle'],
    ['89', '不同的功能开关', '去重'],
  ])}
  ${note('good', '<b>为什么值得注意：</b>Agent 产品的复杂度大头不在「调模型」，而在「把流式输出、工具进度、权限询问、多任务状态同时渲染出来」。用 React 的声明式模型处理这种并发 UI，是它能快速迭代界面的原因。')}
`)}

${section('05', '编译期裁剪：一份代码，多个二进制', `
  <p><code>import { feature } from 'bun:bundle'</code> 不是运行时开关，而是<b>打包器的常量折叠</b>：<code>feature('X')</code> 在构建时被替换成 <code>true</code> 或 <code>false</code>，<code>false</code> 分支连同 import 一起被摇掉。所以泄露的源码里那些「没上线的功能」，在对外二进制里可能一行都不存在。</p>
  ${ev('query.ts', '115-121', `const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null`, '典型写法：条件 require + 类型断言，false 时整块被消除')}
  <p>另一层是按账号裁剪：<code>process.env.USER_TYPE === 'ant'</code> 在 164 个文件里出现，决定「内部员工版」是否加载某些工具、界面与实验能力。这两层叠起来，就是「读代码 ≠ 看线上」的根本原因。</p>
  ${table(
    ['裁剪层', '机制', '例子', '对读者的影响'],
    [
      ['编译期', '<code>feature()</code> 常量折叠', '<code>KAIROS</code>、<code>BUDDY</code>', '代码在，二进制里可能没有'],
      ['账号', '<code>USER_TYPE=ant</code>', '<code>ConfigTool</code>、<code>REPLTool</code>', '内部才有，外部永远看不到'],
      ['环境变量', '<code>process.env.*</code>', '<code>ENABLE_LSP_TOOL</code>', '手动开启即生效'],
      ['服务端', 'GrowthBook / 托管设置', '灰度、限额、killswitch', '代码里读不到最终值'],
    ],
  )}
`)}

${section('06', '一条推荐的阅读路径', `
  <p>如果你只有两小时，按这个顺序读，每一步都能独立跑通：</p>
  <ol>
    <li><code>tools.ts</code> 的 <code>getAllBaseTools()</code>：先知道它有哪些手。</li>
    <li><code>Tool.ts</code> 的类型定义：知道一只手有哪些关节（schema、权限、渲染、并发）。</li>
    <li><code>query.ts</code> 的 <code>queryLoop</code>：知道手是怎么被调用的。</li>
    <li><code>services/tools/StreamingToolExecutor.ts</code>：知道多只手怎么不打架。</li>
    <li><code>services/compact/autoCompact.ts</code>：知道干久了怎么不失忆。</li>
  </ol>
  <p>这五个文件加起来约 3,600 行，占全库不到 1%，却决定了产品 80% 的体验。</p>
`)}
`,
  sources: [
    { label: '本地副本目录统计：find / wc -l', note: '2026-10-29 实测' },
    { label: 'main.tsx、entrypoints/cli.tsx、cli/print.ts、tools.ts、Tool.ts', note: '行号见各节证据块' },
  ],
};
