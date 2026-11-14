# T05 · 子 agent 与多智能体编排：什么时候该拆，什么时候不该

**模块**：M5　**类型**：调研写作　**优先级**：高

## 目标
讲清多 agent 编排的模式、代价和适用边界。各家子代理的产品形态 08 分册 §3.4 已经横评过，**本篇不重复**，重点是"编排模式本身"和"何时不该用多 agent"的证据。

## 必读上下文
- `collab/PROTOCOL.md`
- `research/08-harness-teardown-comparison.md` §3.4（各家子代理形态，引用即可）
- `ai-harness-explained.html` 2.6《How We Built Our Multi-Agent Research System》补遗（不要重复）
- `research/07-pi-design-philosophy.md` 中 pi 反对子代理的立场

## 覆盖范围
1. **编排模式谱系**：orchestrator-worker、流水线、并行扇出 / 汇总、评审者-执行者（generator-critic）、辩论、层级 / 团队（Agent Teams）、交接（handoff，OpenAI Agents SDK）、黑板 / 共享状态。每种模式一句话定义 + 典型产品或论文。
2. **上下文隔离与通信**：子代理拿到什么、回传什么、怎么防止"传话失真"；共享文件 / 消息 / 黑板的取舍。
3. **代价**：token 倍数（Anthropic 研究系统公开过多 agent 约 15 倍 token 的数字，核实并找其他数据）、延迟、一致性冲突（并行写同一代码库）、调试难度。
4. **反方证据**：Cognition《Don't Build Multi-Agents》、多 agent 失败分类研究（如 MAST / "Why Do Multi-Agent LLM Systems Fail?"）、单 agent 加长上下文 vs 多 agent 的对照实验。
5. **协议层**：A2A（Agent2Agent）现状、与 MCP 的分工，2026 年进展。
6. **长任务与并行编码实践**：git worktree 并行、后台 agent、云端 agent 队列（Codex cloud、Copilot cloud agent、Cursor background agents）的工程做法。

## 必须回答的问题
1. 有没有受控实验证明"多 agent 比单 agent 更好"或"更差"？在哪类任务上？差多少？
2. 给一张 **"该不该拆成多 agent"决策表**：任务特征（可并行度、上下文规模、一致性要求、预算）→ 推荐模式。
3. 多 agent 系统最常见的 5 种失败方式是什么？各自的工程对策？
4. 并行写同一个代码库，业界现在怎么避免冲突？

## 交付物
- `research/12-multi-agent-orchestration.md`（约 8k–12k 字）
- `collab/reports/T05-multi-agent.report.md`

## 验收标准
- 编排模式谱系表（模式 × 定义 × 代表产品 / 论文 × 适用 × 代价）
- 正反两方都有一手来源支撑
- 至少 20 个独立来源，官方 / 论文 ≥ 50%
