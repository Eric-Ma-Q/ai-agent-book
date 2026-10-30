# Harness 记忆系统调研:agent 怎么"记得",又怎么"忘掉"

> 调研日期:2026-10-04。方法:主智能体串行检索(遵守协作协议限流规则,未用并行子智能体),约 35 次检索与抓取(WebSearch + 官方文档/论文摘要页精读),精读 20 篇全文/摘要,扫过 30+ 检索命中来源;中文社区覆盖 2-3 篇。每条关键事实标注 [官方](厂商文档/官方博客/论文原文)或[二手](媒体/社区/第三方转述),附时间(年月)与 URL;无法核实出处的标【推断】。
>
> **对象界定**:本篇聚焦 harness 记忆层的**机制、研究与设计取舍**。各家产品形态横评见 08 分册 §3.6(引用不重复);MemGPT"窗口当主存、数据库当磁盘"的分页机制在 ai-harness-explained.html 已有完整拆解(深度记忆检索 32.1%→92.5% 那组数字出自 [官方-论文,2023-10,arXiv:2310.08560]),本篇只引结论;"记忆安全"承接 10 分册 §2 的注入威胁模型。本文"记忆"均指**跨会话持久化记忆**;单会话内的上下文管理(compaction 等)见 08 分册 §3.3,不展开。
>
> **T09a 修订(2026-10-05)**:§2.2 ZCode 行由【直接观察】补为"直接观察+安装包字符串"并给出可复核物证;参考资料 26–34 尽量补到页面级,补不到的注明"仅站点级"及原因。逐条对照见 collab/reports/T09a-research-fixups.report.md。

---

## 一、要点速览

1. **分类学的最大公约数是认知科学四分法**:工作记忆(working memory,即上下文窗口)、情景记忆(episodic,经历)、语义记忆(semantic,事实)、程序记忆(procedural,规则技能),出自 CoALA 框架 [官方-论文,2023-09,arXiv:2309.02427],LangGraph 官方文档直接采用 [官方,2026-10,docs.langchain.com]。
2. **2026 年编码 agent 的记忆主流是"文件"**:Claude Code 的 MEMORY.md 索引+主题文件、Codex 的 `~/.codex/memories/` 本地文件、Anthropic memory tool 的客户端 `/memories` 目录、Manus 的"文件系统是终极上下文"——四家头部全部落在文件上 [官方,2026-10,各官方文档]。
3. **文件型记忆在基准上不输专门记忆层**:Letta 用"纯文件+grep/open 工具+GPT-4o-mini"在 LoCoMo 拿 74.0%,超过 Mem0 论文报告的最优配置(68.5%) [官方-厂商,2025-11,forum.letta.com]。
4. **专门记忆层的论点是"超长规模"**:BEAM 基准显示百万 token 会话连百万窗口模型也退化 [官方-论文,2025-10,arXiv:2510.27246];Mem0/Zep 主打抽取-更新流水线与时序知识图谱 [官方-论文,2025-04/2025-01]。
5. **写入是记忆系统最不可靠的一环**。harness 们的共识动作是"别让模型在热路径上随手写":Codex 把写入推迟到会话空闲后的后台批处理、跳过短会话、脱敏密钥 [官方,2026-10,learn.chatgpt.com];Mem0 用"抽取后比对四选一(ADD/UPDATE/DELETE/NOOP)"补自主写入的不可靠 [官方-论文,2025-04,arXiv:2504.19413]。
6. **"记忆腐烂"(memory rot)已是实践者命名的真问题**:过期记忆不更新、决策互相矛盾、CLAUDE.md 膨胀失效 [二手,2026-05,dev.to];遗忘机制(艾宾浩斯曲线 [官方-论文,2023-05,arXiv:2305.10250]、sleep-time 后台整理 [官方-论文,2025-04,arXiv:2504.13171])重新回到设计视野。
7. **记忆把提示注入从一次性变成驻留**:SpAIware(2024-09)证明注入可写进 ChatGPT 长期记忆并持续外传后续对话 [二手-研究者,2024-09,embracethered.com];AgentPoison 证明 <0.1% 投毒率即可让 RAG 记忆库后门成功率 >80% [官方-论文,2024-07,arXiv:2407.12784]。
8. **防御共识开始成形**:不可信内容在上下文里时禁写记忆(Codex `disable_on_external_context` 开关 [官方,2026-10])、写入脱敏、记忆当不可信输入读、用户可查看可删除。
9. **记忆基准正在打"基准大战"**:Mem0 论文里全上下文基线(约 72.9%)高于 Mem0 本身(约 66.9%) [二手,转述论文表格];LoCoMo 被审计出约 6.4% 的标准答案有错 [二手,2025-12,经 automem.ai 转述];结论:小规模基准上"专门记忆层"对"笨办法"的优势远小于宣传。
10. **商业助手跨会话记忆准确率下降约 30%**(LongMemEval,ICLR 2025) [官方-论文,2024-10,arXiv:2410.10813]——记忆是"做了也更难做好"的方向,值得 harness 设计者花心思但别指望开箱即灵。

---

## 二、记忆分类学:四分法从认知科学到工程界的旅行

### 2.1 学术源头:CoALA 的四分法

学界的通用框架是 CoALA(Cognitive Architectures for Language Agents,Sumers/Yao/Narasimhan/Griffiths,TMLR):把 agent 记忆按认知科学分为**工作记忆**(当前上下文)、**情景记忆**(过往经历的动作/轨迹)、**语义记忆**(事实与知识)、**程序记忆**(执行任务的规则,agent 中体现为 prompt/代码/技能)[官方-论文,2023-09,arXiv:2309.02427]。这篇框架论文成为后来几乎所有工程文档的引用源头——LangGraph 官方文档的 semantic/episodic/procedural 三分法即直接引它 [官方,2026-10,docs.langchain.com/oss/python/langgraph/memory]。

更早的英文综述《A Survey on the Memory Mechanism of Large Language Model based Agents》(2024-04,39 页;作者来自中国人民大学高瓴人工智能学院与华为诺亚方舟实验室)的贡献是把散落论文按"写什么、怎么管理、怎么读"组织成 write–manage–read 流程,结论是当时研究"分散在不同论文里,难以抽象出通用且有效的设计模式" [官方-论文,2024-04,arXiv:2404.13501]。两年后回看,这句话仍然成立:工程界在写入侧远未收敛(见 §四)。

### 2.2 工程界的落地分法:对照表

| 体系 | 分法 | 对应物 | 来源 |
|---|---|---|---|
| CoALA(学术) | working / episodic / semantic / procedural | 上下文 / 轨迹 / 事实 / prompt+代码 | [官方-论文,2023-09,arXiv:2309.02427] |
| LangGraph(官方文档) | semantic(事实,可 profile 或 collection)/ episodic(经历,few-shot)/ procedural(规则,靠 reflection 改 prompt) | 用户画像 / 历史动作 / 系统指令 | [官方,2026-10,docs.langchain.com] |
| Letta/MemGPT(产品) | 论文/早期:core memory blocks(常驻可自编辑)/ recall(全部消息)/ archival(向量外存);**当前文档(2026-10)已转向 MemFS——git 版本化的记忆文件系统+Dreaming 后台整理** | 工作记忆 / 情景记忆 / 语义记忆 | [官方-论文,2023-10,arXiv:2310.08560;官方,2026-10,docs.letta.com/configuration/memory] |
| Claude Code(产品) | 自动记忆四类:user / feedback / project / reference;MEMORY.md 索引常驻、主题文件按需读 | 用户是谁 / 用户怎么调教我 / 项目事实 / 外部资料指针 | [官方,2026-10,docs/memory,引 08 §3.6] |
| ZCode(本库运行环境) | 同四类:user / feedback / project / reference;MEMORY.md 索引每会话注入,单事实文件+frontmatter | 同上 | 【直接观察+安装包字符串】物证(2026-10-05 检出):安装包 `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` 内含四分类枚举 `["user","feedback","project","reference"]`、索引注入与截断字符串"MEMORY.md is always loaded into your conversation context — lines after 200 will be truncated"、记忆文件 frontmatter 模板(name/description/metadata.type: user \| feedback \| project \| reference),与左列描述一致,读者可自行复核 |
| 生成式智能体(学术) | memory stream(观察逐条入流)+ reflection 生成的高层洞察 | 情景记忆 + 反思生成的语义记忆 | [官方-论文,2023-04,arXiv:2304.03442] |

这张表暴露一个有意思的事实:**产品界没有一家宣称自己在做"情景记忆"**。Claude Code 的 feedback 类、Codex 的 summaries、LangGraph 的 episodic(few-shot 示例)其实都在装情景记忆,但都以"事实/规则文件"的形式物化——因为文件型存储里,"经历"必须被**陈述化**(写成"用户偏好 X"这样的事实句)才能存活。这解释了为什么编码 agent 的记忆读起来像"笔记"而不是"日志"【推断,基于上表归纳】。

### 2.3 工作记忆的边界:上下文即记忆的第一层

Anthropic 工程博客把这件事讲得最直白:上下文窗口要当"边际收益递减的有限资源"管——token 越多召回精度越低(context rot),因为注意力是 n² 关系的"attention budget" [官方,2025-09,anthropic.com/engineering]。Manus 从生产侧给了经济学版本:KV-cache 命中率是生产 agent 最重要的单一指标,他们平均输入输出 token 比约 100:1,缓存输入 $0.30 vs 未缓存 $3.00/MTok(以 Claude Sonnet 计),相差 10 倍 [官方,2025-07,manus.im blog]。这两条共同决定了记忆系统的基本形态:**记忆必须大部分时间待在上下文之外,用一个很薄的索引与上下文相连**。

**对 harness 设计的启示**
1. 分类学直接抄 CoALA/LangGraph 四分法,别发明新名词;关键决策是"哪几类配自动写入、哪几类只允许显式写入"。
2. 情景记忆必须陈述化才能进文件型存储——设计写入规则时要显式做"经历→事实/教训"的转换步骤(反思),而不是存原始日志。
3. 索引要薄到可以常驻(参照 Claude Code 200 行/25KB 上限,引 08 §3.6),这是缓存经济学决定的,不是口味问题。
4. 给每类记忆定义"什么信号触发写入":用户偏好→user 类,用户纠正→feedback 类,别混。

---

## 三、存储与检索形态:六种形态与一张代价表

### 3.1 六种形态实拍

**① 纯文件(索引+正文)**。Claude Code 自动记忆:MEMORY.md 索引(前 200 行/25KB 自动进上下文)+ 按需读的主题文件,写入带 user/feedback/project/reference 分类 [官方,2026-10,docs/memory,引 08 §3.6]。Anthropic memory tool 是同一思路的 API 化:工具定义 `{"type": "memory_20250818"}`,六个命令(view/create/str_replace/insert/delete/rename)全部由**客户端**执行,"memory lives entirely in your application",存储格式不限定;系统提示自动注入的协议要求 Claude"做任何事之前先看记忆目录",并假设"context window might be reset at any moment" [官方,2026-10,platform.claude.com/docs memory-tool]。Codex Memories 是文件型的第三个变体:记忆存在 `~/.codex/memories/`(summaries、durable entries、recent inputs、支持证据),官方明确"视为 generated state",建议别手改 [官方,2026-10,learn.chatgpt.com/docs/customization/memories]。Manus 给了这条路线的哲学表述:"we treat the file system as the ultimate context"——大小无限、天然持久、agent 自己可操作,压缩必须可还原(网页只留 URL、文档只留路径) [官方,2025-07,manus.im blog]。

**② 分层记忆(OS 式)**。MemGPT/Letta 的经典设计:core memory blocks 常驻系统提示内、agent 用工具自编辑;recall memory 是可检索的完整消息日志;archival memory 是向量索引的外部存储,模型按需检索分页进上下文 [官方-论文,2023-10,arXiv:2310.08560;官方,2026-10,docs.letta.com ADE 页]。机制详见 ai-harness-explained.html 案例页,此处不重复。**值得单独记录的转向**:2026-10 抓取的 Letta 当前文档里,这套三分法已被替换为 **MemFS——"a git-backed memory filesystem that they can inspect and edit"**(git 版本化、可重组、重组前自动备份、用 /remember 教记忆),配合 **Dreaming** 机制——"uses background subagents to review recent conversations, consolidate useful lessons, and update memory without interrupting your active work",触发条件可选"一定步数后"或"上下文被压缩时",还可让 agent 在第二个后台会话里审查记忆更新 [官方,2026-10,docs.letta.com/configuration/memory]。OS 隐喻的原创者最终收敛到了"文件+后台整理",这是文件型路线最有分量的一个注脚。

**③ 抽取-更新流水线**。Mem0:两阶段——extraction 阶段从对话抽候选记忆,update 阶段与已有记忆比对,由 LLM 自主决定 ADD / UPDATE / DELETE / NOOP 四种操作之一,让记忆库"自动保持一致" [官方-论文,2025-04,arXiv:2504.19413]。注意这个设计的真实含义:**承认模型自主写入不可靠,所以每次写入都要先做一轮全库比对**——这是用推理成本换一致性的设计。

**④ 时序知识图谱**。Zep/Graphiti:"temporally-aware knowledge graph engine",动态融合对话数据与业务数据、保留历史关系 [官方-论文,2025-01,arXiv:2501.13956];论文报 DMR 94.8% vs MemGPT 93.4%,LongMemEval 准确率最高 +18.5%、延迟 -90%。图谱路线的卖点是多跳关系推理(谁和谁、什么时候、什么关系变化)。

**⑤ 产品黑盒(ChatGPT memory)**。两层:saved memories(用户显式让记的)+ reference chat history(2025-04 起 Plus/Pro 可"引用全部过往对话") [二手,2025-04,TechRadar/PCMag 报道 OpenAI 公告];官方 FAQ(help.openai.com article 8590148)未公开内部实现,第三方分析认为是滚动画像而非向量检索【推断,基于 [二手,2025-2026,justin3go.com/pub.towardsai.net] 分析,OpenAI 未证实】。

**⑥ 无记忆,文件系统即状态**。pi 的立场:"prompts are code, .md files are state",不设专门记忆层(引 07 §3.4)。Aider 同路:repo map 即记忆,无跨会话机制(引 08 §3.6)。

### 3.2 对比表:存储形态 × 适用场景 × 代价

| 形态 | 代表 | 检索方式 | 适用场景 | 主要代价 | 失效模式 |
|---|---|---|---|---|---|
| 纯文件(索引+正文) | Claude Code / Codex / Anthropic memory tool / Manus | 索引常驻+按需读文件+grep | 个人与项目级记忆,条目数万以内 | 写入要自律,索引会膨胀 | 记忆腐烂、写入噪声(§四/§五) |
| 分层记忆(经典)/文件系统(当前) | MemGPT/Letta | 早期:常驻 blocks+向量检索分页;当前:git 版本化 MemFS+Dreaming 后台整理 | 长陪伴对话、需要模型自管理窗口 | 依赖模型函数调用可靠性;自建存储 | 分页决策错误(引 html 案例页);当前架构的代价是记忆文件膨胀(引 3.1②) |
| 抽取-更新流水线 | Mem0 | 向量/关键词检索记忆条目 | 跨用户产品记忆、海量会话沉淀 | 每次写入多一轮 LLM 比对;抽取丢真 | 抽取丢信息;更新判错(§4.2) |
| 时序知识图谱 | Zep/Graphiti | 图查询+向量混合 | 多跳关系、实体随时间演化、企业数据融合 | 建图与维护成本高;schema 设计门槛 | 图谱腐烂、错误边长期驻留 |
| 产品黑盒 | ChatGPT memory | 官方未公开 | 直接面向消费者的助手 | 用户不可审计、不可迁移 | 植入/外传事件(§六) |
| 无记忆层 | pi / Aider | 无(用户手动带上下文) | 单仓单人、git 历史即记忆 | 跨会话上下文全靠人 | 无(也无可赢利) |

### 3.3 正方 / 反方 / 我们的判断:向量与图谱到底值不值得上

**正方(该上)**:BEAM 基准(100 会话、2000 题)显示百万 token 级会话连百万窗口模型也显著退化 [官方-论文,2025-10,arXiv:2510.27246];Mem0 报告其记忆层在 1M/10M token 会话上得分 64.1/48.6,而通用长上下文方案掉得更狠 [二手,2026,beri.net 转述 Mem0 指南]。Zep 论文显示时序图谱在多跳与时间推理任务上领先 [官方-论文,2025-01,arXiv:2501.13956]。跨用户、跨项目的产品级记忆(千万条目、模糊语义召回)文件+grep 物理上不可行【推断】。

**反方(不该上)**:编码 agent 的检索对象是代码和指令——精确匹配(grep、文件路径)的召回质量天然高于 embedding;学术普查的横截面证据是**11 个真实 agent runtime 没有一个用向量检索做代码召回** [官方-论文,2026-07,arXiv:2609.00006,引 08 §3.7];Letta 实测纯文件+grep 在 LoCoMo 上 74.0%,超 Mem0 论文最优的 68.5% [官方-厂商,2025-11,forum.letta.com];Manus 的 100:1 token 比意味着任何"每次注入不同片段"的检索策略都在毁 KV-cache [官方,2025-07,manus.im blog]。

**我们的判断**:分界线是**记忆条目规模与查询模糊度**,不是信仰。单项目/单用户的编码场景(几千到几万条、查询高度具体)文件+索引是 2026 年的工程均衡点,向量/图谱是过度设计;跨用户产品记忆、千万级企业知识、多跳关系问题,才轮到 Mem0/Zep 们的架构。另一个常被忽略的判据:**记忆写入频率**——文件型靠 agent 自律写入,条目规模天然受限于"模型愿意写多少";一旦写入是系统自动沉淀(每次会话都写),就必须配抽取-更新流水线,那时向量库是必要条件而非选择【推断,基于 §四写入策略分析】。

**对 harness 设计的启示**
1. 先做文件+索引,把"何时升级到向量/图谱"写成可度量的触发条件(如条目数、检索未命中率),而不是直接上重架构。
2. 若用 Anthropic 式 memory tool,存储格式自己定的好处是**随时可以换后端**——接口是文件命令,底下可以换数据库。
3. 记忆检索尽量复用代码检索的同一套工具(grep/read),少一套工具少一份 token 账本负担(对照 09 分册)。
4. 前缀缓存优先:索引放系统提示区并保持稳定,正文读取放上下文尾部,别把检索结果插中间。

---

## 四、写入策略:谁写、写什么、什么时候写

### 4.1 三个决策维度

写入策略 = 谁决定写(模型自主 / harness 规则 / 用户显式)× 写什么(事实 / 过程 / 反馈)× 何时写(实时 / 会话结束 / 空闲后台)。LangGraph 官方文档把第三个维度讲成标准权衡:**热路径写入**(agent 运行中顺手写)实时透明,但增加延迟、让 agent 在"记东西"和"干正事"之间分心;**后台写入**无延迟,但要决定触发时机(定时/cron/手动) [官方,2026-10,docs.langchain.com]。

### 4.2 写入策略对比表

| 策略 | 谁写 | 写什么 | 何时写 | 去重与合并 | 代表 |
|---|---|---|---|---|---|
| 模型全自主热路径 | 模型 | 任意"它觉得重要"的内容 | 对话进行中实时 | 无系统化机制,靠模型自觉 | 早期 ChatGPT save_memories;Gemini CLI save_memory(引 08 §3.6) |
| 协议强制+用户显式 | 模型按注入协议,用户可纠 | 用户/项目事实,分四类 | 实时,但受规则约束 | 模型维护,索引手动可改 | Claude Code 自动记忆;Anthropic memory tool(注入协议强制"先看记忆") |
| 后台批处理+整合 | 独立提取模型+整合模型 | summaries、durable entries、证据 | 会话空闲后批量,跳过短/活跃会话 | consolidation 模型全局整合,自动脱敏 | Codex Memories [官方,2026-10,learn.chatgpt.com] |
| 抽取-更新四操作 | 专用流水线 | 抽取后的事实条目 | 实时或准实时 | UPDATE 阶段与全库比对,ADD/UPDATE/DELETE/NOOP | Mem0 [官方-论文,2025-04] |
| 重要性评分+反思 | 模型打分,阈值触发整合 | 观察记录 + 反思生成的高层洞察 | 逐条写入;重要性累积超阈值触发反思 | 反思把多条合并为洞察,树状链接 | 生成式智能体 [官方-论文,2023-04,arXiv:2304.03442] |
| 失败驱动(只写教训) | 模型自反思 | 对失败轨迹的文本归因 | 每次试验失败后 | 存情景记忆缓冲,下次尝试注入 | Reflexion [官方-论文,2023-03,arXiv:2303.11366] |
| 空闲期预计算 | sleep-time agent | 对已知上下文的预推理结果 | 空闲时段 | 结果可摊销到多个未来查询 | sleep-time compute [官方-论文,2025-04,arXiv:2504.13171] |
| 用户显式驱动 | 用户 | 用户认为该记的 | 用户指令时 | 用户全权管理 | ChatGPT saved memories;Aider CONVENTIONS.md(引 08 §3.6) |

### 4.3 三个值得注意的工程事实

**其一,"协议强制读"比"协议强制写"更成熟。** Anthropic memory tool 注入的系统协议只硬性规定一件事:动之前先看记忆目录、假设上下文随时会重置、进度必须随时落盘 [官方,2026-10,platform.claude.com]。这是把记忆当成"进程检查点"用——写入是手段,断点续传才是目的。Manus 的 todo.md 复述同理:长任务里不断重写目标到上下文末尾,是对抗 lost-in-the-middle 的注意力偏置 [官方,2025-07,manus.im blog]。

**其二,头部产品都在把写入从模型手里拿走。** Codex 用后台批处理+独立整合模型+配额门槛(`min_rate_limit_remaining_percent`,记忆生成消耗剩余配额低于阈值就不跑),还显式区分提取与整合两个模型(`extract_model`/`consolidation_model`) [官方,2026-10,learn.chatgpt.com]。Mem0 的四操作更新阶段本质是给"自主写入"加一个复核关卡。两家的共同潜台词:**模型在热路径上随手写的东西不可信**(证据见 §8.2)。

**其三,写"什么"的分化比写"多少"更重要。** Claude Code 把 feedback(用户的纠正)单列一类 [官方,2026-10,引 08 §3.6];Reflexion 只写失败归因不写成功过程 [官方-论文,2023-03];生成式智能体给每条记忆打 1-10 重要性分,让"刷牙"这类低分事件自然被反思筛掉 [官方-论文,2023-04]。经验方向一致:**写入过滤器的第一优先级是"反馈与教训",第二是"事实",第三才是"过程"**【推断,基于上述三处归纳】。

**对 harness 设计的启示**
1. 写入默认走后台批处理;热路径只保留"检查点式"小写入(当前目标、关键决策),这是唯一在会话中断场景下不可替代的写入。
2. 写入管线至少两段:提取(会话级)与整合(全局级)分开,合并/去重发生在整合段,可复用 sleep-time 思路在空闲期做。
3. 写入要带元数据:时间戳、来源(哪次会话/是否含不可信内容)、类别、置信度——§五的遗忘和 §六的安全都吃这个字段。
4. "先读后写"入协议:agent 写记忆前必须先查重,查重用检索而不是全库比对(成本差一个量级)。
5. 给用户一个显式写入通道(如"记住这个"),它既是功能也是纠正模型自主写入错误的兜底。

---

## 五、遗忘与更新:记忆为什么会烂

### 5.1 "记忆腐烂"是已被命名的真问题

2026 年实践者社区开始用 memory rot 指代一组症状:长会话里的 working-memory rot(第一个小时做的决定被第四个小时推翻)、跨会话的陈旧事实、CLAUDE.md/AGENTS.md 膨胀后互相矛盾的规则 [二手,2026-05,dev.to《AI agents don't have a memory problem》;2026,HN"Recall – local project memory for Claude Code"讨论]。社区给出的药方高度一致:夜间整理(nightly consolidation)、把持久规则与参考资料分目录、交接时显式标记"陈旧记忆漂移" [二手,2026,dev.to;underhum.dev]。

产品侧也有公开事故可引:OpenAI 社区论坛 2025-03 的报告称,一次后端记忆架构更新后,ChatGPT 长期记忆"静默损坏",部分用户丢失了积累数年的上下文 [二手,2025-03,community.openai.com]。这暴露的是记忆的版本化与迁移能力缺失——记忆系统的 schema 会演化,但用户的记忆不能重来。

### 5.2 学术界的遗忘机制谱系

- **艾宾浩斯遗忘曲线**:MemoryBank(2023-05)按时间流逝+记忆重要性双因素衰减,"重要记忆强化、不重要记忆更快遗忘",模拟人类选择性保存 [官方-论文,2023-05,arXiv:2305.10250]。
- **重要性阈值触发反思**:生成式智能体(2023-04)的 reflection 机制,高分记忆累积超阈值时停下来做归纳,把散落经历合成高层洞察 [官方-论文,2023-04,arXiv:2304.03442]。
- **记忆演化**:A-MEM(NeurIPS 2025)借鉴 Zettelkasten 笔记法,新记忆进来时自动链接旧记忆并**触发旧记忆的上下文与属性更新**——记忆库是活的网络而非死档案 [官方-论文,2025-02,arXiv:2502.12110]。
- **时序失效(edge invalidation)**:Zep/Graphiti 给图上的关系边打时间戳,新事实不是覆盖旧事实而是"旧边失效、新边生效",历史可回溯 [官方-论文,2025-01,arXiv:2501.13956]。
- **空闲期整理**:sleep-time compute(2025-04)证明把推理挪到空闲期,同等准确率下测试时计算省约 5 倍,准确率还能再提升 13-18% [官方-论文,2025-04,arXiv:2504.13171]——为"夜间整理记忆"提供了经济学依据。
- **选择性遗忘是评测维度**:MemoryAgentBench 把 selective forgetting 列为四大能力之一,并发现现有方法没有谁能同时掌握四项 [官方-论文,2025-07,arXiv:2507.05257]——遗忘在 2026 年仍是无人及格的考题。

### 5.3 更新的三个难点

一是**过期检测**:记忆没有 TTL 就会烂,但给事实定 TTL 很难("用户住在北京"和"用户正在北京出差"衰减速度完全不同)【推断】。二是**冲突消解**:新事实与旧事实矛盾时,谁赢?LongMemEval 把"知识更新"(knowledge updates)单列为五大能力之一,而商业助手整体在这套基准上掉约 30% 准确率 [官方-论文,2024-10,arXiv:2410.10813]——更新恰是最弱的一环。三是**版本化**:Codex 把记忆当"generated state"、可随时重建 [官方,2026-10,learn.chatgpt.com];Zep 的失效边保留历史 [官方-论文,2025-01];两者合起来才是完整答案——记忆应该可重建(可以从会话历史重新生成),这比"永不删除"更可靠。

**对 harness 设计的启示**
1. 记忆条目必须带时间戳和最后验证时间;检索时把"这条多旧了"暴露给模型,而不是假装记忆永远新鲜。
2. 冲突策略写成规则:时间新的赢,但保留旧版本可回溯(Zep 式失效而非删除);来源等级高的赢(用户显式 > 模型自主)。
3. 定期(会话数或天数触发)做后台整理:合并重复、归档过期、把多条事实升维成规则——sleep-time 的 5 倍经济学是现成依据。
4. 记忆库设计成"可重建"的派生态:原始输入(会话历史)在,记忆可以从头再生成;这决定了对记忆损坏不必恐慌。
5. 给"遗忘"一个用户界面:让用户能问"你记得我什么"并逐条删除——这同时是隐私合规要求。

---

## 六、记忆安全:从一次性注入到长期驻留

### 6.1 为什么记忆是注入的放大器

10 分册 §2 的威胁模型里,agent 危险的三要素是"读私密数据 + 吃不可信内容 + 能对外通信"。记忆层的特殊性在于:**它把一次成功的注入变成持久后门**。注入载荷不再需要每轮都在上下文里——写进记忆一次,每次会话开始都会被 harness 主动请回上下文。用 Willison 三要素的语言说,记忆给攻击者提供了"会话间的状态存储",这是传统 Web 攻击模型里没有的原语【推断,基于 10 分册框架延伸】。

### 6.2 公开案例链(2024-2025)

- **ChatGPT 持久 DoS**(2024-07):Rehberger 演示经提示注入把伪造记忆写入 ChatGPT,造成跨会话的拒绝服务与记忆操纵 [二手-研究者,2024-07,embracethered.com/blog/posts/2024/chatgpt-persistent-denial-of-service]。
- **SpAIware**(2024-09):恶意程序借提示注入在 ChatGPT 长期记忆里植入指令,把用户**后续所有对话**持续外传到攻击者端点;OpenAI 2024-09 中下旬修复 [二手-研究者,2024-09,embracethered.com;二手,2024-09,The Hacker News 报道;二手,2024-10,Schneier on Security 评论]。这是"记忆持久化间谍软件"的标志性事件,中文社区称为"记忆持久化间谍攻击" [二手-中文,2026,zhuanlan.zhihu.com 事件盘点]。
- **ChatGPT macOS 桌面应用链**(2024):不可信内容→写恶意记忆→持续外传的完整攻击链 [二手-研究者,2024,embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration]。
- **Gemini 记忆改写**(2025-02):注入可改写用户的 Gemini 记忆("你的 AI 在重写你的个人史") [二手-研究者,2025-02,embracethered.com《Hacking Gemini's Memory with Prompt Injection》]。
- **对话史与记忆外传**(2025):滥用系统提示把 ChatGPT 聊天记录与记忆带出 [二手-研究者,2025,embracethered.com/blog/posts/2025/chatgpt-chat-history-data-exfiltration]。
- **记忆库投毒后门**:AgentPoison(NeurIPS 2024)把后门触发器优化到独特嵌入空间,<0.1% 投毒率下对 RAG 助手、自动驾驶 agent、医疗 EHRAgent 达成 >80% 攻击成功率、良性性能影响 <1%,无需改模型参数 [官方-论文,2024-07,arXiv:2407.12784]。对多人共享记忆库的团队场景,这是"一个被污染,全员被后门"的结构性风险【推断,基于其机制】。

### 6.3 目前的防御做法

1. **写入闸门——有不可信内容就别写**。Codex 官方提供 `memories.disable_on_external_context`:用了 MCP 调用、网页搜索等外部上下文的会话不参与记忆生成 [官方,2026-10,learn.chatgpt.com]。这是目前最清晰的"切断注入→记忆"通道的官方实现,代价是牺牲大量正常会话的记忆沉淀【推断,权衡由用户配置决定】。
2. **写入脱敏**。Codex 生成记忆时自动"redacts secrets from generated memory fields",并告诫"Don't store secrets in memories" [官方,2026-10,learn.chatgpt.com];Anthropic memory tool 文档建议过滤敏感信息、限制文件大小 [官方,2026-10,platform.claude.com]。
3. **存储层加固**。Anthropic 明确安全责任在客户端实现:路径穿越防护(拒绝 `/memories` 外路径、解析规范路径、警惕 `../` 与 URL 编码绕过) [官方,2026-10,platform.claude.com]。
4. **记忆当不可信输入读**。把 10 分册 §四的防御栈平移过来:spotlighting(标记记忆来源与边界)、双 LLM(隔离阅读记忆)、CaMeL 式数据流控制(记忆内容不得直接变成高权限动作的参数)。记忆条目带来源标注,渲染时让模型能区分"记忆里的历史指令"与"当前用户指令"。
5. **用户可见可逆**。OpenAI 在 SpAIware 后的修复方向之一是让记忆变更可见、可管理;ChatGPT/Codex 都有 `/memories` 级开关与查看入口 [二手,2024-09,The Hacker News;官方,2026-10,learn.chatgpt.com]。
6. **记忆与规则分层**。Codex 官方文档定位记忆是"a helpful recall layer, not as the only source for rules",团队规则应放 AGENTS.md(人工审查通道)[官方,2026-10,learn.chatgpt.com]——防止被投毒的记忆获得"规则"级的执行权重。

**对 harness 设计的启示**
1. 把"写入闸门"当默认:会话含外部不可信内容时自动禁写(或降级为草稿区待审),把这做成可配置策略而非代码里的 if。
2. 记忆条目是"带毒嫌疑"的数据:任何记忆内容流向高权限工具(网络、shell)前,走与外部数据同级的审查。
3. 共享记忆库必须配写入审计与异常检测(AgentPoison 的教训:投毒是低门槛、高成功率的)。
4. 记忆变更要有 UI 通知与 diff 视图,用户批准过一次的哈希锁定不适用于记忆——记忆天然是变的,变更要可追责。
5. 沙箱出口控制(10 分册)是最后防线:记忆即使被投毒,"外传"这最后一腿要断在出口 allowlist 上。

---

## 七、评测:基准大战与可信度

### 7.1 主要基准与结论

| 基准 | 出品方/时间 | 构成 | 关键结论 |
|---|---|---|---|
| LoCoMo | Snap Research,2024-02 [官方-论文,arXiv:2402.17753] | LLM+人设生成、人工校验的超长对话,平均约 300 轮/约 9K token,最多 35 个会话;QA+事件摘要+多模态 | LLM 对长对话的时间/因果动态理解仍显著落后人类 |
| LongMemEval | 2024-10,ICLR 2025 [官方-论文,arXiv:2410.10813] | 500 道精选问题嵌入可扩展聊天史;信息抽取/多会话推理/时间推理/知识更新/弃答五能力 | 商业助手与长上下文 LLM 跨会话记忆准确率降约 30%;提出索引-检索-阅读三段优化 |
| MemoryAgentBench | UCSD,2025-07(v4 2026-06)[官方-论文,arXiv:2507.05257] | 增量多轮交互改造,上下文 10 万~144 万 token;准确检索/测试时学习/长程理解/选择性遗忘四能力 | 现有方法(含外部记忆模块)没有谁能同时掌握四项能力 |
| BEAM | 2025-10 [官方-论文,arXiv:2510.27246;有二手来源称已被 ICLR 2026 接收,arXiv 页未标注] | 100 段对话、2000 题,会话长至 1M/10M token | 连百万窗口模型也退化;Mem0 报告 64.1@1M、48.6@10M [二手,2026,beri.net 转述] |

### 7.2 基准大战:三个回合

**回合一,Mem0 论文的"内伤"。** Mem0 报告在 LoCoMo 上对 OpenAI 记忆相对提升 26%、p95 延迟 -91%、token 成本 -90% [官方-论文,2025-04,arXiv:2504.19413];但多方第三方转述指出,论文自己的表格里**全上下文基线约 72.9% 高于 Mem0 的约 66.9%**——记忆系统在准确率上输给了"把整个对话塞进上下文"这个笨办法,赢的只是成本和延迟 [二手,2025-2026,13labs.au/automem.ai 等多处一致转述]。

**回合二,Zep 复测 Mem0。** Zep 发文称 Mem0 对其方法的实现有误,修正后 Zep 75.14% vs Mem0 68.5% [二手-厂商,2025,blog.getzep.com,经 automem.ai 转述]。厂商互相复测,数字全在 68-75% 区间打转。

**回合三,Letta 的"文件+grep"。** Letta 用最朴素方案——对话史存成文件,只给 grep/search_files/open/close 四个工具,GPT-4o-mini 拿 74.0%,超 Mem0 论文最优;其口号是"selection replaces extraction"(选择取代抽取) [官方-厂商,2025-11,forum.letta.com]。

**基准本身也在被审计**:Penfield Labs 2025-12 复查 LoCoMo,发现约 6.4% 的标准答案本身有错(约 99/1540),LLM judge 甚至把 63% 的故意错误答案判对——分数对比的可信度存疑 [二手,2025-12,经 automem.ai《Agent Memory in 2026》(2026-06) 转述]。根因之一是 LoCoMo 的对话只有约 9K token,"很长"是 2024 年的标准,2026 年的长窗口模型可以直接作弊 [二手,2026,automem.ai;MemoryAgentBench 批评同向]。

**正方 / 反方 / 我们的判断**:正方认为基准仍给方向性信号(相对差距稳定) [二手,2026,cognee.ai 指南];反方认为厂商自测+judge 不稳+答案错误,数字基本不可比 [二手,2025-12,Penfield Labs 审计]。我们的判断:**横向比分数不可信,纵向的能力分项(知识更新、选择性遗忘)可信**;LongMemEval 的"-30%"与 MemoryAgentBench 的"无人四项全过"两个结论,是这轮混战中最值得 harness 设计者记住的,因为它们指向的是能力缺口而不是产品胜负。

**对 harness 设计的启示**
1. 别按厂商 LoCoMo 分数选记忆方案;用自家真实会话回放做离线评测,选型看"检索未命中率"与"更新正确率"两个自有指标。
2. 评测自己的记忆系统时,把"全上下文基线"和"文件+grep 基线"作为必跑对照——它们比 Mem0/Zep 的分数更接近工程下限。
3. 记忆评测要包含"遗忘"项:写个过期记忆进库,看系统能否在 N 轮后不再引用它。
4. judge 模型要换着用:LLM-judge 对同一答案的判定波动足以颠倒排名(审计已证明)。

---

## 八、必须回答的问题

### 8.1 为什么 2026 年编码 agent 的主流是"文件型记忆"而不是"向量数据库记忆"?什么场景向量/图谱才值得上?

**五条原因,各有出处**:① 编码 agent 已有完善的文件工具面,记忆=文件意味着零新增基础设施与零新增 token 教学成本——Anthropic memory tool 官方实现就是六个文件命令 [官方,2026-10,platform.claude.com],Codex 记忆就是本地目录 [官方,2026-10,learn.chatgpt.com];连"OS 式分层记忆"的原创者 Letta 也在当前文档里换成了 git 版本化的记忆文件系统 MemFS+Dreaming 后台整理 [官方,2026-10,docs.letta.com/configuration/memory](§3.1②);② 代码/指令域里精确检索(grep、路径)优于语义检索,11 个真实 agent runtime 无一用向量做代码召回 [官方-论文,2026-07,arXiv:2609.00006,引 08 §3.7],文件+grep 实测还能打赢专门记忆层 [官方-厂商,2025-11,forum.letta.com];③ 文件可读可改可 diff,天然满足可审计与用户控制,黑盒向量库做不到【推断,工程共识】;④ 缓存经济学:常驻索引+按需正文的分层对 KV-cache 友好,而每次注入不同片段的向量检索是缓存杀手(Manus 100:1 比例与 10 倍价差) [官方,2025-07,manus.im blog];⑤ "磁盘文件才是状态"的架构直觉已沉淀为行业口号(引 07)。

**向量/图谱值得上的场景**:记忆条目到百万级、跨用户/跨项目共享(个人文件模型失效);查询高度模糊(自然语言描述找不到的东西);关系多跳与时序演化问题(图谱主场,arXiv:2501.13956);会话数据自动沉淀成海量记忆、必须走抽取-更新流水线时(向量库是流水线的标配基础设施)【推断,基于 §3.3 与 Mem0/Zep 论文适用域】。

### 8.2 记忆写入由模型自主决定,最常见的失败方式是什么?有什么公开数据或案例?

失败方式按出现频率排序【推断排序,实例皆有出处】:
1. **噪声写入(最常见)**:把单次、临时、戏言级信息当持久事实记下,导致记忆膨胀与检索污染。公开佐证:Codex 官方宁可把写入推迟到"会话空闲足够久之后"后台批处理、跳过短会话、再配一个独立整合模型清理 [官方,2026-10,learn.chatgpt.com]——这套复杂度本身就是对"自主写入不可信"的官方承认;Mem0 的整个 UPDATE 阶段(四操作比对)同样是补丁 [官方-论文,2025-04]。
2. **该更新的不更新(最伤)**:用户状态变了,旧记忆还在主导回答。公开数据:LongMemEval 五能力中知识更新类,商业助手整体掉约 30% [官方-论文,2024-10,arXiv:2410.10813];MemoryAgentBench 的选择性遗忘维度无人达标 [官方-论文,2025-07]。
3. **重复与冲突并存**:同一事实多个版本,检索时随机命中【推断,机制上必然;Codex 用 consolidation 模型全局整合应对,佐证其普遍性 [官方,2026-10]】。
4. **被操控写入**:SpAIware(2024-09,注入→记忆→后续对话持续外传,OpenAI 修复)[二手-研究者,2024-09,embracethered.com];Gemini 记忆改写(2025-02)[二手-研究者,2025-02,embracethered.com];ChatGPT 持久 DoS(2024-07)[二手-研究者,2024-07,embracethered.com]。
5. **敏感信息入库**:官方文档专门做自动脱敏并告诫别存密钥 [官方,2026-10,learn.chatgpt.com],反面说明这是高频事故。
6. **基础设施事故**:2025-03 社区报告后端记忆更新致用户丢失多年积累上下文 [二手,2025-03,community.openai.com]。

### 8.3 持久化记忆让提示注入从"一次性"变成"长期驻留",目前有哪些防御做法?

六层(承接 10 分册 §四防御栈):① 写入闸门——含外部不可信上下文的会话禁写记忆(Codex `disable_on_external_context` 官方先例)[官方,2026-10,learn.chatgpt.com];② 写入脱敏与最小化(secrets redaction、大小限制)[官方,2026-10,learn.chatgpt.com;platform.claude.com];③ 存储层加固(路径穿越防护、根目录不可删改)[官方,2026-10,platform.claude.com];④ 读取时把记忆当不可信输入——来源标注、spotlighting、双 LLM/CaMeL 式数据流控制(平移 10 分册 §四);⑤ 用户可见可逆——记忆查看/删除 UI、变更通知(OpenAI 在 SpAIware 事件后的修复方向)[二手,2024-09,The Hacker News];⑥ 权重隔离——记忆是 recall layer 不是规则层,高权重规则走人工审查的 AGENTS.md 通道 [官方,2026-10,learn.chatgpt.com]。残余风险要诚实:AgentPoison 证明投毒率 <0.1% 即 >80% 成功率 [官方-论文,2024-07],写入闸门挡不住"用户自己粘贴进来的投毒内容",所以出口控制与定期整理是必须的兜底【推断】。

### 8.4 harness 记忆层设计清单(16 条)

**分类与结构**
1. 记忆分四类(用户/反馈/项目/参考)对齐 CoALA,每类独立写入规则与存储前缀。
2. 两级结构:薄索引常驻上下文(上限量化,如 200 行),正文按需读;索引是缓存资产的边界,变更要克制。
3. 记忆与规则物理分层:规则(AGENTS.md 类)人工维护,记忆是派生态,永不把记忆提升为规则。
4. 存储接口标准化为文件命令(参照 memory tool 六命令),后端可替换。

**写入**
5. 后台批处理为准,热路径只许检查点式小写入(目标/关键决策);提取与整合分两个模型/两段管线。
6. 写入前查重(检索式,非全库比对);整合段做合并与升维(多条事实→一条规则)。
7. 每条记忆带元数据:时间戳、来源会话、是否含外部不可信内容、类别、置信度。
8. 会话含外部不可信内容时禁写(可配置降级为草稿区);自动脱敏密钥与凭据。

**读取**
9. 检索优先复用文件工具(grep/read);向量检索作为兜底而非主路。
10. 记忆注入上下文时带来源与新鲜度标注,让模型能判断"这条多旧、谁写的"。
11. 记忆内容流向高权限工具前,与外部数据同审查级。

**遗忘与更新**
12. 冲突策略显式化:新时间赢、高来源赢、旧版本失效但可回溯(不物理删除)。
13. 定期后台整理(会话数/天数触发):合并、归档、过期,空闲期跑(sleep-time 经济学)。
14. 记忆库可重建:原始会话历史在,记忆是派生缓存,坏了能重生成。

**安全与可审计**
15. 用户界面三件套:查看全部记忆、diff 视图看变更、逐条删除/禁用;写入事件留审计日志。
16. 记忆投毒进威胁模型:共享记忆库加写入审计与异常检测;出口 allowlist 兜底外传风险。

**对 harness 设计的启示**(本节即清单,补充一条总纲):记忆层的所有设计都应能回答"这条记忆从哪来、多旧了、用户能不能看见能删掉"——回答不了,就不该进记忆库。

---

## 参考资料

1. CoALA: Cognitive Architectures for Language Agents — https://arxiv.org/abs/2309.02427 (2023-09)
2. A Survey on the Memory Mechanism of Large Language Model based Agents — https://arxiv.org/abs/2404.13501 (2024-04)
3. LangGraph 官方文档·Memory(semantic/episodic/procedural 与 hot path/background) — https://docs.langchain.com/oss/python/langgraph/memory (2026-10 读)
4. Letta 官方文档·Memory(当前:MemFS 记忆文件系统与 Dreaming;经典 core/recall/archival 三分层见 MemGPT 论文与 docs.letta.com ADE 页) — https://docs.letta.com/configuration/memory (2026-10 读)
5. Anthropic Docs·Memory tool(client-side 文件记忆与六命令) — https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool (2026-10 读)
6. Anthropic Engineering·Effective context engineering for AI agents(context rot 与三种记忆技术) — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents (2025-09)
7. Manus·Context Engineering for AI Agents: Lessons from Building Manus(文件系统即终极上下文/KV-cache) — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus (2025-07)
8. OpenAI Codex Docs·Memories(后台批处理/脱敏/注入开关) — https://learn.chatgpt.com/docs/customization/memories (2026-10 读)
9. TechRadar/PCMag 对 OpenAI ChatGPT memory(2025-04)的报道(引用 OpenAI 官方公告) — https://www.techradar.com (2025-04)
10. OpenAI Help·Memory FAQ — https://help.openai.com/en/articles/8590148-memory-faq (官方页,2026-10 抓取受限,经二手佐证)
11. Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory — https://arxiv.org/abs/2504.19413 (2025-04)
12. Zep: A Temporal Knowledge Graph Architecture for Agent Memory — https://arxiv.org/abs/2501.13956 (2025-01)
13. Generative Agents: Interactive Simulacra of Human Behavior — https://arxiv.org/abs/2304.03442 (2023-04)
14. Reflexion: Language Agents with Verbal Reinforcement Learning — https://arxiv.org/abs/2303.11366 (2023-03)
15. Sleep-time Compute: Beyond Inference Scaling at Test-time — https://arxiv.org/abs/2504.13171 (2025-04)
16. MemoryBank: Enhancing Large Language Models with Long-Term Memory — https://arxiv.org/abs/2305.10250 (2023-05)
17. A-MEM: Agentic Memory for LLM Agents — https://arxiv.org/abs/2502.12110 (2025-02,NeurIPS 2025)
18. LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory — https://arxiv.org/abs/2410.10813 (2024-10,ICLR 2025)
19. Evaluating Very Long-Term Conversational Memory of LLM Agents(LoCoMo) — https://arxiv.org/abs/2402.17753 (2024-02)
20. Evaluating Memory in LLM Agents via Incremental Multi-Turn Interactions(MemoryAgentBench) — https://arxiv.org/abs/2507.05257 (2025-07)
21. AgentPoison: Red-teaming LLM Agents via Poisoning Memory or Knowledge Bases — https://arxiv.org/abs/2407.12784 (2024-07,NeurIPS 2024)
22. Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory in LLMs(BEAM) — https://arxiv.org/abs/2510.27246 (2025-10)
23. Rehberger(embracethered.com)·ChatGPT persistent denial of service — https://embracethered.com/blog/posts/2024/chatgpt-persistent-denial-of-service (2024-07)
24. Rehberger·Spyware Injection Into Your ChatGPT's Long-Term Memory — https://embracethered.com/blog/posts/2024/chatgpt-macos-app-persistent-data-exfiltration (2024-09)
25. Rehberger·Exfiltrating Your ChatGPT Chat History and Memories — https://embracethered.com/blog/posts/2025/chatgpt-chat-history-data-exfiltration (2025)
26. Rehberger·Hacking Gemini's Memory with Prompt Injection and Delayed Tool Invocation(2025-02-10;T09a 补深链并核验标题与日期)https://embracethered.com/blog/posts/2025/gemini-memory-persistence-prompt-injection/
27. Letta Forum·知识图谱实用性讨论帖(2025-11;其中 ezra 帖给出"74.0% with simple filesystem tools (grep, search_files, open, close) with GPT-4o mini";T09a 补深链)https://forum.letta.com/t/does-anyone-use-knowledge-graphs-for-anything-practical/94 ;Letta 博客实验原文《Benchmarking AI Agent Memory: Is a Filesystem All You Need?》(2025-08,标题与日期经多方转述与搜索确认,letta.com 博客索引未见该文深链,深链未能回溯)
28. The Hacker News·ChatGPT macOS Flaw Could've Enabled Long-Term Spyware via Memory Function(2024-09-25,SpAIware 报道;T09a 补深链并核验标题与日期)https://thehackernews.com/2024/09/chatgpt-macos-flaw-couldve-enabled-long.html
29. OpenAI Community·记忆丢失/损坏用户报告(2025-03;仅站点级:所引"后端记忆架构更新致静默损坏"的原始帖未能唯一定位;两个最接近的 2025-03 帖:https://community.openai.com/t/request-to-restore-lost-memories/1137315 、https://community.openai.com/t/catastrophic-failures-of-chatgpt-thats-creating-major-problems-for-users/1156230 )https://community.openai.com
30. dev.to·AI agents don't have a memory problem(memory rot 的实践者综述,2026-05;仅站点级:按精确标题检索不到该文,标题可能是转述;memory rot 一词在 2026 年实践者文章中广泛使用,经多次搜索佐证)https://dev.to
31. automem.ai·Agent Memory in 2026: An Honest Comparison of Mem0, Zep, Letta, and the Rest(2026-06-06;T09a 补深链并核验标题与日期)https://automem.ai/blog/agent-memory-in-2026-an-honest-comparison-of-mem0-zep-letta-and-the-rest
32. beri.net·Zep vs Mem0 vs Postgres: Buy the Memory Store Last(2026-09-19,含 BEAM 64.1/48.6 数字转述;仅站点级:站点按日更新、旧刊无存档导航,深链无法回溯,存在性经搜索确认)https://www.beri.net
33. CSDN·【收藏备用】2026年版 AI Agent 记忆技术演进全解析(2026-05 前后;仅站点级:外部搜索引擎只回主域、无法回溯文章深链;且本条原记域名 agent.csdn.net 与搜索实证的 blog.csdn.net 不一致)https://blog.csdn.net
34. 知乎·2024–2026 年全球 AI 系统越过安全限制与主动攻击真实事件(SpAIware 中文转述,2026;仅站点级:精确标题检索不到该文)https://zhuanlan.zhihu.com ;T09a 补一个已核验的中文页面级替代来源:安全内参《向ChatGPT植入恶意"长期记忆",持续窃取用户输入数据》(2024-09-26)https://www.secrss.com/articles/70682
35. 本仓库 08 分册 §3.6/§3.7、10 分册 §2、07 分册(内部交叉引用)
