# 03 · AI 产品设计/交互设计中的问题与经验教训（设计 & UX 视角）

> 调研日期：2026-10-03。方法：22 次中英文 WebSearch + 15 个来源全文精读。覆盖 NN/g、Microsoft Design、Smashing Magazine、A List Apart、UX Collective、Cognition(Devin)、中文设计社区等公开复盘。所有关键观点附来源 URL 与大致时间。

---

## 一、要点速览

1. **"由 AI 驱动"本身不是价值主张**：为追技术而加 AI（hammer 找 nail）是 2019-2025 被反复批判的头号错误；窄范围的 AI 功能更易理解、采用率更高（NN/g）。
2. **对话式 UI 的根本困境是可发现性**：GUI 像逛水果摊、chatbot 像对着告解室——用户要么以为它无所不能，要么彻底僵住（A List Apart, 2016；NN/g chatbot 研究, 2018）。
3. **聊天是"发现"的好界面、通常是"执行"的糟糕界面**：2025 年起 chat-first 受到系统性反思，Agent 产品需要的是控制面（审批、回执、日志、undo），而非无限聊天流（Hatchworks；uxdesign.cc, 2025）。
4. **审批疲劳是 agent 设计的头号隐性风险**：人类对第 40 次确认弹窗的反射通过只要约 1.7 秒，安全闸门退化成"带人类手指的自动点击器"；解法是按"爆炸半径×可逆性"三级分流，只有不可逆操作值得同步打断（TianPan.co, 2026-07）。
5. **过度承诺 + 首次翻车 = 信任破产**：Apple Intelligence 通知摘要因 BBC 投诉假新闻（Mangione"自杀"、Nadal"出柜"）于 2025-01 暂停新闻类功能；Google AI Overviews 因"胶水披萨"等错误长期被信任质疑。
6. **强制开启、难以关闭的 AI 功能正在制造反噬**：Notion AI 只能发邮件申请关闭、Slack AI 需管理员多步关闭——"opt-out 困难"已成社区级抱怨（Reddit r/Notion, 2024-09 起）。
7. **AI 记忆/个性化走在恐怖谷边缘**：ChatGPT"诡异称呼用户名字"（2025-04）说明记忆功能的展示时机比记忆本身更敏感；LLM 冷启动个性化如果处理不当会自建信息茧房（TianPan.co, 2026-04）。
8. **Agent 无法拥有真正可靠的进度条**：计划在设计上就是临时性的——探索揭示范围、失败触发重试，这决定了"思考外显 + 关键点暂停"才是正确的透明度形态（Siyu's Newsletter, 2025-06；TianPan.co, 2026-07）。
9. **没有确定性规格时，设计流程转向 Eval 驱动**："我们从不凭感觉改 agent，每次修改都源于一个失败的 eval"（Microsoft 语音 agent 团队）；成功标准从"任务完成"扩展到适当性、信任、恢复（Rosenfeld Media, 2025-2026）。
10. **拟人化要适度**：适度拟人提升信任，过度拟人触发恐怖谷并放大过度依赖（over-reliance）——RLHF 的"讨好型"输出 + 拟人化设计是信任校准的双重风险（2025-2026 多项研究）。

---

## 二、分主题：问题 → 案例 → 对策

### 2.1 提示词冷启动：用户不知道能问什么

**表现**：新用户面对空白输入框不知如何开口；或以为 AI 无所不能（"帮我做个三明治"）、或彻底僵在原地。A List Apart 的经典比喻：首开 App 像**逛水果摊**（功能全部陈列），首次面对 chatbot 像**对着告解室**，只能依赖门后的声音引导（Matty Mariansky, 2016-02, https://alistapart.com/article/all-talk-and-no-buttons-the-conversational-ui/）。ParallelHQ 引用数据称约 65% 的用户写不好 prompt。

**案例**：NN/g 2018 年的 chatbot 可用性研究中，WebMD 机器人无法事先告知支持查询哪些药物，导致完全无用；早期测试用户"要么盯着屏幕发呆，要么说出离谱请求"（https://www.nngroup.com/articles/chatbots/，2018-11）。TianPan.co（2026-04）把 LLM 冷启动归为"结构问题而非数量问题"：偏好空间几乎无界（长度/语气/正式度/技术深度/引用风格数十个维度且随场景变化），隐式反馈噪音极大——PersonaMem 2025 基准显示前沿模型动态偏好遵循仅约 50% 准确率，48% 的 GPT-4o 错误是"合理但不个性化"（https://tianpan.co/blog/2026/04/10/cold-start-problem-ai-personalization）。

**对策/最佳实践**：
- **Prompt starters 分三层**：全局操作（核心价值）、上下文操作（当前屏幕）、历史操作（过往行为）（ParallelHQ, https://www.parallelhq.com/blog/llm-chat-ux-patterns）。
- **结构化 prompt 模板**（Mad Libs 式填空+下拉变量），降低认知负荷同时教育能力边界。
- **逐步揭示功能**：首触给"短路径胜利"→ 第一条命令详细解释 → 熟悉后撤掉辅助轮 → 按解锁历史推荐进阶功能（A List Apart）。
- **NN/g 提示建议四用途**：可发现性、教育启发、设定约束、便于追问；建议须情境相关、贴合用户水平。
- **冷启动架构**：三层默认（全球默认→行为簇默认→个体信号，10-20 次交互后才启用个体建模）；保留 5-10% 探索（epsilon-greedy）防茧房——淘宝 serendipity 推荐多带来 29.6% 点击且无整体收入损失（TianPan.co, 2026-04）。
- **衡量冷启动健康度**：Prompt 放弃率（开始打字又清空）、话题分布熵坍缩、改写率上升但满意度不升（TianPan.co；ParallelHQ）。

### 2.2 信任建立：不可验证的答案与信任危机

**表现**：AI 错误会"以事实口吻"出错，首次翻车即可摧毁信任；用户怀疑 chatbot 遗漏关键信息（如折扣）。

**案例**：NN/g 研究中用户明确表示担心机器人"漏掉最优答案"；用户在 Messenger 中拒绝输入生日/信用卡，担心数据共享给平台（NN/g, 2018-11）。AI slop 泛滥加剧了"答案不可验证"危机——"AI slop"入选 Merriam-Webster 2025 年度词；佛罗里达大学 2026-03 市场研究显示低质 AI 内容同时伤害消费者与专业创作者，建议平台强制标注（https://news.ufl.edu/2026/03/ai-slop/）。NN/g 2025 年还观察到一个反向信号：**"手工设计"（hand-crafted look）正在成为新的信任标志**——AI 内容泛滥让用户把明显人工制作的界面视为可信来源（NN/g study guide, https://www.nngroup.com/articles/designing-ai-study-guide/）。

**对策**：透明标注 AI 生成（"AI 生成"/"基于你的数据"标签）；溯源引用（citations）把信任锚定到来源——但注意 Perplexity 式引用"并不保证答案正确"（glbgpt.com, 2026-09）；聊天机器人需具备 5 个可信特质——愿意移交人工、灵活性、主动性、情感响应性、透明性（NN/g）；置信度信号校准用户依赖（见 2.5）。

### 2.3 流式输出与延迟感知

**表现**：用户盯着空转 spinner 焦虑；生成中断或慢时被误认为卡死。

**对策/共识**：感知延迟（看到首个有意义交互，约 0.5s 目标）比总时长更重要；token 级流式输出（打字机效果）是 GenAI 聊天标配，可在总时长不变时大幅降低感知等待；骨架屏应与最终内容布局一致，展示"进度而非仅活动"；"永远不要让用户没有反馈"（quinoid / programmingcentral 等 2025-2026 AI UX 模式汇总）。

### 2.4 错误处理、恢复与转人工

**表现**：传统 chatbot 时代失败=听不懂（Domino's 机器人无法理解"townhome"、Kia 机器人用户答"No"直接中断决策树）；LLM 时代失败形态变了——**变成听起来可信的幻觉**（Emily Backes, https://emilybackes.design/post/ai-chatbots-customer-service-guide，2025）。

**案例**：Emily Backes 的服装零售商案例——机器人只会回模板 FAQ、无法处理退换货、没有人工入口；转人工时丢上下文，患者抱怨"我已经厌倦了把症状讲三遍"；Progressive 的 Flo 人设前热后冷，用户立刻察觉并降低信任。NN/g 早期研究中 Booking.com 用轮播展示 80+ 酒店结果，完全不适合长列表。

**对策/实测效果**：
- 坦承"没听懂"并给逃生通道：**在用户开口前主动提供转人工**；UPS 机器人在即将重复回答时坦承并提出转真人，用户对"诚实的无知"评价高于伪装自信的错误答案（Emily Backes；NN/g 第 9 条准则）。
- 上下文交接协议：转接时传递完整对话记录、身份、会话摘要与用户目标。Sortly Sage 改进后机器人解决量 +44%、人工工单 -29%；任务完成率目标 80%+、升级带完整记录 90%+（Emily Backes, 2025）。
- 恢复路径要具体：带指令的重新生成（"重试，更短并聚焦指标 X"）、内联直接编辑 AI 输出、单纯点赞点踩"不足够"（ParallelHQ）；错误提示应友好非技术化，附"换个提示词试试"（Uzer, https://uzer.us/10-common-and-costly-mistakes-when-designing-ai-products-and-how-to-avoid-them-with-good-ux/，2025）。
- 利用"服务恢复悖论"：处理得当的错误可能比零失误更能建立忠诚（Smashing Magazine, 2026-02）。

### 2.5 生成不确定性、置信度 UI 与撤销/回滚

**表现**：把结果呈现得像 100% 准确很危险（健康应用直说"你得流感了"）；agent 完成退款后只显示"Done!"，用户不知道改了什么、如何撤销（Hatchworks 称之为"信任杀手"）。

**对策**：
- **置信度信号三种实现**：百分比、范围声明（Scope: 仅限旅行预订）、视觉提示（绿勾/黄问号）；配套指标为校准分数（置信度与接受率相关 >0.8）与 Scrutiny Delta（低置信计划应获得更长审查时间，如 +12 秒）（Victor Yocco, Smashing Magazine, 2026-02, https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/）。
- **概率性语言**："可能是……/有 80% 几率"；允许探索其他选项（Uzer #10）。
- **Action Audit & Undo**：时间线日志 + 显著撤销按钮 + 明示撤销窗口（"15 分钟内可撤销"）；**撤销率 >5% 时应停用该任务自动化**（Smashing Magazine, 2026-02）。Hatchworks 的对应模式是"行动回执"（什么变了/哪里/时间戳/回滚选项）与"两阶段行动"（先计划后执行，不可逆操作必选）。
- **低置信度视觉化**：隐藏不确定性会在首次出错时摧毁信任；允许用户改底层 prompt 指令使任务完成率提升 32%，可见的上下文控制降低 42% 用户焦虑（ParallelHQ）。

### 2.6 Human-in-the-loop、自主级别与审批疲劳

**表现**：代理有自主权而用户没有=剥夺能动性；反过来，一刀切的审批弹窗引发**审批疲劳**。

**案例（核心：TianPan.co《The Approval Prompt Nobody Reads》，2026-07-07, https://tianpan.co/blog/2026/07/07/the-approval-prompt-nobody-reads）**：agent 一天 40 次审批请求，人类以约 1.7 秒反射点击全部通过，第 41 次（危险的对外转账）同样被无脑批准。历史证据：2500 万次真实展示中 70% 的 Chrome SSL 警告被点穿；医院临床警报 85-99% 无需干预（某儿童医院单日 5300 次警报 95% 误报）；fMRI 显示重复警告第二次观看时神经反应即下降——习惯化无法靠纪律消除。审计日志无法区分"深思 90 秒"与"顺手点掉"，合规叙事沦为空话；提示注入攻击只需把恶意指令伪装成 routine 请求"搭便车"。

**对策**：
- **按"爆炸半径 × 可逆性"三级审批**：L1 只读自动批准+记日志；L2 可逆写操作自动执行+事后审查摘要；L3 不可逆/高爆炸半径才同步打断——采用团队升级率降到 10-15%（TianPan.co, 2026-07）。
- **审批计划而非步骤**：批准"退这 14 笔重复款"的计划后，14 次调用只需对照计划做合规检查。
- **授权要过期**："Allow"限定会话/范围/时间窗；分级边界必须在模型之外的确定性中间件执行（denylist 可被绕过）。
- **Autonomy Dial 自主性拨盘**：Observe & Suggest → Plan & Propose → Act with Confirmation → Act Autonomously，按任务类型分档设置（"争议 50 美元以下扣款可自主"）；代理通过可靠性"挣得"自主权；指标 Trust Density、Setting Churn（Smashing Magazine, 2026-02；Hatchworks）。
- **Devin/Claude Code 的实践**：共同编写 PRD、按"Plan → Implement → Test → Fix → Checkpoint"推进、人始终是架构师；预期是约 80% 时间节省而非全自动（Cognition, https://devin.ai/agents101，2025-06）。两者路线差异：Devin=异步自主低操作技能，Claude Code=工程师在环高频交互（ayautomate.com, 2026）。

### 2.7 记忆功能与个性化的"恐怖谷"

**表现**：被 AI 记住是双刃剑——帮助性的瞬间可能变成侵入性瞬间，尤其当 AI 主动展示它记得什么。

**案例**：ChatGPT Memory 2024-04 上线后，2025-04 被广泛吐槽"creepily referring to users by their names"——个性化跨过怪异线（Freevacy, 2025-04）；PCMag 2025-12 教用户 8 个隐私技巧（查看/删除记忆、Temporary Chats、关闭记忆），说明用户需要主动管理而非默认信任。个性化不当还会自建信息茧房：系统从错误小样本拟合偏好并自我强化，研究发现 LLM 会按人口属性调整输出（正面多讲、负面省略）（TianPan.co, 2026-04）。

**对策**：**记忆控制模式**——展示"记得什么、为什么"，支持编辑/删除、范围限定（Hatchworks 模式 #11）；Devin 的 Knowledge 机制把短期记忆显式转为长期记忆并允许人审查（siyujia.net, 2025-06）；隐私场景的自动调用记忆前需确认（siyujia "上下文/知识匹配"模式）；避免未请求的个性化炫耀（如突然称呼姓名）。

### 2.8 "为加 AI 而加 AI"与强制开启的反噬

**表现**：AI 功能解决不存在的问题；强制开启且难以关闭；闪光图标（✨）含义模糊却越来越与 AI 绑定。

**案例**：
- NN/g 明确批评"先有锤子再找钉子"，指出 AI 聊天并非总是答案、交互机器人若只是复制已有网站/App 功能则价值存疑；Amazon Rufus 说明有价值的功能若不被发现也收效甚微（NN/g study guide, 2019-2025）。
- **Notion AI 关不掉**：Reddit r/Notion 帖"After Disabling AI-interface Notion Works SO MUCH Faster"（2024-09）——性能抱怨 + 只能发邮件给 team@makenotion.com 申请关闭，无自助开关；Tumblr 教程确认这是"唯一方式"。**Slack AI**：管理员须"关闭现有 + 封锁未来"多步操作才能完全禁用。
- Uzer 的十条错误清单（2025）系统化了这个面：未说明 AI 在做什么、过度承诺、不许纠正、忽视偏见、不为失败设计、黑箱、跳过真实用户测试、不教育用户、选项有限无替代（3 个邮件回复建议没一个想说的，需"都不是/自己写"）、不展示确定性。

**对策**：AI suggests, humans decide；为 AI 功能提供清晰的开关与退出；价值主张写"它能帮你解决什么"而非"它是 AI"。

### 2.9 AI 摘要/搜索污染用户体验

**案例**：
- **Apple Intelligence 通知摘要**（iOS 18.1+）：2024-12 BBC 投诉——假通知称 Mangione"开枪自杀"、Luke Littler 决赛结束前"获胜"、Nadal"出柜"；《纽约时报》被错误摘要称内塔尼亚胡被捕。2025-01-17 苹果宣布暂停新闻/娱乐类通知摘要，新版本改用斜体+错误提示（The Guardian, https://www.theguardian.com/technology/2025/jan/17/apple-suspends-ai-generated-news-alert-service-after-bbc-complaint）。Six Colors 评论：只加警告标签"不够"（2025-01）。
- **Google AI Overviews**（2024-05 推出）：披萨胶水事件（把 Reddit 玩笑当事实源）、健康错误信息、"disregard/skip"指令被当查询词的故障（The Verge）；2025-07 起在英欧面临出版商法律投诉（流量与版权）。
- **AI slop 与代码**：Reddit r/ExperiencedDevs"AI slop PRs 正在烧干我的团队"（2025-05）——低质 AI 生成 PR 成为工程团队的 UX 问题。

**教训**：摘要类功能在**高可信度场景（新闻、健康）**的容错率趋近于零；"低风险试用→标注→暂停"的路径说明 Apple 的补救是先降级而非辩解；来源质量控制（不要把 UGC 玩笑当事实）是检索增强产品的 UX 前置条件。

### 2.10 Agent 产品的交互迭代：可视化、中断、接管、失败恢复

**表现与案例**（Siyu's Newsletter《AI Agent 产品交互设计》，贾思玉/亢江妹, 2025-06-07, https://siyujia.net/posts/ai-agent-hci）：
- 启动阶段：模式/模型切换混杂难辨（flowith 首页模式卡片+下拉+Oracle 开关）、画布类产品学习成本高、一次性 prompt 表达不了完整需求。
- 过程阶段：对话/进度/代码/结果多模块信息难对应；过程透明度不足（简历筛选权重像黑盒）；一般不允许中途暂停，只能等跑完再反馈重跑。
- 结果阶段：结果分散多窗口难嵌入工作流；只能文本反馈不能就地编辑；AI 无法自检完成度；**版本管理缺失，难追溯比较回滚**。
- 各家做法：Gemini Deep Research 先拆解规划并给"修改方案"按钮（但仍需文本输入，更优是选项/就地编辑）；Cursor 高亮对应步骤与代码（绿=新增/沿用、红=删除）+ Accept/Reject；Devin 提供"Follow Devin"窗口并在关键决策点（API 调用、数据存放）暂停询问；Grok 纵向进度条兼作导航锚点；Genspark 文字样式区分对话与执行、支持暂停/继续；v0 支持选中局部（图表/卡片）局部重跑；Devin 的 GitHub 留言双向同步。

**失败恢复**（Cognition Agents 101, 2025-06）：agent"绕圈子"时果断终止或手动接管，继续对话往往无用；**重启优于修补**——新开 agent 带完整指令通常比修复搞坏的环境更快；调试是弱项（应让 agent 列根因、人来判断）；细粒度视觉推理差（难精确还原 Figma 截图，应提供设计系统和可复用组件）；给 agent 专用账号、只读 API key、只给 staging。

**架构层共识**（Hatchworks《Agent UX Patterns》, 2025/2026）：三大失败模式——无限聊天记录当唯一 UI、黑箱行动、无启停控制；12 个控制面模式（任务板、活动时间线、启停语义、自主级别、两阶段行动、行动回执、证据面板、人工检查点、角色卡、安全失败恢复、记忆控制、预算+时间盒）；**编排即 UX**（"编排器是轨道，agent 是火车，用户两者都应看到"）；成熟度模型 Chat-first → 引导代理 → 可信自主，"不要跳级"。Microsoft Design（2025-04）三维度原则（Space/Time/Core）：轻推多于通知、拥抱不确定性但展示置信度与推理依据、最深刻的技术是"消失"的技术（Mark Weiser）。

### 2.11 信任、安全与伦理 UX

- **AI 生成内容标注**：Apple 转向斜体+提示；UF 研究建议平台强制标注；NN/g 指出标注是双刃——"手工感"反而成为新信任信号。
- **权限请求设计**：审批分级（见 2.6）；OpenAI 2026-03 关于提升 agent 对提示注入免疫力的设计建议（搜索级来源）；审计日志应记录真实审查质量而非仅"已批准"。
- **隐私期望**：chatbot 中用户不愿输敏感信息（NN/g, 2018）；Slack/Notion 的 AI 训练数据 opt-out 引发专门指南产业（redact.dev 等）；memory 功能需默认可见+易遗忘。
- **过度拟人化**：适度拟人提升信任（自我一致性），过度拟人触发恐怖谷、误导能力认知（ResearchGate 2026-07；blog.burkert.me 2025-09）；RLHF 的"讨好型"输出使 GenAI 比想象更"有说服力"，拟人化设计放大 over-trust（Towards AI, 2025-09）。

### 2.12 设计流程本身：为"不确定的系统"做设计

**问题**：传统 PRD/规格无法描述概率性行为；团队没有"什么算好"的共享定义。

**经验教训**：
- **Eval 驱动设计**：spec-driven 问"该做什么"，eval-driven 问"怎么知道它有效"（LinkedIn/Edward Hahn, 2026）；Microsoft 语音 agent 团队："我们从不凭感觉改 agent，每次修改都源于一个失败的 eval"（Medium/Microsoft harness, 2025）；Vercel/OpenAI Cookbook/Builder.io/hamel.dev 2025 年密集产出 EDD 方法论（先写评估器、错误分析、标注工具）。
- **成功标准扩展**：AI 产品的评估设计需要超越"任务完成"——适当性（appropriateness）、信任、恢复（recovery）都是一级指标（Rosenfeld Media《The New Design Stack》, 2025-2026）。
- **Zurb 论坛（2025-08）**：设计 AI 不是更快打磨像素，而是"为永远不完美的系统构建韧性（resilience）"。
- **现有 guideline 落地困难**：CHI 2023 研究发现实践者使用 Google PAIR Guidebook 时难以把抽象条目映射到具体产品、不知道何时介入流程、难以团队对齐；Microsoft HAX（Amershi et al., CHI 2019）18 条 guideline 按"初始/交互中/出错时/随时间"组织并提供 HAX Toolkit 工作簿来弥合落地鸿沟。
- **设计系统容纳 AI 组件**：GenUI 让聊天生成按钮/复选框收集上下文，减少打字与记忆负担（NN/g）；zeroheight 探讨设计系统为生成式 UI 预留组件契约（2025）。
- **节奏变化**：Lenny's Podcast（2025-03）"How to win in the AI era"——每周发布、拥抱技术债、无情砍范围；Chat-first ≠ workflow-native，设计正让位于 prompt/工作流编排（uxdesign.cc《Are we designing AI products all wrong?》, Hoang Nguyen, 2025-06）。

---

## 三、高频问题合并表（多来源反复出现）

| 高频问题 | 反复提到的来源 | 一句话结论 |
|---|---|---|
| 信任与透明度是 AI UX 的第一性原理 | NN/g、Hatchworks、Microsoft Design、Uzer、Smashing、LogRocket、ParallelHQ | 不透明=不信任；透明≠解释一切，而是"可按需下钻" |
| 用户不知道 AI 能做什么/能问什么（冷启动+可发现性） | A List Apart、NN/g(chatbots+study guide)、ParallelHQ、Uzer#8 | starters+结构化 prompt+逐步揭示是标配 |
| 错误处理与恢复路径缺失 | Uzer#5、Emily Backes、ParallelHQ、Smashing、NN/g | AI 必然出错，恢复设计比防错更重要 |
| 控制权/HITL/确认与撤销 | Smashing、Hatchworks、siyujia、devin.ai、Uzer#3 | "AI suggests, humans decide"；审批要分级，撤销要常在 |
| 过度承诺与期望管理失败 | Uzer#2、NN/g、LogRocket、Microsoft Design、拟人化研究 | 夸大宣传→失望→弃用；措辞要现实 |
| 上下文丢失/记忆黑盒 | NN/g chatbots、ParallelHQ context drawer、Emily Backes、ChatGPT memory 吐槽 | 上下文须可见、可编辑、转人工须带全量记录 |
| "为加 AI 而加 AI" | NN/g、Uzer、uxdesign.cc、Hatchworks | 先有真实用户问题，再谈 AI |
| 强制开启/opt-out 困难引发反噬 | Reddit r/Notion、Slack 帮助文档、Facebook 群组 | AI 功能要有清晰开关，默认谨慎 |
| AI 摘要/生成内容在高风险场景翻车 | Apple/BBC、Google AI Overviews、AI slop 研究 | 新闻/健康类容错为零；标注+来源质量是底线 |
| 进度透明与失败恢复（Agent 特有） | siyujia、Hatchworks、devin.ai、TianPan.co | 计划外显+关键点暂停+重启优于修补 |
| 拟人化与过度依赖 | Towards AI、ResearchGate、burkert、NN/g | 适度拟人，主动校准依赖 |
| 评估体系缺位（设计流程） | Rosenfeld、Vercel、OpenAI、CHI 2023、Zurb | 从 spec 转向 eval-driven，成功标准含信任/恢复 |

---

## 四、来源清单

**英文（全文精读）**
1. NN/g — Designing AI Products and Features: Study Guide（2019-2025 持续更新）https://www.nngroup.com/articles/designing-ai-study-guide/
2. NN/g — The User Experience of Chatbots（Raluca Budiu, 2018-11）https://www.nngroup.com/articles/chatbots/
3. Hatchworks — Agent UX Patterns: Chat-First UX Fails（2025/2026）https://hatchworks.com/blog/ai-agents/agent-ux-patterns/
4. Microsoft Design — UX design for agents（2025-04）https://microsoft.design/articles/ux-design-for-agents/
5. Smashing Magazine — Designing For Agentic AI: Practical UX Patterns（Victor Yocco, 2026-02）https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/
6. Cognition/Devin — Coding Agents 101（2025-06）https://devin.ai/agents101
7. A List Apart — All Talk and No Buttons: The Conversational UI（Matty Mariansky, 2016-02）https://alistapart.com/article/all-talk-and-no-buttons-the-conversational-ui/
8. ParallelHQ — UX Patterns for LLM and Chat Products（2024/2025）https://www.parallelhq.com/blog/llm-chat-ux-patterns
9. Uzer — 10 Common (and Costly) Mistakes When Designing AI Products（2025）https://uzer.us/10-common-and-costly-mistakes-when-designing-ai-products-and-how-to-avoid-them-with-good-ux/
10. Emily Backes — Common UX Mistakes in AI Chatbot Deployments（2025）https://emilybackes.design/post/ai-chatbots-customer-service-guide
11. LogRocket — Avoiding pitfalls of AI for designers（2024/2025）https://blog.logrocket.com/ux-design/ai-product-design-guiding-principles/
12. TianPan.co — The Approval Prompt Nobody Reads（2026-07-07）https://tianpan.co/blog/2026/07/07/the-approval-prompt-nobody-reads
13. TianPan.co — The Cold Start Problem in AI Personalization（2026-04）https://tianpan.co/blog/2026/04/10/cold-start-problem-ai-personalization
14. The Guardian — Apple suspends AI-generated news alert service after BBC complaint（2025-01-17）https://www.theguardian.com/technology/2025/jan/17/apple-suspends-ai-generated-news-alert-service-after-bbc-complaint

**中文（全文精读）**
15. Siyu's Newsletter — AI Agent 产品交互设计：设计模式与案例分析（贾思玉/亢江妹, 2025-06-07）https://siyujia.net/posts/ai-agent-hci

**搜索级引用（未全文精读）**
- uxdesign.cc — Are we designing AI products all wrong?（Hoang Nguyen, 2025-06）https://uxdesign.cc/are-we-designing-ai-products-all-wrong-d54d1005c92f
- Reddit r/Notion — After Disabling AI-interface Notion Works SO MUCH Faster（2024-09）https://www.reddit.com/r/Notion/comments/1fux96j/
- Six Colors — Apple Intelligence summaries warning labels not enough（2025-01）https://sixcolors.com/post/2025/01/apple-intelligence-summaries-might-get-warning-labels-thats-not-enough/
- UF News — "AI slop" hurts consumers and creators（2026-03）https://news.ufl.edu/2026/03/ai-slop/
- Freevacy — ChatGPT creepily referring to users by names（2025-04）
- Rosenfeld Media — The New Design Stack（2025-2026）https://rosenverse.rosenfeldmedia.com
- Microsoft HAX Toolkit / Amershi et al., Guidelines for Human-AI Interaction（CHI 2019）https://www.microsoft.com/en-us/haxtoolkit
- Google PAIR — People + AI Guidebook / CHI 2023 实践者应用研究 https://pair.withgoogle.com/guidebook
- Lenny's Podcast — How to win in the AI era（2025-03）https://www.lennysnewsletter.com
- TianPan.co — 为什么你无法为智能体设置进度条（2026-07-02，搜索摘要）
- ayautomate — Devin vs Claude Code: Autonomous Agents（2026）
- quoinoid/programmingcentral — AI 聊天流式输出 UX 模式汇总（2025-2026）
