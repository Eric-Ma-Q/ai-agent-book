# T03 完成报告

## 交付物
- `research/10-agent-security-sandbox.md` — Agent 安全调研:威胁模型、权限、沙箱与提示注入防御 — 约 8055 中文字符(总 26k 字符、302 行、39 组参考资料)

## 摘要
1. 威胁模型以 Simon Willison "致命三要素"为公理(私密数据+不可信内容+外传通道),并展开为"注入入口→执行→外传→供应链"四张攻击面清单;配了"攻击面 × 缓解手段"矩阵(§2.4)。
2. 注入未被解决是厂商自认的:OpenAI CISO "frontier, unsolved security problem"(2025-10);OpenAI 2025-12 博文标题仍是"持续加固"。AgentDojo/InjecAgent 基线数据支持悲观结论。
3. 防御研究收敛到架构层:CaMeL(能力+来源+控制/数据流分离,7 个百分点效用税换可证明安全)与五种设计模式论文是 2025 年两篇关键文献;2026 年进展在模型层(auto-attacker 红队、分类器)与行业框架(OWASP Agentic Top 10、FMF 指引)。
4. 8 家 harness 权限/沙箱对比表(§3.1):Claude Code(OS 沙箱+出口代理 allowlist+Auto Mode 分类器)、Codex(沙箱×审批二维解耦)、Gemini CLI(旗标沙箱)、Cursor(沙箱终端 GA)、Copilot cloud agent(一次性 Actions 环境+网络 allowlist)、pi/OpenClaw(默认 YOLO+外置容器)、Devin(microVM,二手)、国产(Trae Rust 沙箱/CodeBuddy/通义灵码)。
5. 审批疲劳被数据证伪:人工批准率 93–97%、人工拦截率 13.6%,Auto Mode 组合机制拦截 89%;但 Auto Mode 仍被 Rehberger 多步注入打到 RCE(2026-08)——"沙箱+分类器"也不是终点。
6. 回答了任务单四个问题:沙箱+宽权限 > 逐条审批(§6.3);无单一可靠注入防御,给出四层组合(§7.2);18 条分级 harness 安全清单(§7.3);个人开发者最低 5 件事(§7.4)。
7. MCP 供应链是增长最快的攻击面:postmark-mcp(2025-09)、CVE-2025-6514(2025-07)、Asana 跨租户(2025-06)、工具投毒/ rug pull(2025-04),协议侧 2025-06-18 规范已修补混淆代理与令牌透传。

## 方法与规模
- 检索:约 33 次 WebSearch / 9 次 WebFetch(全文抓取)。4 个并行子智能体因账户限流全部失败,按协议 2026-10-04 新增规则改为主智能体**串行**检索补齐全部方向(威胁模型、权限沙箱、防御研究、审批疲劳、中文来源),未跳过任何方向。
- 精读来源:8 个深链全文/摘要页抓取(Willison trifecta、AgentDojo、CaMeL、Design Patterns、Claude Code sandboxing 官方文档、Codex sandboxing 官方文档、PromptArmor、UpGuard)+ 30+ 搜索结果页消化。
- 中英文比例:英文约 2/3(官方文档与论文为主),中文约 1/3(21 经济网/51CTO/CSDN/V2EX/中文安全社区)。
- 来源构成:参考资料 39 组,其中官方文档/论文/行业组织约 26 组(≈59%,满足 ≥50%);独立来源远超 20 个。
- 耗时:约 2.5 小时(含限流重试与补做)。

## 自检结果(对照协议第 5 节)
- [x] 四个必须回答的问题逐条有答案:Q1→§6.3/§7.1;Q2→§4.5/§7.2;Q3→§7.3(18 条,必须 8/应该 6/可选 4);Q4→§7.4。通过。
- [x] 关键事实均有 [官方/二手] 标注 + 日期 + URL;4 处无出处推断标了【推断】(§2.1 结尾框架句、§3.2 读权限默认值商榷、§5 未授命行为引申、§6.2 弹窗同构性)。通过。
- [x] 抽验 URL:实抽 8 个深链(超过 5 个要求)——simonwillison.net/2025/Jun/16/the-lethal-trifecta/ ✓(引语逐字核对)、arxiv.org/abs/2406.13352 ✓(据此修正用例数为 629)、arxiv.org/abs/2503.18813 ✓、arxiv.org/abs/2506.08837 ✓、code.claude.com/docs/en/sandboxing ✓(全文抓取)、learn.chatgpt.com/codex/sandboxing.md ✓(全文抓取)、upguard.com Asana 博文 ✓、promptarmor.com Antigravity ✓(据此补"cat 命令绕过"细节)。通过。
- [x] git status:仅新增 research/10-agent-security-sandbox.md 与本报告;collab/ 与 research/09-tools-mcp-skills.md 为会话开始前已存在的未跟踪文件,未做任何改动;未触碰 collab/ 只读文件与已有 html/md。通过。
- [x] 每个大节结尾有「对 harness 设计的启示」(二/三/四/五/六 各 3–5 条)。通过。
- [x] 争议点有正反:§4.5(防御是否可靠:正方/反方/我们的判断)、§6.2(YOLO 之辩:pi 立场/HN 反方/判断)。通过。
- [x] 代码类:本任务为调研写作,无代码交付,不适用。

## 与已有内容的关系
- 与 `research/04-product-engineering-lessons.md` §2.2.4/§2.4:**引用不重复**——04 已记录注入案例流与 Lethal Trifecta 定义;本篇 §五将案例收敛为"经过/根因/修复"表并新增 04 未有的 5 个案例(Asana、postmark-mcp、CVE-2025-6514、AISI agent-攻-agent、Auto Mode 被绕过);04 的"概率防御不可信"结论在本篇深化为攻击面矩阵与四层组合防御。
- 与 `research/07-pi-design-philosophy.md` §3.6:07 记录了 pi 的 YOLO/"安全剧场"立场与 HN 反方观点;本篇 §6.2 引用并新增 07 未有的实证数据(89%/13.6%/93%/0-of-720、Rehberger Auto Mode RCE)。**发现一处表述差异**:07/04 将 13.6% 归因为"Willison 人类测试中模型拒绝率",本次检索到的一致数据源描述为"Anthropic 内部研究(1,053 名测试者)中人工审批组的拦截率、人工批准率约 97%"——本篇按并列来源处理,未强行归一,建议审核者裁定。
- 与 01/02/03 分册:无主题重复;§3.1 对比表可反哺 T01 harness 拆解任务。
- 与 `research/09-tools-mcp-skills.md`(T02 交付,另一会话产物):主题相邻但本篇只从安全角度覆盖 MCP(工具投毒/供应链/规范修订),写作前未读取该文件内容,交付后建议审核者查重 MCP 章节重叠度。

## 待决问题 / 未完成项
1. **限流影响**:子智能体方案失败后全部串行自做,个别来源只确认到域名级(未留深链):google-gemini.github.io、docs.github.com、openai.com、docs.kernel.org、modelcontextprotocol.io、m.21jingji.com、blog.csdn.net、v2ex.com、embracethered.com、til.simonwillison.net、genai.owasp.org。这些条目的事实均在多个独立搜索结果中交叉出现,但如需逐字核对请补抓深链。
2. **一手缺口**:89%/13.6%/1,053 测试者/0-of-720 等 Auto Mode 数字全部来自媒体转述(effectstory.com、wakib.ai),未找到 Anthropic 官方一手页面,已全部标 [二手];建议后续找到 Anthropic 官方工程博客后升级引用。
3. **Devin 执行环境**:microVM 隔离仅获二手描述(SourceForge/对比评测),Cognition 官方文档未公开细节;对比表中已注明。
4. **Asana 博文时间戳**:页面显示发布/更新时间(2026-07-02)与事件时间(2025-06-04 发现)不一致,已按事件日期引用并加注;检索中出现的"~1000 企业/0.8%/34 天"量级数字因无深链确认**未采用**。
5. **Codex Linux 沙箱栈新旧不一**:早期 GitHub 文档为 Landlock+ vendored bwrap,现行官方文档为 bubblewrap 优先;本篇按现行文档描述并注明旧路线,两处引用均给出。
6. **CaMeL 落地现状**:"无主流 harness 完整落地"为【推断】(基于各家官方文档未见实现),如 T 后续任务做 harness 源码拆解,可顺带证伪/证实。
7. 假设:按任务单"偏防御视角"省略了攻击载荷与利用细节;Gemini CLI/Copilot 域名级引用视为可接受的最小引用粒度。

STATUS: DONE
