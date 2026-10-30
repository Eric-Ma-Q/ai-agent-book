# T10 · 学习页与题库补 S7 记忆层

**模块**：M9　**类型**：页面补充 + 出题　**优先级**：中　**预计**：小
**执行者**：Claude 子代理（ZCode 额度用完，2026-10-06 起改由子代理执行）

## 背景
T08-ext 给 `labs/mini-harness` 加了第 7 阶段 S7：一个带写入闸门、可重建的记忆层（67 个测试）。但学习页 `harness-engineering.html` 第 8 节还只写了 6 个阶段，题库里也没有 S7 的题（见 ROADMAP 查缺补漏记录最后一行、`collab/reviews/T08-ext-memory-lab.review.md`）。

## 必读
- `collab/PROTOCOL.md`（第 2、5 节；本任务不检索外网，第 3 节的出处规则只适用于引用分册里的事实）
- `labs/mini-harness/README.md` 里 S7 的部分，以及实际代码（以代码为准，不要照着 README 想当然）
- `collab/reports/T08-ext-memory-lab.report.md`、`collab/reviews/T08-ext-memory-lab.review.md`
- `harness-engineering.html` 第 4 节（`#s-memory`）和第 8 节（`#s-labs`）：版式与现有 6 张阶段卡片写法
- `harness-exam.html` 的 `Q` 数组：数据格式、现有 `lab` / `memory` topic 的题，以及页面上所有题数 / 分值统计

## 交付物 1：`harness-engineering.html`
- 第 8 节标题从「六阶段」改为「七阶段」，加一张 S7 卡片，结构与现有卡片一致：解决什么问题 / 核心代码在哪个文件 / 练习题，并给出运行命令（`memory list`、`memory rebuild`、相关测试）。
- 卡片要讲清楚：写入闸门（草稿区 → 正式区）、可重建（真相源是什么，派生态是什么，重建后逐字一致）、脱敏、边界标记防逃逸、两个已修的软链逃逸，以及**已知绕过**（同会话 `bash cat`、跨会话 `write_file → read_file`）和修法方向。
- 第 4 节「对 harness 设计的启示」或延伸阅读里加一句互链到 S7 卡片（写入闸门的动手实现）。
- 如果目录、页首或第 8 节导语里写着"六阶段 / 6 个阶段"，同步改掉。
- 版式、配色、组件沿用页面现有写法；375px 下不能出现横向滚动；页面保持单文件、不引外部资源。

## 交付物 2：`harness-exam.html`
- 新增 **≥ 4 题**，topic 用 `lab` 或 `memory`，严格沿用现有字段与题型；编号接在各 part 现有编号之后，不改已有题。
- `level` 至少有 1 道 analyze 及以上。`src` 指向 S7 卡片的锚点。
- 必出：
  - 为什么记忆写入要先进草稿区，而不是直接让模型写正式记忆（防什么）
  - "可重建"指什么：哪些是真相源，哪些可以删了再重建；重建时按当前闸门配置执行带来的效果
  - 已知绕过：闸门挡住了记忆写入，为什么同会话 `bash cat` 仍能把注入内容带进上下文；修法方向（文件级来源 / 污点追踪）
- 页面上的题数、总分、topic 统计如有，同步更新。

## 约束
- 只改上面两个文件，再加你的报告。不 commit，不改 `labs/` 代码，不改 `collab/` 下其他文件。
- 不新增分册和 labs 里没有的事实；数字（测试数等）以实际运行为准。

## 自查（写进报告）
1. `cd labs/mini-harness` 跑全部测试，报告实际通过数。
2. 用无头 Chrome 或任何你能用的方式，在 375px 视口下确认 `harness-engineering.html` 的 `document.documentElement.scrollWidth === 375`。
3. 校验题库：解析 `Q` 数组，确认 id 不重复、新题字段齐全、统计数字与题目实际数量一致；做不到点击级测试的，说明用了什么方式验证。

## 交付物 3：报告
`collab/reports/T10-s7-pages-exam.report.md`，按 PROTOCOL 第 4 节格式；列出改了哪些地方（改前 → 改后）、新题 id 列表、自查结果；末行 `STATUS: DONE`。
