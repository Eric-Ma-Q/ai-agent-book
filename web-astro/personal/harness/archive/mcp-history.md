# MCP（Model Context Protocol）完整历史：从 Anthropic 内部标准到 Linux 基金会中立项目

> 检索与撰写完成于 2026-10-06。来源以官方一手资料为主（Anthropic 公告、modelcontextprotocol.io 规范 changelog、modelcontextprotocol 官方博客与 GitHub releases），辅以主流技术媒体报道；无法给出深链的节点标注了可查证的出处（站点 + 标题 + 日期）。

---

## 0. TL;DR

- **2024-11-25**：Anthropic 发布 MCP，定位为连接 AI 与数据源的开放协议（"AI 的 USB-C"）。规范首版 `2024-11-05`，同时开源 TypeScript / Python SDK 与一批参考服务器。
- **2025 上半年**：规范一年内连发两版（`2025-03-26`、`2025-06-18`），传输从 HTTP+SSE 换成 **Streamable HTTP**，授权引入 **OAuth 2.1** 并逐步加固；OpenAI（3 月）、Google（4 月）、Microsoft（5 月）相继采纳。
- **2025 下半年**：治理与基础设施成型——官方博客（7 月）、治理模型（7 月）、**MCP Registry** 预览版（9 月）、`2025-11-25` 规范（一周年，Tasks 实验特性、icons、授权增强）。
- **2025-12-09**：Anthropic 将 MCP 捐给 Linux 基金会新设的 **Agentic AI Foundation（AAIF）**，OpenAI、Google、Microsoft、AWS 等成为支持方。
- **2026-07-28**：迄今最大重构版规范发布——**无状态化**（移除 initialize 握手与会话）、Roots/Sampling/Logging 进入弃用流程、Tasks 转为官方扩展、引入 MRTR 模式与特性生命周期政策。

---

## 1. 背景：MCP 之前，模型如何"够到"外部世界

在 MCP 出现之前，"让 LLM 调用外部能力"经历了三代方案，各有遗产，也各有局限：

| 时间 | 事件 | 意义与局限 |
|---|---|---|
| 2016-06-27 | Microsoft、Red Hat、Codenvy 宣布合作标准化 **Language Server Protocol（LSP）**，源自 VS Code 内部的 OmniSharp / TypeScript server 实践 | 证明了"编辑器 × 语言"的 M×N 集成问题可以用一个协议收敛为 M+N。MCP 官方文档明确以 LSP 为灵感来源（"LSP for AI"类比由此而来）。来源：[Red Hat 博客](https://www.redhat.com/en/blog/red-hat-codenvy-and-microsoft-collaborate-language-server-protocol) |
| 2022-10-14 | 论文 **ReAct**（Yao et al.，arXiv:2210.03629）提出"推理 + 行动"循环，让 LLM 在思维链中交错发起工具调用 | 确立了 agent 的基本执行范式 |
| 2023-02-09 | Meta AI 论文 **Toolformer**（arXiv:2302.04761）展示在预训练阶段教会模型自主决定何时调用 API | 工具使用从"外挂编排"走向"模型原生能力" |
| 2023-03-23 | OpenAI 推出 **ChatGPT Plugins**（beta + 插件商店） | 首次把"给聊天助手装插件"做成大众产品；但基于私有规范（OpenAPI + manifest），仅在 ChatGPT 内可用。来源：[OpenAI 公告](https://openai.com/blog/chatgpt-plugins) |
| 2023-06-13 | OpenAI API 原生 **function calling**（gpt-4-0613 / gpt-3.5-turbo-0613） | "函数名 + JSON Schema 参数"的调用形态事实标准化，此后各家 API（Anthropic、Google 等）均采用相似形态；但每个宿主应用仍需自己实现工具的注册、执行与安全。来源：[OpenAI 公告](https://openai.com/index/function-calling-and-other-api-updates/) |
| 2023-11-06 | OpenAI DevDay：**GPTs**（actions 取代 plugins）与 **Assistants API** 发布；plugins 进入弃用流程 | 插件体系被 GPTs/Assistants API 取代；仍是平台私有方案。来源：[OpenAI: Introducing GPTs](https://openai.com/blog/introducing-gpts) |
| 2024-04-09 | ChatGPT Plugins 全部下线（2024-03 起禁建新会话） | 第一代"助手插件"路线终结 |
| 2024-05-30 | Anthropic 宣布 tool use **GA**（"Claude can now use tools"，Claude 3 全系） | 注意：这是 API 层的工具调用 GA，与 11 月的 MCP 是两回事；MCP 发布时距此仅半年。来源：[Anthropic: tool use GA](https://www.anthropic.com/news/tool-use-ga) |

**痛点总结**（Anthropic 发布公告原话）："Every new data source requires its own custom implementation"——每个 AI 应用 × 每个数据源都要写一次定制连接器（M×N 问题）；模型被"困在信息孤岛和遗留系统之后"。function calling 解决了"模型如何发起调用"，但**没有解决"工具如何被发现、被复用、被授权、被任何宿主接入"**——这正是 MCP 要补的协议层。

---

## 2. 主时间线总览

> 详细论述见第 3–8 章；本表为速查。

| 日期 | 事件 | 类别 |
|---|---|---|
| 2024-11-25 | Anthropic 发布 MCP；规范 `2024-11-05`；TS/Python SDK + 参考服务器；Block、Apollo、Zed、Replit、Codeium、Sourcegraph 为早期采用者 | 发布 |
| 2024-12 | Java SDK 由 Spring AI 团队贡献；社区服务器生态爆发 | SDK |
| 2025-Q1 | Cline、Cursor、Windsurf 等编码客户端相继内置 MCP | 采纳 |
| 2025-03-11 | OpenAI Agents SDK 发布，发布即支持 MCP | 采纳 |
| 2025-03-26 | 规范 `2025-03-26`：OAuth 2.1、Streamable HTTP 取代 HTTP+SSE、工具注解；同日 Sam Altman 宣布 OpenAI 全面采纳 MCP | 规范 + 采纳 |
| 2025-04-09（当周广泛报道） | Google DeepMind（Demis Hassabis）宣布 Gemini 将支持 MCP | 采纳 |
| 2025-04 | VS Code 1.99 加入 MCP 支持 | 采纳 |
| 2025-05-19 | Microsoft Build：Windows AI Foundry、Windows 11 原生 MCP 支持、Azure/GitHub 官方 MCP 服务器 | 采纳 |
| 2025-05 下旬 | OpenAI Responses API 支持远程 MCP 服务器 | 采纳 |
| 2025-06-17 | Google 开源 Gemini CLI，内置 MCP | 采纳 |
| 2025-06-18 | 规范 `2025-06-18`：elicitation、结构化工具输出、MCP 服务器归类为 OAuth Resource Server（RFC 9728/8707）、移除 JSON-RPC batching、安全最佳实践页 | 规范 |
| 2025-07-02 | 官方博客 blog.modelcontextprotocol.io 上线 | 社区 |
| 2025-07-31 | 《Building to Last》：正式化 MCP 治理模型（工作组、SEP 流程） | 治理 |
| 2025-09-05 | 官方 PHP SDK 发布 | SDK |
| 2025-09-08 | **MCP Registry** 预览版上线（registry.modelcontextprotocol.io）；数日后 GitHub 也推出自己的 MCP Registry | 基础设施 |
| 2025-10-06 | OpenAI DevDay：ChatGPT Apps / Apps SDK 基于 MCP 构建 | 采纳 |
| 2025-11-21 | **MCP Apps**（客户端内交互式 UI）与 `.mcpb` 打包格式公布 | 规范扩展 |
| 2025-11-25 | 规范 `2025-11-25`（一周年）：OIDC Discovery、icons、增量授权、URL 模式 elicitation、采样中调用工具、OAuth Client ID Metadata Documents、实验性 **Tasks**；治理章节正式化（SEP、SDK 分级） | 规范 + 治理 |
| 2025-12-09 | **MCP 捐赠给 Linux 基金会 Agentic AI Foundation**；Block 捐 goose、OpenAI 捐 AGENTS.md 为共同创始项目 | 治理 |
| 2026-05-21 / 05-29 | `2026-07-28` 规范 RC（博客 05-21 宣布，GitHub RC tag 05-29）；06-29 各语言 Beta SDK | 规范 |
| 2026-07-27 | 官方 Ruby SDK 达到 1.0 | SDK |
| 2026-07-28 | 规范 `2026-07-28`：**无状态化重构**（移除握手与会话）、Roots/Sampling/Logging 弃用、Tasks 转官方扩展、MRTR、特性生命周期政策 | 规范 |
| 2026-08-22 | 《The New MCP Roadmap》发布，确立后续方向 | 治理 |

---

## 3. 诞生（2024-11）

**2024-11-25**，Anthropic 发布 [Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)：

- **定位**：连接 AI 助手与内容仓库、业务工具、开发环境的开放标准；client-server 架构，JSON-RPC 2.0 消息层。
- **首发内容**：规范（版本命名 `2024-11-05`）、TypeScript 与 Python SDK、参考服务器（Google Drive、Slack、GitHub、Git、Postgres、Puppeteer 等），Claude Desktop 即日起可作为 MCP 客户端。
- **早期采用者**：Block、Apollo 已接入系统；Zed、Replit、Codeium、Sourcegraph 参与共建。Block CTO Dhanji R. Prasanna："Open technologies like the Model Context Protocol are the bridges that connect AI to real-world applications."
- **协议作者**：David Soria Parra 与 Justin Spahr-Summers（Anthropic）。
- **版本命名与仓库沿革**：规范采用日期命名。GitHub 仓库中还保留一个更早的内部草案标签 `2024-10-07`（2024-11-06 归档，见 [releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases)），公开修订版即 `2024-11-05`（其后向兼容修订于 2025-03-26 以 `2024-11-05-final` 归档）。

**2024-12**：Java SDK 由 Spring AI 团队开发并捐赠为官方 SDK（[java-sdk](https://github.com/modelcontextprotocol/java-sdk)）；社区 MCP 服务器数量激增，第三方目录（Smithery、Glama 等）出现。

**2025 年 Q1**：编码类客户端成为第一波扩散主力——Cline、Windsurf、Cursor（2025-03 起在产品中集成工具市场）、Zed、JetBrains 系 IDE 相继支持；这与 MCP"开发环境天然是数据源"的定位吻合。

---

## 4. 大厂采纳与规范快速迭代（2025-03 ~ 2025-06）

### 4.1 规范 `2025-03-26`（2025-03-26）

[Changelog](https://modelcontextprotocol.io/specification/2025-03-26/changelog)：

1. **授权框架**：新增基于 **OAuth 2.1** 的完整授权框架（PR #133）。
2. **传输**：用 **Streamable HTTP** 取代原 HTTP+SSE 双端点传输（PR #206）——单端点、可选升级为 SSE 流，为无状态部署铺路。
3. **JSON-RPC batching**：新增支持（注意：两个版本后被移除）。
4. **工具注解**：`readOnlyHint`、`destructiveHint` 等行为提示（PR #185）。
5. 其他：音频内容类型、`completions` 能力声明、ProgressNotification 消息字段。

### 4.2 OpenAI 采纳（2025-03）

- **2025-03-11**：OpenAI 发布 Agents SDK（[new tools for building agents](https://openai.com/index/new-tools-for-building-agents/)），其 [MCP 文档](https://openai.github.io/openai-agents-python/mcp/)自发布起即支持将 MCP 服务器作为 agent 工具源。
- **2025-03-26**：Sam Altman 在 X 上宣布 OpenAI 全面采纳 MCP（"People love MCP"），覆盖 Agents SDK（已上线）、Responses API 与 ChatGPT 桌面端（"即将跟进"）——与规范 `2025-03-26` 同日，竞争者拥抱对手标准成为行业标志性时刻（可对照 [Wikipedia: Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol) 的时间线）。

### 4.3 Google 与 Microsoft 采纳（2025-04 ~ 2025-05）

- **2025-04-09 当周**：Google DeepMind CEO Demis Hassabis 宣布 Gemini 模型与 SDK 将支持 MCP（X 帖子，被 AI Weekly 等广泛报道）。
- **2025-04**：VS Code 1.99 为 GitHub Copilot 加入 MCP 客户端支持（[VS Code 更新日志](https://code.visualstudio.com/updates/v1_99)）。
- **2025-05-19**：Microsoft Build 2025——发布 Windows AI Foundry，宣布 **Windows 11 原生 MCP 支持**（先与部分伙伴做私有预览）；Satya Nadella 称 MCP 是"agentic web 的 HTML"。同期推出 Azure MCP Server、GitHub 官方 MCP Server（[github/github-mcp-server](https://github.com/github/github-mcp-server)）、Microsoft Learn MCP Server、Copilot Studio MCP 支持（见 Microsoft Blog "Microsoft Build 2025: The age of AI agents and building the open agentic web"，blogs.microsoft.com，2025-05-19）。
- **2025-05 下旬**：OpenAI Responses API 支持直接挂接远程 MCP 服务器；2025-08-19 MCP 支持在 Visual Studio 中 GA（devblogs.microsoft.com）。
- **2025-06-17**：Google 开源 Gemini CLI（[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)），内置 MCP 客户端；Gemini API / AI Studio 随后跟进。

### 4.4 规范 `2025-06-18`（2025-06-18）

[Changelog](https://modelcontextprotocol.io/specification/2025-06-18/changelog)——安全与数据质量的一版：

1. **移除 JSON-RPC batching**（PR #416）。
2. **结构化工具输出**：`outputSchema` + `structuredContent`（PR #371）。
3. **授权收紧**：MCP 服务器正式归类为 **OAuth Resource Server**，用 RFC 9728 Protected Resource Metadata 发现授权服务器（PR #338）；客户端**必须**实现 RFC 8707 Resource Indicators，防止令牌被恶意服务器骗取（PR #734）。
4. **Elicitation**：服务器可在交互中向用户请求补充信息（PR #382）。
5. Resource links、`MCP-Protocol-Version` 请求头、生命周期 MUST 化、新增[安全最佳实践](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)页、`title` 字段（人读名与程序名分离）。

---

## 5. 治理成型与基础设施（2025-07 ~ 2025-10）

这一阶段 MCP 从"Anthropic 主导的开源项目"向"有中立治理结构的标准"过渡：

- **2025-07-02**：[官方博客](https://blog.modelcontextprotocol.io/)上线（首篇即博客本身发布宣言）。
- **2025-07-31**：《[Building to Last: A New Governance Model for MCP](https://blog.modelcontextprotocol.io/)》——正式化治理结构：规范演进通过 **SEP（Specification Enhancement Proposal）** 流程，设立 Working Groups / Interest Groups（后随 `2025-11-25` 规范的 SEP-932/SEP-1302 落入规范文本）。
- **2025-08-22**：《Evolving OAuth Client Registration》提出 **Client ID Metadata Documents**（CIMD）以替代动态客户端注册的问题（后在 `2025-11-25` 规范化为推荐机制）。
- **2025-09-05**：官方 PHP SDK 发布（博客公告）。
- **2025-09-08**：**MCP Registry 预览版**上线（[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)，博客《Introducing the MCP Registry》，2025-09-08）。它只存**元数据**不存代码，核心职能是验证命名空间归属（发布者须拥有对应 GitHub org/user），取代原 `modelcontextprotocol/servers` 仓库的发现职能；2025 年底收录约 2,000 台服务器。数日后 GitHub 也推出自己的 MCP Registry，形成"官方注册表 + 平台注册表"并存格局。
- **2025-09-26**：博客《Update on the Next MCP Protocol Release》公布发布节奏（下一次定于 11 月）。
- **2025-10-06**：OpenAI DevDay 发布 ChatGPT **Apps / Apps SDK**，应用以 MCP 服务器形式接入 ChatGPT（[Introducing apps in ChatGPT](https://openai.com/index/introducing-apps-in-chatgpt/)）——MCP 成为消费级应用分发的事实接口。

---

## 6. 一周年与第四版规范、移交 Linux 基金会（2025-11 ~ 2025-12）

### 6.1 规范 `2025-11-25`（2025-11-25，发布一周年）

[Changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)：

- **授权再增强**：支持 OpenID Connect Discovery；`WWW-Authenticate` 增量授权（SEP-835）；**OAuth Client ID Metadata Documents** 成为推荐的客户端注册机制（SEP-991）；对齐 RFC 9728。
- **表达力**：服务器可为工具/资源/提示配置 **icons**（SEP-973）；elicitation 升级（URL 模式、多选枚举、默认值，SEP-1036/1330/1034）；**sampling 可带工具调用**（SEP-1577）；`ElicitResult` 规范化。
- **实验性 Tasks**（SEP-1686）：面向长时任务的可轮询、延迟取结果的持久请求机制。
- **治理正式入规范**：MCP 治理结构（SEP-932）、工作组/兴趣组（SEP-1302）、**SDK 分级制度**（SEP-1730）、社区沟通准则（SEP-994）。
- 其他：JSON Schema 2020-12 为默认方言、stdio 允许 stderr 全类型日志、非法 Origin 返回 403 等。

同期生态动作：**2025-11-21** 公布 [MCP Apps](https://blog.modelcontextprotocol.io/)（服务器可在客户端内渲染交互式 UI）与 `.mcpb`（MCP Bundle）本地服务器打包格式；**2025-11-28** SEP 流程迁移到 PR 制（博客《SEPs Are Moving to Pull Requests》）。

### 6.2 捐赠给 Linux 基金会 Agentic AI Foundation（2025-12-09）

[Anthropic 公告](https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation)、[Linux 基金会新闻稿](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)、[MCP 博客](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)：

- **AAIF**：Linux 基金会旗下 directed fund，使命是让 agentic AI 以"透明、协作、公共利益"方式发展。
- **共同创始项目**：Anthropic 捐 **MCP**；Block 捐开源 agent 框架 **goose**；OpenAI 捐 **AGENTS.md** 规范。
- **共同创始方**：Anthropic、Block、OpenAI；**支持方**：Google、Microsoft、AWS、Cloudflare、Bloomberg（云基础设施支持来自 AWS、Cloudflare、Google Cloud、Microsoft Azure）。
- **捐赠时点数据**（Anthropic 公告）：公开 MCP 服务器 10,000+；Python + TypeScript SDK 月下载 **97M+**；Claude 目录连接器 75+；已获 ChatGPT、Cursor、Gemini、Microsoft Copilot、VS Code 采纳。
- **治理连续性**：公告明确"MCP 的治理模型保持不变"，维护者继续以社区输入与透明决策为先。
- **12 月后续**：2025-12-19 博客《Exploring the Future of MCP Transports》放出**无状态化**方向的预告——直接引出 2026 年的大重构。

---

## 7. 无状态化重构（2026）

2026 年 MCP 完成了从"面向本地/长连接"到"面向服务端/HTTP 基础设施"的范式转向：

- **2026-01-26**：博客《MCP Apps — Bringing UI Capabilities To MCP Clients》（UI 扩展深化）。
- **2026-03-09 / 03-11**：《[The 2026 MCP Roadmap](https://blog.modelcontextprotocol.io/)》与《Understanding MCP Extensions》——确立**扩展（extensions）机制**与年度目标；2026-03-16 对工具注解的风险语义做官方澄清。
- **2026-04-08**：核心维护者团队扩编。
- **2026-05-21（博客）/ 05-29（GitHub RC）**：`2026-07-28` 规范 RC 发布；2026-06-18 配套公布企业托管授权（Enterprise-Managed Authorization，"零接触 OAuth"）；2026-06-29 各官方 SDK 推出 Beta 支持。
- **2026-07-27**：官方 Ruby SDK 达 1.0（至此官方 SDK 覆盖 TypeScript、Python、Java、Kotlin、C#、Go、Swift、PHP、Ruby）。
- **2026-07-28**：规范 [`2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28/changelog) 正式发布，是发布以来最大重构：

  **架构层（无状态化，SEP-2567 / SEP-2575）**
  1. 移除协议级会话与 `Mcp-Session-Id` 头；列表端点不再随连接变化，需要跨调用状态的服务器改用"服务器签发的句柄作为普通工具参数"。
  2. **移除 `initialize`/`notifications/initialized` 握手**——每个请求自带协议版本与客户端能力（`_meta` 承载 `io.modelcontextprotocol/protocolVersion` 等）；版本不匹配返回 `UnsupportedProtocolVersionError`。
  3. 新增 `server/discover`：服务器必须实现，用于广播版本、能力与身份。
  4. 订阅模型重构：以单一长连 POST 流 `subscriptions/listen` 取代 GET 端点与 `resources/subscribe`/`unsubscribe`。
  5. 移除 `ping`、`logging/setLevel`、`notifications/roots/list_changed`；日志级别改由每请求 `_meta` 指定；**移除 SSE 流恢复与 Last-Event-ID 重投**（断流即重发请求）。

  **功能与模式层**
  6. Tasks 从实验特性转为官方扩展 `io.modelcontextprotocol/tasks`（SEP-2663），接口重设计。
  7. 引入 **MRTR（Multi Round-Trip Requests）** 模式（SEP-2322）取代服务器主动发起的 roots/sampling/elicitation 请求：服务器返回 `InputRequiredResult`，客户端补参后重试原请求；所有结果新增必填 `resultType`（`complete` / `input_required`）。
  8. 列表类结果新增 `ttlMs`/`cacheScope` 缓存语义（SEP-2549）、`tools/list` 确定性排序（利于提示缓存）、OpenTelemetry trace 透传约定、自定义请求头 `Mcp-Method`/`Mcp-Name`/`x-mcp-header`。

  **弃用与生命周期**
  9. **Roots、Sampling、Logging 三大功能进入弃用流程**（SEP-2577）——建议改用工具参数/资源 URI、直连 LLM API、stderr/OTel 替代。
  10. **HTTP+SSE 传输正式标记 Deprecated**（SEP-2596，2025-03-26 起弃用至今）；`includeContext` 两值弃用；**RFC 7591 动态客户端注册弃用**，让位 CIMD（PR #2858）。
  11. 首次建立**特性生命周期与弃用政策**：Active/Deprecated/Removed 三态 + 最短 12 个月弃用窗口 + 弃用特性注册表；SEP 流程本身也正式化（SEP-1850）。
  12. 授权细节：RFC 9207 `iss` 校验、Dynamic Client Registration 须带 `application_type`、凭证与授权服务器绑定等。

- **2026-08-22**：博客《[The New MCP Roadmap](https://blog.modelcontextprotocol.io/)》给出重构后的方向声明。
- 生态响应：以 Kuadrant MCP Gateway 0.8（2026-07-30，支持新旧两种协议模式）为代表，网关/代理生态快速跟进无状态协议——无状态化显著降低了负载均衡、多副本部署与 CDN 缓存的实现门槛。

---

## 8. 三条专题线索

### 8.1 传输方式演进：stdio → HTTP+SSE → Streamable HTTP → 无状态 Streamable HTTP

| 阶段 | 版本 | 内容 |
|---|---|---|
| 2024-11 | `2024-11-05` | 两种传输：**stdio**（本地子进程）与 **HTTP + SSE**（远程，双端点：POST + SSE 长连接） |
| 2025-03 | `2025-03-26` | **Streamable HTTP** 取代 HTTP+SSE：单端点，响应可选升级为 SSE 流；HTTP+SSE 进入弃用倒计时 |
| 2025-06 | `2025-06-18` | Streamable HTTP 细化：`MCP-Protocol-Version` 头、Origin 校验（403） |
| 2025-11 | `2025-11-25` | GET 流轮询、流标识与恢复语义澄清（SEP-1699） |
| 2026-07 | `2026-07-28` | **移除协议级会话与握手**，请求自描述（`_meta`）；移除 SSE 恢复/Last-Event-ID；HTTP+SSE 正式 Deprecated。目标：让 MCP 服务器像普通 Web 服务一样水平扩展 |

### 8.2 授权方案演进：从无到有到"企业级零接触"

| 阶段 | 版本/事件 | 内容 |
|---|---|---|
| 2024-11 | `2024-11-05` | 无规范级授权方案（本地 stdio 场景为主） |
| 2025-03 | `2025-03-26` | 引入 **OAuth 2.1** 授权框架 |
| 2025-06 | `2025-06-18` | MCP 服务器 = OAuth **Resource Server**（RFC 9728 元数据发现）；客户端必须实现 **RFC 8707** 资源指示防混用令牌；新增安全最佳实践页 |
| 2025-08~11 | `2025-11-25` | **Client ID Metadata Documents（CIMD）** 成为推荐注册机制；OIDC Discovery 支持；`WWW-Authenticate` 增量授权 |
| 2026-06~07 | `2026-07-28` | 企业托管授权（零接触 OAuth）；RFC 7591 动态注册弃用；`iss` 校验、`application_type`、凭证-服务器绑定等加固 |

### 8.3 SDK 与 Registry

- **SDK**：2024-11 首发 TypeScript、Python；2024-12 Java（Spring AI）；2025 年 Kotlin（JetBrains）、C#（Microsoft 与 Anthropic 合作）、Go（与 Google 合作）、Swift（社区转入官方）陆续到位；2025-09-05 官方 PHP；2026-07-27 Ruby 1.0。`2025-11-25` 规范起 SDK 分为三级（Tier）以区分协议支持与维护承诺（SEP-1730）。官方列表见 [modelcontextprotocol.io/sdks](https://modelcontextprotocol.io)。
- **Registry**：2025-09-08 官方 Registry 预览（元数据服务 + 命名空间验证），取代 GitHub servers 仓库的发现职能；GitHub 数日后推出自家 Registry。2026 年起客户端逐步支持"从 Registry 直接安装"。
- **生态量级**：捐赠 AAIF 时（2025-12）公开服务器 10,000+、SDK 月下载 97M+；2026-07 npm 上 `@modelcontextprotocol/sdk` 周下载约 3,560 万，超过 OpenAI 与 Anthropic 官方 SDK 之和（第三方统计）。

---

## 9. 走势观察

1. **一年两拍，偶有大版本**：2024-11 → 2025-03 → 2025-06 → 2025-11 → 2026-07。节奏约为"半年一小版"，2026-07-28 因无状态化重构而跳档；随后以 12 个月弃用窗口管理存量兼容。
2. **协议的"减法"阶段**：从 `2025-06-18` 移除 batching，到 2026-07-28 移除会话/握手/流恢复并弃用 Roots/Sampling/Logging——MCP 从"全能双向协议"收敛为"无状态工具调用内核 + 扩展（Tasks、MCP Apps）"。
3. **从 Anthropic 项目到中立标准用了 13 个月**：2024-11-25 发布 → 2025-07 治理模型 → 2025-12-09 入 Linux 基金会 AAIF，竞争对手（OpenAI/Google/Microsoft）从采纳者变为基金会支持方。
4. **背景决定形态**：MCP 的每个设计转向都对应一次部署形态迁移——本地 stdio（Claude Desktop 时代）→ 远程托管（SSE）→ 服务器端规模化（Streamable HTTP）→ 云原生/网关（无状态化）。
5. **位置**：MCP 补齐了 function calling（模型层）与各平台插件体系（应用层）之间的**协议层**——工具的发现、复用、授权与跨宿主接入；LSP 用 8 年走过的路，MCP 用 2 年压缩完成。

---

## 附录：主要来源

**官方一手来源**
- Anthropic 发布公告（2024-11-25）：<https://www.anthropic.com/news/model-context-protocol>
- 规范 changelog：[2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/changelog) · [2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog) · [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog) · [2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- 规范仓库 releases（含 2024-10-07 草案与 2026-07-28 RC 日期）：<https://github.com/modelcontextprotocol/modelcontextprotocol/releases>
- 官方博客归档（2025-07-02 起全部文章目录）：<https://blog.modelcontextprotocol.io/>
- AAIF 捐赠公告（2025-12-09）：<https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation> · [Linux 基金会新闻稿](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation) · [AAIF](https://aaif.io/news/linux-foundation-announces-formation-of-aaif)
- MCP Registry：<https://registry.modelcontextprotocol.io>

**厂商与产品来源**
- OpenAI：[Agents SDK 发布（2025-03-11）](https://openai.com/index/new-tools-for-building-agents/) · [Agents SDK MCP 文档](https://openai.github.io/openai-agents-python/mcp/) · [Apps in ChatGPT（2025-10-06）](https://openai.com/index/introducing-apps-in-chatgpt/)
- Google：[Gemini CLI](https://github.com/google-gemini/gemini-cli)；Gemini 支持 MCP 的宣布（2025-04 上旬，Demis Hassabis X 帖）
- Microsoft：Build 2025 相关公告（2025-05-19，blogs.microsoft.com / blogs.windows.com："Windows AI Foundry"、"Advancing Windows for AI development"）；[VS Code 1.99](https://code.visualstudio.com/updates/v1_99)
- GitHub 官方 MCP Server：<https://github.com/github/github-mcp-server>

**背景来源**
- LSP 标准化（2016-06-27）：[Red Hat 博客](https://www.redhat.com/en/blog/red-hat-codenvy-and-microsoft-collaborate-language-server-protocol)
- ChatGPT Plugins（2023-03-23）：<https://openai.com/blog/chatgpt-plugins>；GPTs（2023-11-06）：<https://openai.com/blog/introducing-gpts>
- Function calling（2023-06-13）：<https://openai.com/index/function-calling-and-other-api-updates/>
- Anthropic tool use GA（2024-05-30）：<https://www.anthropic.com/news/tool-use-ga>
- ReAct：arXiv:2210.03629；Toolformer：arXiv:2302.04761
- 综合时间线旁证：<https://en.wikipedia.org/wiki/Model_Context_Protocol>

> 注：个别节点（如 Sam Altman 2025-03-26 的 X 帖、Hassabis 2025-04 的 X 帖）原始链接为社交平台帖文，本文以日期 + 广泛报道（含 Wikipedia 时间线）作旁证；深链缺失处均已标注可检索的出处信息。
