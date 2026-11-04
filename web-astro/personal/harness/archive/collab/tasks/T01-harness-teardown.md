# T01 · 主流编码 Agent Harness 横评拆解

**模块**：M1　**类型**：调研写作　**优先级**：高

## 目标
把"harness 是什么"从报告层面落到真实产品：横向拆解主流编码 agent 的 harness 实现，让读者能说清"同一个模型，换个 harness 为什么表现差很多"。

## 必读上下文
- `collab/PROTOCOL.md`
- `research/07-pi-design-philosophy.md`（体例参照，pi 本身也要纳入对比，但不要重复写它的细节，引用即可）
- `ai-harness-explained.html` 的"05 / PLAYBOOK 施工清单"一节（用它作对比维度的参照）

## 对象（至少 8 个，缺资料的写明）
Claude Code、OpenAI Codex CLI、Gemini CLI、OpenCode、Cline（或 Roo Code）、Aider、Cursor Agent、pi（引用 07），以及至少 1 个国产（Qwen Code / Kimi CLI / iFlow CLI / ZCode 任选，有资料优先 ZCode）。

## 对比维度（每个维度一张表 + 文字分析）
1. **主循环**：单循环还是规划-执行分离；停止条件；最大轮数
2. **工具集**：内置工具清单、数量、编辑方式（全量写 / search-replace / diff / apply_patch）
3. **上下文管理**：系统提示长度（如公开）、compaction 触发阈值与策略、仓库地图/检索方式
4. **子 agent / 并行**：有无、怎么隔离上下文
5. **权限与沙箱**：权限模式、默认沙箱技术（seatbelt / landlock / 容器 / 无）
6. **记忆与项目指令**：AGENTS.md / CLAUDE.md / GEMINI.md 等约定，层级与加载规则
7. **扩展性**：hooks、MCP、skills、插件、SDK 化
8. **开源与模型绑定**：是否开源、是否模型无关
9. **公开评测**：同模型不同 harness 的分数差（Terminal-Bench、SWE-bench 等，必须带日期和出处）

## 必须回答的问题
1. 各家在哪几个设计点上**趋同**？哪几个点上**分歧最大**？分歧背后的取舍是什么？
2. 有没有"同一模型、不同 harness、分数显著不同"的公开证据？差多少？
3. 系统提示 / 工具描述泄露或开源的版本里，有哪些值得抄的写法？（摘 3–5 段短引文并注明出处）
4. 如果从零设计一个编码 harness，你会从每一家各借鉴哪一个设计？（给出一份"最佳组合"清单）

## 交付物
- `research/08-harness-teardown-comparison.md`（约 8k–15k 字）
- `collab/reports/T01-harness-teardown.report.md`

## 验收标准
- 9 个维度都有表格，空格要写"未公开"而不是留空
- 每张表下方有分析段，不只是罗列
- 至少 25 个独立来源，其中官方来源 ≥ 50%
