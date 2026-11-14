import { section, ev, table, note, ul, stats, analogy, tradeoff } from '../ui.mjs';

export const business = {
  no: '09',
  slug: '09-business',
  nav: '遥测与远程',
  kicker: '看不见的那一半产品',
  title: '遥测与远程控制：产品在你机器上的另一半',
  lead:
    '一个装在本地的 CLI，为什么能远程改行为？因为它在启动时拉配置、在运行中传事件、在紧急时接受开关。这一章把「遥测发了什么、能关吗、服务端能改什么」讲清楚 —— 顺便纠正一个流传很广的说法。',
  oneLine: '659 个遥测事件、隐私三档、GrowthBook 灰度、版本与权限的远程开关。',
  tldr: [
    `代码里有 659 个不同的 <code>logEvent(&#39;tengu_…&#39;)</code> 事件名（以 <code>tengu_</code> 开头的字符串共 903 个，多出来的是灰度开关名），路由到 Datadog 与一方事件服务，是否发送还受采样与开关控制。`,
    '遥测<b>可以关</b>：<code>DISABLE_TELEMETRY</code> 关分析，<code>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC</code> 关掉全部非必要流量（含自动更新）。二手文章说「无法退出」不准确。',
    '服务端下发两类东西：<b>策略</b>（能不能用某功能）与<b>托管设置</b>（默认配置），后者支持会话中热更新。',
    '远程开关能做到：禁用绕过权限模式、强制最低版本、在事故期间封顶版本、暂停某条遥测管道。',
    '订阅限额在代码里是四个窗口：5 小时、7 天、7 天 Opus、7 天 Sonnet。',
  ],
  body: () => `
${section('01', '遥测：发了什么，能不能关', `
  <p>事件统一走 <code>logEvent(name, metadata)</code>，元数据只允许布尔/数字/字符串，而且类型上做了个「防呆标记」：凡是字符串字段必须显式标注「我确认这不是代码或文件路径」。这是用类型系统防隐私事故的少见做法。</p>
  ${ev('services/analytics/index.ts', '133-140', `export function logEvent(
  eventName: string,
  // intentionally no strings unless AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  // to avoid accidentally logging code/filepaths
  metadata: LogEventMetadata,
): void {`, '把「不要记录代码」写进类型系统，而不是写进规范文档')}
  <p>隐私等级是三档叠加，取最严格的那个：</p>
  ${table(
    ['等级', '怎么触发', '关掉什么'],
    [
      ['default', '无设置', '什么都不关'],
      ['no-telemetry', '<code>DISABLE_TELEMETRY=1</code>', '分析、一方事件、反馈问卷'],
      ['essential-traffic', '<code>CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1</code>', '遥测 + 自动更新 + 版本说明 + 模型能力表等全部非必要请求'],
    ],
  )}
  ${ev('utils/privacyLevel.ts', '1-13', ` * Privacy level controls how much nonessential network traffic and telemetry
 * Claude Code generates.
 * Levels are ordered by restrictiveness:
 *   default < no-telemetry < essential-traffic`)}
  ${note('good', '<b>纠错：</b>泄露后不少分析说「遥测无法关闭」。代码里明确有两条退出路径，而且最严格那档连自动更新都会停。真正的问题不是「不能关」，而是「默认开、且分散在多个开关里」。')}
`)}

${section('02', '两类开关：编译期与运行期', `
  <p>理解这套系统要分清两层。混淆这两层，就会得出「代码里有 = 线上开着」的错误结论。</p>
  ${table(
    ['层', '机制', '谁决定', '例子'],
    [
      ['编译期', '<code>feature()</code> 常量折叠', '构建配置', 'KAIROS、BUDDY 整段裁掉'],
      ['运行期', 'GrowthBook 灰度 / 动态配置', '服务端', '工具搜索阈值、压缩策略、采样率'],
      ['策略', '<code>isPolicyAllowed(key)</code>', '企业管理员', '禁用远端会话'],
      ['设置', '托管 settings 文件', '企业 / 服务端', '默认权限模式、环境变量'],
    ],
  )}
  ${ev('services/analytics/sink.ts', '12-24', `// It routes events to Datadog and 1P event logging.
const DATADOG_GATE_NAME = 'tengu_log_datadog_events'
...
function shouldTrackDatadog(): boolean {
  if (isSinkKilled('datadog')) return false`, '连「往哪发」都可以被远程关掉（sink killswitch）')}
`)}

${section('03', '服务端能改什么：四个真实开关', `
  ${table(
    ['开关', '代码位置', '效果', '用户感知'],
    [
      ['禁用绕过权限', '<code>bypassPermissionsKillswitch.ts</code>', '启动时拉 gate，命中就把 bypassPermissions 从可选模式里移除', '某个模式突然不见了'],
      ['强制最低版本', '<code>assertMinVersion()</code>', '低于 <code>tengu_version_config.minVersion</code> 直接退出并提示更新', '不更新就不能用'],
      ['封顶版本', '<code>getMaxVersion()</code>', '事故期间暂停自动更新到更高版本', '更新按钮变灰'],
      ['遥测管道', '<code>sinkKillswitch.ts</code>', '单条管道（如 Datadog）被关', '无感'],
    ],
  )}
  ${ev('utils/autoUpdater.ts', '70-80', `const versionConfig = await getDynamicConfig_BLOCKS_ON_INIT<{
  minVersion: string
}>('tengu_version_config', { minVersion: '0.0.0' })

if (versionConfig.minVersion && lt(MACRO.VERSION, versionConfig.minVersion)) {
  console.error(\`It looks like your version of Claude Code (\${MACRO.VERSION}) needs an update.\`)
  gracefulShutdownSync(1)`, '硬性版本闸门：低于服务端要求就退出')}
  ${tradeoff(
    '出事故时能分钟级止损，不用等用户升级；企业能统一策略。',
    '「本地工具」的自主性被削弱：某天早上打开发现功能没了、或必须先升级，代码里没有申诉入口。',
  )}
`)}

${section('04', '托管设置：缓存优先、后台轮询、热更新', `
  <p>企业配置不是「启动读一次文件」，而是「先用磁盘缓存，再拉远端，拉到就热更新」。这样启动不会被网络拖慢，运行中又能接受变更。</p>
  ${ev('services/remoteManagedSettings/index.ts', '527-537', `// Cache-first: if we have cached settings on disk, apply them and unblock
// waiters immediately. The fetch still runs below; notifyChange fires once,
// after the fetch, as before. Saves the ~77ms fetch-wait on print-mode startup.
if (getRemoteManagedSettingsSyncFromCache() && loadingCompleteResolve) {
  loadingCompleteResolve()
}`, '连 77ms 的等待都要省掉 —— 启动性能是产品指标')}
  <p>拉到新设置后，会触发 <code>settingsChangeDetector.notifyChange('policySettings')</code>，让环境变量、遥测、权限在下次读取时生效；拉取失败则 fail-open，继续用本地配置。</p>
`)}

${section('05', '商业模式的代码痕迹', `
  <p>订阅限额不是一句「你超了」，而是四个窗口分别计数：</p>
  ${ev('services/claudeAiLimits.ts', '29-33', `  | 'five_hour'
  | 'seven_day'
  | 'seven_day_opus'
  | 'seven_day_sonnet'`, '5 小时 + 7 天，且按模型分档')}
  ${ul([
    '<b>成本追踪</b>：<code>cost-tracker.ts</code> 按会话累计 token 与美元，支持恢复会话时接续；',
    '<b>认证</b>：OAuth token 存系统钥匙串（macOS）或文件，支持刷新与过期判断；API key 作为另一条路径；',
    '<b>分发</b>：npm 包 + 原生安装器 + 自动更新，更新有锁文件避免并发写坏。',
  ])}
  ${stats([
    ['4', '限额窗口', '5h / 7d / 7d opus / 7d sonnet'],
    ['659', '遥测事件名', '另有 903 个 tengu_ 字符串'],
    ['3', '隐私等级', 'default / no-telemetry / essential'],
    ['77ms', '省掉的启动等待', '缓存优先'] ,
  ])}
`)}

${section('06', '这套设计的两面', `
  ${table(
    ['看到的', '好的解释', '坏的解释'],
    [
      ['默认开遥测', '改进产品需要真实使用数据，且有明确退出开关', '默认值即立场，多数用户不会去读文档'],
      ['远程改行为', '事故止损、企业合规、灰度实验', '本地工具的确定性被牺牲'],
      ['版本闸门', '避免旧版本产生错误数据或安全漏洞', '用户失去「先不升级」的权利'],
      ['模型代号保密', '未发布型号属于商业机密', '「隐身模式」让 AI 参与不可见（见第 08 章）'],
    ],
  )}
  ${note('', '<b>给产品经理的一句话：</b>只要你做一个「装在使用者机器上」的 Agent，就一定会面对同一组取舍：默认遥测、远程配置、版本闸门。提前把「用户能不能关、关了之后功能降级到什么程度」写进 PRD，比事后解释便宜得多。')}
`)}
`,
  sources: [
    { label: 'services/analytics/（index.ts、sink.ts、growthbook.ts）', note: '遥测路由与采样' },
    { label: 'utils/privacyLevel.ts', note: '隐私三档' },
    { label: 'services/remoteManagedSettings/、services/policyLimits/', note: '托管设置与策略' },
    { label: 'utils/autoUpdater.ts、services/claudeAiLimits.ts', note: '版本闸门与限额' },
  ],
};
