# T03 · Agent 安全：权限、沙箱与提示注入

**模块**：M3　**类型**：调研写作　**优先级**：高

## 目标
harness 是模型和真实世界之间的唯一闸门。本任务讲清楚：agent 面对的威胁模型、各家 harness 的权限与沙箱设计、提示注入的攻防现状，以及"YOLO 模式"该怎么评估。偏防御与设计视角，不写可直接复用的攻击载荷。

## 必读上下文
- `collab/PROTOCOL.md`
- `research/07-pi-design-philosophy.md` 中 YOLO 安全观部分
- `research/04-product-engineering-lessons.md` 中 prompt injection 相关部分（**不要重复**，引用并深化）

## 覆盖范围
1. **威胁模型**：Simon Willison 的"致命三要素（lethal trifecta）"、间接提示注入、工具投毒（tool poisoning）、MCP 供应链风险、数据外泄通道
2. **权限模型**：各家 harness 的权限模式（如 ask / auto-edit / full-auto、allowlist/denylist、分类器自动审批），粒度与默认值
3. **沙箱技术**：macOS seatbelt、Linux landlock/seccomp/bubblewrap、容器/微 VM（Firecracker、gVisor）、网络出口控制；各家实际用了哪个
4. **防御研究**：CaMeL、双 LLM 模式、Design Patterns for Securing LLM Agents（2025 论文）、信息流控制；2026 年新进展
5. **真实事件**：agent 删库、越权、通过注入泄露数据等公开事件（只写经过、根因、修复，不写利用细节）
6. **审批疲劳**：人工确认为什么会失效；auto 模式/分类器审批的数据与争议

## 必须回答的问题
1. "沙箱 + 宽权限" 和 "无沙箱 + 逐条审批"，哪个更安全？有什么证据？
2. 目前有没有被证明可靠的提示注入防御？如果没有，工程上的最佳实践组合是什么？
3. 给出一份 **harness 安全设计清单**（≥ 15 条，按"必须 / 应该 / 可选"分级）。
4. 个人开发者在本机跑 agent（比如开着"完全访问"），最低限度应该做哪 5 件事？

## 交付物
- `research/10-agent-security-sandbox.md`（约 8k–12k 字）
- `collab/reports/T03-security-sandbox.report.md`

## 验收标准
- 威胁模型有一张"攻击面 × 缓解手段"矩阵
- 各家权限/沙箱对比表（至少 6 个 harness）
- 至少 20 个独立来源，官方/论文 ≥ 50%
