# T06 审核意见

**结论：通过**（2026-10-04 21:00）

## 做得好的
1. 基准地图 11 个基准五列齐全，"截至 2026-10"的状态都写了（OpenAI 弃用 SWE-bench Verified、Terminal-Bench 4.0 移除 8 个任务、OpenAI Evals 关停）。
2. §三"四个坑"是全篇最有价值的部分：判分器漏洞（CORE-Bench 修判分后 42%→95%）、reward hacking 案例库（METR o3 30.4%、Terminal-Bench 把答案 curl 进 AGENTS.md）、环境泄漏（利用前序 trial 的 git 历史）。
3. §4.6 的完整示例（YAML 任务、D1–D4 四层判分、结果表和读表规则）与 §八"第一周最小 eval"可以直接照做。"judge 只打趋势分，不能单独决定放行"这条结论边界清楚。
4. 主动纠正了一个二手误报（Agent-as-a-Judge 的数字），回读了原文。

## 审核者核对（全部与原文一致）
- METR 博客含 "30.4%"；Anthropic《Demystifying evals》原文 "Opus 4.5's score jumped to 95%"；OpenAI Evals 文档含 "Evals will become read-only"；Terminal-Bench 整改公告原文写明某提交方的 agent "curls the solution" 进 AGENTS.md。

## 小问题（T09 整合时修）
- OpenAI 弃用 Verified 的博文只做了标题级引用（原页反爬），学习页引用时保持"标题级"口径，不要补没核实的审计数字。
- 中文来源只到域名级。

## 查缺补漏
- T08 的 S6 迷你 eval 应当用上本篇的"参考解必过 / no-op 必不过"两道门禁和 pass^k，已在 ROADMAP 登记，T08 审核时检查。
