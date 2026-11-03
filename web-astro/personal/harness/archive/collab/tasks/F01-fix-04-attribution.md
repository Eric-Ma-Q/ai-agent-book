# F01 · 修正 04 分册的两处出处错误

**类型**：勘误　**来源**：T03-r1 报告"与已有内容的关系"　**优先级**：中（很小，约 20 分钟）

## 要改什么
`research/04-product-engineering-lessons.md` §2.2.3 有两处出处写错了：
1. 13.6% 被写成"Willison 的人类测试中的拒绝率"。实际出自 Anthropic 官方研究：1,053 名有偿测试者，人工审批只拦下 13.6%（143/1,053），Auto Mode 拦下 89%。Willison 2026-08-08 的博文是对这份公告的转述。
2. 720 次注入测试被写成"Trajectory Labs 声称"。实际是 Anthropic 委托 Trajectory Labs 做的评测（72 个场景 × 10 次）。

一手出处：https://claude.com/blog/auto-mode-default-in-claude-code（审核者已核对原文）；转述：https://simonwillison.net/2026/Aug/8/auto-mode

另外顺手做一处精确化：`research/07-pi-design-philosophy.md` §3.6 提到 pi 的 "security.md"，补全路径为 `packages/coding-agent/docs/security.md`（pi 仓库根目录的 SECURITY.md 不含相关语句）。

## 交付物
- 修改 `research/04-product-engineering-lessons.md` §2.2.3 两处，并在 04 的参考资料里补上述两条 URL
- 修改 `research/07-pi-design-philosophy.md` §3.6 一处路径
- `collab/reports/F01-fix-04-attribution.report.md`：贴出修改前后的原句对照，末行 `STATUS: DONE`

## 约束
- 只改上面列出的句子，别的内容一字不动。
- 不需要检索，审核者已提供出处；如对原文有疑问，只读这两个 URL 核对。
