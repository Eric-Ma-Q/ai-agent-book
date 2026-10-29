# T09b 完成报告 · 学习页整合 + 题库扩充

**完成日期**：2026-10-05　**执行者**：ZCode（主智能体自做，未用子智能体）

## 交付物

- `harness-engineering.html` — 新学习页「Harness 工程：从拆解到动手」，8 节长文，单文件自包含 — 92.7KB（≤250KB 达标），866 行
- `harness-exam.html` — 题库 58 → 91 题（新增 33 道），TOPICS 新增 8 个专题映射，出题依据文案同步 — 净增约 420 行
- `index.html` — 「Harness 深读系列」组新增第 3 张卡（flow 卡之后）；kicker 8→9 PAGES；考试卡"58 道题"→"91 道题" — 3 处小改
- `collab/reports/T09b-learning-pages.report.md` — 本报告

## 新页面 8 节 × 分册章节对照

| 节 | 锚点 | 使用的分册章节 |
|---|---|---|
| 01 横评拆解 | `#s-teardown` | 08 §3.1/§3.2/§3.3/§3.4（主循环/工具/上下文/子代理）、§3.9+§4.2（乘数证据链）、§4.3 第 1/4/5 条（T01-r1 形式语法约束重点呈现：apply_patch Lark grammar + Gemini 压缩提示词）、§4.4（最佳组合清单全表） |
| 02 工具层 | `#s-tools` | 09 §八 A–D（审查清单 14 条归并为 11 行表）、§3.1（六原语对照表含 2026-07-28 弃用 sampling/roots/DCR）、§八 E（坏工具→好工具完整前后对照 + 逐条依据表）、§2.2/§四/§六/§7（token 账本、Tool Search、代码即工具、CLI vs MCP 结论，浓缩为一段） |
| 03 安全 | `#s-security` | 10 §3.1（权限档位与沙箱对比表，8 家全行照搬）、§3.5（hooks 与策略即代码）、§6.1/§6.3（审批疲劳数据与排序结论）、§2.1（致命三要素）、§3.4/§四（失效模式与防御组合）；三档表用 labs `find -delete` 案例举例 |
| 04 记忆 | `#s-memory` | 11 §8.1（文件型五条证据链）、§3.3（正反方与分界线判断）、§四（写入策略表 + 三个工程事实）、§五（memory rot 一句）、§六（投毒案例链 + 防御六层） |
| 05 多智能体 | `#s-multiagent` | 12 §六（受控实验盘点表 5 行）、§九（决策表浓缩为三个前置判断 + 模式选择）、§3.1/§3.2（三段式契约、委派四件套、传话失真三机制）、§5.2/§十（MAST 三大类表 + 五种失败归纳） |
| 06 评测 | `#s-evals` | 13 §三（四个坑）、§4.2（四档判分器表）、§4.4（pass@k/pass^k）、§八（第一周最小 eval 表）、§5（judge 一句定调）；labs 判分器 bug 作案例课（假模型 5/5 掩盖、真模型暴露、期望值现算 + 两道闸门） |
| 07 成本与可观测性 | `#s-economics` | 14 §2.3（T09a 重算后成本表：cache write 0.15M、合计 ≈$1.72、无缓存约 6.2 倍/Opus 8.8 倍）、§3.1（缓存价格表 5 厂商精简版）、§3.2（10 条缓存友好规则精要，含"压缩断前缀算总账"反直觉提醒）、§6.3/§6.4（trace 最小字段表归并为 6 组 + MAST 日志维度）、§七（预算四层 + 熔断降级告警） |
| 08 动手实验 | `#s-labs` | labs/mini-harness/README.md 全部：运行命令、S1–S6 六张卡片（解决什么问题/核心代码文件/练习题）、两个真 bug 交叉引用 §3/§6、设计取舍两条 |

每节固定结构：一句话结论（`.concl`）→ 核心内容（表格优先，全页 17 张表）→ 对 harness 设计的启示（`.imp`，8/8 节齐全）→ 延伸阅读（链到分册具体章节）。技术要求达成：单文件自包含（无任何外部脚本/字体/CSS）；复用 explained 页的 CSS 变量与组件写法 + 原样内置 theme-patch/home-patch（`harness-theme` key、右下主题钮、左下返回钮、`html.dark` 变量覆盖，墨色反转组件仅 `.finale` 且已按约定处理）；顶部目录 8 条可跳转；宽表格全部包在 `.tblwrap`（overflow-x:auto）里。

## 新增题目清单（33 道，接原编号）

**A 概念快答（A18–A24，7 道）**
| id | topic | level | 考点 |
|---|---|---|---|
| A18 | teardown | remember | 消融实验：上下文管理在 32k 窗口值 35.7 分 |
| A19 | mcp | remember | MCP 2026-07-28 弃用 sampling 与 roots（SEP-2577）【必出】 |
| A20 | security | understand | 判断：人工审批拦截率高于 Auto Mode——反了（13.6% vs 89%） |
| A21 | memory | understand | 判断：热路径随手写是推荐策略——错，共识是后台批处理 |
| A22 | economics | remember | 重算成本示例：合计 ≈$1.72、无缓存约 6.2 倍 |
| A23 | multiagent | understand | 判断：多 agent 提升智能不费 token——错（4×/15×、买并行广度） |
| A24 | evals | understand | 判断：outcome 优于 path、轨迹指标次要补上——对 |

**B 单选（B16–B21，6 道）**：B16 teardown/analyze（二维正交权限抄 Codex）；B17 mcp/understand（tools=model-controlled）；B18 security/analyze（挡 find -delete 的最小正确升级=参数级检查）；B19 memory/understand（向量/图谱的启用分界）；B20 evals/analyze（假模型 5/5 为何没暴露 bug：脚本与判分器同源）；B21 multiagent/understand（等预算实验结论）。

**C 多选（C9–C14，6 道）**：C9 security/analyze（四条白名单绕过命令列举）【必出 find -delete】；C10 mcp/understand（弃用后的迁移路径，含 roots 非访问控制的辨析）【必出】；C11 economics/apply（哪些做法破坏前缀缓存，含压缩断前缀项）【必出】；C12 multiagent/understand（委派四件套）；C13 lab/understand（两道判分器闸门各防什么）【必出】；C14 memory/understand（记忆投毒防御做法）。

**D 排序连线（D6–D9，4 道）**：D6 evals/understand（最小 eval 建设顺序排序）；D7 security/remember（拦截三档从弱到强排序）；D8 teardown/apply（机制×harness 连线）；D9 multiagent/apply（失败模式×典型案例连线）。

**E 代码诊断（E3–E5，3 道）**：E3 mcp/analyze（坏工具定义找违背清单项，放 E 部分）【必出】；E4 lab/analyze（判分器写死期望值+脚本同源的代码诊断）；E5 security/analyze（只读检查代码的诊断）。

**F 案例分析（F8–F11，4 道，两组）**：F8/F9 security evaluate/apply（案例六·全开权限团队：诊断=关着的沙箱+宽权限最危险；整改=沙箱默认开+弹窗预算化+规则即代码）；F10/F11 lab analyze/create（案例七·全绿判分器：根因=期望值写死且与脚本同源；加固=现算+双闸门+环境重置+版本化）。

**G 开放论述（G5–G7，3 道）**：G5 teardown/create 12 分（设计最小编码 harness，六部分+三个主动放弃）；G6 security/evaluate 10 分（审批 vs 沙箱之辩的数据论证）；G7 economics/analyze 8 分（向非技术同事解释 $1.72、缓存命中率、压缩悖论）。

**达标核对**：总数 33 ≥30；topic 计数 teardown 4 / mcp 4 / security 8 / memory 3 / multiagent 4 / evals 3 / economics 3 / lab 4（全部 ≥3）；7 个 part 全有新题；level 分布 remember 4 / understand 12 / apply 4 / analyze 9 / evaluate 2 / create 2，analyze+evaluate+create=13 ≥10；每题 src 指向 `harness-engineering.html#锚点`（33 题的锚点全部经脚本验证存在于新页）或分册/README 文件（存在性已验证）；未改动任何已有题目；考试页统计（试卷结构表、总分 278、题数 91、答题卡分组）为动态计算自动更新，静态同步处为"出题依据"一段。

## 口径红线逐条自查

1. **MAST 42/37/21**：页面 §5.3 表格写"约 42%/约 37%/约 21%"并逐格标 `[二手]`，正文注明"比例数字经二手转述"；考试 D9 解析同样带"二手转述标约"字样。未出精确数字的题（D9 考的是模式×案例连线，非比例）。✓
2. **"辩论趋同于多数派错误"**：页面与题目均未出现该表述，辩论只在 12 分册延伸阅读路径里间接存在。✓
3. **感知延迟两数字（约 4 秒、流式 7 倍）**：页面与题目均未使用；§7 只用了官方一手 DeepSeek TTFT 13s→500ms。✓
4. **OpenAI 弃用 SWE-bench Verified**：§6.1 只写标题级口径（"污染日重、误测前沿编码进展"、2026-02-23、不再以此报告成绩），无审计细节。✓
5. **14 §2.3 重算数字**：§7.1 用 cache write 0.15M、合计 ≈$1.72、无缓存 ≈$10.64 约 6.2 倍（Opus 8.8 倍标【推断】），与 T09a 审核者复算一致。✓
6. **pi 沙箱建议**：§3.1 表写"官方文档点名 Docker、Gondolin micro-VM、NVIDIA OpenShell 等外置隔离"，未出现 Tenki。✓
7. **09 E 示例 schema 含 response_format/page_token**：读取 research/09 当前版本（T09a/F02 修订后已含两参数），页面改写后 schema 原样包含 `response_format`（enum concise/detailed，默认 concise）与 `page_token`（string，取上一页 `next_page.cursor`）；E3 题解析同样点名两参数。✓
8. **T01-r1 形式语法约束**：§1.3 独立小节呈现 apply_patch Lark grammar + Gemini 压缩提示词，标 T01-r1 逐字核对出处。✓
9. **T02 审核两素材**：六原语对照表（§2.2）与坏工具→好工具（§2.3）均落地。✓
10. **T03 审核分工**（09 讲协议演进、10 讲安全）：页面 §2.2 安全只留一句"MCP 内容=不可信输入"并指向 §3；MCP 安全事件展开全部在 §3。✓
11. **T07 审核提醒**（压缩断前缀进学习页）：§7.3 第 2 条以加粗反直觉提醒呈现，C11 亦考。✓
12. **T04/T05/T06 审核遗留**（09 §3.5 收缩、ZCode 物证、Letta 转向、探测类）均已在分册层面由 T09a 处理，页面直接引用现行版本。✓

## 自查方式与结果

**方法**：本地 `python3 -m http.server 8977` + 系统 Chrome（puppeteer-core，复用本机既有环境），三个页面全部真实打开并交互；`node --check` 校验考试页主脚本语法；Node VM 实例化题库数据跑不变量校验；375px 视口全元素 `right>docW` 溢出扫描。注：本环境 visual-judge 子智能体不可启动（既往会话已验证 provider-not-found），按记忆中的绕法降级为自行截图目检。

**结果**：
- **渲染**：新页 8 sections/8 目录链接/17 表/6 实验卡/对照双栏 2 列，themeFab+homeFab 注入成功；日/夜双主题截图目检通过（夜间变量覆盖正确、无浅底浅字）。索引页 9 张卡、新卡位于第 3 位（flow 之后）、kicker "9 PAGES"。考试页试卷结构表 8 行、合计"91 题 278 分"，答题卡按 A–G 七组正确分组。
- **目录跳转**：点目录第 6 条平滑滚动后 `#s-evals` 落在视口顶部（settled=true）。
- **判分**：对 14 个新题直接调用页面 `grade()` 全部符合预期（填空按空计分、单选对/错、多选全对 3/3·少选 1.5/3·错选 0、代码多选 4/4、排序 4/4、连线 4/4、开放题自评 12/12）；UI 层练习模式点选 B16→"核对本题"得到 `result-ok` 锁定样式。
- **控制台**：三页面 pageerror=0、requestfailed=0；唯一一条 console.error 是 `/favicon.ico` 404（所有页面共有的既有现象，非本次引入，与既有 5 页一致）。
- **手机 375px**：初查发现新页横向滚动（scrollWidth 641>375，根因：`.cite` 的 `white-space:nowrap` 与超长行内 code 撑破段落）——已修复（cite 允许换行、code 加 `overflow-wrap:anywhere`），复查 scrollWidth=375=clientWidth，无横向滚动；考试页与索引页 375px 本就无横向滚动。宽表格在新页全部收在 `.tblwrap` 容器内滚动。
- **git status**：本会话改动仅 `harness-engineering.html`（新）、`harness-exam.html`、`index.html` + 本报告；status 里 research/08–11、labs/、collab/BOARD.md、F02 报告等改动为并行会话（F02 小勘误任务等）所为，未触碰。

## 与已有内容的关系

- **重复**：新页 §1.2/§2.2 等处对 explained 页已讲过的工具设计原则只做增量引用不复述（遵循 09 分册的对象界定）；§6 评测与 13 分册、§7 与 14 分册均为压缩呈现，深链回分册。以上交叉引用均已 grep 原文确认（如 index 卡片原句"58 道题检验学习成果"、考试页"出题依据"原句、TOPICS 原键表）。
- **补充**：explained/flow/DSH 三页均未覆盖 08–14 分册内容，本页是它们在"深读系列"里的延续；考试页此前的 10 个 topic 也完全不含新分册内容，33 道新题是纯增量。
- **冲突**：无。一处口径对齐说明——新页 §3.1 权限表以 10 分册 §3.1（T03-r1 修正后）为基准（Cursor 行=Landlock+seccomp、pi 行=Docker/Gondolin/NVIDIA OpenShell），与 08 分册 §3.5（T09a 对齐后）同口径；index 考试卡的"58 道题"改为"91 道题"属于任务"统计同步更新"授权范围内的必要修正（卡片本身未删未移序）。

## 待决问题 / 未完成项

1. **F02 并行编辑 research/09**：按任务约束未改 research/；页面 schema 以读取时点的当前版本为准（已含 response_format/page_token，满足红线）。若 F02 后续再改示例细节，页面 §2.3 需要一次对照同步（建议审核者验收时确认）。
2. **favicon 404**：全站既有现象（所有页面都无 favicon 文件），本次未处理——不在交付物清单内，如需统一可由审核者另派任务。
3. **外部 URL 抽查口径**：本任务交付物未新增任何外部 URL（所有事实的出处标注沿自分册，URL 留在分册内；页面/题目的链接全部为本仓库相对路径 + 页内锚点，33 题锚点与文件链接已 100% 程序化验证）。分册自身的外部 URL 抽查由各自任务（T01–T07、T09a）完成。
4. **第 8 节练习题的时效性**：labs 若后续返工改动文件名/行数，§8 卡片中的文件名与测试名需同步（当前与 README 逐字一致）。
5. **字数口径**：本任务为页面制作类，无"调研日期引用块/字数下限"要求；新页中文正文估算约 9,000 字（不含代码/表格/URL），供审核者参考。

STATUS: DONE
