# T03-r1 完成报告（安全分册返工）

## 交付物

- `research/10-agent-security-sandbox.md` — 原地修改后的安全分册 r1 版（含 T01 联动的 Cursor 修正）— 全文 30,923 字符，其中中文字 8,885（r1 前中文 8,329，**中文净增 +556**；总字符增量见"待决问题"第 1 条的口径说明）
- `collab/reports/T03-r1-security-sandbox.report.md` — 本报告

## 逐条回应审核意见

### 必须修改

**1. 主论点的数字证据太弱** → 审核意见：补 84% 官方数字作第一证据；Auto Mode 回一手核对；93% 出处存疑需核实；找不到一手就降级。
**怎么改的**：
- 84% 原句已亲自抓取核实：Anthropic 工程博文 "Beyond permission prompts: making Claude Code more secure and autonomous"（2025-10-20）原文即 "sandboxing safely reduces permission prompts by 84%"，已作为"沙箱从供给端减少弹窗"的第一证据写入要点 6、§6.1、§6.3。
- Auto Mode 一手公告已找到并全文核实：首发公告 `claude.com/blog/auto-mode`（2026-03-24，原话 "a classifier reviews it to check for potentially destructive actions"）；默认化公告 `claude.com/blog/auto-mode-default-in-claude-code`（2026-08-07 发布，2026-08-14 起对 Pro/Max/Team 生效）。1,053（"We hired 1,053 paid testers through a research vendor"）、13.6%（143/1,053）、89%（937/1,053）、97% 批准率、Trajectory Labs 720 次注入测试（72 场景 × 10 次）全部出自该公告，正文所有引用点改标 [官方]。
- **93% 经核实不出自 Anthropic**：官方公告与伴生文 `auto-mode-in-production`（2026-08-07，Nuro/Gusto/Garner 客户案例）均无 93%；官方口径是 97%。93% 保留为 cordum.io（2026-04）第三方口径并降级为旁证，不再承担结论。
- effectstory.com / wakib.ai 在正文中全部移除，仅参考资料 28 保留为"二手转述旁证"注记。
**改在哪一节**：要点速览 5/6、§3.2、§4.4、§4.5、§6.1、§6.2、§6.3、§7.2，参考资料 28/29/40。

**2. 13.6% 的归属冲突要裁定** → 审核意见：找原始出处，本篇写清最终结论；04/07 有误则在报告写明，不要改 04/07。
**怎么改的**：裁定为——**13.6% 出自 Anthropic 官方研究（1,053 名有偿测试者，经研究供应商招募），Willison 2026-08-08 的博文（simonwillison.net/2026/Aug/8/auto-mode）是对官方公告的转述与评论**（Willison 还提醒"仍有 11% 的场景 auto mode 拦不住"，此提醒也已补入）。裁定写在 §6.1 第二条。顺带发现 04 分册还有第二处误归：720 次注入测试是 **Anthropic 委托** Trajectory Labs 做的评测（72 场景 × 10 次 = 720），不是 Trajectory Labs 单方"声称"。按约束**未改 04/07 分册**，请审核者另派任务修正 04 §2.2.3 两处表述。
**改在哪一节**：§6.1（归属裁定条目）、要点 6。

**3. §2.1 出处张冠李戴** → 审核意见：确认 "Treat model-generated commands and code as untrusted" 到底出自哪家。
**怎么改的**：将该句与 "Watching the transcript, using project trust, and reviewing changes do not create a security boundary" 逐字核实——两句均出自 **pi 仓库 `packages/coding-agent/docs/security.md`**（earendil-works/pi，浅克隆后 grep 确认原句；pi 根目录 SECURITY.md 无此句，当前 main 仍可复核）。这是 **pi 的威胁模型**，不是 Anthropic 的文档。§2.1 已改归属并补 GitHub 深链。**07 分册 §3.6 的归属（pi security.md）本身就是对的，无需修正**。
**改在哪一节**：§2.1"注入入口"条目，参考资料 43。

### 应该修改

**4. 域名级引用补深链** → 五条承重引用全部补上并逐一验证：
- Gemini CLI 沙箱：`google-gemini.github.io/gemini-cli/docs/cli/sandbox.html`（渲染页验证，Seatbelt/Docker/Podman/`--sandbox` 均在页内）
- Copilot cloud agent：`docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent` + 防火墙页 `docs.github.com/copilot/how-tos/agents/copilot-coding-agent/customizing-or-disabling-the-firewall-for-copilot-coding-agent`
- OpenAI Atlas 加固博文：`openai.com/index/hardening-atlas-against-prompt-injection`（openai.com 屏蔽程序抓取，经 Wayback 快照 2025-12-23 验证存在且 HTTP 200，与 2025-12-22 发布一致）
- MCP 安全最佳实践：`modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices`（混淆代理/令牌透传/SSRF/会话劫持/本地 server 攻击均在页内）
- NVD CVE-2025-6514：`nvd.nist.gov/vuln/detail/CVE-2025-6514`（经 NVD REST API 交叉验证：CVSS 9.6 Critical，发布 2025-07-09）
其余无法深链的保持"域名级"标注（参考资料已注明）。**额外发现并修正一处事实错误**：原文写 Copilot 出口控制为 "`permissions.network` 域名 allowlist"——官方文档无此 YAML 字段，实际是在 GitHub UI 的 "Internet access" 设置里配置的防火墙域名 allowlist（推荐清单默认启用，仅约束 agent 经 Bash 启动的进程），已同步修正。
**改在哪一节**：§3.1 表（Gemini 行深链、Copilot 行修正）、§3.2 Copilot 段、§3.3、§2.3（MCP 最佳实践 + NVD）、要点 2（Atlas）、参考资料 11/13/15/17/23。

**5. 缺 hooks / 策略即代码** → 新增 §3.5"确定性拦截的用户侧落地：hooks 与策略即代码"（约 600 中文字，含官方文档引用）：Claude Code hooks（PreToolUse 执行前触发可拦截：退出码 2 或 JSON `permissionDecision: allow/deny/ask/defer`、`updatedInput` 改写参数、PermissionRequest 事件）、permissions allow/deny 规则文件与优先级（托管 > 命令行 > 项目本地 > 项目共享 > 用户）、managed-settings.json/MDM 企业下发；Codex 的 `.rules` 规则引擎（Starlark `prefix_rule()`，allow/prompt/forbidden 取最严，`codex execpolicy check` 测试）。§7.3 清单对应加第 15 条（P1），清单从 18 条变 19 条，标题同步改。
**改在哪一节**：§3.5（新增）、§7.3 第 15 条与标题、参考资料 44/45。

**6. 出处标注升级** → Willison 是"致命三要素"概念原始出处，要点 1 与 §2.1 改标 [官方-概念原始出处]；"Safe YOLO mode" 确认为 Anthropic 官方 Claude Code best practices 博文的原生命名（原博文现 308 跳转到 code.claude.com/docs/en/best-practices，原文经 Wayback 验证含 "d. Safe YOLO mode" 一节及 "claude --dangerously-skip-permissions" 原句），§6.3 启示 3 改标 [官方] 并补 URL。
**改在哪一节**：要点 1、§2.1、§6.3 启示 3，参考资料 42。

### 补充修正（T01 横评联动，审核者 2026-10-04 补充意见）

**审核意见**：T01 横评发现 §3.1 Cursor 行有误——Cursor 官方文档写明 Linux 沙箱是 Landlock + seccomp（内核 6.2+，bwrap 只是后备），不是"bwrap 等价物"；Run Modes 现为 Auto-review / Allowlist / Run Everything 三档，"Ask Every Time" 已在 v3.5 退役。
**怎么改的**：回到 Cursor 官方文档 `cursor.com/docs/agent/security/run-modes` 逐项核实，与 T01 记录完全一致——①Linux："Cursor uses Landlock and seccomp"，要求**内核 6.2+ 且支持 Landlock v3**，bwrap 仅是后备沙箱后端（环境变量 `CURSOR_SANDBOX_LANDLOCK_STATUS` 的 `bubblewrap` 取值），不满足条件时"falls back to asking for approval"；②三档为 Auto-review（**3.6 起、2026-05-29 成为推荐默认**）/ Allowlist / Run Everything；③"**Ask Every Time** was deprecated"（v3.5，新用户不可选，官方指引用空 allowlist 等价替代）；④顺带补入官方自认 "Auto-review is not a security boundary" 与网络控制方式（沙箱内默认断网，`sandbox.json` 域名 allowlist，默认叠加常用包管理源）。§3.1 Cursor 行整行重写，参考资料 12 更新为 run-modes 深链并注明修正内容。原文该行其余信息（如"沙箱终端 1.7 beta→2.0 GA"的历史演进、`Settings→Agents→Auto-Run` 路径）以官方现行为准被替换，避免与三档体系混淆。
**改在哪一节**：§3.1 表 Cursor 行、参考资料 12。

## 摘要

1. 89% / 13.6% / 97% / 1,053 / 720 五个承重数字全部回到 Anthropic 官方公告一手来源，低质量二手站（effectstory/wakib）从正文清除。
2. 84% 官方原句核实并补入，"沙箱替代审批"论证从此有两条独立的官方数字支撑：沙箱砍 84% 弹窗供给，Auto Mode 拦 89% vs 人工 13.6%。
3. 13.6% 归属裁定：Anthropic 研究、Willison 转述；04 分册 §2.2.3 两处误归（Willison 的人类测试；Trajectory Labs"声称"720），待审核者另派任务修正。
4. "Treat model-generated commands and code as untrusted" 确认出自 pi 仓库 security.md 而非 Anthropic，§2.1 已改；07 分册无错。
5. 93% 批准率非官方数字（官方 97%），已降级为第三方旁证。
6. 发现并修正原文对 Copilot 出口控制机制的错误描述（无 `permissions.network` 字段，是 UI 防火墙 allowlist）。
7. 新增 §3.5（hooks / permissions 规则 / Codex 规则引擎），"确定性层"补上了用户侧落地形态；§7.3 清单增至 19 条。
8. 五条承重深链全部补齐并逐条验证；Safe YOLO 与 lethal trifecta 出处升级为官方。
9. （T01 联动）Cursor 行整行重写：Linux 沙箱更正为 Landlock+seccomp（内核 6.2+，bwrap 仅后备），三档 Auto-review/Allowlist/Run Everything，Ask Every Time 3.5 起退役，补官方"非安全边界"自认与 `sandbox.json` 网络控制。

## 方法与规模

- 新增检索约 16 次：WebSearch 3、WebFetch 11（含 Cursor run-modes 复核）；另用 NVD REST API、Wayback CDX/快照、GitHub API、浅克隆 pi 仓库 grep 做了 5 次命令行验证（GitHub 代码搜索需登录，改用克隆本地检索）。全程主智能体串行，0 子智能体，未遇限流。
- 精读一手来源 8 篇：Auto Mode 首发公告、默认化公告、auto-mode-in-production 案例文、沙箱工程博文、pi security.md（克隆本地全文）、Claude Code hooks 文档、Claude Code settings 文档、Codex local-config 与 rules 文档。
- 中英文比例：本轮新增全部为英文一手来源（12+）；无新增中文来源（补的是官方文档，中文检索方向上一轮已覆盖）。
- 耗时估计：约 1.5 小时。

## 自检结果

- 任务单"必须修改/应该修改"逐条有回应：见上文"逐条回应审核意见"6 条，全部落地。
- 关键事实标注：新增事实全部 [官方] + 精确日期 + 可验证 URL；新增推断仅 §3.5 局限一句，已标【推断】。通过。
- 抽 5 个 URL 验证：claude.com/blog/auto-mode-default-in-claude-code（200，数字与引用一致）、code.claude.com/docs/en/hooks（200，PreToolUse 拦截语义一致）、google-gemini.github.io/gemini-cli/docs/cli/sandbox.html（200，Seatbelt/Docker/Podman/`--sandbox` 一致）、modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices（200，五大类攻击一致）、nvd.nist.gov/vuln/detail/CVE-2025-6514（NVD API：CVSS 9.6、2025-07-09、mcp-remote 命令注入，一致）。openai.com Atlas 页反爬，用 Wayback 快照验证。另核 cursor.com/docs/agent/security/run-modes（200，Landlock+seccomp/三档/Ask Every Time 退役逐项与 T01 记录一致）。通过。
- 未修改交付物之外的文件：`git status` 仅显示会话开始时已存在的 untracked 文件（collab/、research/08/09/10），04/07 分册未动，无 tracked 文件变更。通过。
- 每个大节有「对 harness 设计的启示」：未删动任何启示块；§3.5 并入第三章，沿用章末启示。通过。
- 争议点正反两面：§4.5、§6.2 结构未动，仅数字来源升级为官方。通过。
- 代码类（能运行/README/运行输出）：不适用。

## 与已有内容的关系

- **04 分册 §2.2.3**：两处误归待修正（13.6% 写成"Willison 的人类测试"；720 写成"Trajectory Labs eval 声称"，实为 Anthropic 委托其评测）。本篇 §6.1 已写明裁定；按约束未改 04，建议审核者派小任务修正该两行并同步 04 的参考资料（可引 claude.com/blog/auto-mode-default-in-claude-code 与 simonwillison.net/2026/Aug/8/auto-mode）。
- **07 分册 §3.6**：pi security.md 归属正确，与本篇 §2.1 修正后一致，无冲突，未动。
- **09 分册**：未触碰；MCP 安全内容分工（09 讲协议演进、10 讲安全）按审核者已登记的方案，待 T09 整合时收缩 09 §3.5。
- 其余页面与调研无新增冲突。

## 待决问题 / 未完成项

1. **"篇幅只增不超过 1,500 字"的口径假设**：按中文字符计，本稿中文 +556 字，在预算内；若按含 URL、英文引文与配置示例的总字符计，净增约 +4,424——超出部分几乎全部是审核意见第 1/4/5 条直接要求的引用载体（约 14 条新增官方深链 URL、84% 等英文原句、hooks/规则配置示例），且我已把可省的转述压缩（§6.1 结论段去重、参考资料精简、Auto Mode 首发公告 URL 只保留必要的两处）。如审核者按总字符口径执行该约束，建议明确"引用 URL 是否计字"，或允许下轮以删旧内容对冲。
2. 审核者怀疑"93% 可能出自 Anthropic 自己的 Auto Mode 文章"——已核实**不成立**（官方公告、in-production 案例文均无 93%，官方口径 97%）；93% 保留为 cordum.io 第三方口径。
3. openai.com 与 NVD 详情页屏蔽程序抓取，分别用 Wayback 快照（2025-12-23，HTTP 200）与 NVD REST API 交叉验证；建议审核者浏览器人工复核这两条深链一次。
4. managed-settings.json 的 OS 级具体路径（如 macOS `/Library/Application Support/ClaudeCode/`、Linux `/etc/claude-code/`）在 settings 文档页未列出，为避免引错未写入正文；如需可另查 managed-settings 专页补齐。
5. pi 仓库当前 main 的根目录 `SECURITY.md` 不含目标语句（目标语句在 `packages/coding-agent/docs/security.md`）；07 分册 §3.6 只写"security.md"未写全路径，语义上没错，若希望更精确可在后续任务中补全路径。

STATUS: DONE
