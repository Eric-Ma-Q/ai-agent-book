# T12 完成报告

> 接手说明：本任务由上一个执行者做到大半后中断（无报告、无验收）。本报告记录接手时的状态、我补改的内容和实测验收结果。

## 交付物
- `ai-failure-casebook.html` — 15 例扩为 42 例的案例集（8 组 tab、42 行对比表、十条 + 12 条续集规律、64 项检查清单、续集选例说明）— 3,326 行
- `index.html` — 仅 casebook 卡片（42 例 / 37 个应用层 / 22 条规律 / 64 项）；接手时已改好，本次未动
- `collab/reports/T12-casebook-merge.report.md` — 本报告

## 摘要
1. **接手时的状态**：主体搬运已完成——42 个 tab / 42 个 `case-*` panel、8 组分组、42 行对比表、规律节"十条 + 12 条"并标出三处修正、清单 64 项、选例说明"续集三批"段、页脚 2026-10-07、index 卡片都已就位；原 15 个 panel 正文与 HEAD 版逐字一致（脚本比对，未改动）。
2. **发现的主要错误：hero"39/42 由外部最先发现"数错了。** 按三份调研稿"谁先发现"列重新数：T11a 9/9；T11b 8/9（Amazon Q 是 AWS 内部回滚在先；豆包由微信风控拦截，调研稿注明"风控是别人的风控"，计外部）；T11c 8/9（AI 造谣案由监管巡查发现，调研稿称"本批唯一由'内部'先发现"）；原 15 例 13/15。合计 **38/42**。已改 hero、清单"发现"组的出处标注、表格读法注；表格里豆包的标签改为外部色并注"（微信侧）"，让表格颜色和统计口径一致（表中外部 38 行，非外部 4 行：Klarna、麦当劳、Amazon Q、AI 造谣）。
3. **来源条数**：ChatGPT 分享链接案只列了 1 条，补上调研稿里的第 2 条（Search Engine Land）。Anthropic 质量下降、豆包手机助手两案在调研稿里**本来就只有 1 条可核实链接**，按"不新增事实"保留 1 条，并在选例说明里写明。
4. **时间线阶段标签（T11a 审核第 1 条）**：Tessa 的"2023-06-01 发布"已改为"背景"；Air Canada 的"2024-02-16 修复（公众层面）"原先被直接删掉了，我按审核意见恢复成"信号"条目。另把 Anthropic 时间线"08-25"改成"08-25~26"（调研稿第三个 bug 在"08-26 前后"，原来并进了 08-25 条）。
5. **字段口径**：MyCity 的 lag 第三项写成"曝光 → 下线"，改回统一的"止血耗时：约 23 个月（曝光 → 下线）"（调研稿原文）。
6. **规律 2 的旧数字**：原规律 2 写"15 个案例里有 13 个"，和新 hero 并列容易误读，在不改编号、不改论点的前提下补了括注"（扩到 42 例后为 38 个，见规律 12 的修正）"。
7. **选例说明补全**：加入 T11b 换下的 Taco Bell、Snapchat My AI 及理由（来自 T11b 报告"待决问题"第 1 条），T11c 放弃的方向（盛京医院撤稿、r/replika 规模数字），以及仍未取得原文的来源（Fast Company 首发、Engadget、DoNews、新京报）。
8. **深链定位（交互修正，请审核者关注）**：tab 分成 8 组后，tab 区在桌面端约 700px 高、在手机端约 1,600px 高。原逻辑在深链、点击对比表、点击"上一个 / 下一个"时滚到 `#cases` 区顶部，**当前面板会落在首屏之外**（15 例时没有这个问题）。改为滚到当前 panel（`.panel{scroll-margin-top:58px}`，首次加载的跳转同理）。其他交互（点击、← → / Home / End、hash 同步、hashchange）没有改。

## 方法与规模
- 通读任务单、PROTOCOL、三份审核意见、三份调研稿的对比表 / 规律 / 检查项 / 选例节，以及 T11a/b/c 报告的"待决问题"。
- 用脚本审计页面：逐个 panel 检查字段（一句话定性、假设 + 指标、时间线、三项 lag、为什么没拦住、四层根因、止血 / 修复 / 制度化、做对 / 欠缺、PM 条数、来源条数、pager）；把新 27 个 panel 里的每个多位数字和日期，逐案拿到对应调研稿小节做子串核对。
- 抽 5 例人工逐条对照：Anthropic、M365 捆绑、Mata v. Avianca、德勤、Replika。
- 浏览器实测：本机 Google Chrome 无头模式，独立 user-data-dir（临时目录）+ CDP 端口 19333 + `python3 -m http.server 18777`（只绑 127.0.0.1），由一个 Python 脚本统一启动和关闭。**没有连接或触碰 muse2api 的 19210 端口和它的 Chrome**（测后确认其进程 22576 仍在运行）。
- 本任务不开子智能体；没有 git commit。

## 自检结果（按任务单"验收"）

### 1. HTML 结构检查（脚本 `HTMLParser` 栈匹配 + id / aria 交叉核对）
```
tag errors: [] unclosed at EOF: []
ids: 94 duplicates: []
roles: {'tablist': 1, 'presentation': 16, 'tab': 42, 'tabpanel': 42}
aria-controls: 42 missing targets: []
data-case: 42 unique: 42 missing targets: []
aria-labelledby missing: []
case-* ids: 42 panels without tab: [] panels without table row: []
tab order == table order: True
```
计数核对：
```
checklist li: 64
patterns: 22 修正 marks: ['修正原规律 4', '修正原规律 2', '修正原规律 7']
table rows: 42 rows whose discoverer cell starts ext: 38 int-first: ['case-klarna', 'case-mcd', 'case-amazonq', 'case-rumor']
groups: ['模型 / 平台层（5 个）', 'AI 替公司说话（6 个）', '人格与输出失控（3 个）', '默认值与商业化（10 个）', 'Agent 与开发工具（4 个）', '专业流程（8 个）', '陪伴与未成年人（4 个）', '硬件与形态（2 个）']
hero: [('42', '个案例 · 37 个应用层'), ('38/42', '由外部最先发现'), ('5', '段式分析框架'), ('64', '条上线检查项')]
footer: 整理于 2026-10-07
```
新 27 个 panel 的字段：全部齐全；PM 条目 3–4 条；来源 2–4 条，只有 Anthropic、豆包为 1 条（调研稿只有 1 条，见待决问题）。

### 2. 浏览器实测（无头 Chrome + CDP，脚本最后一次完整运行的输出）
```
started http.server pid 25704 chrome pid 25705
[1] console errors/warnings on load: ['Failed to load resource: the server responded with a status of 404 (File not found) http://127.0.0.1:18777/favicon.ico']
[2] tab click: {'count': 42, 'bad': [], 'lastHash': '#case-rabbit'}
[2b] keyboard: {'afterLeftFromFirst': '#case-rabbit', 'afterRight': '#case-gpt4o', 'from29Right': '#case-cnet'}
[2c] table data-case links: {'links': 42, 'bad': []}
[3] deep link case-amazonq {'hash': '#case-amazonq', 'visible': ['case-amazonq'], 'panelTop': 58, 'viewportH': 813, 'titleTop': 81, 'scrollY': 4641, 'tabSelected': 'true'}
[3] deep link case-gpt-share {'hash': '#case-gpt-share', 'visible': ['case-gpt-share'], 'panelTop': 58, 'viewportH': 813, 'titleTop': 81, 'scrollY': 4641, 'tabSelected': 'true'}
[3] deep link case-avianca {'hash': '#case-avianca', 'visible': ['case-avianca'], 'panelTop': 58, 'viewportH': 813, 'titleTop': 81, 'scrollY': 4641, 'tabSelected': 'true'}
[3b] pager / table link / hashchange: {'pagerFrom': 'case-avianca', 'pagerTo': 'case-deloitte', 'pagerPanelTop': 58, 'tableLinkOn': True, 'tableLinkPanelTop': 58, 'hashchangeOn': True, 'hashchangePanelTop': 58}
[4] 375px: {'initial': [375, 375, 375], 'allPanelsOk': True, 'bad': [], 'overflowingOutsideScrollers': [], 'tableScroll': [860, 341, 'auto']}
[4b] 375px deep link #case-rumor panelTop: 58 visible: True
[5] dark contrast ratios: {'htmlDark': True, '#case-amazonq .verdict': 11.59, '#case-amazonq .ctl li': 12.98, '#case-amazonq .stg': 6.43, '#case-amazonq .lag b': 12.98, '#case-amazonq .layer span': 12.98, '#case-amazonq .pm li': 12.98, '#case-amazonq .srcs a': 9.12, '#case-amazonq h3': 12.98, '#compare td': 9.12, '#compare .who.ext': 8.27, '#compare .who.int': 10.29, '#compare tr.grp td': 8.69, '.pat h4 small': 12.98, '.pat p': 6.42, '#checklist li': 12.98, '#method .note li': 14.36, 'min': [6.42, '.pat p']}
[1b] errors across whole session: 1 ['{"method": "Log.entryAdded", "params": {"entry": {"source": "network", "level": "error", "text": "Failed to load resource: the server responded with a status of 404 (File not found)", "timestamp": 179']
leftover chrome procs: none | leftover http.server: none
```
逐项结论：
- **控制台**：页面脚本没有报错。唯一一条是浏览器自动请求 `/favicon.ico` 被 http.server 返回 404，与页面无关（页面没有声明 favicon，其他页面也一样）。
- **42 个 tab**：逐个点击，每次只有对应 panel 可见，`aria-selected` 和 hash 同步，判定全部通过；← 在第 1 个循环到第 42 个，第 29 个按 → 到第 30 个（跨组正常）。
- **对比表 42 个 `data-case` 链接**全部能切到对应 panel。
- **深链**（seed 固定随机抽新案例 `#case-amazonq` / `#case-gpt-share` / `#case-avianca`，手机端另测 `#case-rumor`）：直接打开即选中对应 tab，panel 顶端停在 58px（紧贴吸顶目录下方），标题在首屏内。pager、表格链接、手动改 hash 也都落在 panel 上。
- **375px**：初始和切换 42 个 tab 后都是 `scrollWidth == clientWidth == 375`；`main` 下没有元素超出视口（宽表在 `.table-scroll` 内，860 > 341，`overflow-x:auto`）。
- **暗色**：`prefers-color-scheme: dark` 下 `html.dark` 生效；新内容各类文字对实际背景的对比度最低 6.42（规律正文），都高于 WCAG AA 的 4.5。看过截图（375px 暗色 tab 区、1280px 暗色 tab 区、1280px 亮色 `#case-tomato` 深链），排版正常。
- **进程清理**：脚本结束时按进程组关掉 Chrome 和 http.server，事后 `pgrep` / `lsof` 确认没有残留，19333、18777 端口已释放；muse2api 的 Chrome（pid 22576）未受影响。

### 3. 抽查 5 个新案例（对照调研稿）
| 案例 | 核对项 | 结果 |
|---|---|---|
| Anthropic 质量下降 | 08-05 引入、0.8%、08-29 峰值 16% 与约 30% Claude Code 用户、09-02/04/12 回滚、09-16/18 修复、09-17 复盘、约 6 周 | 一致；"08-25"条把 08-26 前后的第三个 bug 并了进来，已改为"08-25~26" |
| M365 捆绑 Copilot | 2024-10-31、109→159（+45%）/ 139→179（+29%）、270 万、6.99→9.99、2025-02-07 The Register、2025-10-27 起诉、2025-11-05/06 道歉、2026-07-29 CMA 25 英镑 | 全部一致 |
| Mata v. Avianca | 2023-02 / 04 / 05-04 / 05-25 / 06-22、5,000 美元三方连带、678 F. Supp. 3d 443、Park v. Kim 2,000 美元、2025-02 Morgan & Morgan、ABA 512 2024-07、2,149 件（截至 2026-10-05） | 全部一致 |
| 德勤澳大利亚 | 2025-07-04 237 页、2025-08-22/25、约 20 处、2025-10-03 修订版、10-05/06 退最后一期款、12-03 合伙人离职、约 7 周 / 约 6 周 | 一致；12-03 条调研稿标"后续"，页面标"响应"，属于标签归类，未改 |
| Replika | 2023-02-02 Garante、02-15 Vice、03-01 ABC、03-25 回退、03-30 公告、2025-04-10 罚 500 万欧元、约 1–2 周 / 约 7 周 | 一致；一句话定性写"六周后"，lag 写"约 7 周"，**两处都照搬调研稿原文**（调研稿内部就不一致），未擅改，列入待决 |

另外用脚本把新 27 个 panel 里的全部多位数字和日期，逐案拿到对应调研稿小节做子串核对：除 Grok"截至 2026-10 检索"中的"2026"外全部命中，而这一处对应调研稿"截至检索日"，T11a 检索日为 2026-10-07。

### 4. 红线与范围
- 没有新增事实：补的内容（第 2 条来源、Air Canada 2024-02-16 条目、落选候选、未取得原文清单）都出自三份调研稿或 T11a/b/c 报告。"微信侧"出自 T11b 调研稿（案例标题"被微信风控请下线"）。
- Gemini CLI：只有在描述媒体叙事时出现"媒体以'AI 删库'报道"，定性写的是"文件只是被移到了 C 盘根目录"，规律 16 写"agent 说删光了，其实没删"。
- Amazon Q：定性和时间线都写"随 v1.84.0 真实分发……仅因载荷里一个语法错误才没有执行"，引用 AWS 公告原话。
- `git status`：我只改了 `ai-failure-casebook.html`，并新增本报告。没有 commit。

## 与已有内容的关系
- 原 15 个 panel 与 HEAD 版逐字一致（脚本逐 panel 比对，无差异）。原十条规律的编号和论点没动，只在规律 2 加了一处括注。原 35 项检查清单的内容没动，原"上线前"组改名为"上线前 · 评测与核查"，并新增"上线前 · 默认值与授权""变更与对外沟通"两组。
- `index.html` 的工作区 diff 里还有**不属于 T12 的改动**：kicker 从"9 PAGES"改为"10 PAGES"、AI PM 组描述、新增"AI 报销审核"卡片（对应未跟踪文件 `ai-expense-review-prd.html`）。这些是接手前就存在的其他任务改动，我没有碰，审核时请和 T12 的 casebook 卡片改动分开看。
- `collab/BOARD.md` 的改动、`research/18-*` 与 `research/18-parts/` 来自审核者 / T11d，与本任务无关。

## 待决问题 / 未完成项
1. **单来源案例**：Anthropic（只有官方复盘）和豆包（只有 21 世纪经济报道综述）达不到"来源 2–4 条"。调研稿没有第二条可核实链接，按红线没有补。如需补齐，要由 T11b 的后续检索提供。旧案例 AI Overviews 也只有 1 条来源，但旧 panel 按任务单不改。
2. **审核意见里"能补原文更好"的几项未补**：Bing 官方博客《Updates to Chat》、Engadget（Meta 提示语）、Reuters（MyCity / Grok / Replika）、Mata 制裁命令原文、ABA 512 官方页。补这些需要新检索并引入调研稿之外的 URL，超出"只搬运"的范围，已在选例说明的"仍未取得原文"一条中列出。
3. **Replika"六周"与"约 7 周"**：调研稿的一句话定性和 lag 不一致（按日期算，2 月上旬 → 03-25 约 6–7 周）。页面保留原文，建议审核者定一个口径后两处统一。
4. **检查清单"编号顺延"**：页面清单原本就没有编号（无序列表），新增 29 项按生命周期并入对应分组，没有另加编号。29 项之间、以及和原 35 项之间没有发现实质重复，所以总数是 35 + 29 = 64。合并时有两处压缩：T11c 第 10 项删去了"监管约谈响应剧本"半句，T11a 第 6 项删去了"（连续数十轮情感诱导）"括注。
5. **深链交互改动**（摘要第 8 条）：从"滚到案例区顶部"改为"滚到当前面板"。代价是深链进来时看不到 tab 区，需要往上滚才能切换别的案例；好处是案例内容直接可见，pager 翻页后也不用再往下找。如果审核者更希望保留原行为，可以只回退 `select()` 里的一行和首次跳转的一行。
6. 豆包的"谁先发现"着色从内部色改成外部色，是为了和 38/42 口径一致（调研稿表格里用的是绿色，但正文计为外部）。如果审核者认为平台风控应算"非外部"，hero 应改为 37/42，表格读法注也要相应调整。

STATUS: DONE
