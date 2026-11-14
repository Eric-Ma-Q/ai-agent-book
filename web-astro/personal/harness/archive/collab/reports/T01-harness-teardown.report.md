# T01 完成报告

## 交付物
- `research/08-harness-teardown-comparison.md` — 11 个主流编码 harness × 9 维度横评拆解,含四问作答与"最佳组合"清单 — 中文正文约 9,573 字(全文 35,180 字符,含表格与英文)

## 摘要
1. **harness 乘数有了三条独立证据链**:Composio 同模型横评(8 harness×30 任务,通过率 47%→67%,每成功任务成本差 7 倍);arXiv:2609.20804 组件消融(上下文管理在 32k 窗口值 35.7 分);arXiv:2605.23950 方差分解(harness 方差可超过模型方差并致排名反转)。
2. **趋同面**:AGENTS.md 已成 Linux 基金会托管的事实标准(60k+ 项目);子代理/技能统一为 markdown+YAML 且跨 harness 互认(Cursor 直接读 .claude/.codex 目录);macOS 沙箱全员 Seatbelt;skills 采用率 9/11 反超 MCP 8/11(arXiv:2609.00006 源码普查)。
3. **分歧面**:工具哲学(46 vs 4)、审批哲学(YOLO / 二维正交 / 分类器仲裁)、上下文来源(repo map vs 自主检索+压缩 vs codemode)、编辑机制(文本 diff / apply_patch / 定向替换 / 全量写)、开源与绑定。
4. **关键机制摘录**:Claude Code 46 工具+参数级权限 specifier+34 种 hooks 事件+MEMORY.md 两级记忆;Codex 沙箱×审批正交+开源提示词熔断条款;Cursor Auto-review"沙箱内直行、出沙箱过分类器"+Linux Landlock+seccomp;OpenCode 把 compaction 做成隐藏系统代理;aider 每轮 lint/test 自动修复闭环。
5. **行业动态**:Roo Code 2026-05-15 关停;Cursor 自研 Composer(2025-10-29);Z.ai 推出自有 ADE"ZCode"同时官方文档明示 GLM Coding Plan 兼容 Claude Code/Cline/OpenCode——模型厂与 harness 厂互相渗透。
6. **国产三家落地**:ZCode(直接观察+媒体,无公开文档)、Qwen Code(28.3k 星,多协议+Agent Teams)、Kimi Code CLI(开源,MCP,52% AA Coding Agent Index)。
7. **"最佳组合"清单**(必答问题 4):Codex 的权限抽象、Claude Code 的子代理隔离与 specifier、aider 的 repo map 与验证闭环、pi 的 append-only 缓存纪律、Cursor 的配置目录兼容等,合成一条总原则:上下文省着花、安全交给基础设施、验证焊进循环、其余用文件表达。

## 方法与规模
- 检索动作约 60 次(WebFetch 约 46 次含 6 次 404、WebSearch 约 14 次),全流程主智能体**串行**完成,子智能体 0 个(遵守 PROTOCOL 并发规则);遇到 1 次搜索超时按协议等 60 秒重试成功;GitHub API 限流改用页面直抓。
- 精读来源约 40 篇,官方来源(文档/仓库/论文)约 30 篇,占比约 2/3(≥50% 达标);总独立来源 46 项(≥25 达标)。
- 中英比例:英文一手为主(官方文档),中文来源用于国产产品与社区动态(智谱官方微博/CSDN/媒体转述)。
- 耗时:约 2.5–3 小时(含限流等待)。
- 维度 5(权限与沙箱)复用已审核的 T03 分册(`research/10`)官方出处并复核,不重复展开。

## 自检结果
- [x] **必答四问逐条有答案**:§4.1 趋同/分歧(含取舍表)、§4.2 同模型不同 harness 证据(四条证据链+数字)、§4.3 五段引文(4 段可回源原文,Codex 提示词为开源仓库原文)、§4.4 最佳组合清单(逐家一项+总原则)。
- [x] **关键事实有 [官方]/[二手] 标注+日期+URL**;无出处处均标【推断】或【直接观察,2026-10】(ZCode 部分);数字均带"截至 2026-10"或事件日期。
- [x] **随机抽 5 个 URL**:aider.chat/docs/repomap.html(200)、community.openai.com/…/1395578(200)、github.com/jujumilk3/leaked-system-prompts(200)、code.claude.com/docs/en/sandboxing(200)、reddit.com/r/PiCodingAgent/…(403,反爬拦截;该链接来自搜索索引非编造,其支撑的事实另有两处已核实来源佐证,已在正文与参考资料如实标注)。
- [x] **未修改交付物之外的文件**:`git status` 仅新增 `research/08-harness-teardown-comparison.md`(collab/ 与 research/09、10 的 untracked 状态为既有状态,未触碰)。
- [x] **每个大节有「对 harness 设计的启示」**:九个维度小节各附 2–4 条可操作启示。
- [x] **争议点有正反两面**:审批哲学(YOLO vs 分类器 vs 正交)、子代理(全家桶 vs pi 的反对+替代工作流)、极简是否可外推(Composio 单模型局限已明示)、闭源与开源商业模式各自逻辑。
- 代码类自检项不适用(纯调研任务)。

## 与已有内容的关系
- **research/07-pi-design-philosophy.md**:按任务单要求只引用不重复——pi 的行均标注"(引 07 §x)",本文新增的是 pi 在 11 家横评中的相对位置。
- **research/10-agent-security-sandbox.md §3**:维度 5 为摘要表+交叉引用。**发现一处应反馈给 T03-r1 的修正**:Cursor Linux 沙箱官方文档明确为 Landlock+seccomp(内核 6.2+,bwrap 仅为后备上报值),10 分册写的是"Linux bwrap 等价物";另 Cursor Run Modes 三档(Auto-review/Allowlist/Run Everything)与"Ask Every Time 已于 v3.5 退役"为 10 分册未覆盖的新事实。
- **research/09-tools-mcp-skills.md**:机制层互补;arXiv:2609.00006 的"skills 9/11 vs MCP 8/11、无向量检索、无框架导入"为 09 分册"CLI vs MCP 之辩"补充了横截面证据。
- **ai-harness-explained.html PLAYBOOK**:施工清单逐条映射到真实产品(aider lint 闭环=自我验证、Codex 换窗=上下文分阶段、AGENTS.md=外部记忆先行),无冲突,可作为该页"深挖"素材。
- 未修改任何既有 html/md。

## 待决问题 / 未完成项
1. **ZCode 无公开官方文档**(docs.z.ai/bigmodel.cn 均未收录),相关行以【直接观察,2026-10】(本文作者即运行于该环境,工具面/权限四档/记忆机制等均可复核)与二手报道呈现;建议后续任务以官方文档发布后复核。
2. **Terminal-Bench 4.0 现行榜单**为 JS 渲染,三次尝试(tbench.ai/llms.txt/第三方站)未能直读原始数据,榜单数字用二手转述并标注;建议后续用浏览器自动化直读榜单接口。
3. **Reddit 403**:方法论文帖无法自动访问,事实由 deepakness 全表+Composio 官方页双源支撑,已标注。
4. **Composio 评测只覆盖 DeepSeek 系单模型**,"极简 harness 在强模型上仍占优"未获同规模交叉验证(arXiv 消融方向一致但问题不同);正文已明示此边界。
5. **Codex 默认模型口径不一**(官方界面示例 gpt-6.1-sol vs 社区口径 GPT-5.5),如实并列,待官方 changelog 确认。
6. 少量工具名(update_plan、browser_action、use_mcp_tool)与 Roo Orchestrator 模式未逐一核对,均标【推断】;对表格"未公开"格已按要求不留空。

STATUS: DONE
