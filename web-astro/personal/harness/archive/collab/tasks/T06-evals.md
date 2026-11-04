# T06 · Agent 评测：怎么给自己的 harness 建 eval

**模块**：M6　**类型**：调研写作　**优先级**：高

## 目标
08 分册 §3.9 已经证明"harness 是变量"。本篇回答下一个问题：**一个团队要改进自己的 harness，该怎么建评测体系**。偏方法论和实操。

## 必读上下文
- `collab/PROTOCOL.md`
- `research/08-harness-teardown-comparison.md` §3.9、§4.2（harness 作为变量的证据，引用即可）
- `research/09-tools-mcp-skills.md` §2.1、第八节第 13 条（工具层的评估闭环）
- `ai-harness-explained.html` 3.4"评测侧：另一种 harness"（不要重复）

## 覆盖范围
1. **基准地图**：编码（SWE-bench Verified / Pro / Multimodal、Terminal-Bench 2.x–4.0）、工具调用（BFCL、τ-bench / τ²-bench、MCP 类基准如 MCP-Universe / MCPMark）、通用 agent（GAIA、OSWorld、WebArena 等）。每个基准一句话：测什么、怎么判分、已知问题（污染、饱和、判分漏洞）。
2. **基准的坑**：数据污染、SWE-bench Verified 被质疑的问题、判分器漏洞被 agent 钻空子（reward hacking）的公开案例、榜单"最佳配置"不可复现。
3. **自建 eval 方法论**：任务集怎么来（真实日志采样、失败案例回收）、结果怎么判（可执行测试 / 规则 / LLM-as-judge / 人工）、轨迹评测（不只看结果，看过程：工具调用是否合理、是否越权）、离线 vs 线上（A/B、影子流量）。
4. **LLM-as-judge 的可靠性**：一致性、偏差、校准办法，公开数据。
5. **工具与平台**：Inspect（UK AISI）、OpenAI Evals、Braintrust、LangSmith、Promptfoo、Harbor（Terminal-Bench 框架）等，各自定位。
6. **把 eval 接进开发流程**：回归集、发布门槛、模型升级前的对比、成本与延迟一起评。

## 必须回答的问题
1. 一个 5 人小团队，第一周该建什么样的最小 eval？给出具体步骤和规模（多少条任务、怎么判分）。
2. 什么时候可以信 LLM-as-judge，什么时候不行？有什么公开数据？
3. 公开基准上分数高，为什么在自己的任务上不一定好？给出机制和案例。
4. 给一份 **harness eval 清单**（≥ 12 条）。

## 交付物
- `research/13-agent-evals.md`（约 8k–12k 字）
- `collab/reports/T06-evals.report.md`

## 验收标准
- 基准地图表（基准 × 测什么 × 判分方式 × 已知问题 × 最新状态，截至 2026-10）
- 至少 1 个"从零建 eval"的完整示例（任务样例 + 判分规则 + 结果表格式）
- 至少 20 个独立来源，官方 / 论文 ≥ 50%
