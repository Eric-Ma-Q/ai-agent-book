# 子 agent 与多智能体编排:什么时候该拆,什么时候不该

> 调研日期:2026-10-04。方法:遵守 PROTOCOL 第 2 节并发限流规则,主智能体自己串行检索,未用子智能体;约 25 轮检索/抓取,精读一手来源 18 篇(官方博客/文档 11 篇、论文 7 篇),二手来源 10+ 篇(含中文社区)。对象界定:本篇讨论**编排模式本身**——多 agent 系统的拓扑、通信、代价与适用边界;各家 harness 子代理的**产品形态**横评(上下文隔离、并发上限、配置格式)已在 08 分册 §3.4 完成,此处只引用不重复;Anthropic《How We Built Our Multi-Agent Research System》的数字与两条经验已在总笔记 `ai-harness-explained.html` 2.6 展开,pi 反对子代理的立场已在 07 分册,同样只引用。每条关键事实标注 [官方](厂商文档/官方博客/论文原文)或 [二手](媒体/社区/第三方评测),附时间与来源(全 URL 见文末参考资料);无出处的推断标【推断】;文中数字均为"截至 2026-10"可回源口径。
>
> **T09a 修订(2026-10-05)**:§5.2 的 MAST 42/37/21 失败比例逐条补"约"与 [二手] 标注;Gartner 预测补官方新闻稿 URL(参考资料 27),正文口径同步;参考资料 21–25 尽量补页面级 URL,补不到的注明"仅站点级"及原因。逐条对照见 collab/reports/T09a-research-fixups.report.md。
>
> **修订(2026-10-17)**:§3.1 补子代理**回传量级**的官方口径(1,000–2,000 token,参考资料 28),§3.3 启示补"回传预算"一条;§4.1 把"4×/15× 成本倍数"与"80% 性能归因"拆为两段,并补上原文的两个限定(方差解释≠因果、模型升级优于翻倍 token 预算)。本次为用户直接请求的口径修订,无任务单,故未另出报告。

---

## 一、要点速览

1. **"多 agent"不是一种技术,是八种编排模式**:orchestrator-worker、流水线、并行扇出/汇总、评审者-执行者、辩论、层级/团队、交接、黑板/共享状态——它们的分歧可以用两个轴概括:**控制权在谁手里**(中央编排者 vs 自主交接)和**上下文怎么流**(消息回传 vs 共享文件 vs 黑板)。
2. **多 agent 有实打实的收益证据,但强依赖任务类型**:Anthropic 内评中"Opus 4 领队 + Sonnet 4 子代理"超出单 Opus 4 达 90.2%(研究类广度任务)[官方,2025-06,Anthropic];学术对照里,可分解的金融推理任务多 agent 最高 +80.8%,而顺序规划任务最差 −70.0% [官方,2026-04(v3),arXiv:2512.08296]。
3. **等预算受控实验是反面证据**:同等"思考 token"预算下,单 agent 在多跳推理上一致地持平或优于多 agent——多数已报告的多 agent 优势"更适合用未计入的计算量与上下文效应解释,而非架构本身" [官方,2026-04,arXiv:2604.02460]。
4. **token 倍数有官方数字**:agent 约为聊天的 4×,多 agent 系统约为聊天的 15× [官方,2025-06,Anthropic]——两者都是**成本倍数**(相对聊天的累计 token 消耗),与同篇"token 用量解释 80% 性能方差"的**性能归因**是两个维度,不可换算(见 §4.1);中文社区流传的"40% 失败率"是误传——原文的 40% 是"工具测试 agent 重写工具描述后,后续 agent 完成任务时间缩短约 40%"[官方,2025-06,Anthropic;辨析见 §4.1]。
5. **失败发生在"接缝"而非模型**:伯克利 MAST 分类对 7 个框架 1,642 条多智能体执行轨迹标注出 3 大类 14 种失败模式,失败轨迹占比按框架/任务在 41%–86.7% 之间;三大类是规格与系统设计、智能体间失配(占比最高之一)、任务验证 [官方,2025-03(v1)/2025-10(v3),arXiv:2503.13657;比例数字经二手转述]。
6. **反方阵营的领袖是 Cognition**:《Don't Build Multi-Agents》(2025-06-12,Walden Yan)提出两原则——"共享完整 agent 轨迹,而非单条消息""行动携带隐含决策,冲突的决策带来糟糕结果",主张默认单线程 agent + 任务间压缩,并点名认可 Claude Code 子代理"只回答问题、不写代码"的用法 [官方,2025-06,Cognition]。
7. **Anthropic 自己也不建议在编码任务上用多 agent**:原文明确"需要所有 agent 共享同一上下文、或 agent 间存在大量依赖的领域不是好选择",因为编码"真正可并行的任务比研究少" [官方,2025-06,Anthropic];pi 则把"会话中途派生子代理"视为"没提前规划的症状"(引 07 §3.2)。
8. **并行写同一代码库的工程答案在 2025–2026 收敛**:git worktree 进程内隔离(Claude Code `--worktree`、Cursor 2.0 的 8 路并行)+ 云端一次性环境(Codex cloud、Copilot cloud agent、Cursor Cloud Agents)+ 拉取请求汇合点 + "先研究/评审后写码"的官方纪律(Claude Code Agent Teams 文档)。
9. **协议层在 2026 年分层定型**:MCP 管 agent→工具(垂直),A2A 管 agent→agent(水平),"MCP 和 A2A 不是竞争者——它们高度互补" [官方,2026-10,a2a-protocol.org];A2A 由 Google 捐给 Linux 基金会,2026-08 又加入 Agentic AI Foundation,技术指导委员会有 AWS/Cisco/Google/IBM/Microsoft 等 8 家代表 [官方,2026-10,a2a-protocol.org]。
10. **给 harness 设计者的判据已经清晰**:拆分的收益来自"可并行度 × 上下文隔离收益",成本是"token 倍数 × 一致性风险 × 调试复杂度";默认单 agent,只有当任务**天然可分解、子任务间低耦合、且有集中验证**时才升级到多 agent(决策表见 §9)。

---

## 二、编排模式谱系

### 2.1 先划一条线:工作流还是自主 agent

Anthropic 在《Building Effective Agents》(2024-12)里给出的分界是本领域引用最广的:**工作流(workflow)**是"LLM 和工具通过**预定义代码路径**编排"的系统,**agent**是"LLM **动态指挥自身过程与工具使用**、掌控任务完成方式"的系统 [官方,2024-12,Anthropic Building Effective Agents]。这条线同时定义了多智能体编排的两大族:多**工作流**(拓扑写死在代码里,如流水线、固定扇出)与多 **agent**(拓扑由编排者模型现场决定,如 orchestrator-worker)。同一篇文章的五条工作流模式(链式、路由、并行化、orchestrator-workers、评估者-优化者)实际就是后来所有多 agent 产品的"模式底版" [官方,2024-12,Anthropic]。OpenAI 的 Agents SDK 文档同样把"代码编排"描述为"更确定、更可预测——速度、成本与性能都是" [官方,2026,openai-agents-python 文档]。

### 2.2 八种模式谱系表

| 模式 | 一句话定义 | 代表产品/论文 | 适用 | 代价 |
|---|---|---|---|---|
| **orchestrator-worker(编排者-工作者)** | 中央 LLM 动态拆解任务、派发给工作者、汇总结果;子任务不预定义 | Anthropic 研究系统(2025-06)[官方];OpenAI Agents SDK "agents as tools"(manager 保留控制权)[官方,2026];Magentic-One(2024-11,任务账本+进度账本)[官方];LangGraph supervisor [官方] | 无法预知子任务的复杂查询;多文件改动 | 编排者是单点;token 汇聚于中央;依赖委派质量 |
| **流水线(pipeline)** | 固定顺序的阶段化角色分工,上一步输出是下一步输入 | MetaGPT:SOP 编码进提示词,产品经理→架构师→工程师的"装配线",强制结构化产物(PRD/设计文档/代码)[官方,2023-08,arXiv:2308.00352];Anthropic prompt chaining [官方,2024-12] | 可预知、可分段的任务;每段有明确产物格式 | 延迟按阶段累加;上游错误级联;不灵活 |
| **并行扇出/汇总(fan-out/aggregation)** | 同一任务或独立子任务并发跑多份,程序化汇总 | Anthropic 并行化(sectioning/voting)[官方,2024-12];Codex cloud "Best of N"最多 4 路并行尝试,各自容器出 diff/PR 比对 [官方 changelog,2025-06;二手细节];"More Agents Is All You Need"采样-投票 [官方,2024-02,arXiv:2402.05120] | 广度搜索;提升置信度;难任务的多样尝试 | token 倍数放大;仅当结果可验证/可合并 |
| **评审者-执行者(generator-critic)** | 一个 LLM 生成,另一个循环式给出评估与反馈 | Anthropic evaluator-optimizer 模式 [官方,2024-12];Claude Code/ZCode 内建只读评审子代理(08 §3.4);ACE 的 Generator–Reflector–Curator(总笔记案例 10) | 有清晰评估标准、迭代有增益的任务 | 评审者同样会错;轮次成本;可能互相拉扯 |
| **辩论(debate)** | 多份模型实例互看答案、多轮互相批评修正后裁决 | Du et al.《Improving Factuality and Reasoning through Multiagent Debate》[官方,2023-05,arXiv:2305.14325] | 数学推理、策略问答等可交叉验证的错误 | 多轮对话 token 高;趋同于多数派错误【推断】 |
| **层级/团队(hierarchy/teams)** | 团队 lead 分派任务,队员各自独立上下文,经共享任务清单+消息协作;可嵌套成树 | Claude Code Agent Teams(实验特性:lead + 共享任务清单 + mailbox)[官方,2026-10];LangGraph hierarchical [官方];Qwen Code Agent Teams(08 §3.4) | 多模块并进;需要互相校对的研究/评审 | token 线性放大;协调开销;文档明示"收益递减" |
| **交接(handoff)** | 分诊 agent 把对话控制权整体移交给专家 agent,专家接管本轮后续 | OpenAI Agents SDK handoffs("该专家成为本轮剩余时间的活跃 agent")[官方,2026];LangGraph swarm(handoff)[官方] | 路由/分诊;专家应直接面向用户 | 控制权移交后原 agent 失去感知;历史需裁剪转移 |
| **黑板/共享状态(blackboard)** | 各 agent 不互传消息,而是读写一块共享状态(任务板/文件),由状态变化驱动协作 | 源于经典 AI 黑板系统(1970-80 年代 Hearsay-II,教科书知识);现代形态:Claude Code Agent Teams 的共享任务清单+mailbox JSON 文件 [官方,2026-10];Anthropic 报告 04 的进度文件+git(总笔记深挖);pi"md 文件即状态"(引 07) | 异步、多人/多 agent 长任务;需要外部可见进度 | 状态一致性要自己维护;谁清理、谁仲裁需规则 |

### 2.3 谱系的两条轴

把八种模式放进两个轴就看清了它们的关系。**轴一:控制权**。orchestrator-worker、扇出/汇总、评审者-执行者的控制权始终在中央——OpenAI 把这族叫 "agents as tools"(agent 当工具),明确建议"专家只负责有边界的子任务、不应接管面向用户的对话" [官方,2026,openai-agents-python 文档];交接与团队模式的控制权是**分布式**的——OpenAI 的 handoff 里"专家成为本轮剩余时间的活跃 agent",两者还可以组合:"分诊 agent 交接给专家,专家仍可把其他 agent 当工具调用窄子任务" [官方,2026,openai-agents-python 文档]。**轴二:通信介质**(展开见 §3.3)。Magentic-One 是"账本式中央控制"的极致:编排者在外层循环维护任务账本(事实/猜测/计划),内层循环维护进度账本(任务是否完成?是否卡死?有进展吗?下一个谁说话?),再决定派发与重规划 [官方,2024-11,Microsoft Research]。

值得注意的一点:除辩论外,几乎没有任何生产级编码 harness 采用"agent 互相对话"的去中心化拓扑——Arcade/学术综述称之为 group chat 的形态主要活在框架演示里 [二手,2026,多方框架文档];伯克利扩展规律研究把架构分为 Independent/Centralized/Decentralized/Hybrid 四种,结论是"错配的协调会降低性能",且"没有集中验证的架构更容易传播错误" [官方,2026-04(v3),arXiv:2512.08296]。这与 MAST"失败在接缝"互证:**控制权越分散,接缝越多**【推断,由上述两处证据合取】。

**对 harness 设计的启示**:(1) 模式选择先于模型选择——同一份模型预算,花在"错误的编排拓扑"上的损失可达 70 个百分点(§5.4),远大于换模型的收益;(2) 为用户暴露的应是"扇出/评审/团队"等少数可解释模式,而不是通用"agent 编排框架";(3) 中央验证(orchestrator 上的检查器)应作为模式的默认组件而非可选项——两条独立证据都指向它;(4) 交接模式适合客服/工单类应用,不适合写代码:编码需要回传汇合,不是单向移交;(5) 黑板(文件)是唯一不烧 token 的协调介质,凡需要跨 agent 可见的进度一律落盘。

---

## 三、上下文隔离与通信:子代理拿到什么、回传什么

### 3.1 标准契约:隔离窗口 + 摘要回传

各家子代理的隔离机制横评见 08 分册 §3.4(独立窗口、自定义提示词、默认只回传摘要)。本节补**契约设计**的证据:Anthropic 的委派四件套——"每个子代理需要目标、输出格式、工具与信息源指引、清晰的任务边界"——来自真实反例:模糊的"调研半导体短缺"导致一个子代理去查 2021 年芯片危机、另两个重复调研 2025 年供应链 [官方,2025-06,Anthropic]。Claude Code Agent Teams 文档进一步给出接收侧约束:"给队友足够的出生上下文——它们不继承 lead 的对话历史" [官方,2026-10,code.claude.com/docs/en/agent-teams]。OpenAI Agents SDK 的 handoff 则要处理相反的问题:控制权移交时**对话历史要选择性转移/裁剪**以适配专家的窗口 [官方,2025-03,OpenAI A Practical Guide to Building Agents]。所以无论哪种模式,通信契约都是三段式:**出生上下文(显式给足)→ 过程隔离(过程不回流)→ 回传物(摘要或引用)**。

回传物该有多长,Anthropic 给过一个量级口径:子代理"可能探索性地用掉数万甚至更多 token,但只回传一份浓缩、提炼过的摘要(通常 1,000–2,000 token)" [官方,2025-09-29,Anthropic Effective Context Engineering]。Claude Code 的产品文档是这句话的工程实现——"中间工具调用与结果留在子代理内部,只有它的最终消息返回父级"(only its final message returns to the parent),"父级拿到的是一份简洁摘要,而不是子代理读过的每个文件" [官方,2026-10,code.claude.com/docs/en/sub-agents]。两者分工要分清:1,000–2,000 是**回传预算**的经验值,子代理**内部**烧多少 token 不受此限;产品层没有硬性的回传上限,能调的只有间接旋钮——`maxTurns`(达到上限时回传内容被标记 partial,可 resume)与 `autoCompactWindow`(100,000–1,000,000,决定子代理自己何时压缩)[官方,2026-10,同上]。

### 3.2 "传话失真"的三个机制

MAST 把智能体间失配(inter-agent misalignment)单列为三大失败类之一,其中包括"信息传递不正确""未忽略无关上下文""一个 agent 的错误推理污染整个群体" [官方,2025-03,arXiv:2503.13657]。落回工程,失真有三个机制:

1. **摘要压缩失真**:大段输出经对话历史层层复制、层层转述,Anthropic 称之为"传话游戏(game of telephone)",处方是"子代理把工作直接写入文件系统或外部存储,只向协调者回传轻量引用"——"防止多阶段处理中的信息损失,并降低大段输出经对话历史复制带来的 token 开销" [官方,2025-06,Anthropic 附录]。
2. **隐含决策不对齐**:Cognition 的 Flappy Bird 案例是标准样本——把"做一个 Flappy Bird 克隆"拆给两个子代理,一个把背景做成超级马里奥风格,另一个做的鸟不像游戏素材,因为双方"看不见对方在做什么",各自带着"未事先规定的冲突假设"工作 [官方,2025-06,Cognition]。
3. **错误级联**:一个 agent 的错误输出成为下游输入。伯克利扩展规律研究证实:"没有集中验证的架构比集中协调的架构传播更多错误" [官方,2026-04(v3),arXiv:2512.08296]。

### 3.3 三种通信介质的取舍

| 介质 | 做法 | 优点 | 缺点 | 谁在用 |
|---|---|---|---|---|
| **消息回传** | 子代理结果作为工具结果/消息进入父上下文 | 实现简单;父代理立即掌握结论 | 大输出挤压父窗口;层层转述失真 | 所有 harness 的默认(08 §3.4);OpenAI agents-as-tools |
| **共享文件(工件)** | 产物落盘,回传路径/引用;接手者读文件 | 不占窗口;可审计;跨会话存活 | 文件管理(命名/清理/冲突)要自己设计 | Anthropic 附录处方;报告 04 的进度文件+git(总笔记深挖);pi 的"文件即状态"(引 07);Claude Code worktree 内产物 |
| **黑板(任务板+邮箱)** | 共享任务清单(pending/in-progress/completed+依赖)+ 每 agent 一个 mailbox 文件 | 异步协作;进度外部可见;成员可直接互相发消息 | 状态一致性/清理需规则;读板也花 token | Claude Code Agent Teams(任务清单+mailbox JSON 于 ~/.claude/teams/<team>/inboxes/)[官方,2026-10] |

三种介质不是互斥的,成熟做法是**分层使用**:任务协调走黑板(状态),交付走文件(工件),提醒/汇总走消息(通知)。Agent Teams 文档正是这个结构:任务状态在共享清单、 mailbox 传消息、而"避免两个队友改同一个文件(会导致互相覆盖)"的纪律把**写冲突**挡在文件层之外 [官方,2026-10,agent-teams 文档]。

**对 harness 设计的启示**:(1) 把"委派四件套"做成子代理定义文件的可选字段,而不是靠提示词祈祷;(2) 子代理默认"产物落盘+引用回传",消息回传只留给摘要,大输出一律走文件——这是 Anthropic 复盘里性价比最高的一条;(3) 黑板状态(任务清单)用结构化格式(JSON/带 checkbox 的 md)并规定唯一写者,避免黑板本身变成冲突点;(4) 需要集中验证的检查器必须拿到**全量工件**(读文件)而不是**转述**(读消息),否则验证者也被传话失真传染【推断】;(5) 出生上下文给"边界"(什么不要做)与给"目标"(做什么)同样重要——Anthropic 的重复调研反例缺的正是边界;(6) 给回传物设一个显式 token 预算(官方经验值 1,000–2,000,见 §3.1),并在子代理定义里写明"超出预算的产物落盘,只回传路径与要点"——这条纪律决定多花的 token 落在子代理内部,还是反过来压垮父窗口【推断,量级出处见 §3.1】。

---

## 四、代价:token 倍数、延迟、一致性、调试

### 4.1 token 倍数:官方数字与一次数字漂移的辨析

最常被引用的倍数出自 Anthropic 官方原文:"在我们的数据里,agent 通常使用约 4 倍于聊天的 token,多 agent 系统使用约 15 倍于聊天的 token" [官方,2025-06,Anthropic]。这是**成本倍数**——相对一次普通聊天交互的累计 token 消耗,回答"多 agent 贵多少";口径是内评相对倍数,原文未披露聊天的统计方式,不可当绝对 token 数用。

同一篇文章里常被并排引用的还有**性能归因**数字:BrowseComp 评测中"仅 token 用量一项就解释了 80% 的方差",加上工具调用次数与模型选择三者合计 95% [官方,2025-06,Anthropic]。两者维度不同,不能互相换算或替代:4×/15× 说的是**代价**,80% 说的是**多 agent 为什么有效**——性能优势有相当部分就是买 token 买来的,这为 §5.3 的等预算实验提供了动机。引用这条归因时必须同时带上原文的两个限定:(1) 方差解释是**相关性**,不等于"多烧 token 就一定涨分";(2) 原文明确"升级到 Claude Sonnet 4 的收益大于把 Sonnet 3.7 的 token 预算翻倍"——token 是必要条件,不是充分条件 [官方,2025-06,Anthropic]。

其他公开倍数:pi 生态的 oh-my-pi 发行版被实测出比 pi 本体快 20 倍的 API 消耗(引 07 §6.2)——说明"多 agent 化的上层封装"可以远比官方口径浪费;08 分册 §3.9 的同模型横评里,每成功任务成本从 $0.028(pi)到 $0.195(Claude Code)差 7 倍——harness 的编排策略本身就是成本变量 [二手,2026-08,Composio;引 08]。

**辨析一次中文社区的数字漂移**:多篇中文文章把"40% 失败率"挂在 Anthropic 多 agent 复盘名下。核对原文,该文并无失败率数字;40% 出现在工具测试 agent 的段落——"该 agent 重写工具描述以避免失败,使**未来 agent 的任务完成时间下降约 40%**" [官方,2025-06,Anthropic 原文;二手混淆例见 ByteByteGo 转述及多篇公众号]。类似地,Gartner"到 2027 年底 40% 以上 agentic AI 项目将被取消"的预测(官方新闻稿 2025-06-25,URL 见参考资料 27;Gartner 站点反爬,新闻稿标题与日期经多个独立转述源交叉核对,原报告仍未回溯)也与 Anthropic 无关。**教训与总笔记 03 分册"评测必须披露口径"同构:引用倍数/比率前必须回源**。

### 4.2 延迟:并行买时间,只在可并行处成立

研究系统的实测:领队并行开 3–5 个子代理、子代理内部再并行调 3+ 工具,两项改动"把复杂查询的研究时间最多缩短 90%" [官方,2025-06,Anthropic]。代价侧,08 分册横评显示 harness 间中位耗时 122–272 秒不等 [二手,2026-08,Composio;引 08]。编码任务与研究任务的区别在于依赖链:Anthropic 原文的限制条款——编码"真正可并行的任务比研究少" [官方,2025-06]——意味着 90% 的时间收益**不能外推到编码**;可并行的只是"读"和"验证"(研究/评审),写仍要串行汇合【推断,与 Cognition 及 Agent Teams 官方建议一致】。

### 4.3 一致性冲突:并行写的税

Cognition 的两原则("行动携带隐含决策,冲突的决策带来糟糕结果")就是一致性税的理论化 [官方,2025-06,Cognition];MAST 的智能体间失配类里"不必要/不正确的行动""发现捷径绕过任务规格"都是它的具体形态 [官方,2025-03,arXiv:2503.13657]。工程侧的官方警告最直白:Agent Teams 文档把"同文件编辑"列为差场景——"两个队友编辑同一个文件会导致互相覆盖(overwrites)",并建议"从研究/评审任务开始,而不是并行写码" [官方,2026-10,agent-teams 文档]。并行写码的解法(隔离与汇合)是 §8 的主题。

### 4.4 调试难度:多一层编排,多一类不可复现

Anthropic 在《Building Effective Agents》里直接警告框架"增加抽象层,让调试更复杂",建议从裸 LLM API 起步 [官方,2024-12];OpenAI 的代码编排建议(用 asyncio.gather 等显式代码控制)卖点同样是"更确定、更可预测" [官方,2026,openai-agents-python 文档]。中文社区的生产复盘把账算得更狠:一支团队"花了整整 $47,000 才搞明白"多 agent 是未来但生产级基础设施"现在基本就是个黑洞"(单点故障、上下文超限、隐性重复调用、缺少按 agent 拆账) [二手,2025-12,知乎复盘文]。MAST 的存在本身就是调试难度的证明:如果没有共享词表的失败分类,多 agent 系统的调试只能靠逐条翻轨迹 [官方,2025-03,arXiv:2503.13657]。

**对 harness 设计的启示**:(1) 把"这次并行花了多少 token、谁花的"做成按 agent 拆账的一等视图(对照 ZCode 安装包里可按子代理记账的思路,08 §3.4);(2) 并行度默认保守(Anthropic 努力缩放规则:简单事实检索 1 个 agent/3–10 次工具调用;对比类 2–4 个子代理/各 10–15 次;只有复杂研究才 10+ 子代理 [官方,2025-06]),让"升级并行度"成为需要理由的决定;(3) 时间收益只在子任务真正独立时兑现,拆分前先画依赖图,有依赖就退回流水线或单 agent;(4) 调试视图要能重建"每个 agent 在每一步看到了什么"——多 agent 的不可复现性来自上下文快照的缺失【推断】;(5) 给 token 倍数设预算熔断:15× 不是故障,是常态,预算要按 15× 规划而不是按 2× 规划然后事故。

---

## 五、反方证据:什么时候不该拆

### 5.1 Cognition《Don't Build Multi-Agents》:两原则与 Flappy Bird

Walden Yan(2025-06-12)把反方立场写成了两条"如此关键、如此不值得违反,以至于你应该默认排除"违反它们的架构的原则 [官方,2025-06,Cognition]:

- 原则一:"**共享上下文,共享完整的 agent 轨迹,而不只是单条消息**"(Share context, and share full agent traces, not just individual messages);
- 原则二:"**行动携带隐含决策,冲突的决策带来糟糕结果**"(Actions carry implicit decisions, and conflicting decisions carry bad results)。

由此推出的正面主张:默认"单线程线性 agent"(上下文连续),长任务加一个把历史压缩成"关键细节、事件与决策"的压缩步骤——Cognition 甚至为此微调了一个小模型专职压缩;并称上下文工程"实际上就是构建 AI agent 的工程师的头号工作" [官方,2025-06,Cognition]。该文同时点名认可 Claude Code 的用法:子代理"通常只被指派回答一个问题,不写任何代码",调查过程不占主代理历史,让主轨迹跑得更长 [官方,2025-06,Cognition]。总笔记案例 09 已收录此文,本节只补一点:它的立场在 2026 年被受控实验部分证实、部分证伪——**证实在等预算下多 agent 无优势,证伪在"任何形式的子代理都脆弱"**(只读研究型子代理正是被等预算研究之外的所有证据接受的形态)【推断,§5.3–5.4 与 5.1 的合取】。

### 5.2 MAST:失败在接缝,不在模型

伯克利团队(Cemri 等,NeurIPS 2025 Spotlight)对 7 个主流多智能体框架(LangGraph、AutoGen、ChatDev、MetaGPT 等)的 1,642 条执行轨迹做了六位专家标注,得到 3 大类 14 种失败模式的分类法 MAST [官方,2025-03(v1)/2025-10(v3),arXiv:2503.13657;Spotlight 身份与框架清单经二手确认]:

1. **规格与系统设计**(任务分解错误、角色提示不佳、actor 选错)——约占全部失败的 42% [二手,2025–2026,转述自 MAST 论文分析];
2. **智能体间失配**(信息传递错误、未忽略无关上下文、错误推理污染群体、不服从任务规格、走捷径、不必要/错误行动)——约 37% [二手,同上];
3. **任务验证**(过早终止、验证不充分、验证过程错误)——约 21% [二手,同上]。

失败轨迹占比按框架与任务在 **41%–86.7%** 之间 [二手转述自论文分析,2025–2026]。两个结论值得原样保留:其一,论文摘要明确说多智能体在流行基准上的增益"往往很小(often minimal)" [官方,arXiv 摘要];其二,作者反复强调多数失败**不是模型能力问题,而是接缝问题**——这与 08 分册"harness 是乘数"的结论在多 agent 场景的对应物。

### 5.3 等预算受控实验:优势蒸发

斯坦福 Tran & Kiela(arXiv:2604.02460,v1 2026-04-02)是迄今最直接的受控实验:三个模型族(Qwen3、DeepSeek-R1-Distill-Llama、Gemini 2.5)× 多种多 agent 架构,**固定"思考 token"预算**比较单/多 agent 在多跳推理上的表现。结果:"**在推理 token 恒定时,单 agent 系统在多跳推理任务上一致地持平或优于多 agent 系统**";作者用数据处理不等式(DPI)给出信息论解释,并警告 API 侧预算控制存在显著伪影(尤其 Gemini 2.5)、基准伪影会夸大多 agent 增益;总评是"多 agent 系统的许多已报告优势,更适合用未计入的计算量与上下文效应解释,而非架构本身的好处" [官方,2026-04,arXiv:2604.02460]。

### 5.4 编排扩展规律:+80.8% 与 −70.0% 之间的巨大方差

《Towards a Science of Scaling Agent Systems》(arXiv:2512.08296,v1 2025-12-09,v3 2026-04-08)做了更大的受控扫描:260 组配置 × 6 个 agent 基准 × 5 种架构(Single + Independent/Centralized/Decentralized/Hybrid)× 3 个 LLM 族,标准化工具、提示词与算力以隔离架构效应。关键数字:相对单 agent 基线,架构带来的性能跨度"从可分解金融推理上的 **+80.8%** 到顺序规划上的 **−70.0%**";预测模型 R²=0.373,能为 87% 的留出配置选中最佳架构;并确认两条规律——"单 agent 基线超过某个水平后,协调的收益递减(coordination saturation)""工具密集型任务会出现多 agent 开销" [官方,2026-04(v3),arXiv:2512.08296]。

### 5.5 Anthropic 与 pi:来自"正方"的克制

反方证据不只在反方阵营。Anthropic 原文明确:"**需要所有 agent 共享同一上下文、或 agent 间存在大量依赖的领域不是好选择**",编码任务"真正可并行的任务比研究少" [官方,2025-06];其报告 04(长任务 harness)的 Future work 也写着单 agent 与多 agent 孰优"still unclear"(总笔记深挖引)。pi 的立场更彻底:"会话中途派生子代理是你没提前规划的症状",并行子代理写功能"除非你不在乎代码库退化成垃圾堆"——替代方案是另开会话收集上下文、产出工件(引 07 §3.2)。

### 5.6 正反方与我们的判断

- **正方**:Anthropic 90.2% 内评 [官方,2025-06];+80.8% 可分解任务 [官方,2512.08296];研究时间 −90% [官方,2025-06];"More Agents"采样-投票在原始准确率接近 50% 临界点的任务上随 agent 数单调提升 [官方,2024-02,arXiv:2402.05120];辩论在数学/策略问答上优于单模型与自我反思 [官方,2023-05,arXiv:2305.14325]。
- **反方**:等预算下优势蒸发 [官方,2026-04,2604.02460];顺序规划 −70.0% [官方,2512.08296];增益"往往很小"且 41–86.7% 轨迹有失败 [官方+二手,MAST];Cognition 两原则 [官方,2025-06];token 15× [官方,2025-06]。
- **我们的判断**:两条阵营证据并不矛盾,分界变量有三个——**任务可并行度**(广度研究可拆,依赖链长的写码不可拆)、**预算是否守恒**(放开 token 预算时多 agent 更强,守住预算时优势消失)、**验证结构**(有集中验证的架构显著少传播错误)。多 agent 是"用 token 买并行广度"的工具,不是"提升智能"的工具;在编码 harness 里,它的合理形态是**读取/评审并行 + 写入串行**,而不是"并行写码"。

**对 harness 设计的启示**:(1) 把"等预算对照"列入 harness 自身的评测协议:升并行前,先测同样的 token 预算给单 agent 能到多少分;(2) 失败分类(MAST 三类)应内建成日志维度——每次多 agent 运行打上"规格/失配/验证"的失败标签,可自动统计;(3) 文档要像 Anthropic 一样写明自己的多 agent 不适合什么(共享上下文、强依赖),而不是只宣传 90.2%;(4) "子代理只回答问题不写代码"(Cognition 认可的 Claude Code 用法)是当前证据下最安全的默认值;(5) 凡宣称多 agent 收益的产品材料,先检查它是否披露了 token 总量——未披露即按 §4.1 的教训打折。

---

## 六、受控实验证据盘点(必须回答的问题 1)

**有没有受控实验证明"多 agent 比单 agent 更好"或"更差"?在哪类任务上?差多少?**

| 研究 | 固定了什么 | 任务类型 | 结果 | 出处 |
|---|---|---|---|---|
| Anthropic 内评(2025-06) | 模型族(Opus 4 lead + Sonnet 4 子 vs 单 Opus 4);**未控 token** | 广度研究(如"S&P 500 科技公司董事会成员") | 多 agent **+90.2%** | [官方,2025-06,Anthropic] |
| 斯坦福等预算对照(2026-04) | **思考 token 恒定**;3 模型族 × 多种 MAS 架构 | 多跳推理 | 单 agent **一致持平或更优**;优势归因于未计入算力 | [官方,2026-04,arXiv:2604.02460] |
| 编排扩展规律(2025-12/2026-04) | 工具/提示词/算力标准化;260 配置 | 6 类基准 | **+80.8%**(可分解金融推理)~ **−70.0%**(顺序规划);协调饱和;工具密集任务有开销 | [官方,arXiv:2512.08296] |
| 采样-投票(2024-02) | 同一模型重复采样投票 | MMLU/GSM8K/MATH 等可验证答案任务 | 随 agent 数提升;原始准确率近 50% 时收益最大,远低于时投票失效;仅适用可验证答案 | [官方,arXiv:2402.05120] |
| 多 agent 辩论(2023-05) | 同模型多实例辩论 vs 单模型/自反思 | 数学推理、策略问答 | 辩论提升事实性与推理 | [官方,arXiv:2305.14325] |
| MAST 观察性研究(2025) | —(非对照,标注 1,642 条轨迹) | 7 框架真实运行 | 增益"往往很小";41–86.7% 轨迹存在失败;失败集中在接缝 | [官方,arXiv:2503.13657] |

一句话回答:**有受控实验,且两个方向的都有**。差多少取决于三个变量:不控预算的广度研究任务上多 agent 可赢 80–90 个百分点;等预算的推理任务上单 agent 一致持平或更优;顺序规划类任务上错误编排可输 70 个百分点。编码任务介于其间——官方证据(Anthropic 自己的限制条款、Agent Teams 的"先研究后写码"纪律)都指向"读取并行、写入串行"的混合形态。

**对 harness 设计的启示**:评测多 agent 功能时,报告里必须同时给出"token 预算是否守恒"与"任务可并行度"两个坐标——缺失任何一个坐标的对比都不可比(对照 08 分册"评测必须披露 harness"的元结论)。

---

## 七、协议层:A2A 与 MCP 的分工

**现状**:A2A(Agent2Agent)2025-04 由 Google 发布,2025-06 捐给 Linux 基金会;官方口径:"A2A 最初由 Google 开发并捐赠给 Linux 基金会",由来自 AWS、Cisco、Google、IBM Research、Microsoft、Salesforce、SAP、ServiceNow 的代表组成的技术指导委员会维护,Apache-2.0 许可 [官方,2026-10,a2a-protocol.org]。2026-08-27 官方博客宣布 A2A 加入 Agentic AI Foundation(与 AGENTS.md 同一基金会,引 08 分册 §3.6 的 Linux 基金会脉络),2026-10-01 发布 A2A CLI [官方,2026-08/10,a2a-protocol.org 博客]。规范版本:v1.0 为首个稳定版(2026 年初),含与 v0.3 的破坏性变更但 Agent Card 可同时声明双版本兼容;v1.2 于 2026-03 发布 [二手,2026-08,iTechGuides 等转述,未逐条回溯 spec release notes]。

**与 MCP 的分工**——官方原话:"MCP 是 agent 到工具的通信:它标准化 agent 如何连接工具、API 与资源",而 A2A 让 agent "互相发现、委派任务、共享结果";"**MCP 和 A2A 不是竞争者——它们是高度互补的**" [官方,2026-10,a2a-protocol.org]。A2A 的设计立场是**不透明性**:"在不需要共享内部记忆、工具或专有逻辑的情况下互操作" [官方,2026-10,a2a-protocol.org]——这与本篇 §3 的 harness 内编排相反:harness 内的子代理恰恰要"共享出生上下文、控制回传格式",A2A 解决的是 harness **之间**的互操作。两者接起来,正好是 09 分册"协议是外设总线"的延长线 [二手,2026,adoption 口径:截至 2026-05 约 150+ 组织支持,A2A 成熟度约落后 MCP 一年]。

**对 harness 设计的启示**:(1) harness 内多 agent 用"文件+消息+任务板"就够,A2A 的不透明委派是为跨 harness/跨厂商场景设计的,不要在单机 harness 里套用【推断】;(2) 若暴露多 agent 能力给外部,Agent Card 式的"能力声明+发现"文件值得对标——它与 AGENTS.md/skills 的 markdown 声明风潮同构;(3) MCP 与 A2A 的"垂直/水平"分层是个干净的架构检验:任何"agent 间协议"提案若在做工具接入的活,就是越界;(4) 关注 A2A 的任务生命周期语义(委派/状态/产物回传),它与 harness 内 orchestrator 的任务账本(Magentic-One)惊人相似——跨 harness 委派成熟后,两者的词汇表可能合流【推断】。

---

## 八、长任务与并行编码实践(必须回答的问题 4)

**并行写同一个代码库,业界现在怎么避免冲突?** 答案分三层:**进程内隔离 → 云端隔离 → 汇合点纪律**。

### 8.1 进程内隔离:git worktree

Claude Code 有专门的 worktree 文档页:`--worktree`(或 `-w`)把会话放进 `.claude/worktrees/<name>/`、分支 `worktree-<name>`;文档对收益的原话:"每个 Claude Code 会话跑在自己的 worktree 里,意味着一个会话的编辑永远不会碰到另一个会话的文件,于是一个会话做功能、第二个会话同时修 bug" [官方,2026-10,code.claude.com/docs/en/worktrees]。机制上有四个强制检查(编辑/写操作、shell 工作目录、git 重定向 `git -C`/`GIT_DIR`/`cd`、无法验证的命令形态都会被拦),`.worktreeinclude` 把 `.env` 等 gitignore 文件复制进新 worktree,子代理可用 frontmatter `isolation: worktree` 各得一个临时 worktree(无变更自动清理) [官方,2026-10,worktrees 文档]。Cursor 2.0 的多 agent 界面同样用 git worktree + remote tree 隔离 8 路并行 agent [二手,2025-10/11,SD Times 报道];OpenAI 的《Harness Engineering》把"应用可按 git worktree 逐改动启动"列为环境可读性的关键设施(总笔记 3.1)。Qwen Code 宣称特性对齐含 git worktrees(08 §3.2)。

### 8.2 云端隔离:一次性环境 + 分支 + 草稿 PR

- **Codex cloud**:同一任务最多 4 路并行尝试(Best of N),官方 changelog:"Codex 现在可以为单个任务同时生成多个回复,帮你快速探索可能的解法、挑出最佳方案" [官方 changelog,2025-06,经检索确认原文];`codex cloud exec --attempts <N>`(1–4,默认 1)[二手,2026-09,命令帮助转述];OpenAI 自家的 DevDay 2025 应用就是用 Codex Cloud + best-of-N 并行迭代多个设计做出来的 [官方,2025-11,developers.openai.com 博客]。
- **GitHub Copilot cloud agent**:官方文档页《About GitHub Copilot cloud agent》:把 issue 指派给 Copilot(选 'Copilot' 为 assignee)即触发,agent 在"由 GitHub Actions 驱动的一次性开发环境"里工作,产出变更到分支并转为 PR 供人审 [官方,2026,GitHub Docs];Dependabot 告警指派给 agent 时同样自动建会话并开草稿 PR [官方,2026,GitHub Docs]。
- **Cursor Cloud Agents**(原 Background Agents,2026 年更名):远程隔离 Ubuntu VM、自己开分支、可开草稿 PR;2026-08-19 changelog 展示"跑一群子代理测我的应用找 bug,每个在自己的环境里";2026-09-10 的 Cursor Projects 让协调者"按需并行开多少都行"并可"把任务委派给数千个子代理";2026-09-02 起云 agent 可跑在自托管基础设施(AWS Lambda、Modal 等) [官方,2026-08/09,cursor.com/changelog]。

08 分册 §3.4 已给出各家子代理产品形态横评(隔离窗口、并发默认 20、嵌套层数),本节不重复;这里补的工程结论是:**"并行单元 = 独立上下文 × 独立文件系统 × 独立分支"** 已是三家云端 agent 的共同公式,汇合点统一收束到 PR/diff 比对——由人(或评审 agent)做最终仲裁。

### 8.3 汇合点纪律:从"隔离"到"不冲突"还差三步

1. **任务切分避让**:Agent Teams 官方文档把"同文件编辑"列为差场景并建议"从研究/评审任务开始" [官方,2026-10];Anthropic 复盘的"教领队委派"(给边界防重复劳动) [官方,2025-06] 同属此层。
2. **机械强制的架构不变量**:OpenAI 的 linter 强制分层架构与依赖方向,agent 复制坏模式时由后台任务定期清扫(总笔记 3.1)——并行合并后仍有最后防线。
3. **小步 PR + 集中验证**:Copilot 草稿 PR 机制、Codex diff 并排比对、Anthropic 报告 04 的 JSON 功能清单验收(总笔记深挖)——让"谁对谁错"由验证器而非先到先得决定。

**对 harness 设计的启示**:(1) worktree 隔离应做到"机制强制"而非"提示词承诺"(对照 Claude Code 的四条硬检查:可验证才算隔离);(2) 云 agent 的三件套(一次性环境/自动分支/草稿 PR)是把"审批疲劳"转化为"事后审 diff"的产品答案,与 10 分册沙箱哲学同构——隔离换信任;(3) 汇合点的仲裁者必须拿到全量工件与全量 diff,这个角色天然属于"评审者-执行者"模式;(4) 给并行度配"成本防火墙":云端按容器计费、本地按 token 计费,两种账都要在 UI 常驻可见(对照 08 §3.5 Cursor 的"Auto-review 不是安全边界"式的诚实条款);(5) "数千个子代理"的营销口径与"3–5 个队友"的官方使用建议并存——设计者应以后者为准绳,前者是能力上限不是使用建议【推断】。

---

## 九、"该不该拆"决策表(必须回答的问题 2)

先给三个前置判断(任何一个不满足就别拆):

1. **有真 bug 的单 agent 基线吗?** 若单 agent 失败原因是提示词/工具/上下文管理,先修 harness 再考虑拆(对照 08 分册"harness 乘数"与报告 04"瓶颈在环境")。
2. **子任务互相看不见会坏事吗?**(Cognition 原则二)会——别并行写;要写,退回"读并行、写串行"。
3. **预算能按 15× 规划吗?** 不能,先做 token 策展(08 §3.3),别用并行硬堆。

满足前置后,按任务特征选模式:

| 任务特征 | 上下文规模 | 一致性要求 | 预算 | 推荐模式 | 依据 |
|---|---|---|---|---|---|
| 简单事实检索/定向问答 | 小 | 低 | 紧 | **不拆**:单 agent,3–10 次工具调用 | Anthropic 努力缩放规则 [官方,2025-06];协调饱和(单 agent 已强时协调无益)[官方,2512.08296] |
| 大仓库/长会话,但任务本身串行 | 大 | 高(决策链连续) | 中 | **不拆**:单 agent + compaction/文件外存 | Cognition 单线程主张 [官方,2025-06];pi 立场(引 07) |
| 广度调研、多源并行收集 | 大 | 低(各子题独立) | 可放宽 | **orchestrator-worker(读并行)**:2–4 子代理起步,产物落盘只回传引用 | Anthropic 90.2% 与委派四件套 [官方,2025-06] |
| 对答案有疑虑、需要置信度 | 小 | 低 | 可放宽(答案可验证) | **并行扇出+投票**(best-of-N) | Codex Best of N [官方 changelog];采样-投票在准确率近 50% 时有效 [官方,2402.05120] |
| 有明确质量标准、可机械验收 | 中 | 中 | 中 | **评审者-执行者**:执行 agent + 只读评审 agent 循环 | Anthropic evaluator-optimizer [官方,2024-12];Cognition 认可的只读子代理 [官方,2025-06] |
| 多模块功能,模块间接口已冻结 | 大 | 中(接口处高,内部低) | 宽 | **worktree/云隔离并行写 + PR 汇合**,每模块一个 agent | Claude Code worktrees [官方,2026-10];Codex/Copilot/Cursor 云 agent 公式 [官方,2025–2026] |
| 需要互相校对的多线研究/评审 | 大 | 中 | 很宽 | **Agent Teams**(lead + 3–5 队友 + 共享任务清单) | Agent Teams 文档 [官方,2026-10] |
| 顺序依赖强的重构/迁移 | 中 | **很高** | 任意 | **不拆**:单 agent 顺序执行;要快就缩短反馈环而不是加 agent | 顺序规划 −70.0% [官方,2512.08296];Anthropic 编码警告 [官方,2025-06] |
| 跨厂商/跨 harness 协作 | 各自 | 低 | 独立核算 | **A2A 委派**(不透明,经 Agent Card 发现) | a2a-protocol.org [官方,2026-10] |

使用方法:从上到下找到**第一个**匹配行即停——多数编码任务会落在"不拆"或"读并行"两行;只有接口冻结的多模块工程才值得进 worktree 并行行。

**对 harness 设计的启示**:把这张表编码进 harness 的引导行为——子代理工具的描述里直接写"何时不用我"(对照 Claude Code 工具描述的写法,08 §4.3);并为"拆分"动作加一道预算检查(预估本次扇出的 token 上限,超限先问用户)。

---

## 十、多智能体最常见的五种失败方式与对策(必须回答的问题 3)

以 MAST 三大类为骨架,结合一手工程材料,最常见的五种失败及对策:

| # | 失败方式 | 证据 | 工程对策 |
|---|---|---|---|
| 1 | **任务描述模糊 → 子代理重复劳动/越界** | Anthropic:"调研半导体短缺"致 2021/2025 两拨重复调研 [官方,2025-06] | 委派四件套(目标/输出格式/工具源指引/边界)写进委派模板 [官方,2025-06];领队计划落盘可审(报告 04 模式) |
| 2 | **传话失真**(层层转述丢信息、token 放大) | "game of telephone" [官方,2025-06,附录];MAST"信息传递不正确" [官方,2503.13657] | 产物落盘、只回传轻量引用 [官方,2025-06];共享完整轨迹而非单条消息(Cognition 原则一,适用于必须共享时)[官方,2025-06] |
| 3 | **隐含决策冲突/并行写冲突** | Flappy Bird 两种风格 [官方,2025-06,Cognition];Agent Teams"同文件互相覆盖"警告 [官方,2026-10] | worktree/云环境隔离(§8.1–8.2);任务切分避让同文件;接口先冻结再并行;冲突由集中仲裁(PR/评审 agent)裁决 |
| 4 | **验证缺失/过早终止**(agent 自称完成即结束) | MAST 验证类约占 21% [官方,2503.13657(分类原文);比例经二手转述];报告 04"agent 说做完不算做完"(总笔记) | 集中验证架构(无集中验证的架构传播更多错误 [官方,2512.08296]);机械验收(JSON 清单/测试);完成标准由验证器持有而非执行 agent |
| 5 | **错误级联**(一个 agent 的坏输出污染群体) | MAST"错误推理污染群体" [官方,2503.13657];OpenAI"agent 复制包括坏模式在内的一切"(总笔记 3.1) | 阶段间设程序化门(gate)[官方,2024-12];坏输出触发重规划而非继续(Magentic-One 进度账本检测卡死 [官方,2024-11]);按 agent 拆账+失败标签日志,让级联可归因 |

**对 harness 设计的启示**:五种失败里,1、2 是"委派接口"问题,3 是"文件系统"问题,4、5 是"验证器"问题——多 agent 编排的工程量其实 80% 花在这三处基础件上,而不是花在"聪明的拓扑"上【推断,由 MAST 失败分布(设计+失配合计约 79%)支持】。

---

## 十一、可信度与存疑项

- **高可信**(官方一手,2026-10 实抓/实读):Anthropic 两篇(多 agent 复盘、Building Effective Agents)、Cognition 原文、MAST/斯坦福/扩展规律/More Agents/辩论/MetaGPT 六篇论文页、OpenAI Agents SDK 文档、Magentic-One MS Research 博客、Claude Code Agent Teams 与 worktrees 文档、A2A 官网、GitHub Copilot cloud agent 文档、Cursor changelog。
- **中等**(知名二手,已交叉):Codex Best of N 的 `--attempts` 参数细节(命令帮助转述)、Cursor 2.0 八路并行的 worktree 机制(SD Times)、MAST 框架清单与 NeurIPS Spotlight 身份、各框架清单与 41–86.7% 失败轨迹占比的转述、Gartner 40% 预测(新闻稿已核 URL,原报告未回溯)、A2A v1.0/v1.2 版本时间线(转述,官方站仅见"What's New in v1.0"链接)。
- **未核实/存疑**(明示):中文社区"40% 失败率"确认为误传(§4.1);知乎 $47,000 案例为匿名复盘,金额无法回源,仅作方向参考;LateNode 社区"多 agent 贵 20–30%"的说法样本不足,未采用;"辩论趋同于多数派错误"为我的推断,论文本身报告的是收益【推断】;Anthropic 内评的评测集细节(任务数、判分方式)官方未公开。
- **方法局限**:受协议限流约束为单智能体串行检索;AutoGen 原生 conversation patterns、CrewAI、OpenAI Swarm(已并入 Agents SDK)等框架文档未逐一精读,模式表中的框架归属以官方文档+多方二手交叉为准;2026 年新出现的 MAS 评测基准(MAS-PromptBench 等)未纳入。

---

## 十二、参考资料

1. Anthropic — How we built our multi-agent research system(2025-06-13)https://www.anthropic.com/engineering/built-multi-agent-research-system
2. Anthropic — Building Effective Agents(2024-12)https://www.anthropic.com/research/building-effective-agents
3. Anthropic — Effective Harnesses for Long-Running Agents(2025-11-26;经总笔记深挖核对)https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
4. Cognition — Don't Build Multi-Agents(Walden Yan,2025-06-12)https://cognition.com/blog/dont-build-multi-agents
5. Cemri et al. — Why Do Multi-Agent LLM Systems Fail?(MAST,arXiv:2503.13657,v1 2025-03-17/v3 2025-10-26)https://arxiv.org/abs/2503.13657
6. Tran & Kiela — Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets(arXiv:2604.02460,v1 2026-04-02)https://arxiv.org/abs/2604.02460
7. Kim et al. — Towards a Science of Scaling Agent Systems(arXiv:2512.08296,v1 2025-12-09/v3 2026-04-08)https://arxiv.org/abs/2512.08296
8. Li et al. — More Agents Is All You Need(arXiv:2402.05120,2024-02,TMLR)https://arxiv.org/abs/2402.05120
9. Du et al. — Improving Factuality and Reasoning in Language Models through Multiagent Debate(arXiv:2305.14325,2023-05)https://arxiv.org/abs/2305.14325
10. Hong et al. — MetaGPT: Meta Programming for Multi-Agent Collaborative Framework(arXiv:2308.00352,2023-08)https://arxiv.org/abs/2308.00352
11. Microsoft Research — Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks(2024-11-04)https://www.microsoft.com/en-us/research/blog/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
12. OpenAI — Agents SDK 文档:Multi-agent orchestration(handoffs / agents as tools)https://openai.github.io/openai-agents-python/multi_agent/
13. OpenAI — A Practical Guide to Building Agents(2025-03,PDF)https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
14. OpenAI — How Codex ran OpenAI DevDay 2025(2025-11)https://developers.openai.com/blog/codex-at-devday
15. LangChain — LangGraph 文档:Multi-agent concepts(supervisor/hierarchical/swarm)https://langchain-ai.github.io/langgraph/concepts/multi_agent/
16. Anthropic — Claude Code 文档:Agent Teams(2026-10 实抓)https://code.claude.com/docs/en/agent-teams
17. Anthropic — Claude Code 文档:Run parallel sessions with worktrees(2026-10 实抓)https://code.claude.com/docs/en/worktrees
18. A2A Protocol 官网(治理/TSC/与 MCP 互补声明,2026-10 实抓)https://a2a-protocol.org/latest/
19. GitHub Docs — About GitHub Copilot cloud agent(2026 实抓)https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
20. Cursor — Changelog(Cloud Agents/Projects/swarm 子代理,2026-08/09 条目,2026-10 实抓)https://cursor.com/changelog
21. SD Times — Cursor 2.0 enables eight agents to work in parallel(2025-10/11;仅站点级:站点拒绝抓取(HTTP 400),搜索引擎不返回深链,文章存在性经搜索确认)https://sdtimes.com
22. ByteByteGo — How Anthropic Built a Multi-Agent Research System(2025-09-16;"40%"误传样本;T09a 补深链并核验标题与日期)https://blog.bytebytego.com/p/how-anthropic-built-a-multi-agent
23. 知乎 — Cognition VS Anthropic:多智能体系统的两种截然不同的态度(2025-06-17;仅站点级:知乎专栏深链无法经外部搜索回溯,文章存在性经搜索确认)https://zhuanlan.zhihu.com
24. 知乎 — 为什么在生产环境部署多智能体系统容易出现问题($47,000 案例,2025-12;仅站点级:原帖深链无法经外部搜索回溯,案例流传经多方二手佐证)https://www.zhihu.com
25. InfoQ 中文 — 月烧 35 万元 token、逼得 Claude 官方连夜限速!被全网吐槽的中国"榜一大哥",已经靠 AI 年入千万了(作者褚杏娟,2025-08-20;仅站点级:infoq.cn 文章深链无法经外部搜索回溯,标题/作者/日期经搜索确认)https://www.infoq.cn
26. 本仓库内部交叉引用:research/08-harness-teardown-comparison.md §3.4(各家子代理形态横评)、§3.9(Composio 横评);research/07-pi-design-philosophy.md(pi 反对子代理与文件即状态);research/09-tools-mcp-skills.md(MCP 机制);research/10-agent-security-sandbox.md(沙箱哲学);ai-harness-explained.html 2.6(Anthropic 复盘补遗)、案例 09(Cognition)、深挖(报告 04 演化链)
27. Gartner — Gartner Predicts Over 40% of Agentic AI Projects Will Be Canceled by End of 2027(官方新闻稿,2025-06-25;T09a 补 URL:Gartner 站点反爬(HTTP 403),URL 经多个独立转述源交叉确认,原报告未回溯)https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027
28. Anthropic — Effective context engineering for AI agents(2025-09-29;"子代理只回传浓缩摘要,通常 1,000–2,000 token"的出处)https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

> 注:21/23/24/25 为二手来源,深链无法回溯者已注明原因(T09a);22、27 已补页面级 URL;内部交叉引用(26)不重复计入独立来源数。
