# T02 · 工具层：工具设计、MCP、Skills 与"代码即工具"

**模块**：M2　**类型**：调研写作　**优先级**：高

## 目标
讲透 harness 的"双手"：工具怎么设计、怎么暴露给模型、怎么控制工具描述和工具结果对上下文的占用；以及 2025–2026 年工具层的几条路线之争。

## 必读上下文
- `collab/PROTOCOL.md`
- `ai-harness-explained.html` 中 2.2《Writing Effective Tools for Agents》一节和 DEEP DIVE 里"ACI"一段（**不要重复**，在此基础上往深和往新写）
- `research/07-pi-design-philosophy.md` 中关于 MCP 立场的部分

## 覆盖范围
1. **工具设计原则**：命名、参数设计、错误信息写法、返回体裁剪、分页/截断、幂等；ACI（SWE-agent）思想的后续发展
2. **MCP**：协议要点（tools / resources / prompts / sampling / elicitation 等）、版本演进到 2026 年的变化、远程 MCP 与鉴权、生态现状与问题（工具描述膨胀、安全）
3. **工具发现与按需加载**：tool search、延迟加载（deferred tools）、渐进披露
4. **Skills**：Anthropic Agent Skills 的设计（SKILL.md、按需加载、与 MCP 的分工）、其他厂商的跟进或对应物
5. **代码执行代替工具调用**：Anthropic "Code execution with MCP"、Cloudflare "Code Mode"、CodeAct 论文等——为什么让模型写代码调 API 可能比直接 tool call 更省 token、更强
6. **CLI vs MCP 之争**：pi / 一些社区观点主张"bash + CLI 就够了"，正反论据

## 必须回答的问题
1. 一个工具的描述 + 结果，典型占多少 token？有哪些公开数据说明工具膨胀的代价？
2. MCP、Skills、CLI、代码执行四种方式，各自最适合什么场景？给一张决策表。
3. 2026 年的主流做法是什么？哪个方向正在被放弃？
4. 写一个"工具设计审查清单"（≥ 12 条），可直接拿去审自己的工具。

## 交付物
- `research/09-tools-mcp-skills.md`（约 8k–12k 字）
- `collab/reports/T02-tools-mcp-skills.report.md`

## 验收标准
- 第 5 部分至少给出 1 个具体例子（同一任务：tool call 版 vs 代码执行版，token 对比如有公开数据）
- 决策表和审查清单完整可用
- 至少 20 个独立来源，官方 ≥ 50%
