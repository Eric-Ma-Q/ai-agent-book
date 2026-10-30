// Single source of truth for the Harness archive: the 16 pages, their groups,
// the two runnable labs and the reading path. The directory page, the library
// builder and the tests all read from here; see README.md for the maintenance
// rules.
export const PAGE_GROUPS = [
  {
    id: 'deep',
    title: 'Harness 深读',
    description: '七篇主线：从工程报告解读到可交互的循环图解，再到任务队列与结业考试。',
  },
  {
    id: 'product',
    title: '产品功能拆解',
    description: '把一个真实功能拆到事件、触发时机与配置。',
  },
  {
    id: 'pm',
    title: 'AI 产品经理',
    description: '转岗实战、产品全景、完整 PRD、简历与结业考试。',
  },
  {
    id: 'industry',
    title: 'AI 行业调研',
    description: '厂商问题、岗位落地、架构决策、设计教训与失败复盘，均标注来源与限制。',
  },
];

export const PAGES = [
  {
    slug: 'ai-harness-explained',
    title: 'Harness 深度解读：以 Anthropic 工程报告为主线',
    description: '长文正文：核心循环、上下文工程与工程化决策，随文可展开备注与深挖。',
    sitePath: 'ai-harness-explained.html',
    group: 'deep',
    kind: '长文',
    tags: ['核心循环', '上下文工程', 'Anthropic'],
  },
  {
    slug: 'ai-harness-flow',
    title: 'Harness 交互流程图解 · Agent 的完整工作循环',
    description:
      '可动手玩的伴读页：状态机支持自动演示 / 手动驾驶，含上下文压力仪表与崩溃续跑模拟。',
    sitePath: 'ai-harness-flow.html',
    group: 'deep',
    kind: '图解',
    tags: ['状态机', '交互演示', '上下文压缩'],
  },
  {
    slug: 'harness-engineering',
    title: 'Harness 工程：从拆解到动手',
    description:
      '把七份调研分册与 mini-harness 压成一条学习路线：横评、工具层、安全、记忆、多智能体、评测、成本、动手七阶段。',
    sitePath: 'harness-engineering.html',
    group: 'deep',
    kind: '学习路线',
    tags: ['横评', '工具层', '记忆', '评测'],
  },
  {
    slug: 'deepseek-harness-dsh',
    title: 'DeepSeek Harness（DSH）深度解读 · 一切皆插件',
    description: '姊妹篇：DSH 的插件化架构拆解与工程取舍，与主线对照阅读。',
    sitePath: 'deepseek-harness-dsh.html',
    group: 'deep',
    kind: '深度解读',
    tags: ['插件架构', 'DSH', '架构取舍'],
  },
  {
    slug: 'ask-user-question-product',
    title: 'ask_user_question 产品设计 · 把「猜」变成「选」',
    description:
      '把「选项 + 推荐」当一个产品来做：三条公理、VoI 门控、六个设计自由度、七状态机、十条失败模式与度量口径。',
    sitePath: 'ask-user-question-product.html',
    group: 'deep',
    kind: '产品设计',
    tags: ['交互设计', '推荐', '失败模式'],
  },
  {
    slug: 'agent-task-queue',
    title: '任务队列：Agent 的第二条时间线',
    description:
      '四条车道、六个契约、九个状态：把 Claude Code、Cursor、Codex、Devin 的队列语义与 Postgres 实现放在一张图里。',
    sitePath: 'agent-task-queue.html',
    group: 'deep',
    kind: '产品设计',
    tags: ['任务队列', '并发', '持久化', 'steering'],
  },
  {
    slug: 'harness-exam',
    title: 'Harness 结业考试',
    description:
      '97 道题检验学习成果：填空、判断、单选、多选、排序、连线、代码诊断、案例分析与开放论述，自动判分并按专题出掌握度报告。',
    sitePath: 'harness-exam.html',
    group: 'deep',
    kind: '考试',
    tags: ['自测', '掌握度', '专题'],
  },
  {
    slug: 'claude-code-hooks-33',
    title: 'Claude Code Hooks · 33 个事件的完整值班',
    description:
      '用一个夜间迁移案例把 33 个 hook 事件全部跑通：可点击流程图、每个事件的中文名 / 触发时机 / 真实配置与七种典型误用。',
    sitePath: 'claude-code-hooks-33.html',
    group: 'product',
    kind: '功能拆解',
    tags: ['Claude Code', 'hooks', '配置'],
  },
  {
    slug: 'claude-code-source-teardown',
    title: 'Claude Code 源码拆解 · 一个 Agent 产品怎么用 51 万行装起来',
    description:
      '基于 2026-03-31 npm sourcemap 泄露的 v2.1.88 源码（1,884 个 TS 文件 / 512,664 行）：十章拆事件证据、代码地图、主循环、工具、上下文、权限、多 Agent、未发布功能、遥测与远程控制，每条断言带文件行号，附八道自测。',
    sitePath: 'cc-source-teardown/index.html',
    group: 'product',
    kind: '源码拆解',
    tags: ['Claude Code', '源码', '产品拆解', 'Harness'],
  },
  {
    slug: 'ai-agent-pm-career',
    title: '产品经理转 Agent · 面经、JD 与简历实战',
    description:
      '面向已有产品经验的转岗者：5 个面经样本、7 个 JD 对照、分阶段简历模板、项目证据与投递策略，来源与限制逐条标注。',
    sitePath: 'ai-agent-pm-career.html',
    group: 'pm',
    kind: '转岗实战',
    tags: ['面经', 'JD', '简历'],
  },
  {
    slug: 'ai-products-pm-analysis',
    title: 'AI 产品全景 2026 · 产品经理视角的产品解构报告',
    description:
      '基于 90+ 轮公开信息检索，对 111 款 AI 产品拆解：目标用户、方案、商业化与护城河；含 2026Q3 办公 Agent 与个人助理两节。',
    sitePath: 'ai-products-pm-analysis.html',
    group: 'pm',
    kind: '产品全景',
    tags: ['产品解构', '商业化', '护城河'],
  },
  {
    slug: 'ai-expense-review-prd',
    title: 'AI 报销审核 · 完整产品设计',
    description:
      '在现有 OA 中增加 AI 审核：财务工作台、票据证据、规则与补件、人工决定，以及中断恢复和回写去重的完整闭环。',
    sitePath: 'ai-expense-review-prd.html',
    group: 'pm',
    kind: 'PRD',
    tags: ['报销审核', '工作台', '人工复核'],
  },
  {
    slug: 'ai-pm-resume',
    title: '零 AI 经验 · AI 产品经理简历优化指南',
    description:
      '七步从改简历走到投递：岗位地图、30 天证据包、完整简历 Before/After、十项自检与投递复盘，进度存本机。',
    sitePath: 'ai-pm-resume.html',
    group: 'pm',
    kind: '简历指南',
    tags: ['简历', '证据', '投递'],
  },
  {
    slug: 'ai-pm-interview-questions',
    title: 'AI 产品经理 · 真实面经题库（716 条）',
    description:
      '首轮牛客 447 篇面经帖与 muse 汇编合并去重 659 条，2026-10-20 用本机 local-web-search 复搜补 57 条，共 716 条面试官原话：九类主题、可按公司与来源筛选；另附必考 20 题与答题框架及双源对比。',
    sitePath: 'ai-pm-interview-questions.html',
    group: 'pm',
    kind: '面经题库',
    tags: ['面经', '题库', '交叉验证'],
  },
  {
    slug: 'ai-pm-exam',
    title: 'AI 产品经理系列 · 结业考试',
    description:
      '115 道题覆盖本系列四篇：填空、判断、单选、多选、排序、连线、材料诊断、案例分析与开放论述，2026-10 对齐简历指南与报销 PRD 的复查口径，自动判分并按 17 个专题出掌握度报告。',
    sitePath: 'ai-pm-exam.html',
    group: 'pm',
    kind: '考试',
    tags: ['自测', '掌握度', '专题'],
  },
  {
    slug: 'ai-industry-research-2026-10',
    title: 'AI 行业调研 2026-10 · 厂商问题 × 设计教训 × 前沿动态',
    description:
      '155 轮中英文检索、70+ 来源精读的合并报告：20 家厂商问题速查、10 类共性问题、16 类产品设计问题与技术 / 商业前沿。',
    sitePath: 'ai-industry-research-2026-10.html',
    group: 'industry',
    kind: '行业调研',
    tags: ['厂商', '设计教训', '前沿动态'],
  },
  {
    slug: 'harness-in-business',
    title: 'Harness 上岗：公司里的 Agent 工程（2024–2026）',
    description:
      '13 个深度案例 + 9 个短线案例：运营、设计、产品与客服岗位上的 Agent 落地，含 4 个回退案例、5 条跨案例规律与 45 条来源。',
    sitePath: 'harness-in-business.html',
    group: 'industry',
    kind: '案例研究',
    tags: ['公司案例', '岗位落地', '回退复盘'],
  },
  {
    slug: 'anthropic-workflow-shift-2026-10',
    title: 'Anthropic 工作流程转变 2025–2026：从写代码到管理 Agent',
    description:
      '基于三份内部报告、Scion 工程博客与 NBER/METR 外部研究：拆解代码生产、评审、版本控制、组织招聘与研究流程的 before/after，附 14 条来源与争议。',
    sitePath: 'anthropic-workflow-shift-2026-10.html',
    group: 'industry',
    kind: '深度案例',
    tags: ['Anthropic', '工作流程', 'Agent', '组织变革'],
  },
  {
    slug: 'single-agent-loop',
    title: '单 Agent 循环：什么时候把子 Agent 折回主循环',
    description:
      '基于 Anthropic 2026-10 指南与 17 条来源：三个保留条件、四种处置、六步迁移、折叠推演与逐题翻转评测，附 8 个交互。',
    sitePath: 'single-agent-loop.html',
    group: 'industry',
    kind: '架构决策',
    tags: ['单 Agent', '子 Agent', '上下文工程', '评测'],
  },
  {
    slug: 'fde-career-guide-2026',
    title: '前端部署工程师（FDE）就业指南 2026 · 岗位地图与转岗路线',
    description:
      '39 条来源：FDE 的国内外薪资与岗位地图、一线真相、亚太岗位与认证、六块能力栈、三个作品集、简历与 5–7 轮面试。',
    sitePath: 'fde-career-guide-2026.html',
    group: 'industry',
    kind: '就业指南',
    tags: ['FDE', '求职', '前端转型', '薪资'],
  },
  {
    slug: 'claude-code-product-design',
    title: 'Claude Code 产品设计 2026 · 把终端 Agent 做成操作系统',
    description:
      '基于 65 篇官方文档、550 条 npm 版本数据、Agent SDK（MIT）与 sandbox-runtime（Apache-2.0）源码：拆解定位、会话生命周期、工具、权限沙箱、上下文、扩展、多代理、商业化与开源边界，附 39 条来源。',
    sitePath: 'claude-code-product-design.html',
    group: 'industry',
    kind: '产品拆解',
    tags: ['Claude Code', '产品设计', 'Agent', '权限'],
  },
  {
    slug: 'ai-failure-casebook',
    title: 'AI 产品失败复盘 · 从发现到修复',
    description:
      '42 个代表性失败案例（37 个 AI 应用层）的产品视角拆解：产品假设、谁先发现、根因四层、止血与修复，附 22 条跨案例规律。',
    sitePath: 'ai-failure-casebook.html',
    group: 'industry',
    kind: '案例复盘',
    tags: ['失败案例', '根因', '修复'],
  },
];

export const LABS = [
  {
    id: 'mini-harness',
    title: 'mini-harness',
    summary:
      '约 1,950 行、只用 Python 标准库：主循环、权限钩子、上下文压缩、大输出落盘、只读子代理、迷你 eval 与带写入闸门的记忆层。',
    tests: 67,
    command: 'cd web-astro/personal/harness/archive && python3 -m unittest discover labs/mini-harness/tests',
    readme: 'labs/mini-harness/README.md',
    workbench: '/harness/mini-harness/',
    tags: ['Python 标准库', '7 个机制', '无第三方依赖'],
  },
  {
    id: 'selfloop',
    title: 'SelfLoop',
    summary:
      '可观测的自举改进循环：提议 → 验证 → 闸门 → 归档，跑到收敛、超预算或到顶就停；每轮都判断有没有变好。',
    tests: 14,
    command:
      'cd web-astro/personal/harness/archive/labs/selfloop && python3 -m unittest discover -s tests -v',
    readme: 'labs/selfloop/README.md',
    workbench: '/harness/selfloop/',
    tags: ['自举改进', '验证器', '原生 JS'],
  },
];

export const READING_PATH = [
  {
    step: '01',
    title: '先看全貌',
    description: '用一篇长文建立核心循环与上下文工程的框架。',
    href: '/harness/site/ai-harness-explained.html',
  },
  {
    step: '02',
    title: '把循环跑一遍',
    description: '在流程图里手动驾驶状态机，感受压缩与崩溃续跑。',
    href: '/harness/site/ai-harness-flow.html',
  },
  {
    step: '03',
    title: '动手实现',
    description: '跟着 Harness 工程路线，把七个机制逐个写进 mini-harness。',
    href: '/harness/site/harness-engineering.html',
  },
];

export const STATS = { pages: 22, research: 19, labs: 2, topics: 4 };

// Requirement 013: a practice entry in the AI PM group. It is not an archived
// page, so it stays out of PAGES and does not change the page count.
export const PRACTICE = {
  id: 'ai-pm-interview',
  title: 'AI 产品经理 · 模拟面试',
  description: '用结业考试的专题掌握度和错题出题，练习模式当场点评，模拟模式结束复盘。',
  href: '/harness/interview/',
  group: 'pm',
  kind: '模拟面试',
  tags: ['多轮对话', '模型档案', '复盘'],
};

// Requirement 034: a guide entry in the AI PM group. Like PRACTICE it is not an
// archived page, so it stays out of PAGES and does not change the page count.
export const GUIDE = {
  id: 'pm-interview-guide',
  title: '产品经理面试与简历方法论',
  description: '先看面试官怎么评分，再把经历写成证据：五步闭环、八个环节、JD 四层与对齐矩阵。',
  href: '/harness/interview-guide/',
  group: 'pm',
  kind: '方法总纲',
  tags: ['面试技巧', '简历', '方法论'],
};

// Library categories, in display order. `category` matches manifest.json.
export const LIBRARY_CATEGORIES = [
  { id: 'pages', label: '内容页', category: 'page', description: '21 个单文件长文与总览' },
  { id: 'research', label: '调研分册', category: 'research', description: '页面事实与出处的上游来源' },
  { id: 'longform', label: '长文 Markdown', category: 'longform', description: '行业调研与 MCP 历史的原文' },
  { id: 'labs', label: '实验', category: 'lab', description: 'mini-harness 与 SelfLoop 的代码与说明' },
  { id: 'docs', label: '专题与规范', category: 'doc', description: '学习专题、页面清单、功能梳理与开发规范' },
  { id: 'collab', label: '协作存档', category: 'collab', description: 'BOARD、任务、报告与评审' },
  { id: 'build', label: '构建源', category: 'build', description: 'hooks-33 与幻灯片的构建脚本与源文件' },
  { id: 'artifacts', label: '产物', category: 'artifact', description: '技术分享 PPTX 与 PDF' },
];
