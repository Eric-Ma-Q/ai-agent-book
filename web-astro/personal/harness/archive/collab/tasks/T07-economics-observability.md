# T07 · 工程经济学与可观测性：一次 agent 会话的钱花在哪、怎么看见

**模块**：M7　**类型**：调研写作　**优先级**：高

## 目标
回答两个工程问题：①一个 agent 会话的 token 和钱花在哪里，harness 设计怎样省；②出了问题怎么看见，应该记录什么。

## 必读上下文
- `collab/PROTOCOL.md`
- `research/09-tools-mcp-skills.md` §2.2（工具 token 账本，引用即可）
- `research/08-harness-teardown-comparison.md` §3.3、§3.9（压缩、缓存、成本差）
- `research/12-multi-agent-orchestration.md` §四、§十（token 倍数、失败分类）
- `research/07-pi-design-philosophy.md` 中 99.93% 缓存命中率一段

## 覆盖范围
1. **成本结构**：一次编码 agent 会话的 token 构成（系统提示、工具定义、历史、工具结果、输出），输入:输出比（Manus 公开过约 100:1），哪一块最贵。找公开的拆账数据或实测。
2. **Prompt caching**：Anthropic / OpenAI / Gemini / DeepSeek 等的缓存机制与价格（写入价、命中价、TTL），截至 2026-10；"缓存友好"的 harness 设计规则（稳定前缀、只追加、工具列表确定性排序、动态注入放尾部）；哪些常见做法会破坏缓存。
3. **省钱手段**：模型路由（压缩、分类、标题用便宜模型）、大输出落盘只回传路径和摘要、按需加载工具、批处理 / 低优先级 API、提前终止。每种手段给公开数据或案例。
4. **延迟**：首 token 时间、工具执行时间、并行工具调用、流式输出；用户感知延迟的公开研究或产品数据。
5. **可观测性**：OpenTelemetry GenAI 语义约定（截至 2026-10 的状态）、主流平台（Langfuse、LangSmith、Arize Phoenix、Braintrust、Helicone 等）的定位；一条 agent trace 应该记录哪些字段；把 MAST 三类失败（规格 / 失配 / 验证）做成日志维度。
6. **预算与熔断**：按会话、按用户、按子 agent 的预算；超限怎么处理；公开的"账单失控"事件。

## 必须回答的问题
1. 一次典型的编码 agent 会话（例如修一个中等 bug），token 和费用大致怎么分布？给出公开数据或可复现的估算方法。
2. 写一份 **缓存友好设计规则**（≥ 8 条），每条说明"破坏它会怎样"。
3. 给出一份 **agent trace 最小字段表**（字段名、类型、用途、例子）。
4. 给一份 **成本控制清单**（≥ 12 条，按"必须 / 应该 / 可选"分级）。

## 交付物
- `research/14-economics-observability.md`（约 8k–12k 字）
- `collab/reports/T07-economics-observability.report.md`

## 验收标准
- 一张"各厂商缓存价格与规则"对比表（注明截至日期和出处）
- 至少一个完整的成本估算示例（列出每一块的 token 数和单价）
- 至少 20 个独立来源，官方 / 论文 ≥ 50%
