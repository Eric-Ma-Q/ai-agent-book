# T10 完成报告

执行者：Claude 子代理（2026-10-06）。没有检索外网。页面和题目里的事实都取自 `labs/mini-harness` 的代码（`harness/memory.py`、`harness/sessions.py`、`harness/loop.py`、`harness/cli.py`、`tests/test_s7_memory.py`）、README 的 S7 节和「设计取舍与已知局限」，以及 T08-ext 的报告和审核意见。

## 交付物
- `harness-engineering.html`：第 8 节改为七阶段，新增 S7 卡片 `#lab-s7`，第 4 节加互链到 S7 卡片，同步改了过期的数字。diff 为 +33 / −12 行（文件现 888 行）。
- `harness-exam.html`：新增 6 题（A25、B22、C15、E6、F12、F13），全部是新增行，没有改动已有题。diff 为 +56 / −0 行（文件现 1629 行）。
- `collab/reports/T10-s7-pages-exam.report.md`：本报告。

### harness-engineering.html 改动明细（改前 → 改后）
| 位置 | 改前 | 改后 |
|---|---|---|
| 目录第 08 项 | 动手实验：mini-harness 六阶段 | …七阶段 |
| §8 h2 | mini-harness 六阶段 | mini-harness 七阶段 |
| §8 一句话结论 | 约 1,400 行……六个核心机制……跑通 46 个测试 | 约 1,950 行……七个核心机制……跑通 67 个测试 |
| 8.1 运行命令 | `# 46 个测试（含判分器双闸门与只读绕过回归）`，共 3 条命令 | `# 67 个测试（…与 S7 记忆注入场景）`，并加一条 `python3 -m harness memory list` |
| 8.1 出处 | 2026-10-05 实跑 46 tests OK | 2026-10-06 实跑 67 tests OK |
| 8.2 小标题 | 六个阶段 | 七个阶段 |
| S1 卡片 | `Agent.run`（171 行） | `Agent.run`（loop.py 195 行，含 S7 的两个挂点） |
| S6 卡片之后 | 无 | **新增 S7 卡片 `#lab-s7`**（见下） |
| 8.3 启示第 1 条 | 六个阶段抄谁都有出处……判分抄 13 §4.2 | 七个阶段……另加"记忆层抄 11 §6.3 / §8.4" |
| 8.3 启示第 4 条 | 先跑 46 个测试……1,400 行的玩具 | 先跑 67 个测试……1,950 行的玩具 |
| §8 延伸阅读 | S1–S6 各阶段详解 | S1–S7 各阶段详解 |
| §4「对 harness 设计的启示」第 3 条（写入闸门） | 无 | 末尾加"动手实现见第 08 节 S7 记忆层卡片"，链接 `#lab-s7` |

S7 卡片的结构和 S1–S6 一样：`.stage`、`st-head` 里放编号、标题和"解决什么问题"，下面用 dl 分 dt / dd。卡片里有以下几块：
- **核心代码**：sessions.py 是真相源，memory.py 是派生缓存，loop.py 加了两个挂点，测试 20 个。
- **写入闸门：草稿区 → 正式区**：污点从哪几个通道进来、草稿和正式区各自的路径，以及"按 remember 那一刻的状态裁决"。这里也回答了"为什么不让模型直接写正式记忆"。
- **可重建：真相源 vs 派生态**：真相源是 `.harness/sessions/*.jsonl`；重建后逐字一致，因为 `created` 取会话记录里的原值；重建时闸门按当前配置裁决，代价是什么也写了。
- **脱敏与边界标记**：所有落盘点都脱敏，name 走白名单，注入时尖括号转全角，所以记忆内容关不掉边界标记。
- **开发中修掉的两个软链逃逸**：都写了对应的回归测试名。
- **已知绕过**：用页面原有但没用过的 `.st-ex` 高亮框。写了同会话 `bash cat` 和跨会话 `write_file → read_file` 两条，以及由弱到强的修法方向：文件级来源标签 → 污染会话禁写工作区 → 内容重合度比对 → 沙箱加出口 allowlist。
- **运行命令**：`memory list`、`memory rebuild`，以及 S7 测试的 discover 命令。
- **练习题** 3 道。

整个页面没有新增 CSS，没有引外部资源。

### 新题 id 列表
| id | 题型 | topic | level | 分值 | 考点 |
|---|---|---|---|---|---|
| A25 | judge | lab | understand | 1 | 闸门按 remember 那一刻的状态裁决（先记后读的那条仍算干净） |
| B22 | single | lab | understand | 2 | **必出①**：为什么先进草稿区，防的是什么 |
| C15 | multi | lab | **analyze** | 3 | **必出②**：真相源和派生态分别是什么；重建按当前闸门配置执行；逐字一致的原因；草稿会"复活" |
| E6 | code | lab | **analyze** | 4 | 简化记忆层代码诊断：路径穿越、缺闸门、缺脱敏、边界可伪造 |
| F12 | single | lab | **analyze** | 3 | **必出③**（案例八）：同会话 `bash cat` 为什么能绕过闸门 |
| F13 | multi | lab | create | 3 | **必出③**（案例八）：修法方向是文件级来源标签 / 污点追踪，并说明为什么不能靠正则或提示词 |

所有新题的 `src` 都指向 `ENG+'#lab-s7'`，多数还附了 `labs/mini-harness/README.md`。F12 和 F13 的 `group` 是 `case8`，案例背景（scenario）挂在 F12 上。

## 摘要
1. S7 卡片的内容以代码为准。我用 FakeModel 写了探针脚本，复现了三件事：
   - 同会话 `bash cat external/page.md` 后 remember，记忆写进了正式区 `feedback/p.md`。
   - 跨会话 `fetch_external → write_file notes.md`，换一个会话 `read_file notes.md → remember`，同样写进了正式区。
   - "先 remember、后 fetch、再 remember"时，前一条留在正式区，后一条进了 `_drafts/`。

   页面写的"两条都已实测复现"和 A25 的答案就是依据这次实跑。
2. 页面上 S6 时期的数字已经过期：46 个测试、约 1,400 行、loop.py 171 行。现在是 67 个测试、约 1,950 行（代码加 compact.md 实数 1,961 行）、loop.py 195 行，已经同步改掉。这几个数字都和 README 及实测一致。
3. 题库的统计（试卷结构表、合计题数和分值、topic 掌握度）都由 JS 从 `Q` 数组动态算出，页面上没有写死的题数，所以除了加题不用改别处。
4. 新题从代码里挑了几个容易误解的点做干扰项：重建是按"当时"配置还是"当前"配置（C15）、会话记录脱不脱敏（C15）、草稿区会不会被清空（C15）、只注入索引是不是错误设计（E6）、能不能靠给 bash 加正则堵住绕过（F13）。

## 方法与规模
- 外网检索 0 次。精读了任务单、PROTOCOL、T08-ext 的报告和审核意见、memory.py 和 sessions.py 全文、loop.py / cli.py / subagent.py 里 S7 的相关段落、test_s7_memory.py 的结构，还有 README 的快速开始、S7 节、局限节和附录 4。
- 改页面用的是 Python 精确字符串替换，每个锚点先断言只出现一次，避免误改。
- 耗时约 1 小时（估）。

## 自检结果
1. **全部测试**：在 `labs/mini-harness` 下跑 `python3 -m unittest discover tests`，结果是 `Ran 67 tests … OK`。在仓库根目录跑 `python3 -m unittest discover labs/mini-harness/tests` 也是 67 个，全部 OK。S7 单独跑（`discover -s tests -p 'test_s7_memory.py'`）20 个，OK。跑完后仓库里没有残留 `.harness/` 目录。卡片里写的 S7 测试命令也实跑确认过。注意：`python3 -m unittest tests.test_s7_memory` 这种写法在这里会报错，因为 tests 目录不是包，所以页面用的是 discover 写法。
2. **375px 横向滚动**：我另起了一个无头 Chrome 154（`--headless=new`，调试端口 9337，`--user-data-dir` 放在 scratchpad 的临时目录），通过 CDP 设成 375×800 的 mobile 视口，打开 `harness-engineering.html`：
   - `document.documentElement.scrollWidth === 375`，`body.scrollWidth === 375`。
   - pre 和表格容器以外，没有元素越出视口。
   - S7 卡片宽 343px，页面上的阶段卡片共 7 张。
   - 控制台没有报错。
   - 截图目检 S7 卡片排版正常，长的测试函数名能在行内断开。

   考试页在 375px 下的 scrollWidth 也是 375。用完后已经 kill 掉自己起的这个 Chrome 进程（pid 88005），9337 端口已关闭，临时 profile 已删除。用户常驻的各个服务都没碰。
3. **题库校验**：
   - **静态检查**：用 node 抽出 `Q`、`PARTS`、`TOPICS`、`LEVELS` 并执行。结果是 97 道题，id 没有重复，每个 part 的编号连续。所有题的必需字段都齐全（客观题要有 explain 和 src，开放题要有 rubric 和 reference）。topic 和 level 都合法，answer 下标都在范围内，`[[n]]` 引用都在范围内，单选的 answer 是数字，多选和代码题的 answer 是数组，每个 group 都有 scenario。
   - **改前 → 改后统计**：合计 91 题 / 278 分 → 97 题 / 294 分。各部分：A 24→25 题（35→36 分）、B 21→22 题（42→44 分）、C 14→15 题（42→45 分）、E 5→6 题（20→24 分）、F 11→13 题（33→39 分），D 和 G 不变。topic 计数：lab 4→10，memory 3 不变。
   - **点击级测试**：在无头 Chrome 里清空本地存储，选练习模式，点"开始答题"，对 6 道新题逐一勾选正确答案再点"核对本题"，6 题都显示"✓ 完全正确"，得分分别是 +1 / +2 / +3 / +4 / +3 / +3。解析里没有残留 `[[n]]`（已换成乱序后的字母），出处链接都是 `harness-engineering.html#lab-s7`，E6 的代码块正常渲染，案例八的背景能显示。首页试卷结构表的合计行是 97 / 294。
4. **改动范围**：`git status` 显示我只改了 `harness-engineering.html` 和 `harness-exam.html`，另外新增了本报告。`collab/BOARD.md` 在我开工前就已经是修改状态（审核者的改动），我没碰。没有 commit，没有改 labs 代码。

PROTOCOL 第 5 节里关于出处 URL 抽查、争议正反两面这几项不适用：本任务没有新增外部事实，S7 卡片里的取舍（rebuild 按当前策略）沿用 README 的正方 / 反方写法。

## 与已有内容的关系
- S7 卡片是 README「S7 记忆层」和「设计取舍与已知局限」两节的压缩版，链回 11 §6.3 / §8.4 和 10 §4.3（CaMeL）。这几个章节号沿用 README 的引用，本次没有重新 grep 分册原文。
- §4.2 / §4.3 讲的是"写入闸门"和"防御六层"的原理，S7 卡片是它们的动手实现；两边通过 §4 启示的链接和 S7 卡片的出处互相连起来。S7 卡片里"禁止给 bash 加正则"的论据，和 §3.3 及 S5 卡片里"形态清单追不完"的说法一致。
- 题库原有的 memory 题（A21、B19、C14）考的是分册原理，新题考的都是 lab 实现，不重复。F12 和 F13 沿用 F10 / F11（案例七）"诊断 → 开方"的配对写法。

## 待决问题 / 未完成项
- **index.html 的题数已过期**：第 175 行还写着"91 道题检验学习成果"，现在实际是 97 道。按约束我不能改 index.html，建议审核者或后续任务把它改成 97。
- **假设 1**：任务单要求在第 4 节加一句互链。我把这句加在了「对 harness 设计的启示」的写入闸门那条末尾，没有放进延伸阅读。
- **假设 2**：页面上"约 1,950 行"沿用 README 的口径。代码加 compact.md 的实数是 1,961 行，测试不计在内。
- **假设 3**：S1 卡片原来写"Agent.run（171 行）"，171 实际是 loop.py 的文件行数。S7 加了挂点后 loop.py 变成 195 行，所以我改成"loop.py 195 行，含 S7 的两个挂点"。这算 S7 带来的连带修正，不在任务单明列之内。
- 8.3 里"通过了初版全部 34 个测试"是历史事实，没有改。
- 新题的 level 是我按题意自己判定的：有 3 道 analyze 和 1 道 create，满足"至少 1 道 analyze 及以上"的要求。

STATUS: DONE
