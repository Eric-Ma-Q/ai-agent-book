# T04 审核意见

**结论：通过**（2026-10-04 20:20）

## 做得好的
1. **最有分量的新发现有一手证据**：Letta（MemGPT 分层记忆的原创者）当前文档已改为 git 版本化的记忆文件系统 MemFS + Dreaming 后台整理。它和 Claude Code、Codex、Anthropic memory tool、Manus 一起，构成"2026 年编码 agent 记忆走文件路线"的完整证据链。
2. **"基准大战"三个回合写得清醒**：Mem0 自己论文里全上下文基线高于 Mem0；Zep 复测；Letta 用"文件 + grep"拿到 74.0%；LoCoMo 被审计出约 6.4% 的标准答案有错。结论是"横向分数不可信，纵向的能力分项可信"，判断准确。
3. **写入策略表和 16 条清单可直接用**。"写入从模型手里拿走"（后台批处理、提取与整合分两段、含外部内容就禁写）是很好的教学主线。
4. 自检时主动更正了两个记错的 arXiv 编号，并删掉一条只有二手来源的"ICLR 2026 接收"。

## 审核者核对（全部属实）
- Letta 文档原始页面含 "git-backed" 与 "MemFS"；Codex Memories 文档含 `disable_on_external_context` 与 "redacts secrets from generated memory fields"。
- AgentPoison 摘要原文："…80% with minimal impact on benign performance (less than 1%) with a poison rate less than 0.1%"。
- embracethered 的 SpAIware 文章标题与 URL 对应正确。

## 需要指出的问题
- **报告里有一条不存在的"冲突"**：报告说"08 §3.6 把 Letta 描述为分层记忆"，但 08 全文没有出现 Letta 或 MemGPT。正文没受影响，但这是在报告里编造了交叉引用。今后写"与已有内容的关系"时，**每条都要 grep 原文确认**。

## 小问题（T09 整合时修）
- ZCode 那一行只标了【直接观察】，按 T01 审核后的规则，要补"安装包字符串"这类可复核的物证。
- 参考资料 26–34 只到站点级。
- §2.1 把《A Survey on the Memory Mechanism…》称为"中文综述"不准确，这是一篇英文论文（作者来自中国高校）。

## 查缺补漏（已登记到 ROADMAP）
- 记忆的"写入闸门"（含外部内容就禁写）和"可重建派生态"适合动手实现，作为 T08 之后的实验扩展（T08 不加码，避免任务过大）。
