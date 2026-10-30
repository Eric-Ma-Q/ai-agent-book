# F02 完成报告 · T08-r1 与 T09a 审核遗留的 6 个小问题

## 交付物

- `research/09-tools-mcp-skills.md` — §八 E 示例：改写后 schema 补 `response_format`/`page_token` 两参数，返回体说明与对照表同步 — diff +13/-3 行
- `research/10-agent-security-sandbox.md` — §3.1 pi 行删除"（如 Tenki）"，改为官方 containerization.md 口径，出处补 URL 与实抓日期 — diff 1 行
- `research/11-memory-systems.md` — §2.1 "中文综述"改为"英文综述"并注明作者单位 — diff 1 行
- `research/08-harness-teardown-comparison.md` — pi 行括注补全 4 种外置隔离；表后"提请审核者裁定"注改为"已与 10 §3.1 统一"；删除参考资料 43 并重编号，正文编号引用同步；可信度节注明降源 — diff +12/-10 行
- `labs/mini-harness/harness/subagent.py` — git 只读子命令拒绝 `--output`/`--output=`（新增 `_GIT_WRITE_FLAGS` + 参数级检查分支） — 162 行
- `labs/mini-harness/tests/test_s5_subagent.py` — 新增回归测试 `test_git_readonly_subcommand_output_flag_blocked`（4 条命令变体断言被拒 + 断言工作区无文件被创建 + 不带旗标仍放行的负对照） — 149 行
- `labs/mini-harness/README.md` — S5 三层闸清单与练习题同步（新增第 3 题）、Bug 2 修法清单同步、附录 1 测试快照更新为 47、附录 3 追加"修复后（2026-10-05 审核者实跑）"小节 — diff +35/-8 行

## 逐条回应（改前 → 改后）

**1. research/09 第八节 E 示例：`response_format`/`page_token` 缺席 schema**
- 改前：返回体写"默认 concise 档，detailed 档经 `response_format` 参数取"、`how_to` 写"pass this cursor as page_token"，但改写后 schema 只有 `query`/`channel`/`time_range` 三个参数。
- 改后：schema 补入 `response_format`（`enum: ["concise","detailed"]`，描述写明两档内容与"Defaults to concise"）和 `page_token`（string，描述写明"取自上一页 `next_page.cursor`，首轮省略"）；返回体标题行同步写明翻页方法；对照表第 7 行注明"（`response_format` 参数，enum 两档，默认 concise）"、第 8 行注明"（请求侧对应 `page_token` 参数，首轮省略）"。已用脚本抽取该 JSON 块 `json.loads` 验证合法、5 个参数键齐全——定义、返回体、说明三者一致。

**2. research/10 §3.1 pi 行"（如 Tenki）"**
- 改前：`官方建议 Docker/VM/远程沙箱(如 Tenki)承载不可信仓库`，出处只有 npm 包页与 pi-1-0 博文；08 §3.5 表后挂着"提请审核者裁定"的注。
- 改后：改为"官方 containerization.md 给出 Docker、Docker Sandboxes、Gondolin micro-VM、NVIDIA OpenShell 四种外置隔离承载不可信仓库"，出处补 `https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/containerization.md`（2026-10 实抓）。该文档标题 "Run Pi in an isolated environment"，四种隔离方式与 OpenShell 的 NVIDIA 归属均从原文核实。08 表后注改为"已与 10 §3.1 统一"并附同一 URL；08 表内 pi 行括注同步补全为四种（任务单虽只要求改注，但"统一"需要两行口径一致，见待决问题假设 2）。

**3. research/11 §2.1 把英文论文称作"中文综述"**
- 改前："更早的中文综述《A Survey on the Memory Mechanism of Large Language Model based Agents》(2024-04,39 页)"。
- 改后："更早的英文综述《A Survey on the Memory Mechanism of Large Language Model based Agents》(2024-04,39 页;作者来自中国人民大学高瓴人工智能学院与华为诺亚方舟实验室)"。论文语言与作者单位经 arXiv abs 页与 HTML 全文首页核实（Gaoling School of Artificial Intelligence, Renmin University of China；Huawei Noah's Ark Lab）。

**4. research/08 参考资料 43（Niharika）原文疑下线**
- 改前：参考资料 43 挂"仅站点级：该文无法定位、原文可能已下线"；可信度节写"BigGo/Niharika 的 auto-compact 阈值"。
- 改后：双查确认无法换源——2026-10 实抓 niharikabalachandra.com，现存 5 篇文章均与 compaction 无关；Wayback Machine CDX 索引该域名只有 2018-2019 年的 WordPress 主页与静态资源，无任何文章存档。按任务单**删除该条**，44–48 重编号为 43–47；正文仅有的两处编号引用（原"参考资料 47/48"，即 Gemini snippets.ts 与 Codex apply_patch_spec.rs）grep 全文确认后同步改为 46/47；可信度节改为"BigGo 的 auto-compact 阈值"，并加 F02 注说明删源原因与置信度下调。正文其余句子无单独依赖 Niharika 的引用（grep 全文确认）。

**5. subagent.py：`git log --output=x` 绕过**
- 改前：`_WRITE_FLAGS` 按命令首词查表（find/sort/diff），git 无旗标黑名单，`git log/show/diff --output[=文件]` 落在参数级检查之外，只读子代理可写出文件。
- 改后：新增 `_GIT_WRITE_FLAGS = {"--output"}`，`_readonly_violation` 对 `git <只读子命令>` 的参数逐 token 检查（同时覆盖 `--output` 与 `--output=文件` 两种形态）；模块 docstring 的示例清单补 `git log --output`。回归测试 `test_git_readonly_subcommand_output_flag_blocked` 覆盖 `git log --output=o6`、`git log --output=o6 --oneline`、`git show --output=o7 HEAD`、`git diff --output=o8` 四条（断言"只读子代理拒绝"且工作区 `iterdir()` 为空），并断言不带写旗标的 `git log --oneline` 仍放行。README S5 三层闸清单与"审核发现的两个真 bug"修法清单同步补 git `--output/--output=`，S5 练习题新增第 3 题："还能找到哪些'只读命令的写旗标'？这说明了什么？"（附提示：形态匹配清单永远追不完，参数级检查只是第二档）。

**6. README 附录 3 缺修复后真模型结果**
- 改前：附录 3 只有"修复前"表，结尾写"修复后的真模型复跑由审核者在 r1 验收时执行"。
- 改后：在复跑命令块之后追加"#### 修复后（2026-10-05 审核者实跑）"小节，数据自任务单**逐字照抄**（脚本比对逐行一致，未改任何数字），big-pickle 与 mimo-v2.6-flash-free 均 5/5、T3"行数 9，正确"；前文"由审核者执行"一句改为指向该小节；小节末补一句教学点：修复前后差的 1 分自始至终不是模型能力问题。

## 摘要

1. 09 分册 E 示例现在"定义—返回体—说明"三者一致：schema 补入 `response_format`（enum 两档、默认 concise）与 `page_token`（opaque cursor、首轮省略），对照表第 7/8 行注明，JSON 块经程序化校验合法。
2. pi 的外置沙箱口径两分册统一为官方 containerization.md 的四种方案：Plain Docker、Docker Sandboxes、Gondolin micro-VM、NVIDIA OpenShell（"NVIDIA OpenShell"的提法与归属从文档原文核实），"（如 Tenki）"与"提请审核者裁定"注全部清除。
3. arXiv:2404.13501 确为英文综述，作者来自人大高瓴人工智能学院与华为诺亚方舟实验室——"中文综述"是 T04 起就存在的张冠李戴。
4. Niharika 那篇 compaction 文章经站点实抓 + Wayback CDX 双重确认不可回溯，按任务单删条重编号（44–48 → 43–47），正文两处编号引用同步，auto-compact 阈值仅剩 BigGo 一源并明示置信度下调。
5. `git log/show/diff --output[=文件]` 绕过已在参数级检查层封死；这是"参数级检查也是打地鼠"的又一实证，与 README 的三档论述（首词白名单 → 参数级检查 → 进程级沙箱）形成闭环，并转化为 S5 练习题。
6. 附录 3 补齐"修复后 5/5"真模型数据：修复前后唯一变量是判分器——与 13 分册"判分器漏洞"论点互为印证。
7. 测试 46 → 47（新增 1 条回归），全量通过；README 附录 1 快照同步为真实复跑结果。

## 方法与规模

- 检索/抓取共 6 次：WebSearch 1 次（定位 pi containerization 文档）；WebFetch 5 次（containerization.md 原文、arXiv abs 页、arXiv HTML 全文首页、niharikabalachandra.com、Wayback CDX 索引）。全部主智能体串行完成，未用子智能体，未触发限流。
- 精读来源 4 个：pi containerization.md（官方）、arXiv:2404.13501（abs+HTML 两页，官方-论文）、Niharika 站点首页（核伪）、Wayback CDX 列表（核伪）。
- 中英比例：英文 4 / 中文 0——本次为勘误型事实核查，全部一手来源本身是英文。
- 耗时估计：约 40 分钟（含读协议/任务单/审核意见与 5 次核验）。

## 自检结果

- 任务单"清单"6 条逐条有改前→改后回应（见上节）；无"必须回答的问题"栏目。
- 关键事实标注：containerization.md 内容 [官方,2026-10 实抓,URL]；arXiv 语言与作者单位 [官方-论文,2024-04,arXiv:2404.13501]；Niharika 下线结论基于 2026-10 实抓两源，已在 08 可信度节 F02 注中写明方法。无编造 URL/数字/引语；唯一推断性表述（README 修复后小节的"教学点"一句）不涉事实引用。
- URL 抽查 5 个，全部可访问且内容与引用一致：① containerization.md raw URL（四种隔离方式与 OpenShell 归属一致）；② arxiv.org/abs/2404.13501（英文、标题、日期一致）；③ arxiv.org/html/2404.13501v1（两单位署名一致）；④ niharikabalachandra.com（现存 5 篇无 compaction 文，与删除决定一致）；⑤ Wayback CDX（无存档，与删除决定一致）。
- `git status` 自查：本任务只改了任务单允许的 7 个文件（research/08/09/10/11 + labs/mini-harness 三件）+ 本报告。`collab/BOARD.md` 的未提交改动与未跟踪的 `harness-engineering.html` 非本任务所改（并行任务 T09b 与审核者的改动），未触碰任何 html。
- 编号引用同步核查：grep "参考资料 [0-9]" 全文仅剩两处（snippets.ts、apply_patch_spec.rs），均已指向重编号后的正确条目；grep "Niharika" 在 research/ 与 labs/ 仅剩 08 的 F02 删源注（有意保留的溯源记录）；grep "Tenki" 仅剩同一注里的"未见 Tenki"。
- 代码类：能运行，真实输出见下；未写任何密钥或密钥位置（真模型数据表为审核者提供的结果记录，不含密钥）。

`python3 -m unittest discover labs/mini-harness/tests` 真实输出（2026-10-05，F02 改动后）：

```text
...............................................
----------------------------------------------------------------------
Ran 47 tests in 0.721s

OK
```

新增回归测试单独运行：

```text
$ python3 -m unittest discover labs/mini-harness/tests -k git_readonly -v
test_git_readonly_subcommand_output_flag_blocked (test_s5_subagent.TestReadonlyParameterChecks.test_git_readonly_subcommand_output_flag_blocked) ... ok

----------------------------------------------------------------------
Ran 1 test in 0.015s

OK
```

## 与已有内容的关系

- research/08 §3.5 表 pi 行 ↔ research/10 §3.1 pi 行：本任务的目标即消除两处口径冲突；改后两行均为官方四种方案（08 行详列四种，10 行详列四种并带 URL），已 grep 原文确认。
- research/09 §八 E 示例 ↔ 同节对照表第 7/8 行：改前 schema 与返回体/对照表脱节（T09a 审核意见 1），改后逐行对应，无新增冲突。
- labs README 附录 3"修复前"表 ↔ T08 审核意见中的真模型表：原表数字未动（逐字保留），仅追加"修复后"小节，两表并存构成"判分器修复前后"对照。
- labs README S5"怎么实现"、Bug 2"修法"、subagent.py docstring 三处旗标清单：改后三处一致（都含 git `--output/--output=`），grep 确认无第四处同类清单遗漏。
- 与 13 分册的关系（未改动）：附录 3 新教学点与 13 §4.2"判分器漏洞：错的不是模型，是裁判"呼应，README 原有链接已覆盖，无需新增引用。

## 待决问题 / 未完成项

- **假设 1（四种 vs 三种）**：任务单写"改为与 pi 官方 containerization.md 一致（Docker、Gondolin micro-VM、NVIDIA OpenShell）"，但官方文档实际列出四种（还有 Docker Sandboxes）。为与"以官方文档为准"的原则一致，改后文本写了全部四种；若审核者希望严格压到任务单点名的三项，收窄即可，不影响其他改动。
- **假设 2（08 表内 pi 行同步）**：任务单对 research/08 只明确要求改表后注；但注改成"已与 10 §3.1 统一"后，表内 pi 行若仍只写"点名 Docker 与 Gondolin micro-VM"则名不副实，故同步补全括注（未改来源列口径）。
- **未重验项**：research/10 出处里的 npm 包名 `@earendil-works/pi-coding-agent` 与 earendil.com 博文沿用既有文本未重验（非本任务清单项，T09a 审核已核过 npm 页）；arXiv 2404.13501 的"39 页"沿用原文（T04 口径，未重新数页）。
- **非本任务的仓库状态**：`collab/BOARD.md` 有未提交改动、仓库根有未跟踪的 `harness-engineering.html`，属并行任务/审核者操作，本任务未触碰、也未据其做任何判断。
- **后续建议**：若后续再有 lab 类任务，可考虑把"_WRITE_FLAGS + _GIT_WRITE_FLAGS"的清单挪进 README 附录做成对照表，方便读者按"写旗标也是攻击面"主题检索（本次未做，避免超范围改 README 结构）。

STATUS: DONE
