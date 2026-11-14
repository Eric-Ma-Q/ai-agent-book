# T02 完成报告

## 交付物
- `research/09-tools-mcp-skills.md` — 工具层调研:工具设计原则与 token 账本、MCP 协议演进到 2026-07-28、工具按需加载、Agent Skills、代码执行范式、CLI vs MCP 之争与 2026 主流、14 条工具设计审查清单 — 8,900+ 汉字(总字符约 3.2 万)/ 约 390 行

## 摘要
1. **工具膨胀有公开账本**:Anthropic 五服务器 58 工具 ≈ 55K tokens、自家优化前 134K;pi 实测 Playwright MCP 21 工具 13.7K;GitHub MCP 93 工具 ≈ 55K(二手转引,原帖付费墙已核实)。折算单工具定义 500–2,000 tokens【推断,已标注】。OpenAI 给出一轮 <20 函数的硬建议。
2. **按需加载同时省 token 与提准确率**(本文最强发现):Anthropic Tool Search Tool 官方数字 72K→8.7K(−85%),且 Opus 4 准确率 49%→74%、Opus 4.5 79.5%→88.1%——"少即是多"首次有了受控实验。
3. **MCP 活到 2026 但重造了**:2026-07-28 规范(俗称 MCP 2.0)无状态化、删 initialize 握手、弃用 DCR、新增 server/discover 与 tasks 异步扩展、URL elicitation 防钓鱼。SSE(2025-03)与会话态(2026-07)两条旧路线已死。
4. **Skills 已是跨厂商开放标准**:agentskills.io 客户墙 44 个产品(实抓核对),含 ChatGPT & Codex、Gemini CLI、Copilot、Cursor、pi;Anthropic 工程文确认开放标准化日期 2025-12-18;三级渐进披露(~100 token / <5K / 磁盘不限)与 MCP 形成官方口径的互补分工。
5. **代码执行范式产品化并有三组同任务对照数据**:Anthropic 同任务 150,000→2,000 tokens(−98.7%)、Cloudflare 2,500 端点从等价 MCP 1.17M tokens 压到 2 工具 ~1,000 tokens(−99.9%)、PTC 复杂研究任务 −37%(提醒了任务形态边界)。中间结果不出沙箱同时是隐私架构(PII 令牌化)。
6. **CLI vs MCP 之争的原文被普遍误读**:pi 2025-08 的 120 次实测结论是平手(MCP 还快 23%、便宜 2.5%),"The protocol is just plumbing" 确出自该文(已回原文确认);2026-09-29 pi 官方反转拥抱 MCP(经 codemode 沙箱暴露)。收敛结论是分层:MCP 做边界、CLI 做高频、Skills 做知识、代码执行做编排。
7. 交付了一份 14 条的工具设计审查清单(定义与命名/返回体裁/行为与错误/治理与演进四组),每条带通过标准与出处。

## 方法与规模
- 四路检索:① MCP 协议与生态;② 工具设计与 token 经济;③ Skills 与代码执行范式;④ CLI vs MCP 之争与中文社区。子代理合计约 130 次搜索+抓取。
- **限流补做(2026-10-04,按协议第 2 节"并发与限流"新规)**:三个子智能体检索方向(MCP 协议演进、工具设计与 token 膨胀、Skills 与代码执行)由主会话**串行**逐页回读原文补做,加上首轮抽查共直接核实 **22 页**:MCP 规范 7 页(架构/tools/elicitation/授权/2025-06-18 变更页/版本页)、Anthropic 5 篇工程与平台文档、Agent SDK tool-search、OpenAI function calling 指南、Cloudflare code-mode-mcp、agentskills.io、pi mcp-vs-cli 与 codemode.md、arXiv 2402.01030 与 2504.03767、smolagents 博客、Invariant 披露、ghuntley.com。
- **补做成果——1 处重要勘误**:社区流传的"MCP Safety Audit 43%/37%/22%"三数字经回读 arXiv 2504.03767 原文确认**不出自该文**(该文仅审计 4 个 server、无百分比调查),已从交付物删除并留勘误说明;论文真实结论("current MCP design carries a wide range of security risks"+ 三类攻击演示)已按原文改写。
- 精读全文来源约 44 个;引用来源 35 组,官方约 28 组(≈80%)。中英文比例:英文一手为主,中文来源约 15%(均标二手,仅用于社区观察)。
- 耗时估计:子代理检索约 40 分钟 + 主会话串行补做与核对约 50 分钟 + 写作约 90 分钟。

## 自检结果
- [x] 必答问题逐条有答案:问题 1 → 交付物 2.2 节;问题 2 → 7.2 决策表(8 场景×四方式);问题 3 → 7.3 节;问题 4 → 第八节(14 条清单)。
- [x] 关键事实有 [官方]/[二手] 标注 + 日期 + URL;无出处推断标【推断】(三处,均已标注)。
- [x] URL 抽查:超额完成——主会话直接回读 22 个承重来源,内容与引用逐句一致;1 处不一致(MCP Safety Audit 百分比)已勘误(见"方法与规模")。
- [x] 未修改交付物之外的文件:`git status` 仅 `research/09-tools-mcp-skills.md` 与 `collab/reports/T02-tools-mcp-skills.report.md`;未 commit/push。
- [x] 每个大节结尾有「对 harness 设计的启示」(二~七节各 3–5 条,第八节以清单落地收束)。
- [x] 争议点有正反两面:2.3 ACI 两极、3.5 安全问题正方/反方/判断、5.3 Skills 批评、6.3 代码执行正反方、7.1–7.2 CLI/MCP 双方钢人五张牌+实证稀缺判断;示例增益也补了 OpenAI 的反例提醒(推理模型加示例可能有害)。
- [x] 验收标准:6.3 节同一任务 tool call 版 vs 代码执行版对照表(3 组公开 token 数据);决策表与 14 条清单完整可用;独立来源 35 组(≥20)、官方约 80%(≥50%)。
- 代码类自检项:不适用(纯调研任务)。

## 与已有内容的关系
- `ai-harness-explained.html` 2.2 节:刻意不重复,2.1 节以"增量"形式引用其数据并补 OpenAI 侧细则;2.2 节把 token 数据扩成行业账本。冲突:无。
- `research/07-pi-design-philosophy.md`:第七节引用其时间线;两处增量——①回原文确认"The protocol is just plumbing"出自 2025-08-15 原文且原文结论是平手(07 分册表述无误);②补齐 2026-09-29 反转的技术形态(codemode 沙箱暴露 + searchTools BM25 + 3000-token 工具声明预算)。冲突:无。
- `ai-harness-explained.html` 深挖(SWE-agent/MemGPT/Manus):引用其 25K 截断与 Manus"mask don't remove"互证,未重复叙述。
- 对后续任务的接口:T03 可复用 3.5 节安全事件清单与"annotations 不是安全边界"结论;T07 可复用 2.2 节 token 账本与 6.2 节"三笔账";T09 可把 7.2 决策表与第八节清单做成学习页组件。

## 待决问题 / 未完成项
1. **Huntley "GitHub MCP 93 工具/55K tokens"**:已核实原帖付费墙内、句子不可见,采信多方一致转引并标注;如需实锤可订阅回读。
2. **Cursor"延迟加载省 46.9%"**:changelog 原页未核到,第三方转述(idebattle.com,2026-01)与其他二手源一致,采信并标注。
3. **MCP Safety Audit 三数字**:已确认不出自该文、未找到可靠原始出处,不采信;若 T03 深入安全,建议改引该文真实结论或寻找真正的调查型论文。
4. **XAA/SEP-990、MCP registry 总数、各扫描百分比**(8.5% OAuth 等):二手弱来源,只作方向参考,正文均已标注。
5. **Codex 技能上线确切日期**(约 2026-01)、**tasks 于 2025-11-25 引入的沿革**(SEP-1686):未核实,正文不写死日期或已注明。
6. **建议后续补充**:英文圈 2026 下半年 MCP 2.0 迁移成本的第一批工程复盘;中文圈跟进 MCP 2.0 的原创内容;T01 横评若产出各 harness 工具清单 token 数,可回填 2.2 节账本。

STATUS: DONE
