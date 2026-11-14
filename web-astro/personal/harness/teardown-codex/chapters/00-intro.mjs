import { statStrip, table } from '../ui.mjs';
import { STATS, SHA } from '../data.mjs';

export const intro = () => `
<section id="s01">
  <h2><span class="num">01</span>五条产品判断</h2>
  <p>Codex 的源码价值不在功能数量，而在五个产品选择。每条都按「用户问题 → 选择 → 用户价值 → 代价」写，相关章节可直接跳转。它们不是行业独有，而是这份固定提交里的实现判断；第 09 章再与 039 的 Claude Code 逐条对照。</p>
  ${table(
    ['产品判断', '用户问题', 'Codex 的选择', '用户价值', '代价', '相关章'],
    [
      [
        '运行时与 App Server 分层',
        '一个 CLI 怎么同时服务 TUI、exec、桌面、移动与 SDK？',
        '<code>core</code> 管运行时，<code>app-server</code> 管 thread / turn 协议；TUI / exec 用 in-process 客户端，桌面 / 移动用 daemon。',
        '同一套会话语义复用多端，新增表面不必重写 core 集成。',
        '协议兼容、experimental 方法与 daemon 生命周期成为新成本。',
        '<a href="02-map.html">02</a> · <a href="08-surface.html">08</a>',
      ],
      [
        '工具可编程层',
        '工具很多时，模型该直接调用，还是写代码组合？',
        'direct / deferred / code mode / hidden 暴露矩阵；code mode 让模型写 JavaScript 调用嵌套工具。',
        '工具面可按上下文裁剪，组合调用不必拆成很多轮。',
        '宿主依赖、工具发现与授权面变大；code mode 不可用时要回退。',
        '<a href="04-tools.html">04</a>',
      ],
      [
        '权限组合',
        '怎样让 Agent 能干活，又不越过文件、命令与网络边界？',
        'approval + sandbox policy + execpolicy + network proxy + reviewer 组合。',
        '文件、命令、网络、审批分层治理，规则可审计。',
        '组合多、平台后端不一致；用户很难从一句「已允许」推断实际边界。',
        '<a href="06-permission.html">06</a>',
      ],
      [
        '条件后台压缩',
        '长任务怎样不爆上下文，又不让用户干等？',
        '90% 派生上限 + 65% 条件异步预跑 + 20k 摘要上限；65% 只在特定开关与 provider 能力下成立。',
        '压缩可以提前准备，长任务更少被打断。',
        '摘要损失不可逆；后台请求有成本；条件不满足时仍走前台压缩。',
        '<a href="05-context.html">05</a>',
      ],
      [
        '角色与协作生命周期',
        '多 Agent 怎么从「再叫一个模型」变成可管理任务？',
        'role + spawn / wait / send / close / resume + message board；V1 默认 6 线程，V2 默认 4 个并发线程（含 root）。',
        '并行分工、review 隔离、子 Agent 可等待与回收。',
        '成本与协调复杂度上升；V1 / V2 两套上限增加理解成本。',
        '<a href="07-agents.html">07</a> · <a href="09-difference.html">09</a>',
      ],
    ],
  )}
</section>

<section id="s02">
  <h2><span class="num">02</span>五条判断怎样互相支撑</h2>
  <p>分层让多端复用；工具矩阵让运行时按场景裁剪能力；权限组合给工具与执行设边界；条件压缩让长任务持续；角色与消息板把并行任务变成可管理对象。五条叠在一起，才是「本地 Agent 产品」，而不是「模型 + 命令行」。</p>
  ${statStrip(STATS)}
</section>

<section id="s03">
  <h2><span class="num">03</span>证据与边界</h2>
  <p>统计用逐文件 <code>splitlines()</code> 累加，固定提交 <code>${SHA}</code>，读取日期 2026-11-09。证据分四级：A 级能指到源码 <code>path:line</code>；B 级是仓库内文档；C 级是从调用链推断；D 级是不在仓库或材料不足。</p>
  ${table(
    ['等级', '含义', '页面写法'],
    [
      ['A', '固定 SHA 的源码可直接指到 <code>path:line</code>', '代码块 + 行号 + GitHub permalink'],
      ['B', '仓库内官方 README、文档或配置注释', '文档链接 + 原文摘要'],
      ['C', '从调用链推断，代码没有直接断言', '标「推断」，给推断依据'],
      ['D', '不在本仓库或材料不足', '标「不可验证」，不补细节'],
    ],
  )}
  ${table(
    ['层', '是否在本仓库', '能证明什么', '不能证明什么'],
    [
      ['CLI / TUI / exec', '是，完整 Rust 源码', '本地 Agent 的循环、工具、权限、压缩、记忆', '线上账号实际启用哪些 feature'],
      ['app-server / daemon', '是，完整 Rust 源码', 'JSON-RPC 协议、thread / turn 模型、远程控制生命周期', '桌面 / 移动客户端内部实现'],
      ['桌面 App', '否，只有安装器与下载地址', 'CLI 如何拉起 / 安装 App、URL scheme 形态', 'App 内部 UI、状态管理、权限交互'],
      ['Codex Web / Cloud', '否，只有客户端', '客户端如何认证、提交任务、读取 diff', '调度器、执行器、存储、隔离方式'],
      ['IDE 扩展', '否，README 只给外链', '存在 IDE 入口', '扩展实现与协议细节'],
      ['模型服务', '否，只有 API 客户端', '请求格式、工具声明、流式事件', '模型行为、真实上下文窗口、线上阈值'],
    ],
  )}
</section>
`;
