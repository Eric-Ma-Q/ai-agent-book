# T08 · 动手实验：从零写一个最小 harness

**模块**：M8　**类型**：编码 + 教学文档　**优先级**：高

## 目标
用一个小而完整的代码实验，把 08–14 分册讲的机制亲手做一遍。读者跟着 6 个阶段走完，能说清每个机制解决什么问题、代价是什么。

## 必读上下文
- `collab/PROTOCOL.md`（第 5 节代码类自检）
- `research/08-harness-teardown-comparison.md` §4.4（最佳组合清单）
- `research/09-tools-mcp-skills.md` 第八节（工具设计审查清单）
- `research/10-agent-security-sandbox.md` §3.5（hooks 与策略即代码）
- `research/12-multi-agent-orchestration.md` §三（子代理契约）

## 技术约束
- Python 3.11+，**只用标准库**（HTTP 用 `urllib`），不引入任何 agent 框架。
- 模型接口用 **OpenAI 兼容的 Chat Completions + tools**，地址和模型名从环境变量读：`HARNESS_BASE_URL`（默认 `http://localhost:8080/v1`，本机已有兼容服务）、`HARNESS_MODEL`、`HARNESS_API_KEY`（可空）。**代码里不许写任何密钥。**
- 必须提供 **假模型（FakeModel）**：按脚本返回预设的 tool call 序列，让所有测试离线可跑、结果确定。
- 核心循环文件不超过 300 行；每个文件不超过 400 行。

## 6 个阶段（每个阶段一个小节 + 对应测试）
1. **S1 主循环**：read_file / write_file / bash 三个工具；循环直到模型不再调用工具或达到 max_steps；工具结果截断（例如 10k 字符）且截断时告诉模型怎么取下一段。
2. **S2 权限与 hooks**：工具调用前经过 `pre_tool_use` 钩子链，规则文件（JSON）定义 allow / ask / deny（例如拒绝 `rm -rf`、拒绝写工作区外路径）；被拒时把原因作为工具结果回给模型。
3. **S3 上下文压缩**：估算 token（字符数 / 4 即可），超过阈值时用一次模型调用把旧历史压成摘要；保留系统提示和最近 N 条消息；压缩提示词单独成文件。
4. **S4 大输出落盘**：工具结果超过阈值时写进 `.harness/artifacts/` 并只回传路径 + 前几行 + 行数。
5. **S5 只读子代理**：`explore` 工具启动一个只带 read_file / bash（只读命令白名单）的子循环，独立上下文，只回传摘要。
6. **S6 迷你 eval**：5 个本地任务（如"在给定仓库里找到某函数并写出它的调用者"），可执行判分；输出结果表（任务、通过与否、步数、token 估算）。

## 交付物
- `labs/mini-harness/`：源码、`rules.example.json`、`prompts/compact.md`、`tests/`
- `labs/mini-harness/README.md`：每个阶段讲"解决什么问题 → 怎么实现 → 对应哪份分册的哪一节 → 练习题"；附**真实运行输出**（至少：全部测试通过的输出，以及一次用真模型跑 S6 eval 的结果表；真模型跑不通就写明原因并附假模型的输出）
- `collab/reports/T08-mini-harness-lab.report.md`

## 验收标准
- `python3 -m unittest discover labs/mini-harness/tests` 全部通过，审核者会亲自运行
- 每个阶段至少 2 个测试，S2 的拒绝路径必须有测试
- README 的每个阶段都链接回对应分册的章节
- 不修改 labs/ 以外的任何文件
