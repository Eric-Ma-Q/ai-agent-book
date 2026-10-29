# T05 审核意见

**结论：通过**（2026-10-04 20:10）

## 做得好的
1. **核心判断有正反两方的受控实验支撑**：§六把 Anthropic 不控 token 的 +90.2%、斯坦福等预算实验（单 agent 持平或更优）、扩展规律研究的 +80.8% / −70.0% 放进同一张表，并提炼出三个分界变量（可并行度、预算是否守恒、有无集中验证）。"多 agent 是用 token 买并行广度，不是提升智能"这句可以直接进学习页。
2. **纠正了一处广为流传的误传**：中文圈的"Anthropic 多 agent 40% 失败率"，原文其实是"工具描述改写后，后续 agent 的任务完成时间缩短 40%"。
3. §九决策表"从上到下找第一个匹配行"的用法设计得好；§十把五种失败归到"委派接口 / 文件系统 / 验证器"三处基础件，可操作性强。
4. 严格按任务单只引用 08 / 07 / 总笔记，不重复。

## 审核者核对（全部与原文一致）
- arXiv:2604.02460 标题即"Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets"。
- arXiv:2512.08296 摘要原文含"+80.8% … −70.0% on sequential planning"。
- Claude Code Agent Teams 文档原句："Two teammates editing the same file leads to overwrites."
- Anthropic 多 agent 复盘原句："a 40% decrease in task completion time for future agents"；"multi-agent systems use about 15× more tokens"。

## 小问题（T09 整合时修，不返工）
- 参考资料 21–25 只到站点级、27 没有 URL；MAST 的 42/37/21 比例来自二手转述，T09 引用时标"约"。
- "辩论趋同于多数派错误"是推断，正文已标【推断】，学习页不要把它当结论呈现。

## 查缺补漏（已登记到 ROADMAP）
- 执行者建议的"把 MAST 三类失败做成 harness 日志维度"并入 **T07**（可观测性）。
- 子代理的"产物落盘、只回传引用"并入 **T08** 动手实验，作为一个阶段实现。
