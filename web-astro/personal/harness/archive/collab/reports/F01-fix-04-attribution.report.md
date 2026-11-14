# F01-fix-04-attribution 完成报告

## 交付物
- `research/04-product-engineering-lessons.md` — §2.2.3 案例/数据句勘误（两处出处错误）+ 参考资料补 2 条 URL — 改 1 句、增 1 行
- `research/07-pi-design-philosophy.md` — §3.6 威胁模型条目补全 security.md 完整路径 — 改 1 处
- `collab/reports/F01-fix-04-attribution.report.md` — 本报告

## 修改前后对照

### 04 分册 §2.2.3（两处出处错误一并修正）

**改前：**
> **案例/数据**：Anthropic 内部 Trajectory Labs eval 声称 720 次间接注入全部被 auto mode 拦截，而 Willison 的人类测试显示只有 13.6% 的场景模型主动拒绝危险操作——"安全机制本身可能成为故障的一部分"（simonwillison.net，2026-08-08）。

**改后：**
> **案例/数据**：Anthropic 委托 Trajectory Labs 的评测（72 个场景 × 10 次）中，720 次间接注入对运行 auto mode 的 Claude 模型全部未得手；而同一公告（claude.com/blog/auto-mode-default-in-claude-code，2026-08-07）的官方研究显示，1,053 名有偿测试者的人工审批只拦下 13.6%（143/1,053）的危险命令，auto mode 则拦下 89%（937/1,053）——Willison 在转述（simonwillison.net，2026-08-08）中评论："asking humans to click 'OK' every few steps is clearly not going to result in safe behavior"（每几步就让人类点一次 OK，显然换不来安全行为）。

修正点说明：
1. **720 次注入测试**："Anthropic 内部 Trajectory Labs eval 声称" → "Anthropic 委托 Trajectory Labs 的评测（72 个场景 × 10 次）"，并注明"对运行 auto mode 的 Claude 模型"（评测同时测了 Codex/GPT-5.6 Sol，其攻击成功率并非 0，为免误读限定到 Claude）。
2. **13.6%**："Willison 的人类测试……模型主动拒绝" → "同一公告的官方研究：1,053 名有偿测试者的人工审批只拦下 13.6%（143/1,053）的危险命令，auto mode 拦下 89%（937/1,053）"。数字已用原文复核：博客原句 "The testers caught the dangerous command just 13.6% of the time (143 of 1,053)"、"auto mode blocked 89% of the same commands (937 of 1,053)"。
3. **引语替换（超出字面任务、需审核者注意）**：原引语"安全机制本身可能成为故障的一部分"在两个来源中均查不到对应原句，属无出处引语，按写作规范不能保留。已替换为 Willison 博文中可核实的评论原句 "asking humans to click 'OK' every few steps is clearly not going to result in safe behavior"，语义与原句论点（审批机制本身失效）一致，论证方向不受影响。

### 04 分册 参考资料补两条 URL

在"五、来源清单 → 检索引用（要点出处）"的 Prompt injection 条目后新增一行：
> - Agent 安全评估（§2.2.3）：Anthropic 官方公告 auto-mode-default-in-claude-code — https://claude.com/blog/auto-mode-default-in-claude-code（2026-08-07：1,053 名有偿测试者人工审批拦下 13.6%、auto mode 拦下 89%；委托 Trajectory Labs 测 72 个场景 × 10 次，720 次间接注入全部未得手）；Simon Willison 转述评论 — https://simonwillison.net/2026/Aug/8/auto-mode（2026-08-08）

### 07 分册 §3.6（路径精确化）

**改前：**
> - **威胁模型**(security.md):"Treat model-generated commands and code as untrusted."……

**改后：**
> - **威胁模型**(`packages/coding-agent/docs/security.md`):"Treat model-generated commands and code as untrusted."……

该行其余内容未动。行 97 之后的引用标签 `[官方,2026,cli.md/security.md]`（§3.6 自动化等价物条目）与 §一 要点速览中的 `[官方,2025-11;2026 security.md]` 也出现 security.md 简写，按"只改列出的句子/一处"约束未动，见"待决问题"。

## 摘要
1. 13.6% 的真实出处是 Anthropic 官方公告中的有偿用户研究：1,053 名测试者在会话中遇到被换成危险命令的权限弹窗，人工审批仅拦下 13.6%（143/1,053），auto mode 对同样命令拦下 89%（937/1,053）。
2. 720 次间接注入测试是 Anthropic 委托第三方 Trajectory Labs 所做，72 个场景各测 10 次；对运行 auto mode 的 Claude Fable 5 / Opus 5 / Sonnet 5 全部未得手（GPT-5.6 Sol 在 Codex 两种模式下攻击成功率 5.83% / 19.03%，故改句时限定为"对运行 auto mode 的 Claude 模型"）。
3. Anthropic 公告发布于 2026-08-07；Willison 2026-08-08 的博文是带评论的转述（link post），不是独立的人类测试。
4. 原句引语"安全机制本身可能成为故障的一部分"无原文对应，已替换为 Willison 可核实的评论原句。
5. 一个意外发现：人类拦截率随会话变长从约 17% 降到约 5%，auto mode 保持不变；且 13.6% 低 partly 源于用户审批习惯性放行（公告称 97% 批准率）——如后续想强化 §2.2.3 的论点可用，本次未写入。

## 方法与规模
- 检索：0 次新检索（按任务单"不需要检索"执行）；仅读取任务单给定的 2 个 URL 做原文核对（WebFetch 各 1 次，一次通过）。
- 精读来源：2 篇（Anthropic 公告、Willison 转述），关键数字均照录原句复核。
- 中英来源比例：1 中（任务单/协议）/ 2 英（引用来源）。
- 耗时：约 15 分钟。

## 自检结果
- 任务单"要改什么"逐条有答案：两处出处错误 → 见"修改前后对照"第 1、2 点；参考资料补 URL → 已补；07 路径 → 已改。通过。
- 关键事实出处：改后句内含两个来源与日期，参考资料条目含完整 URL。通过。
- 抽查 URL：本次引用的 2 个 URL 均实际访问并照录原句核对，内容一致。通过。
- 未修改交付物之外的文件：`git diff --stat` 仅显示 research/04（+2/-1）、research/07（1 处改动）；collab/ 与 research/08–10 为任务开始前已存在的未跟踪文件，未触碰。通过。
- 「对 harness 设计的启示」：本次为勘误类小任务、未新增大节，沿用原文各节既有启示，未添加（如需可在审核意见中指出的位置补写）。
- 争议点正反面：原句论点经替换引语后仍成立（审批机制失效→auto mode 相对更安全，但 Willison 同文提醒 auto mode 仍有 11% 残余风险——该提醒已存在于 07 分册同类讨论，04 分册原句未涉及，未扩写）。通过。
- 代码类：不适用。

## 与已有内容的关系
- `research/07-pi-design-philosophy.md` §3.6 与本任务无内容冲突，仅做路径精确化。
- `research/04-product-engineering-lessons.md` §2.2.3 的"表现"行"供应商 eval 与人类测试可能严重背离"：修正后，720/720 与 13.6% 两个数字同出 Anthropic 公告，严格说是"实验室攻击评测全拦"与"真人审批漏放"的对比，而非"供应商 eval vs 独立人类测试"的背离。该行的表述与新数据不完全匹配，但按"只改列出句子"约束未动，建议审核者定夺（见待决问题）。
- 其余分册（08–10）未检查、未改动，不在任务范围。

## 待决问题 / 未完成项
1. **引语替换**：原引语在两来源中无对应原句，我按写作规范替换为可核实的 Willison 原句评论。若审核者认为应保留原引语（例如它出自其他未提供来源），请提供出处，我再改回。
2. **§2.2.3"表现"行**："供应商 eval 与人类测试可能严重背离"与新修正的事实口径略有出入（两个数字同源），建议改为"实验室评测与真人审批行为可能严重背离"之类表述，本次未动。
3. **security.md 简写的其余出现处**：07 分册 §3.6 的引用标签 `[官方,2026,cli.md/security.md]`（行 99）和 §一 要点速览的 `[官方,2025-11;2026 security.md]`（行 17）仍是简写。任务说"一处"，我理解为只改威胁模型条目（引语所在行）；若需一致化，两处可顺手补全。
4. "有偿测试者"表述采用任务单口径（审核者已核对原文），本次抓取未直接见到 "paid" 原词，未单独复核。

STATUS: DONE
