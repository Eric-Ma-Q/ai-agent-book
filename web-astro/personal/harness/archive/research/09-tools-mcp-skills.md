# 工具层调研:工具设计、MCP、Skills 与"代码即工具"

> 调研日期:2026-10-04。方法:四路并行检索(① MCP 协议与生态;② 工具设计与 token 经济;③ Skills 与代码执行范式;④ CLI vs MCP 之争与中文社区),合计约 130 次检索与抓取,精读 40+ 全文来源;按协议"并发与限流"规则(2026-10-04 新增),三个子智能体检索方向(MCP 协议演进、工具设计与 token 膨胀、Skills 与代码执行)随后由主会话**串行补做、逐页回读原文核实**——加上首轮抽查,主会话直接回读的承重来源共 22 页(MCP 规范 7 页:架构/tools/elicitation/授权/2025-06-18 变更页/版本页及 2026-07-28 根;Anthropic 5 篇:advanced-tool-use/code-execution-with-mcp/writing-tools-for-agents/skills 工程文/平台文档;Agent SDK tool-search、OpenAI function calling 指南、Cloudflare code-mode-mcp、agentskills.io、pi mcp-vs-cli 与 codemode.md、arXiv 2402.01030 与 2504.03767、smolagents 博客、Invariant 披露、ghuntley.com),其中 1 处子代理转引错误已勘误(见 3.5 节)。每条关键事实标注 [官方](厂商仓库/文档/官方博客/论文原文)或 [二手](媒体/社区/第三方评测),附时间与来源;未能核实的明确标注,不编造。
>
> **对象界定**:harness 的工具层——agent 的"手"如何设计、如何暴露给模型、如何控制其对上下文的占用,以及 2024-11 至 2026-10 工具层的路线之争。与已有内容的分工:`ai-harness-explained.html` 2.2 节已逐条解读《Writing Effective Tools for Agents》,本文不重复其复述,只在 token 账本处引用其数据并往深/往新写;`research/07-pi-design-philosophy.md` 已覆盖 pi 的 MCP 立场三部曲,本文第七节引用其结论并补齐 2026-09 反转后的技术形态与业界对照。
>
> **T09a 修订(2026-10-05)**:§3.1 新增原语对照表(tools/prompts/resources/sampling/elicitation/roots 的控制方、用途与接入方式,含 2026-07-28 版对 sampling/roots 的弃用);§3.5 安全事件收缩为一段、细节改链 10 分册 §2.3;第八节新增"坏工具→好工具"完整改写示例;参考资料 5–8、16–18 补日期,32、33 补页面级 URL。逐条对照见 collab/reports/T09a-research-fixups.report.md。

---

## 一、要点速览

1. **工具膨胀是有公开账本的**:58 个 MCP 工具 ≈ 55K tokens 起步(Anthropic 五服务器实例)[官方,2025-11];GitHub MCP 93 工具 ≈ 55K tokens(二手转引);Playwright MCP 21 工具 = 13.7K(pi 实测)[官方,2025-11]。一个典型 MCP 工具定义约 500–2,000 tokens【推断,按来源数字折算】。
2. **按需加载是 2025-11 后的行业标准答案**:Anthropic Tool Search Tool 把 72K 定义压到 8.7K(−85%),同时准确率不降反升(Opus 4:49%→74%)[官方,2025-11];Claude Agent SDK 默认只加载 5 个最相关工具;Cursor 延迟加载省 46.9%(二手)。
3. **MCP 活到了 2026,但换了一个人**:2026-07-28 规范(社区称 MCP 2.0)删除协议级会话与 initialize 握手、无状态化、弃用 Dynamic Client Registration,新增 `server/discover` 与 tasks 异步扩展[官方,2026-07]。
4. **Skills 已成跨厂商开放标准**:SKILL.md + 三级渐进披露(~100 tokens 元数据 / <5K 正文 / 磁盘资源不限),agentskills.io 客户墙 40+ 产品,含 ChatGPT & Codex、Gemini CLI、GitHub Copilot、VS Code、Cursor、pi、OpenHands[官方,2026-10 实抓]。
5. **"代码执行代替工具调用"从论文走向产品**:Anthropic 实测同一任务 150,000→2,000 tokens(−98.7%)[官方,2025-11];Cloudflare 把 2,500 个端点的 API 压成 2 个工具约 1,000 tokens(等价 MCP server 需 1.17M)[官方,2026-02]。
6. **CLI vs MCP 之争的原文结论常被误读**:pi 作者 120 次实测的结论是"平手"(MCP 版还快 23%、便宜 2.5%),他建议的是"有了 shell 就造好 CLI";2026-09 pi 官方反转拥抱 MCP(经沙箱暴露)。收敛结论是分层而非二选一。
7. **2026 年正在被放弃的**:全量预载巨型工具集、SSE 传输(2025-03 废弃)、协议级会话与握手(2026-07 移除)、DCR(2026-07 弃用)、"把工具描述当人写文档"的写法。

---

## 二、工具设计原则:契约、账本与 ACI 谱系

### 2.1 设计要点(在总笔记 2.2 节之上的增量)

总笔记已详述《Writing Effective Tools for Agents》的评估驱动闭环与命名空间结论,这里只补该文之后沉淀下来的、可操作的设计增量:

- **合并工作流级工具,不要 1:1 包装 API 端点**。Anthropic 明确反对"包装现有软件功能"的工具,给的反例是把 `get_customer_by_id + list_transactions + list_notes` 换成一个 `get_customer_context`;OpenAI 亦建议"把总是顺序执行的函数合并"[官方,2025-09,Anthropic writing-tools-for-agents https://www.anthropic.com/engineering/writing-tools-for-agents;官方,2026,OpenAI function calling 指南 https://developers.openai.com/api/docs/guides/function-calling]。
- **参数设计有两条硬规则**:枚举/结构优于自由文本("用 enums and object structure to prevent invalid states",如 `toggle_light(on, off)` 允许非法组合就是坏设计);OpenAI 建议始终开 strict mode(schema 全字段 required、`additionalProperties:false`,可选字段用 null 类型表达)[官方,2026,OpenAI function calling 指南]。
- **错误信息是提示词,不是日志**。好的报错"给出具体可执行的改进建议,而非不透明的错误码或堆栈";要示范正确输入格式(如日期格式示例)。SWE-agent 的配套发明是"空输出也要说话":命令成功但无输出时必须返回"你的命令成功执行且没有产生任何输出",防止模型幻觉成功内容[官方,2025-09,Anthropic;官方,2024-2025,SWE-agent ACI 概念页 https://swe-agent.com/latest/background/aci/]。
- **幂等与副作用要有元数据**。MCP 的 tool annotations 给了四个 hint:`readOnlyHint`(默认 false)、`destructiveHint`(默认 true!)、`idempotentHint`(默认 false)、`openWorldHint`(默认 true),并要求客户端"必须把 annotations 视为不可信,除非来自可信服务器"[官方,2025-03 schema / 2026-07 规范页 https://modelcontextprotocol.io/specification/2026-07-28/server/tools]。harness 不能拿 hint 当权限依据,只能当 UI 与确认策略的输入。
- **描述里要预埋"行为纠偏"**。Anthropic 的经典案例:搜索工具描述含糊导致 Claude 无谓地在 query 后追加"2025"使结果偏移,改一句话描述即修复;对工具描述做精细调整曾把 Sonnet 3.5 推到 SWE-bench Verified 当时 SOTA[官方,2025-09,Anthropic;详见总笔记 2.2 节]。
- **描述的"实习生测试"与无返回值处理**。OpenAI 给了两条常被忽视的细则:描述要"pass the intern test"(描述含糊到实习生都看不懂怎么用,模型一样不会用);无返回值的函数应返回一个状态字符串(如 "success"),否则模型无从确认调用是否生效;派发器对未知函数名应当抛错而不是静默忽略,否则模型会在错误假设上继续堆调用[官方,2026,OpenAI function calling 指南]。
- **并行调用要显式设计而非默认放行**。OpenAI 的立场是"最好假设一轮内有多次调用"(best practice to assume there are several),但需要串行时用 `parallel_tool_calls: false` 强制单发;需要限定可选面时用 `allowed_tools`。这与 Manus 的"logits 掩码、mask don't remove"(总笔记深挖已录)是同一问题的两端:一个在 API 参数层解决,一个在解码层解决[官方,2026,OpenAI;二手,2025-06,Manus 博客]。

### 2.2 token 账本:工具膨胀的代价(回答必答问题 1)

**定义侧(工具描述/schema 进上下文,每轮都在)**:

| 数据点 | 数字 | 性质与来源 |
|---|---|---|
| Anthropic 五服务器实例(GitHub 35 + Slack 11 + Sentry 5 + Grafana 5 + Splunk 2) | 58 工具 ≈ **55K tokens**,且"对话还没开始" | [官方,2025-11,advanced-tool-use https://www.anthropic.com/engineering/advanced-tool-use] |
| 同文:仅 Jira 一个 server | ≈ 17K tokens | [官方,2025-11,同上] |
| Anthropic 自家内部(优化前) | 工具定义 **134K** tokens | [官方,2025-11,同上] |
| pi 实测:Playwright MCP 21 工具 | **13.7K** tokens(占当时 200K 窗口 6.8%);Chrome DevTools MCP 26 工具 ≈ 18K | [官方,2025-11,what-if-you-dont-need-mcp https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/] |
| GitHub MCP server | 93 工具 ≈ **55K** tokens("swallows another 55,000 of those valuable tokens") | [二手,2025,Geoffrey Huntley,原帖付费墙、经多方转引 https://ghuntley.com/allocations/] |
| Claude Agent SDK 经验值 | 50 个工具 ≈ 10–20K tokens;工具选择准确率在 **>30–50 个**时明显退化 | [官方,2026,Agent SDK 文档 https://code.claude.com/docs/en/agent-sdk/tool-search] |
| OpenAI 官方建议 | 一轮开始时函数少于 **20 个**;定义"占用上下文并按输入 token 计费" | [官方,2026,OpenAI function calling 指南] |

按上表折算,**单个 MCP 工具定义约 500–2,000 tokens,一个 20–30 工具的 server 约 1.5–2 万 tokens**【推断,由来源数字均摊,仅作量级参考】。

**结果侧(每次调用的返回)**:

- Slack 消息工具:detailed 档 206 tokens vs concise 档 72 tokens,"三分之一的 tokens",省略的是 thread_ts/channel_id 等技术 ID[官方,2025-09,Anthropic;总笔记 2.2 已录]。
- Claude Code 对工具结果默认截断 **25,000 tokens**(`MAX_MCP_OUTPUT_TOKENS` 可调)[官方,2025-09,Anthropic 原文;环境变量名见 code.claude.com settings 文档,2025-2026]。
- pi codemode 的脚本输出默认上限 10,000 tokens[官方,2026,pi codemode.md https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/codemode.md]。
- 结构性放大:Manus 复盘长任务"平均约 50 次工具调用、输入输出比约 100:1"(总笔记深挖已录)——意味着定义侧每省 1 token ≈ 全会话省 50+ tokens,KV 缓存命中与否决定它是 50 倍还是 1 倍的账【推断,由前述公开数字推演】。

**膨胀的真实代价不止 token 费**:Agent SDK 文档明言工具一多"选择准确率退化";Anthropic 的 Tool Search 评测显示去掉 80% 定义后准确率反而大涨(见第四节)——说明塞满定义的上下文本身就是噪声[官方,2025-11/2026]。

### 2.3 ACI 谱系的后续发展:从"精心设计接口"到"接口可以极简到只剩 bash"

SWE-agent(2024)证明只改接口不改模型,12.47% vs 基线 1.31%/3.79%(总笔记已录)。之后 2025–2026 的走向值得注意——**ACI 思想没有死,但收敛方向出乎意料:两个极**。

- **一极:领域 ACI 仍然值得雕**。Aider 的编辑格式实验是最干净的证据:同一 GPT-4 Turbo,把"整文件重写"换成 unified diff 格式,基准分从 20% 升到 61%;换成 diff 后"惰性注释"任务从 12 个降到 4 个;而"给小费 $2000"式情绪化提示反而更差——起作用的是接口体裁,不是话术[官方,2024,aider.chat/docs/unified-diffs.html https://aider.chat/docs/unified-diffs.html]。Aider 排行榜至今按 edit format 分列成绩,diff 类格式"用少得多的 token"[官方,2024-2025,https://aider.chat/docs/leaderboards/]。
- **另一极:最小 ACI 意外地能打**。SWE-agent 团队自己的 2025-2026 结论是:核心 agent **100 行 Python、除 bash 外零工具、甚至不用模型的 tool-calling API**(动作经 subprocess 执行、线性历史)就能上 SWE-bench Verified 74%+(Gemini 3 Pro);官方直言 2024 年开创的很多东西"a lot of this is not needed at all",并把 SWE-agent 转入维护模式、推荐 mini-swe-agent[官方,2025-2026,https://mini-swe-agent.com/latest/]。pi(4 工具、定义 <1000 tokens)与 Codex 的极简工具定义同路(07 分册已录)。
- **两条极线共享一个解释**:前沿 RL 训练的模型自带大量"世界先验"(bash、gh、pandas 都是训练数据),ACI 的重心从"教会模型用工具"移向"别用劣质接口干扰模型"+ "让接口吐不出垃圾"。前者催生极简,后者催生接口级防护(100 行文件查看器、lint 拦截、25K 截断)与返回体裁裁剪。

**「对 harness 设计的启示」**

1. 工具定义按"每轮都进上下文"计价:先给工具定义做 token 预算(经验线:整套 >10K 或 >10 个就该上按需加载,Anthropic/OpenAI 两家阈值一致)[官方]。
2. 返回值设计四件套缺一不可:自然语言名、详略档位(response_format)、分页/截断、空结果显式说明。
3. 错误信息当提示词写:说清正确格式 + 给修复建议;宁可啰嗦不可含糊。
4. ACI 投入的两极都成立:高频核心工具值得像 Aider 雕 diff 格式那样雕;其余工具宁缺毋滥——两个方向都比"加第 40 个工具"划算。
5. annotations/hint 是给 harness 的元数据,不是安全边界;确认策略、UI、审计可以消费它,授权不能依赖它。

---

## 三、MCP:协议要点、版本演进到 2026、鉴权、生态与安全

### 3.1 协议要点(以 2026-07-28 规范为准)

MCP 的原语分两侧:服务器提供 **tools(模型控制)/ resources(应用控制的数据)/ prompts(用户控制)** 三类能力;客户端可向服务器反喂 **sampling(代跑补全)、elicitation(代问用户)、roots(工作目录)**[官方,2026-07,规范 architecture 页 https://modelcontextprotocol.io/specification/2026-07-28/architecture]。**注意:2026-07-28 版已弃用 sampling 与 roots(SEP-2577),弃用注册表同时列出 logging(SEP-2577,迁移到 stderr/OTel)与 DCR**[官方,2026-07,deprecated 注册表 https://modelcontextprotocol.io/specification/2026-07-28/deprecated]。六原语对照(T09a 补,"谁控制"均为规范原文措辞):

| 原语 | 谁控制 | 典型用途 | harness 怎么接 | 出处(规范原文) |
|---|---|---|---|---|
| tools | **模型**(model-controlled) | 模型自主发现并调用的动作面:查数据库、调 API、执行计算 | 按需加载 + 审批策略 + annotations 只当 UI/确认输入,不当权限依据(规范明示 annotations 不可信) | [官方,2026-07,server/tools:"Tools in MCP are designed to be model-controlled"] |
| prompts | **用户**(user-controlled) | 用户显式触发的提示模板(斜杠命令/菜单);规范注明"指谁决定何时使用,而非谁写内容" | 映射为用户可见命令/模板入口,内容经 prompts/get 按需拉取 | [官方,2026-07,server/prompts:"Prompts are designed to be user-controlled"] |
| resources | **应用**(application-driven) | 给模型供上下文的数据(文件、数据库 schema、应用信息),由 host 决定如何纳入 | "哪些资源进上下文"的策略在 harness:树/列表选择、按需 read、订阅变更(listChanged/subscribe) | [官方,2026-07,server/resources:"Resources in MCP are designed to be application-driven"] |
| sampling | 服务器发起,host/用户在回路控制;**2026-07-28 起弃用** | 服务器在工具执行中嵌套请求 LLM 补全(代理执行) | 新实现不接;迁移路径:直接集成 LLM provider API | [官方,2026-07,client/sampling 页弃用警告(SEP-2577)] |
| elicitation | 服务器请求,**用户决定**是否回答 | 服务器向用户要输入(2026-07 分 form/URL 模式;form 禁收密码/API key/支付凭据,敏感流必须走 URL 模式且"MUST show the full URL") | 映射到确认 UI;URL 不得自动打开或预取;对 harness 是"代问用户"的标准通道 | [官方,2026-07,client/elicitation](本文 §3.2 版本表已录) |
| roots | **客户端**提供;**2026-07-28 起弃用** | 告知服务器"哪些目录/文件相关"——规范原文:信息性指引,**不是访问控制机制**,协议不强制服务器停留在 roots 内 | 新实现不接;迁移路径:经工具参数/资源 URI/服务器配置传目录;若用,暴露前要用户同意 | [官方,2026-07,client/roots 页弃用警告(SEP-2577)] |

对工具层最要紧的几处:

- **tools**:`tools/list` + `tools/call`,支持分页;2026-07 版新增响应缓存提示(`ttlMs`/`cacheScope`)并要求工具集确定性排序以提升 prompt 缓存命中,"MUST NOT vary per-connection"。执行错误用 `isError: true` 返回(区别于协议错误),供模型自纠错[官方,2026-07,server/tools 页]。
- **structured output**:`outputSchema`(JSON Schema)→ 服务器必须返回符合 schema 的 `structuredContent`,客户端应校验[官方,2025-06 引入,2026-07 延续]。
- **elicitation**(服务器向用户要输入,2025-06-18 引入):2026-07 分 form 模式与 URL 模式;规范以整节描述钓鱼/账号接管风险,禁止用 form 模式收集密码/API key/支付凭据,敏感流必须走 URL 模式且"MUST show the full URL"、不得自动打开或预取[官方,2026-07,client/elicitation 页 https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation]。
- **tasks**(异步长任务,现为官方扩展):服务器对长操作返回 `CreateTaskResult`(taskId/ttl/pollInterval),状态机 working / input_required / completed / failed / cancelled,支持中途补输入与协作式取消[官方,2026-07,extensions/tasks https://modelcontextprotocol.io/extensions/tasks/overview]。
- **server/discover**:2026-07 新增的必选 RPC,一次拿到服务器支持的协议版本、能力与身份——握手时代的"先 initialize 再干活"被它替代[官方,2026-07,versioning 页]。

### 3.2 版本演进(回答"到 2026 年的变化")

| 版本 | 日期 | 关键变化 |
|---|---|---|
| 1.0 | 2024-11-05 | 初版;stdio + HTTP+SSE;三原语;sampling [官方,规范版本页] |
| 2025-03-26 | 2025-03-26 | **Streamable HTTP 替代 HTTP+SSE**(旧传输废弃);OAuth 2.1 授权框架引入;tool annotations 进 schema [官方,2025-03-26 规范;SSE 废弃经二手多源确认] |
| 2025-06-18 | 2025-06-18 | structured tool output;**elicitation**;MCP 服务器明确为 OAuth **资源服务器**,要求 RFC 8707 resource indicators [官方,2025-06-18 规范] |
| 2025-11-25 | 2025-11-25 | **URL mode elicitation** 引入(官方规范页明文"introduced in the 2025-11-25 version");tasks 以实验扩展起步(SEP-1686,沿革未直接核实) [官方,2026-07 规范页回溯;二手] |
| **2026-07-28("MCP 2.0")** | 2026-07-28 | **删除协议级会话与 initialize 握手**(SEP-2575)、移除 `Mcp-Session-Id`;逐请求能力协商;新增 `server/discover`;**弃用 Dynamic Client Registration**(改 Client ID Metadata Documents);tasks 转正式扩展;统一 `subscriptions/listen`;新增"Stateful Tools"指引(无协议会话后用显式 handle,handle 是名字不是能力,未认证服务的 handle 实为 bearer token) [官方,2026-07-28 规范多页;二手称其为"迄今最大修订",Simon Willison 2026-07-31 评价"the most significant change to the MCP spec since it first launched",https://simonwillison.net/tags/mcp/] |

2026-07-28 规范原文给架构定性的句子:"MCP is a stateless protocol: every request is self-contained and carries its own protocol version and capabilities"[官方,2026-07,architecture 页]。

### 3.3 远程 MCP 与鉴权

- 授权模型:MCP 服务器 = OAuth 2.1 **资源服务器**;客户端必须实现 RFC 8707(token 受众绑定到本服务器,"MUST NOT accept or transit any other tokens")与 RFC 9728 Protected Resource Metadata 发现;逐步授权(401 → scope 引导;403 insufficient_scope → step-up 重授权)[官方,2026-07,basic/authorization 页 https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization]。
- 客户端注册的优先级变了:**Client ID Metadata Documents(SHOULD)> 预注册 > DCF;DCR 已正式弃用**——早期生态"每个客户端现场注册"的模式在 2026 被判定为不安全默认[官方,2026-07,同上]。
- 企业路线:SEP-990 企业托管授权(Cross App Access,XAA)——企业 IdP 签发断言换短时 token,消除逐服务器同意屏[二手,2026,多源转述;未直接核实 SEP 原文]。
- 现实摩擦:`mcp-remote` 桥接工具是痛点集中地(OAuth 弹窗循环、localhost 回调挂起),且曾出 CVE-2025-6514(OAuth 参数处理致 OS 命令注入)[二手,2025-2026,GitHub issues 与安全通告汇总]。Kenton Varda 早年评价"OAuth 动态客户端注册可能是整个规范最重要的解锁",两年后规范自己弃用了它——这个反复本身就是"协议在与现实互相驯化"的证据[二手,2025-11,经 Simon Willison 转述]。

### 3.4 生态现状

- **采用时间线**:Anthropic 2024-11 开源 → OpenAI 2025-03-26 宣布 Agents SDK 支持(与规范同日)→ Google DeepMind 2025-04-09 确认 Gemini 支持 → Microsoft 2025-05 Build 宣布 Windows/AI Foundry 原生 MCP 并进指导委员会 → AWS 2025-07 AgentCore → ChatGPT **Apps SDK 明确 built on MCP**(2025-10-06 DevDay,首发 Canva/Figma/Spotify/Zillow)[二手,各厂官方公告汇总,均多源可查]。
- **Registry**:官方 registry.modelcontextprotocol.io 2025-09-09 preview 上线;GitHub 2025-10-13 推出自己的 registry,发布需域名验证[二手,heise/InfoQ 报道]。当前收录总数无官方公布,第三方自动索引自称一千到三千不等,仅供参考【推断,数字不可比】。
- **SDK**:官方维护 TypeScript(参考实现)/Python/Go(与 Google)/Java(与 Spring)/Kotlin/C#(与 Microsoft)/Swift[官方 schema 仓库 + 二手分级说法]。
- **远程 server 供给**:GitHub Remote MCP Server GA(2025-09-04,OAuth 2.1+PKCE)[官方,github.blog];Stripe/Notion/Figma 等均有官方 server[二手]。

### 3.5 生态问题与安全(正方/反方/判断)

**问题一:工具描述膨胀**——已在上节给账本,MCP 语境下的特有形态是"server 越接越多,定义线性叠加"。Anthropic/Cloudflare/pi 三家数字互证。

**问题二:安全事件与协议层回应**——2025-2026 的主要事件:工具投毒与 rug pull(Invariant Labs,2025-04)、GitHub 官方 server 被恶意 issue 注入借用户**合法**凭据外泄私有仓库(2025-05-26)、MCP Safety Audit 演示恶意代码执行/远程访问控制/凭据窃取三类攻击(arXiv 2504.03767)、mcp-remote OAuth 命令注入(CVE-2025-6514)、MCP Inspector RCE(CVE-2025-49596)、恶意 server 供应链(postmark-mcp)[均为二手,2025-2026,多源互证;**事件经过、根因与缓解的完整展开见 10 分册 §2.3 与 §五**]。此处只留协议层结论:这些事件没有一例出自协议消息格式本身,而是"工具描述进上下文""第三方 server 拿凭据""客户端实现有洞"三类接口层问题;协议的回应是持续收紧——OAuth 资源服务器模型与令牌绑定(2025-06-18)、"annotations 必须视为不可信"(2025-03 起)、elicitation URL 模式防钓鱼(2026-07)、DCR 弃用(2026-07)。正方认为这是"用法与实现质量问题",协议补得动;反方认为"任意第三方描述进上下文"是架构级缺陷,协议补不了;我们的判断:对 harness 设计者,唯一安全的假设是 **MCP 内容 = 不可信输入**,与用户输入同级对待(此判断与 07 分册 pi 的"安全=限制可达范围"、T03 安全分册的 Lethal Trifecta 框架一致)。**勘误(2026-10-04)**:社区流传的"43% 受测 server 可执行任意 shell / 37% SSRF / 22% 跨文件系统"三数字不出自 MCP Safety Audit(经回读论文原文核实,该文只审计 4 个 server [官方,2025-04,https://arxiv.org/abs/2504.03767]),亦未找到其可靠原始出处,不采信。

**「对 harness 设计的启示」**

1. 按需加载 MCP 工具应是 2026 年 harness 默认(做法见第四节),除非工具数 <10。
2. 把 MCP 服务器当"不可信插件源"治理:域名验证、描述投毒扫描、最小授权、结果与描述都过注入检测。
3. 用 2026-07-28 形态接入:无状态 + server/discover + OAuth 资源服务器模型;新项目不要再实现 DCR。
4. 长任务用 tasks 扩展而非自造轮询协议;跨调用状态用显式 handle 并按 bearer token 保管。
5. 缓存友好是协议级义务:工具列表确定性排序、`ttlMs`/`cacheScope` 配合 harness 的 append-only 会话(与 07 分册 pi 的 99.93% 缓存命中案例同构)。

---

## 四、工具发现与按需加载:从"全量菜单"到"目录 + 详情"

### 4.1 Anthropic Tool Search Tool(2025-11-24,advanced-tool-use 公告的三特性之一)

- **机制**:工具定义加 `defer_loading: true` 不进上下文;模型用 `tool_search_tool_regex`(正则/BM25/自定义)按需检索,找到的才加载。整个 MCP server 可整体延迟(`default_config`)[官方,2025-11,advanced-tool-use]。
- **数字(全部官方,已回读核对)**:五服务器 58 工具场景,传统预载 ~72K tokens;Tool Search 下"启动 ~500 + 检索出 3-5 个工具 ~3K ≈ 8.7K,保留 95% 上下文窗口,**token 用量降 85%**"。更反直觉的是准确率:**Opus 4 从 49% 升到 74%,Opus 4.5 从 79.5% 升到 88.1%**——少即是多有了受控实验。
- **官方启用阈值**:定义 >10K tokens 或 >10 个工具或多服务器 → 开;<10 个且常用 → 不开;最常用 3-5 个保持常载[官方,2025-11]。
- **Agent SDK 落地形态(2026)**:默认"只加载最相关的 5 个工具,直到 compaction";`ENABLE_TOOL_SEARCH=auto` 在延迟定义达窗口 10% 时自动激活;目录上限 10,000 工具;并给了一条工具命名建议——"search_slack_messages 胜过 query_slack",发现质量取决于名称/描述的关键词[官方,2026,Agent SDK tool-search 文档]。
- 同公告的 **Programmatic Tool Calling** 与 **Tool Use Examples** 分别见第六节与 2.1 节(示例使复杂参数处理准确率 72%→90%;注意 OpenAI 的反向提醒:"Adding examples may hurt performance for reasoning models"——示例并非普适增益)[官方,2025-11,advanced-tool-use;官方,2026,OpenAI function calling 指南]。

### 4.2 其他厂商与产品

- **Cursor**:曾设 MCP 工具 40 个上限(ghuntley 页面可见陈述:"Cursor caps the number of MCP tools that can be enabled in Cursor to just 40 tools");后上线延迟工具加载,二手多源引其 changelog 称 MCP 相关任务总 token **−46.9%**(changelog 原页未能直接核到,采信多源一致转述,如 idebattle.com 2026-01 摘要)[二手,2025-2026]。
- **VS Code**:曾有一段时间移除了 128 工具上限(ghuntley 页面可见陈述)[二手,2025-2026];GitHub 官方 MCP server 提供 toolsets 分组开关以减 token[二手,2025]。
- **OpenAI**:官方指南建议"一轮开始时函数 <20 个",定义按输入计费,缓解手段是"减少前置函数、缩短描述、或用 tool search(gpt-5.4+)"——三大厂在"阈值 10-20 个、按需加载是解"上完全收敛[官方,2026,function calling 指南]。
- **GitHub Copilot CLI**:2026-04 起 `@mcp` 显式触发语法(用户点名才挂 MCP)[二手,2026-04,issue 转述]。

### 4.3 渐进披露的统一形状

把本节与第五、六节(Skills 三级披露、codemode 的 searchTools、code-execution 的文件树+search_tools 三档)放在一起,能看到 2026 年工具暴露的统一设计语言:

**全量 schema 常驻 → 目录常驻(名字+一句话)+ 详情/执行按需**。这与网页设计里的渐进披露(progressive disclosure)同构:harness 的工具栏从"一次性把所有抽屉拉开"变成"抽屉上贴标签,拉开才付钱"。代价是发现质量成了新单点——搜索词不中就等于工具不存在,所以各家都在名称/描述关键词上给硬指导[官方,2025-11/2026,多方]。

**「对 harness 设计的启示」**

1. 默认实现"目录+详情"两层:常驻层只有名字与一句描述(<100 tokens/工具),正文/完整 schema 按需。
2. 常载集合要精心挑(3-5 个高频工具),其余交给检索;检索索引的质量=名称与描述的写法,给工具起"动词_对象_限定"式名字。
3. 用受控实验校准阈值:Anthropic 的 49%→74% 说明"省 token"与"更准"可以同时发生,不必在两者间犹豫。
4. 工具目录要设上限并定期清理(Anthropic 目录上限 1 万、OpenAI 建议一轮 <20),把它当产品货架而不是垃圾桶。

---

## 五、Skills:把程序性知识移出模型、放进文件系统

### 5.1 本体设计(Anthropic,2025-10-16 发布,2025-12-18 开放标准化)

- **形态**:一个文件夹 + `SKILL.md`(YAML frontmatter 必填 `name`、`description`)+ 可选 `scripts/ references/ assets/`。官方类比"新员工的入职指南"[官方,2025-10,equipping-agents-for-the-real-world-with-agent-skills https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills]。
- **三级渐进披露(官方 token 数)**:Level 1 元数据启动即载,"~100 tokens per Skill";Level 2 SKILL.md 正文"Under 5k tokens"触发时载;Level 3+ 资源"None until accessed",脚本经 bash 执行、"only their output enters context"[官方,platform.claude.com agent-skills 文档]。
- **Claude Code 工程细节**:技能列表中 description+when_to_use 截断到 **1,536 字符**;建议"SKILL.md 保持 500 行以内";compaction 时每技能保留前 5,000 tokens、共享 25,000 tokens 预算;API 侧 frontmatter 只允许 6 个规范字段[官方,2026,code.claude.com/docs/en/skills]。
- **API 形态**:Messages API 经 `container` 参数传 `skill_id`,**要求 code_execution 工具**(技能跑在容器里);内置 pptx/xlsx/docx/pdf;容器 Python 3.11、5GiB、**无外网**;计费按容器时长(每月 1,550 免费小时后 $0.05/小时)[官方,platform.claude.com code-execution-tool 文档]。
- **与 MCP 的分工(官方原句)**:"We'll also explore how Skills can complement [MCP] servers by teaching agents more complex workflows that involve external tools and software"——官方口径是**互补**:MCP 管连接与鉴权,Skills 管程序性知识与工作流;中文圈的传播比喻"MCP 是插座、Skills 是操作手册"与此一致[官方,2025-10;二手,2026,smzdm/CSDN 转述]。

### 5.2 标准化与采用(2026-10 实抓 agentskills.io,回答"其他厂商跟进")

agentskills.io 自述格式"originally developed by Anthropic, released as an open standard";客户墙含 **44 个产品**,关键的:ChatGPT & Codex、Gemini CLI、GitHub Copilot、VS Code、Cursor、Amp、OpenHands、OpenCode、Roo Code、Goose(Block)、Letta、pi、Kiro(AWS)、TRAE(字节)、Databricks Genie Code、Snowflake Cortex Code、Tabnine、Spring AI、OpenClaw 等,每家都附实现文档链接[官方,2026-10,https://agentskills.io]。

三家头部实现对照(均官方文档):

- **OpenAI Codex**:"build on the open agent skills standard";技能目录 `.agents/skills`(repo/user 级)+ `/etc/codex/skills`;技能列表上限"至多模型上下文的 2%,或 8,000 字符";带 `$skill-installer` 与 openai/skills 仓库(上线确切日期未核实,约 2026 年初)[官方,learn.chatgpt.com/docs/build-skills]。
- **Gemini CLI**:文档明言"Based on the Agent Skills open standard";`~/.gemini/skills/` 与项目级,`activate_skill` 需用户同意(2026-04-30 更新)[官方,geminicli.com/docs/cli/skills/]。
- **pi**:skills.md 文档 + Packages 打包(skills/extensions/模板/主题一键安装)[官方,github.com/badlogic/pi-mono docs]。

### 5.3 批评与风险(正反两面)

- 反方:"Skills 不过是提示词+文件"——社区反驳称"Skills are not 'just prompts,' they are supply-chain artifacts"(是供应链工件);已有 Skillgate 类扫描器与 2026 年 arXiv 论文讨论技能注册表的语义供应链攻击[二手,2026]。
- 官方告诫:"A skill can grant itself broad tool access"(技能可以给自己扩权)——只装可信来源[官方,2026,Claude Code skills 文档]。
- 蔓延(sprawl):技能一多,组合冲突与治理成本重现,和 MCP 工具膨胀同构——"加载哪个技能"本身开始需要检索策略(arXiv 2026-08 "How Should an Agent Load Its Skill?")[二手,2026-08]。

**「对 harness 设计的启示」**

1. 把"怎么做事"的知识写成 Skills 而不是塞系统提示词:元数据常驻(100 tokens)+ 正文触发加载,正好复用工具按需加载的同一套机制。
2. Skills 与 MCP 的接线原则:连接/鉴权/结构化数据走 MCP,流程/规范/脚本走 Skills;两者都不要装"以后可能用"的。
3. 技能也是供应链:来源审查、扫描、锁版本;给技能的 allowed-tools 设白名单。
4. 压缩场景给技能留预算(Claude Code 的 25K 共享池是个可抄的数字)。

---

## 六、"代码即工具":让模型写代码调 API,而不是逐个 tool call

### 6.1 思想源头与产品化时间线

- **CodeAct 论文**(arXiv 2402.01030,ICML 2024):对 17 个 LLM 的分析显示,以可执行代码为动作空间"outperforms widely used alternatives (up to 20% higher success rate)"[官方,2024-02,https://arxiv.org/abs/2402.01030]。摘要之外流传的"调用步数减少 ~30%"未见原文出处,不采信。
- **HuggingFace smolagents**(2024-12-31):CodeAgent vs ToolCallingAgent 的工程化与普及(E2B 沙箱)[官方,2024-12,https://huggingface.co/blog/smolagents]。
- **Anthropic《Code execution with MCP》**(2025-11-04):把 MCP 工具暴露为**文件系统上的 TypeScript API**,模型用 bash/代码编排;配套 tool search 与 PTC 产品化[官方,2025-11]。
- **Cloudflare Code Mode**(2025-09-26 首篇;2026-02-20 续篇出数字)[官方,blog.cloudflare.com]。
- **pi codemode**(2026,1.0 核心特性):模型写 JS 在 QuickJS 沙箱编排 pi 工具(07 分册已录机制)[官方,2026,codemode.md]。
- **Anthropic PTC GA 化**:`code_execution_20260120` 版本"adds REPL state persistence and programmatic tool calling from within the sandbox"[官方,2026-01,platform.claude.com code-execution-tool 文档]。

### 6.2 机制:为什么省 token、为什么更强

代码执行范式改变了三笔账(均为官方表述):

1. **定义账**:全量 schema 预载 → 按需读取。Anthropic 机制是"每个 MCP 工具一个 TS 文件"(`./servers/google-drive/getDocument.ts`),agent 靠"list the ./servers/ directory"发现;配 `search_tools` 提供三档细节——"name only, name and description, or the full definition with schemas"[官方,2025-11,code-execution-with-mcp]。
2. **中间结果账**:直接 tool call 时每步结果都过模型;代码执行"intermediate results stay in the execution environment by default"。官方例子:10,000 行数据在沙箱里过滤,"The agent sees five rows instead of 10,000";PII 自动令牌化(`[EMAIL_1]`/`[PHONE_1]`)后真实数据"never through the model"——隐私同时受益[官方,2025-11,同上]。
3. **轮次账**:直接调用一圈一轮推理;代码块里 20+ 次调用"eliminate 19+ inference passes"(PTC 数字),`while`+sleep 轮询这类控制流下沉到代码[官方,2025-11,advanced-tool-use]。

### 6.3 同一任务:tool call 版 vs 代码执行版(验收要求的对比)

| 对比项 | 直接 tool call / 等价 MCP | 代码执行版 | 节省 | 出处 |
|---|---|---|---|---|
| 例 A(Anthropic):连接多个 MCP server 完成跨服务器任务(把 Google Drive 的会议记录附到 Salesforce 线索) | **150,000 tokens**(全量工具定义+中间结果过模) | **2,000 tokens**(探索文件树,只读所需定义) | **98.7%**(官方原句"This reduces the token usage from 150,000 tokens to 2,000 tokens—a time and cost saving of 98.7%") | [官方,2025-11,code-execution-with-mcp,已回读核对] |
| 例 B(Cloudflare):把整个 Cloudflare API(2,500+ 端点)交给 agent | 等价 MCP server **1,170,000 tokens**(另一处口径:逐端点全暴露 >2M) | 2 个工具(`search()`+`execute()`)**约 1,000 tokens** | **99.9%**(官方原句"Code Mode reduces the number of input tokens used by 99.9%",tiktoken 计量) | [官方,2026-02,https://blog.cloudflare.com/code-mode-mcp/,已回读核对] |
| 例 C(Anthropic PTC):复杂研究任务的平均 token | 43,588 | 27,297 | **37%**(模型还要读代码,省幅小于纯编排任务) | [官方,2025-11,advanced-tool-use,已回读核对] |

例 C 提醒了一个重要边界:**任务越"编排"、数据越大,代码执行优势越大;任务越"单发调用",优势越小**(模型还要付写代码与沙箱运维的成本)。Anthropic 自己承认:"These infrastructure requirements add operational overhead and security considerations that direct tool calls avoid"[官方,2025-11]。

两个容易被忽略的增量收益同样来自官方原文:一是**有状态续作**——中间产物可落盘(`./workspace/leads.csv`)跨步骤复用,把"状态放文件系统不放上下文"(07 分册第三章的 pi 原则)推进到工具编排层;二是**与 Skills 的化学反应**——"Adding a SKILL.md file to these saved functions creates a structured skill"(给沉淀下来的函数配一个 SKILL.md 就成了结构化技能),代码执行跑通的编排可以直接固化为可复用资产[官方,2025-11,code-execution-with-mcp]。

**代码执行的反方**(综合官方自认与社区):错误处理与调试负担转移给模型(一次写错整块重来);小模型写代码成功率存疑;延迟与沙箱运维成本;任意代码执行扩大安全面(需无外网沙箱+资源限制)。正方:三大厂 2026 年全部把某种形态的沙箱执行做成一等公民(Anthropic PTC、OpenAI Responses API 的 code_interpreter/容器化 code execution、Cloudflare Workers isolate、pi QuickJS),事实已投票[官方,多方]。

**「对 harness 设计的启示」**

1. 工具数量 >20 或单次结果 >1K tokens 的 harness,应默认提供"工具的代码视图"(文件树 + search 三档),让模型用代码编排而不是逐发调用。
2. 沙箱是前置条件:无外网、资源限额、输出截断(pi 的 10K 默认值是可抄数字);没有沙箱就退回传统 tool call。
3. 中间结果默认不出沙箱是隐私架构而不只是省 token:PII 令牌化在 harness 层做,真实值不过模型。
4. 保留直接 tool call 作为小任务快路径,按任务形态路由(见 7.2 决策表),不要一刀切。

---

## 七、CLI vs MCP 之争与 2026 年的主流(含决策表)

### 7.1 争论的原文与误读

- **平手论(pi,2025-08-15)**:自建 terminalcp 同时提供 MCP 与 CLI 两种封装,3 任务 × 4 工具 × 10 次 = 120 次实测(Claude Code):"MCP vs CLI truly is a wash: Both achieved 100% success rates";MCP 版还**快 23%**(51m vs 66m)、便宜 2.5%;一个反直觉发现是 MCP 绕过了 Claude Code 对每条 bash 命令的 Haiku 安全校验(35K vs 1.3–2M tokens)。结论建议:"if you're building a tool from scratch and your users already have a shell tool available, just make a good CLI. It's simpler and more portable",且 CLI 输出可管道复用、"The protocol is just plumbing"[官方,2025-08-15,https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/,已回读核对]。**注意**:此文常被引用为"MCP 输了",原文其实是平局;且"协议只是管道"确实出自此文(07 分册表述无误,检索中曾有质疑,已回原文确认)。
- **拒绝论(pi,2025-11-02)**:焦点从"性能"转向"上下文账单":Playwright MCP 21 工具 13.7K、Chrome DevTools MCP 26 工具 18K,他的 README 方案 225 tokens;"Bash and code are composable"[官方,2025-11-02]。
- **反转(pi 团队,2026-09-29)**:官方博文《"You Said No MCP!"》宣布 MCP 进 pi 核心,理由:生态与规范已变("the MCP of today is not the MCP of yesteryear");pi 需要的沙箱解释器与 MCP 演化方向一致;"the best way to positively influence something is to embrace it"。技术形态:MCP 工具经 **codemode JS 沙箱**延迟暴露(配 `searchTools()` BM25 发现,工具声明 3000-token 预算)——注意"拥抱 MCP"与"上下文经济学"并不冲突,后者是前者实现方式[官方,2026-09-29,https://earendil.com/posts/you-said-no-mcp/;官方,2026,codemode.md]。
- **第三方立场抽样**:Geoffrey Huntley 算账(GitHub MCP 93 工具 55K tokens vs `gh` 近零——模型本就熟知)[二手,2025];Peter Steinberger:"MCPs which are a constant cost and garbage in my context… pay zero context tax"[二手,2025-10,经 Willison 转述];Simon Willison 轨迹:2025-11 提出 MCP 应做"auth、网络与安全边界的窄门"而非胖 API;2026-07-31 因 MCP 2.0 无状态化"重新感兴趣";2026-09 认为全功能编码 agent 不需要 MCP、受控环境受益于 MCP 的访问控制与审计[二手,2025-11/2026-07/2026-09,simonwillison.net]。反方阵营亦有 2026-09 的 "MCP was always a bad idea?"(HN 335 分/331 评论)[二手,2026-09]。

**正反两面的钢人论证**(供决策表使用,不省略任何一方的最强理由):

- **CLI 阵营最强的五张牌**:①可组合——管道、重定向、落盘再引用,MCP 结果必须过模型上下文才能二次加工[官方,pi 2025-08/11];②上下文效率——55K vs 225 tokens 的量级差[官方+二手];③零学习税——gh/tmux/pandas 早在训练数据里,in-context 文档即可匹敌[官方,pi 120 次评测];④无常驻进程、无端口、无版本握手,可移植可测试("simpler and more portable")[官方,pi];⑤前沿模型时代最小 ACI 就够(2.3 节两极证据)。
- **MCP 阵营最强的五张牌**:①委托 OAuth——agent 不碰 API key,token 受众绑定服务器,这是 CLI 做不到的鉴权形态[官方,2026-07 授权规范];②受控环境的访问边界与审计日志[二手,Willison 2026-09];③大规模扇出——earendil 演示 4 并行 worker 分析 167 个 Linear issue"without wasting any context at all",CLI 逐条跑会把全部输出灌进模型[官方,2026-09];④非 bash 环境与结构化界面——IDE、Windows、聊天客户端、需要 UI 的 elicitation 场景[官方规范];⑤厂商分发渠道与企业治理层(remote server、registry、toolsets)[官方+二手]。
- **实证对比的真实状态**:最严格的公开对照就是 pi 的 120 次评测(结论平手);更大规模的"harness×工具形态"受控实验截至 2026-10 仍稀缺——多数"CLI 碾压 MCP"或"MCP 更企业级"的说法是推理而非测量。这一点本身就是个发现:**工具形态之争目前是账本之争(token 可测),不是能力之争(性能难测)**[判断,基于上述检索范围]。

### 7.2 决策表:四种方式各适合什么(回答必答问题 2)

| 需求场景 | 首选 | 次选/补充 | 理由(来源支持) |
|---|---|---|---|
| 本机高频操作:文件、shell、代码 | **内置 CLI 工具**(read/bash/edit) | — | 前沿模型对 shell 有先验;pi/Codex 极简定义可打;mini-swe-agent 证明 bash-only 可达 74% [官方] |
| 调用需要 OAuth 委托的第三方 SaaS;给客户/多产品分发集成 | **远程 MCP**(OAuth 2.1 资源服务器) | CLI(本地已存凭据时) | 委托鉴权+审计+企业治理是 MCP 相对 CLI 的真增量 [官方规范;Willison 2026-09] |
| 团队流程/领域知识/规范产物(怎么写周报、怎么发版) | **Skills**(SKILL.md) | AGENTS.md/CLAUDE.md(更静态) | 三级渐进披露 ~100 tokens 起载;跨 44+ 产品可移植 [官方] |
| 大 API 面(百+端点)、链式依赖、大结果过滤、并行扇出 | **代码执行**(PTC/codemode/Code Mode) | 按需加载的 MCP | 98.7%/99.9% 的账;中间结果不出沙箱 [官方] |
| 长时异步任务(跑批、等待回调) | **MCP tasks** 或后台进程+文件状态 | tmux/后台 bash | tasks 状态机与轮询/推送已标准化 [官方,2026-07] |
| 需要跨厂商复用同一能力 | **Skills**(开放标准) | MCP(server 也可跨产品) | agentskills.io 44 客户墙;Codex/Gemini CLI 官方兼容 [官方] |
| 强治理环境(最小权限、可审计) | **远程 MCP + annotations + 审计层** | Skills(allowed-tools) | 资源服务器模型+step-up 授权;CLI 直调难收口 [官方规范] |
| 极端 token 敏感(本地小模型、长会话) | **CLI + 极简 README** | codemode | 225 tokens vs 13.7K 的对比 [官方,pi] |

### 7.3 2026 年的主流与退场者(回答必答问题 3)

**主流(有多方证据的收敛)**:

1. **分层**:CLI/内置工具做高频本机操作;MCP 做"边界"(鉴权、审计、受控访问、异步、跨产品分发);Skills 做程序性知识;代码执行做大编排。四者是叠加关系而非替代关系(Anthropic 自家就是四层全押)[官方,多方]。
2. **按需加载是默认**:Claude Agent SDK 默认 5 个、Cursor 46.9% 优化、OpenAI tool search 跟进——"全量预载"成为要专门解释的 legacy 行为[官方+二手]。
3. **Skills 标准化**:OpenAI/Google/Microsoft 系产品全部兼容 SKILL.md,生态从 Anthropic 单家实验变成行业默认格式[官方,agentskills.io]。
4. **代码执行成为一等公民**:Anthropic PTC 进 API 正式版本号、OpenAI 有容器化 code execution、Cloudflare Code Mode 进产品、pi 反转后把 MCP 装进 codemode[官方,多方]。
5. **MCP 2.0 化**:无状态、逐请求协商、企业授权(XAA)、URL elicitation——协议向"task-based agents"重造[官方,2026-07]。

**正在被放弃的**:

- "一个 server 几十上百工具、全量 schema 常驻"的用法(三家的按需加载都是对它的否定)[官方];
- HTTP+SSE 传输(2025-03 废弃)、协议级会话与 initialize 握手(2026-07 移除)、DCR(2026-07 弃用)[官方规范];
- "CLI vs MCP 二选一"的提问方式本身——连最坚定的反 MCP 者 pi 也回到了 MCP,争论重心移到"怎么暴露"(沙箱内、延迟加载)[官方,2026-09];
- 把工具描述当"给人看的文档"写——三大厂文档现在都把它当提示词工程对象[官方]。

### 7.4 中文社区观察(2026-10 检索)

- **叙事滞后约 3–6 个月**:2026 年中文圈的 MCP/Skills 讨论以翻译、测评、二次消化为主——Anthropic 2025-11 的 code-execution 数字(98.7%)与 pi/Codemode 话题在 2026 年 3–7 月才密集出现在 CSDN/知乎/公众号;而英文社区 2026-09 已在辩论 MCP 2.0 与"bad idea"命题[二手,2026-10 检索确认]。
- **厂商主导**:有分量的中文内容多出自云厂商与聚合号(阿里/腾讯/火山系 MCP 平台叙事、CSDN MCP 社区),个人开发者的原创深度辩论文稀缺;未见有影响力的中文"反 MCP"檄文,"MCP 已死"类标题多为标题党[二手]。
- **落地语境差异**:中文叙事更强调"企业接入与合规"(私有化部署、审计、国产模型适配),对 token 经济学的敏感度低于英文圈——与国内 API 计价与私有化交付形态有关【推断,基于上述文章的议题分布,未做定量统计】。
- 与本项目其他分册的交叉:07 分册(pi)是中文圈少数跟进到 2026-09 反转的一手调研;01/02 分册(厂商问题)记录的国内 harness 均未公开表态 MCP 2.0,属明显信息差[二手+项目内调研]。

**「对 harness 设计的启示」**

1. 不要在路线之争里站队,按 7.2 决策表分场景路由;冲突时优先"哪个形态把最少、最相关的 token 送进窗口"。
2. MCP 接入从一开始就按 2026-07-28 形态设计(无状态+discover+按需加载),不背 2024 形态的包袱。
3. 给每一层都留"出口":CLI 工具可被 codemode 调、MCP 工具可被延迟加载、Skills 可带脚本——层间可组合是 2026 形态的标志。
4. 工具层改动全部走评估闭环(2.1 节与第八节第 13 条),这是各大厂商唯一完全一致的做法。

---

## 八、工具设计审查清单(回答必答问题 4,可直接使用)

以下 14 条按"看定义 → 看返回 → 看行为 → 看治理"分组,每条给出通过标准(来源见前文):

**A. 定义与命名**

1. **命名空间与消歧**:工具名带服务前缀、动词+对象+限定(`asana_projects_search` 式);同服务内无近义重叠(有 `search_logs` 就不再要 `read_logs`)。前缀/后缀用自家评估定,不抄别人。
2. **一轮可见工具数 ≤20**(OpenAI 线)/定义总量 <10K tokens(Anthropic 线),超出必须有按需加载或分组的实现路径。
3. **描述是提示词**:写清"何时该调、何时不该调";没有废话套话;做过"模型行为偏差"排查(年份追加式 bug)。
4. **参数最小化与防非法态**:必填最少;枚举/结构优于自由文本;strict schema;复杂嵌套参数给 1-5 个 `input_examples`(Anthropic 实测 72%→90%)。
5. **不 1:1 包装 API 端点**:面向任务合并(工作流级工具);纯透传的 CRUD 组合判为不合格。

**B. 返回体裁**

6. **给人看 vs 给模型看**:返回自然语言名与模型需要的字段,不返回 uuid/mime_type 等技术噪音(除非模型要用它做后续调用)。
7. **详略档位**:提供 `response_format`(detailed/concise)或等价物;默认档足够完成典型任务。
8. **分页/范围/过滤/截断 + 合理默认值**;截断必须"可续"(告诉模型怎么取下一页),不允许静默截断。
9. **空结果显式说明**("成功但无输出"也要说),防幻觉。

**C. 行为与错误**

10. **错误信息可执行**:含正确格式示例 + 修复建议;不吐原始堆栈/错误码了事。
11. **副作用与幂等元数据完备**:readOnly/destructive/idempotent 标注齐全;危险操作有确认路径;幂等或可安全重试。
12. **结果 token 有账本**:该工具平均返回多少 token、P95 多少,有数字、入监控(Claude Code 的 25K 截断是兜底不是设计)。

**D. 治理与演进**

13. **评估先行**:该工具有一组带可验证结局的任务对(prompt→expected outcome),改描述/参数跑回归;有 held-out 集;验证器不因格式差异误杀。
14. **货架管理**:每季度审视使用率,低用/重叠工具合并或下线;工具目录有上限;第三方工具视为不可信输入做注入扫描。

**E. 完整示例:把一个坏工具改写成好工具(T09a 新增)**

下面的改写对象是一个接 Slack 的 MCP 查询工具。改写前的版本把清单 A–C 的典型错误集齐,改写后的版本逐条修复。**示例为教学构造**【推断:工具本身是合成的,但其中每个反模式与修复手法都有对应官方出处,见对照表】。

改写前——定义:

```json
{
  "name": "query_slack",
  "description": "Searches Slack messages.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "q":    { "type": "string", "description": "query" },
      "time": { "type": "string", "description": "time filter, e.g. last week, March, Q3 ..." }
    }
  }
}
```

改写前——返回体与错误:

```json
{ "ok": true,
  "messages": [ { "ts": "1717777777.000001", "user": "U0123ABC",
                  "text": "……", "thread_ts": "1717777800.000002",
                  "blocks": [ "……20 行渲染结构……" ] } ],
  "response_metadata": { "next_cursor": "dGVhbQ==" } }
```

错误时返回:`{"ok": false, "error": "rate_limited"}`;查无结果时返回 `{"ok": true, "messages": []}`。

改写后——定义:

```json
{
  "name": "slack_search_messages",
  "description": "Search messages in a Slack workspace by keyword, author, or channel. Use when the user asks about past discussions or decisions recorded in Slack. Do not use to send or modify messages (use slack_post_message for that).",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query":   { "type": "string", "description": "Keyword phrase to search for" },
      "channel": { "type": "string", "description": "Channel name without #; omit to search all channels" },
      "time_range": { "type": "string",
                      "enum": ["today", "last_7_days", "last_30_days", "this_quarter", "all_time"],
                      "description": "Defaults to last_7_days" },
      "response_format": { "type": "string",
                           "enum": ["concise", "detailed"],
                           "description": "concise = one-line summary + permalink per hit; detailed = adds thread context. Defaults to concise" },
      "page_token": { "type": "string",
                      "description": "Opaque cursor taken from the previous response's next_page.cursor; omit on the first call" }
    },
    "required": ["query"]
  },
  "annotations": { "readOnlyHint": true }
}
```

改写后——返回体(默认 concise 档,detailed 档经 `response_format` 参数取;翻页把上一页的 `next_page.cursor` 原样传回 `page_token` 参数):

```json
{ "results": [
    { "summary": "Mateo: shipping the payments fix on Thursday (2026-09-28, #eng-payments)",
      "permalink": "https://slack.com/archives/C0123/p1717777777000001" } ],
  "result_count_estimate": 43,
  "next_page": { "cursor": "dGVhbQ==",
                 "how_to": "pass this cursor as page_token to get the next 20 results" } }
```

空结果:`{"results": [], "note": "No messages matched. Try a shorter keyword or widen time_range."}`;错误:`{"error": "rate_limited", "retry_after_seconds": 30, "hint": "wait, then retry the same call"}`。

逐条对照(改动 → 清单条目 → 依据):

| 改动 | 清单条目 | 依据 |
|---|---|---|
| `query_slack` → `slack_search_messages`(服务前缀+动词+对象) | 1 | Agent SDK 文档:命名决定发现质量,"search_slack_messages 胜过 query_slack" [官方,2026,https://code.claude.com/docs/en/agent-sdk/tool-search] |
| 描述写清"何时该调/不该调"(use when / do not use) | 3 | Anthropic:描述是提示词;搜索工具描述含糊导致年份追加 bug [官方,2025-09,https://www.anthropic.com/engineering/writing-tools-for-agents] |
| `time` 自由文本 → `time_range` 枚举 | 4 | OpenAI:"enums and object structure to prevent invalid states" [官方,2026,https://developers.openai.com/api/docs/guides/function-calling] |
| 透传 Slack 原始 JSON → 自然语言 summary + permalink,去掉 ts/blocks/user_id | 6 | Anthropic:同工具 detailed 档 206 tokens vs concise 档 72 tokens,省掉的是 thread_ts 等技术 ID [官方,2025-09,advanced-tool-use] |
| 加 detailed/concise 详略档位(`response_format` 参数,enum 两档,默认 concise) | 7 | 同上 |
| `next_page.cursor` + `how_to` 说明怎么取下一页(请求侧对应 `page_token` 参数,首轮省略) | 8 | 清单 8:截断必须"可续",不允许静默截断 |
| 空结果显式 note + 修复建议 | 9 | SWE-agent:"命令成功但无输出也要说话",防幻觉 [官方,2024-2025,https://swe-agent.com/latest/background/aci/] |
| 错误码 → 带 `retry_after_seconds` 与 `hint` 的可执行错误 | 10 | Anthropic:错误信息要给具体可执行的改进建议,不是不透明的错误码 [官方,2025-09,writing-tools-for-agents] |
| 加 `annotations.readOnlyHint: true` | 11 | MCP 规范:hint 默认值相反(readOnlyHint 默认 false/destructiveHint 默认 true),且客户端"MUST 视为不可信" [官方,2026-07,https://modelcontextprotocol.io/specification/2026-07-28/server/tools] |

清单 2/5/12/13/14(工具数预算、不 1:1 包装、token 账本、评估先行、货架管理)是 harness 与货架层的检查项,不体现在单个工具定义里,分别见 §2.2、§2.1、§四与本节第 13/14 条。

**「对 harness 设计的启示」**:这份清单本身就是启示的落地形态——工具层的每个设计决策(命名、参数、返回、错误、元数据、评估、货架)都能对应到一条可勾选项;建议把它直接做成 code review 的模板或 CI 里对工具定义 schema 的 lint 规则,让"工具是评测驱动的工程对象"从口号变成流水线。

---

## 九、可信度与存疑项

- **高可信(官方一手,且 7 处已二次回读核对)**:Anthropic 三篇工程博文与平台/SDK 文档、Cloudflare 两篇、MCP 2026-07-28 规范多页、agentskills.io、pi 三篇博文、OpenAI function calling 指南、SWE-agent/mini-swe-agent/aider 官方文档、CodeAct 摘要。
- **中等(知名二手或多源互证)**:Willison/Huntley/Varda 立场引文、Invariant 两起事件、OpenAI/Google/Microsoft 采用时间线、Cursor 40 上限与 46.9% 延迟加载(后者 changelog 原页未核到,多源一致)。
- **已勘误**:初稿曾采信社区流传的"MCP Safety Audit 43%/37%/22%"三数字;主会话回读 arXiv 2504.03767 原文后确认该文只审计 4 个 server、无百分比调查,三数字不出自此文且未找到可靠原始出处,已从正文删除并在 3.5 节留勘误说明(2026-10-04)。
- **仅供方向/未核实(明示)**:Huntley "93 工具/55K"原帖付费墙、句为转引;MCP Safety Audit 43%/37%/22% 未回读原文;各类服务器扫描百分比(安全厂商口径,有动机);MCP registry 总数;Codex 技能上线确切日期(约 2026-01);CodeAct"步数 −30%"不在摘要;OpenAI 2025-09 "code_execution 工具"传闻未核实;XAA/SEP-990 未读 SEP 原文;"单个工具 500-2,000 tokens"与"每省 1 定义 token≈全会话省 50+"为本文折算【推断】。
- **中文圈滞后观察**:2026 年中文讨论基本是英文 2025-11 code-execution/Skills 话题的翻译与二次消化,滞后约 3-6 个月,且多出自厂商号/聚合号;未见有影响力的中文原创反 MCP 檄文[二手,2026-10 检索确认]。

## 十、参考资料

1. Anthropic — Writing effective tools for agents — with agents(2025-09)https://www.anthropic.com/engineering/writing-tools-for-agents
2. Anthropic — Introducing advanced tool use on the Claude Developer Platform(2025-11-24)https://www.anthropic.com/engineering/advanced-tool-use
3. Anthropic — Code execution with MCP(2025-11-04)https://www.anthropic.com/engineering/code-execution-with-mcp
4. Anthropic — Equipping agents for the real world with Agent Skills(2025-10-16)https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
5. Anthropic Platform Docs — Agent Skills overview(2026-10 读)https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
6. Anthropic Platform Docs — Code execution tool(2026-10 读)https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
7. Claude Code Docs — Skills(2026-10 读)https://code.claude.com/docs/en/skills
8. Claude Code Docs(Agent SDK)— Tool Search(2026-10 读)https://code.claude.com/docs/en/agent-sdk/tool-search
9. MCP Specification — Versioning(2026-07-28 current)https://modelcontextprotocol.io/specification/versioning
10. MCP Specification 2026-07-28 — Architecture https://modelcontextprotocol.io/specification/2026-07-28/architecture
11. MCP Specification 2026-07-28 — Server/Tools https://modelcontextprotocol.io/specification/2026-07-28/server/tools
12. MCP Specification 2026-07-28 — Client/Elicitation https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation
13. MCP Specification 2026-07-28 — Basic/Authorization https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
14. MCP Extensions — Tasks https://modelcontextprotocol.io/extensions/tasks/overview
15. Agent Skills 开放标准官网 https://agentskills.io
16. OpenAI Codex — Build skills(2026-10 读)https://learn.chatgpt.com/docs/build-skills
17. OpenAI — Function calling guide(2026-10 读)https://developers.openai.com/api/docs/guides/function-calling
18. Gemini CLI — Skills(2026-04-30)https://geminicli.com/docs/cli/skills/
19. Mario Zechner — MCP vs CLI(2025-08-15)https://mariozechner.at/posts/2025-08-15-mcp-vs-cli/
20. Mario Zechner — What if you don't need MCP at all?(2025-11-02)https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/
21. Earendil — "You Said No MCP!"(2026-09-29)https://earendil.com/posts/you-said-no-mcp/
22. pi — codemode.md https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/codemode.md
23. Cloudflare — Code Mode(2025-09-26)https://blog.cloudflare.com/code-mode/
24. Cloudflare — Code Mode: give agents an entire API in 1,000 tokens(2026-02-20)https://blog.cloudflare.com/code-mode-mcp/
25. Wang et al. — Executable Code Actions Elicit Better LLM Agents(CodeAct,ICML 2024)https://arxiv.org/abs/2402.01030
26. Yang et al. — SWE-agent(NeurIPS 2024)https://arxiv.org/abs/2405.15793;ACI 概念页 https://swe-agent.com/latest/background/aci/
27. mini-SWE-agent 官方站 https://mini-swe-agent.com/latest/
28. Aider — Unified diffs(2024)https://aider.chat/docs/unified-diffs.html;leaderboards https://aider.chat/docs/leaderboards/
29. HuggingFace — smolagents 博客(2024-12-31)https://huggingface.co/blog/smolagents
30. Simon Willison — MCP 相关文集(2024-2026)https://simonwillison.net/tags/mcp/
31. Geoffrey Huntley — Allocations(2025,付费墙)https://ghuntley.com/allocations/
32. GitHub — github-mcp-server https://github.com/github/github-mcp-server;Remote GitHub MCP Server is now generally available(github.blog changelog,2025-09-04;T09a 补深链并核验标题与日期)https://github.blog/changelog/2025-09-04-remote-github-mcp-server-is-now-generally-available
33. Invariant Labs — GitHub MCP Exploited: Accessing private repositories via MCP(2025-05-26)https://invariantlabs.ai/blog/mcp-github-vulnerability;MCP Security Notification: Tool Poisoning Attacks(2025-04-01)https://invariantlabs.ai/blog/mcp-security-notification(T09a 补深链并核验标题与日期)
34. Radosevich & Halloran — MCP Safety Audit: LLMs with the Model Context Protocol Allow Major Security Exploits(arXiv 2504.03767,2025-04;2026-10 回读核实,不含流传的百分比数字)https://arxiv.org/abs/2504.03767
35. 中文二手(示例):CSDN《MCP未来会死?》(2026-04-20,mcp.csdn.net);知乎《如何看 Anthropic 最新发布的 Claude Skills?》(2025-10);CSDN《Cursor和Manus告诉我们:外壳同样重要》(2026-03)
