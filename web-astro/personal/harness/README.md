# Harness 学习归档

旧项目 `~/project/harness` 于 2026-10-18 迁入阅读器的 dev 扩展（需求 006），以只读归档方式随 `astro dev` 提供：

- 迁移源：`~/project/harness`，提交 `4c1cbf2`，`git status` 干净；
- 迁移范围：`git ls-files` 的 182 个文件，合计 6,273,780 字节；2026-10-19 新增《Harness 上岗》与《Anthropic 工作流程转变》，2026-10-20 新增《AI 产品经理 · 真实面经题库》，2026-10-21 新增《Claude Code 产品设计》与配套调研分册，2026-10-27 新增《任务队列：Agent 的第二条时间线》，2026-10-29 新增《前端部署工程师（FDE）就业指南》，同日新增《Claude Code 源码拆解》多页专题（11 页 + 1 份共享样式），2026-11-02 新增《Super-agent 设计探索》，2026-11-03 追加同系列的《Super-agent 结构图》后，清单为 204 个文件 / 7,475,201 字节；同日先新增 `labs/superagent-setup`（19 个文件，223 个文件 / 7,546,233 字节），随后按需求 044 替换为 `labs/superagent-flow`（22 个文件），清单为 226 个文件 / 7,570,659 字节；`STATS.pages` 为 24。
- 迁移清单：[`manifest.json`](manifest.json)（逐文件来源、去向、类别、URL、字节数、SHA-256）；
- 清理：校验与确认后，2026-10-18 停止 8742 预览进程（PID 16837）并删除 `~/project/harness`；删除前在 `/tmp/harness-20261018.bundle` 留了一份含完整历史的 3.5 MB bundle，验收结束前可 `git clone` 恢复；
- 目录数据：[`catalog.mjs`](catalog.mjs)；资料库：[`library.json`](library.json)（由清单生成）。

## 目录映射

| 内容 | 归档位置 | 访问方式 |
|---|---|---|
| 24 个内容页 + `index.html`（含 `cc-source-teardown/` 多页专题） | `archive/*.html`、`archive/cc-source-teardown/` | `/harness/site/<name>.html` |
| 调研分册 19 份 | `archive/research/` | `/harness/site/research/...` |
| 两篇长文 Markdown | `archive/*.md` | `/harness/site/...md` |
| 实验 60 个文件 | `archive/labs/` | `/harness/site/labs/...` |
| 专题与规范 21 份 | `archive/docs/` | `/harness/site/docs/...` |
| 协作存档 71 份 | `archive/collab/` | `/harness/site/collab/...` |
| 构建源 8 个 | `archive/hooks-33/`、`archive/_deck/` | `/harness/site/...` |
| 产物 2 个 | `archive/harness-tech-share-2026-10.pptx`、`.pdf` | `/harness/site/...` |
| 旧项目元文件 4 个 | `meta/{agents-md,claude-md,gitignore,zcodeignore}.txt` | 不对外提供 |

原目录结构保留，旧页面内部的相对链接不需要改写。唯一的例外：`labs/selfloop/.gitignore` 改存为 `archive/labs/selfloop/gitignore.txt`，避免归档里出现点文件。不迁移的缓存与运行态见 `manifest.json` 的 `excluded`：`.git/`、`.playwright-mcp/`、`__pycache__/`、`*.pyc`、`labs/selfloop/.selfloop/`、`_deck/pdfout/`、`.DS_Store`。跑实验会重新生成 `__pycache__/` 与 `.selfloop/`，它们被本目录的 `.gitignore` 排除，`verify.mjs` 扫描时也会跳过，不算清单缺项。

## 只读边界

- `archive/` 是原文件副本，页面默认只读；阅读器运行时只在响应里注入 `nav.js` 浮层、全站随页问答模块，以及两个考试页的 `exam-favorites.js`、`exam-progress.js`，不改磁盘文件。
- 8 个旧页面自带的 `#homeFab`「返回页面总览」会在浮层挂载成功后隐藏，避免与「Harness 目录」形成两个返回入口；`nav.js` 加载失败时旧按钮保持可见，原页面不受影响。
- `nav.js` 的第一个链接可用 `data-home-href` 改写（`none` 表示不显示），并支持 `data-home-label/-short/-icon`、`data-reader-label`；书稿考试 A/B 卷用它返回「结业考试」，归档页不传这些属性，输出与原来一致。
- 内容修订：需求 015 于 2026-10-19 修订了 `archive/ai-pm-resume.html`（七步结构、完整简历 Before/After、投递闭环、打印与可访问性）；需求 025 于 2026-10-26 做 2026-10 数据校准与面试考点补齐（拉勾破产、内推/猎头、上下文工程、评测颗粒度、PDF+DOCX、原型面试、MCP/FDE）；需求 026 于 2026-10-26 把 `archive/ai-expense-review-prd.html` 升到 v1.1：凭证底座改为结构化电子凭证优先、数电票红冲替代作废、状态机与提交闸门对齐、补建议采纳率与盲从样本、评测颗粒度、间接注入、durable execution；需求 027 于 2026-10-26 二次复核对 `ai-pm-resume.html` 做五处修正（深读时长改为 11.5 分钟、ATS 文件口补 PDF 现状、一页上限改为约 8 年、试验次数改为至少 3 次、入口卡题数改为 115）；需求 028 于 2026-10-26 给 `ai-pm-exam.html` 补 10 题并把六维维度名对齐为「上下文工程」（105 题 / 302 分 → 115 题 / 324 分）。这些修订都不改 URL 与锚点。除这类显式修订外，不为了新功能改归档页。
- 想改页面：先照常编辑 `archive/` 下的文件，再跑 `node personal/harness/verify.mjs --update` 更新哈希，然后跑 `node personal/harness/build-library.mjs` 与测试。原始哈希仍可从 git 历史取回。
- 多页专题（`archive/cc-source-teardown/`）：11 个页面由 `personal/harness/teardown/build.mjs` 生成，共享 `teardown.css`。**不要直接改归档里的 HTML**：改 `teardown/chapters/*.mjs`（或 `ui.mjs`、`theme.mjs`），跑 `node personal/harness/teardown/build.mjs`，再 `node personal/harness/verify.mjs --update`。专题只占 catalog 里一条 `PAGES`，`sitePath` 是 `cc-source-teardown/index.html`；`manifest.json` 里每个生成文件各占一条（`category: 'page'`，`source` 写 `cc-source-teardown/<文件名>`）。
- 新增或下线页面：先改 `catalog.mjs` 与 `manifest.json`（或重新迁移），再跑 `node personal/harness/build-library.mjs`，最后跑 `npm run test:personal`。新增的独立 Astro 页面必须挂 `personal/components/return-nav.astro`（左下角返回浮层）；归档页已由 `nav.js` 注入，不要手写第二套按钮。规范见 [`../../../docs/dev/开发规范/页面与返回导航.md`](../../../docs/dev/开发规范/页面与返回导航.md)。目录页、资料库、测试共用这三份数据，不要只改一处。不是迁移来的新页，`manifest.source` 写归档根相对名（如 `harness-in-business.html`），不要写仓库里的原始路径，否则链接测试会找不到文件。
- 不要把这个目录挪进 `web-astro/public/`：归档只在 dev 模式提供，`npm run build` 不包含它。

## 题库收藏

两个题库页（`harness-exam.html`、`ai-pm-exam.html`）的每道题有「♡ 收藏 / ♥ 已收藏」；收藏汇总在 `/harness/favorites/`。

| 内容 | 位置 | 说明 |
|---|---|---|
| 收藏页 | `web-astro/personal/pages/harness-favorites.astro` | 服务端读收藏与题库，客户端只做搜索、筛选、取消 |
| 注入脚本 | `web-astro/personal/harness/exam-favorites.js` | 由 `static.mjs` 注入两个考试页的响应，归档 HTML 不变 |
| 收藏存储 | `personal/harness/favorites.json` | 只存 `{ exam, id, addedAt }`；随 `sync-notes` 提交 |
| 题库解析 | `web-astro/personal/harness/questions.mjs` | 请求时从两个归档页提取题干/选项/答案/解析/出处 |
| 收藏接口 | `GET /__personal/exam-favorites`、`POST /__personal/exam-favorites/set` | 在 `api.mjs` 注册，沿用 `x-personal-api` 头 |

维护要点：

- 题库页的星标是运行时注入，**不要**为了收藏去改 `archive/` 里的考试页，否则会破坏 188/188 校验。
- 新增题库：改 `harness/exams.mjs`，再在 `harness/static.mjs` 的 `examPages` 里登记文件名与 id。
- 收藏文件损坏时收藏页显示错误、题库页星标禁用；修复 JSON 或删除文件即可恢复。
- 收藏跨设备依赖部署脚本的 `SYNC_PATHS` 包含 `personal/harness`。

## 题库进度同步

两个题库的草稿、历次成绩与错题本保存在服务端，`localStorage` 只作缓存：

| 内容 | 位置 | 说明 |
|---|---|---|
| 服务端数据 | `personal/harness/progress/harness.json`、`ai-pm.json` | `{ format, version, exam, updatedAt, clearedAt, store }`；不入 git |
| 注入脚本 | `web-astro/personal/harness/exam-progress.js` | 首次读取闸门、防抖保存、dirty 补写、首次迁移/合并、清空与文案 |
| 服务端读写 | `web-astro/personal/harness/exam-progress-store.mjs` | 校验 schema/store/大小；`clearedAt` 清空标记 |
| 接口 | `GET /__personal/exam-progress`、`POST /__personal/exam-progress/save` | 在 `api.mjs` 注册；body 上限 4 MB，store 上限 2 MB |
| 同步标记 | 浏览器 `<STORE_KEY>:sync:v1` | `{ dirty, serverUpdatedAt }`；只在本机 |

维护要点：

- 进度文件被 `personal/.gitignore` 的 `harness/progress/` 排除；不要把它加进 `SYNC_PATHS` 的提交范围。备份用题库页「导出全部记录」或手动复制该目录。
- 清空：页面「清空全部记录」两次确认，先写服务端空 store + `clearedAt`，成功后再清本机。
- 首次合并：服务端为空时上传本机；服务端已有数据且本机无同步标记时合并 attempts/mistakes/draft；服务端有 `clearedAt` 时不合并旧数据。
- 文件损坏：GET 500，页面退回本机缓存并提示；清空操作可以覆盖损坏文件，或手动删除后重开。
- 归档考试页仍不改；两个注入脚本按 `exam-progress.js` → `exam-favorites.js` → `nav.js` 的顺序加载。

## Super-agent 结构图（需求 042）

`/harness/site/super-agent-architecture.html` 是 042 正文页配套的图形版，单文件、与正文互链，不是迁移页。

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `archive/super-agent-architecture.html` | 八段：输入、两级过滤、Router、分派/直通、Worker、三个支撑机制、存算与环境分离、Watchdog 与数字 |
| 目录项 | `catalog.mjs` 的 `PAGES` | slug `super-agent-architecture`，group `industry`，kind `结构图` |
| 测试 | `personal/tests/super-agent-architecture.test.mjs` | 注册、八个分段、关键标签、无外部资源、双向链接、manifest 字节与哈希 |

维护要点：

- 改图只改这一个文件，再跑 `node personal/harness/verify.mjs --update` 与 `node personal/harness/build-library.mjs`，最后跑 `npm run test:personal`。
- 版面宽 1520，900px 以下折成单列，页面级不出现横向滚动；打印样式是 A3 横向，可直接存 PDF。
- 正文页顶部的「看整页结构图」按钮与结构图页脚的正文链接互为入口，改路径时两边一起改。

## mini-harness 交互运行台

`/harness/mini-harness/` 是需求 009 加的只读运行台，不是归档的一部分，也不写 `archive/`：

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `web-astro/personal/pages/mini-harness.astro` | dev-only 路由；机制卡与无脚本降级在服务端渲染 |
| 路由 | `web-astro/personal/routes.mjs` 的 `MINI_HARNESS_PATH` | 目录页入口也用它；不要手写 URL |
| 模拟器 | `web-astro/personal/harness/mini-harness/engine.mjs` | 纯函数：主循环、权限、压缩、落盘、子代理、记忆、eval |
| 客户端 | `web-astro/personal/client/harness/mini-harness.ts`、`mini-harness.css` | 单步/播放/裁决/检查器/评测台；只读 DOM，不发请求 |
| 测试 | `personal/tests/mini-harness-sim.test.mjs`、`mini-harness-page.test.mjs` | 场景、分支、阈值、确定性、源码常量对齐、路由与页面标记 |

使用与边界：

- 4 个场景（完整流程、权限裁决、压缩与落盘、记忆闸门）；7 个机制卡；S6 评测台可分别跑脚本模型 5/5 与空操作模型 0/5。
- 严格策略下 `rm -rf` 直接拒绝，`git push` 进入 `ask`；点「批准 / 拒绝」会从头重算同一条确定性轨迹。
- 所有工具都在内存工作区里模拟，模型响应来自脚本化 FakeModel；不联网、不调真实模型、不写 `personal/`、不写浏览器存储，刷新即重置。
- 页面里的压缩/落盘阈值为了短演示调低；生产默认值（100,000 tokens / 2,000 字符）在页首注明，结论以 `archive/` 源码与 README 为准。
- 改模拟器后跑 `node --experimental-strip-types --test personal/tests/mini-harness-*.test.mjs`；改页面或目录入口后跑完整 `npm run test:personal`。模拟器常量测试会读取 Python 源码，两边不一致时先确认哪边是有意修改。

## SelfLoop 交互运行台

`/harness/selfloop/` 是需求 014 加的只读运行台，不是归档的一部分，也不写 `archive/`：

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `web-astro/personal/pages/selfloop.astro` | dev-only 路由；四道闸门、停机表、机制卡与无脚本降级在服务端渲染 |
| 路由 | `web-astro/personal/routes.mjs` 的 `SELFLOOP_PATH` | 目录页入口也用它；不要手写 URL |
| 模拟器 | `web-astro/personal/harness/selfloop/engine.mjs` | 纯函数：基线、提示词、脚本候选、四道闸门、接受、内存 RunStore、停机 |
| 客户端 | `web-astro/personal/client/harness/selfloop.ts`、`selfloop.css` | 单步/播放/曲线/候选表/检查器；只读 DOM，不发请求 |
| 测试 | `personal/tests/selfloop-sim.test.mjs`、`selfloop-page.test.mjs` | 场景、闸门、停机、确定性、源码常量对齐、路由与页面标记 |

使用与边界：

- 5 个场景：跑到 verified、平台期、预算、完整性作弊、canary 近失；6 个阶段 P1–P6；四道闸门各有独立证据。
- 默认场景的四轮分数 0.4942 → 0.6867 → 0.8154 → 1.0、可见 5/6、隐藏 162/316/419/520、canary 32/45/70/95 来自归档源码的一次真实 `verify_source` 跑分；提示词 token 444/460/460 与总成本 0.000616 与 `MockProposer` 一致。
- 可调最大轮数、预算、平台期 K、手动停止与“verified 后停机”；所有候选与运行档案都在内存里，不联网、不调模型、不写 `personal/`、不写浏览器存储，刷新即重置。
- 页面里的预算演示值（$0.00045）和 canary 场景的 1 轮上限为了短演示调低；生产默认（10 轮 / $2 / K=3）在页首注明，结论以 `archive/labs/selfloop/` 源码与 README 为准。
- 改模拟器后跑 `node --experimental-strip-types --test personal/tests/selfloop-*.test.mjs`；改页面、路由或目录入口后跑完整 `npm run test:personal`。模拟器常量测试会读取 Python 源码，两边不一致时先确认哪边是有意修改。

## 任务队列深读（需求 032）

`/harness/site/agent-task-queue.html` 是 2026-10-27 新增的深读页，放在「Harness 深读」分组；它不是迁移页，也不改任何旧页面。

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `archive/agent-task-queue.html` | 单文件；四条车道、六个契约、九个状态、12 个失败模式；内联 CSS/JS |
| 目录项 | `catalog.mjs` 的 `PAGES` | slug `agent-task-queue`，group `deep`，kind `产品设计` |
| 清单 | `manifest.json` | `page=22`、`fileCount=190`、`library.total=186` |
| 测试 | `personal/tests/agent-task-queue.test.mjs` | 14 个 section、14 条来源、自包含、manifest 字节与哈希 |

维护要点：

- 改页面后跑 `node personal/harness/verify.mjs --update`，再跑 `build-library.mjs` 与 `npm run test:personal`；manifest 的 bytes/sha256 由校验脚本更新，不要手改。
- 正文 `[n]` 与文末 `<li id="sN">` 一一对应；新增来源时同时改 `ol.sources` 与正文引用，测试会检查两边集合相等。
- 页面里的 `/book/chapter6/` 是阅读器路由，不是归档文件；`harness-links.test.mjs` 对 `/book/` 开头的站内根路径放行，其余相对链接仍要求在归档内可解析。
- 目录页卡片由 `archive/index.html` 静态渲染；新增或下线页面时同时改 `catalog.mjs` 与 `archive/index.html`，`harness-links.test.mjs` 会检查每个 catalog 页面都在 index 里有链接。

## 单 Agent 循环决策页（需求 035）

`/harness/site/single-agent-loop.html` 是 2026-10-29 新增的架构决策页，放在「AI 行业调研」分组；它不是迁移页，也不改任何旧页面。

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `archive/single-agent-loop.html` | 单文件；12 节、17 条来源、8 个交互（决策器、账本、迁移步进、折叠推演、翻转矩阵等） |
| 目录项 | `catalog.mjs` 的 `PAGES` | slug `single-agent-loop`，group `industry`，kind `架构决策` |
| 清单 | `manifest.json` | `page=22`、`fileCount=190`、`library.total=186` |
| 测试 | `personal/tests/single-agent-loop.test.mjs` | 12 节、17 条来源、引用闭合、8 个交互根节点、自包含、manifest 字节与哈希 |

维护要点：

- 决策器是 5 个布尔输入的启发式，不是自动判决；原文只有三个保留条件，四种处置中的“合并”要在审计阶段单独判断。
- 账本与推演里的数字是教学示意，页面已标“不是实测”；不要把它们写成厂商数据或行业基准。
- 来源 `[n]` 与 `<li id="sN">` 一一对应；17 条必须全部被正文引用，测试会检查集合相等。
- 页面里的 `/book/chapter10/`、`/book/chapter2/` 是阅读器路由，不是归档文件；`harness-links.test.mjs` 对 `/book/` 开头的站内根路径放行。

## Super-agent 设计探索页（需求 042）

`/harness/site/super-agent-design-2026-11.html` 是 2026-11-02 新增的架构解读页，放在「AI 行业调研」分组；它不是迁移页，也不改任何旧页面正文。

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `archive/super-agent-design-2026-11.html` | 单文件；13 节、8 条来源、6 个交互（特征映射、架构对照、批处理计算器、注入深度、实验口径、自检清单） |
| 目录项 | `catalog.mjs` 的 `PAGES` | slug `super-agent-design`，group `industry`，kind `架构解读` |
| 清单 | `manifest.json` | `page=35`、`fileCount=203`、`library.total=199` |
| 测试 | `personal/tests/super-agent-design.test.mjs` | 13 节、8 条来源、引用闭合、6 个交互根节点、自包含、manifest 字节与哈希 |

维护要点：

- 外部来源只有原文与原型仓库两条，其余六条是站内页面与书稿章节，只做对照、不作证据；第 3 节的“代价”一列与第 6、9 节的判断是本页解读，改稿时保留“本页判断”的标注。
- 批处理计算器只在 1、40 条/分两个端点有原文数据，中间是对数插值，界面已标“示意”；不要把插值结果写成实测。
- 实验表有三个口径（完成时间 / 读缓存 token / 决定数），原文没给的格子写“未给出”，不要为了表格好看补数。
- 需求文档见 `docs/dev/requirements/042-super-agent-design/`，含原文摘录与引用边界。

## AI 产品经理模拟面试

`/harness/interview/` 是需求 013 加的 dev-only 页面，不属于归档，也不写 `archive/`。它把 AI PM 结业考试的专题掌握度、错题和过往复盘变成一场多轮面试。

| 内容 | 位置 | 说明 |
|---|---|---|
| 页面 | `web-astro/personal/pages/interview.astro` | 画像、设置、对话、复盘与历史；服务端只渲染画像与历史 |
| 画像/计划 | `web-astro/personal/harness/interview-profile.mjs` | 17 个专题、5 个轮次、4 档难度、5 个复盘维度；纯函数 |
| 会话 | `web-astro/personal/harness/interview-store.mjs` | `personal/harness/interview/sessions/<id>.json`；单场 40 轮 / 1 MB / 最多 50 场 |
| 前端 | `web-astro/personal/client/harness/interview*.ts`、`interview*.css` | 设置、DSH 式模型菜单、对话、复盘、导出 |
| 实验台 | `agent-lab/agent_lab/interview.py`、`interview_routes.py` | `POST /interview/turn`、`POST /interview/report`；无状态，不落盘 |

使用与边界：

- 入口：Harness 目录 AI PM 分组的练习卡、收藏页、AI PM 考试页浮动导航（只在响应里注入 `data-interview`，归档文件不变）。
- 面试记录含简历摘要和完整对话，`personal/.gitignore` 已排除 `harness/interview/`；备份用页面导出 JSON / Markdown。
- 阅读器只负责出题依据和落盘；模型调用走现有 `/__lab` 代理和模型档案，密钥不出实验台。
- 复盘模型不按标记输出时保留原文，不丢记录；未知 review id 由阅读器丢弃，避免编造链接。输出被 `max_tokens` 截断（`finish_reason=length`）时复盘带 `truncated`，页面提示重新生成；截断到没有可用段落则整次失败，不落半截报告。请求的输出上限跟着模型档案（设置页里的 `max_output_tokens`），没有档案时用 `LAB_MAX_OUTPUT_TOKENS`；日志在 `run-logs/agent-lab.err.log` 的 `interview report truncated` 行。
- 「重新生成复盘」是幂等的：页面生成期间禁用按钮，实验台按「会话 id + 输入 + 模型档案」指纹合并重复提交（进行中挂接、完成后 10 秒内复用，失败不缓存），双击、重试、另一个标签页再点都只调一次模型。
- 测试：`personal/tests/interview-*.test.mjs`、`agent-lab/tests/unit/test_interview*.py`。

## superagent-flow 实验（需求 044）

`labs/superagent-flow/` 是 2026-11-03 替换 043 部署走查后的第三个实验，把 `dsh-superagent-prototype` 的运行流程实现成离线事件回放器；它不是迁移内容，也不启服务、不联网。

| 内容 | 位置 | 说明 |
|---|---|---|
| 实验代码 | `archive/labs/superagent-flow/superagent_flow/` | Source、Intake、Gate、Eval、Ticket、Assignment、阶段、Channel 与 CLI |
| 说明 | `archive/labs/superagent-flow/README.md` | 两条路径、四个对象、阶段表、八个场景、三种 accept mode、边界与简化 |
| 目录项 | `catalog.mjs` 的 `LABS` | id `superagent-flow`，运行台 `/harness/superagent-flow/`（需求 045），`tests` 与单测实数一致 |
| 清单 | `manifest.json` | 22 条 `category: 'lab'`，`source` 写归档相对名（如 `labs/superagent-flow/README.md`） |
| 测试 | `archive/labs/superagent-flow/tests/` | 98 个：gate、intake、Eval、工单与重校验、阶段表、Channel、八场景与确定性 |

维护要点：

- 规则只改三处：准入与强度在 `gate.py`，评估与超时在 `evals.py`，阶段表在 `stage.py`；改完同步 `docs/dev/requirements/044-superagent-flow-lab/design.md` 的规则表。
- 场景的预期终态写在 `tests/test_scenarios.py`，改场景时两边一起改，`catalog.mjs` 的 `tests` 计数也要跟着改。
- 新增文件后先补 `manifest.json` 条目，再跑 `verify.mjs --update` 与 `build-library.mjs`；`__pycache__` 由 `RUN_STATE` 跳过，不要写进清单。
- 实验只回放判定与状态迁移，不代表真机结论；README 的「边界与简化」一节是事实边界，改稿时保留。

### 交互运行台（需求 045）

`/harness/superagent-flow/` 把 044 的八个场景做成浏览器运行台：单步、回退、自动播放、重置与跳到结尾；时间线按记录展示 tick、阶段、key、outcome 与原文出处；检查器可看工单快照（Ticket、Mandate、Assignment、Report、PR）、决策与消息、原始 JSON。规则由 `harness/superagent-flow/engine.mjs` 逐模块复刻，每条记录后存一份快照。

| 内容 | 位置 |
|---|---|
| 回放引擎 | `web-astro/personal/harness/superagent-flow/engine.mjs` |
| 页面 | `personal/pages/superagent-flow.astro`、`client/harness/superagent-flow.ts`、`client/harness/superagent-flow.css` |
| 路由 | `personal/routes.mjs` 的 `SUPERAGENT_FLOW_PATH`，由 `integration.mjs` 注册 |
| 测试 | `personal/tests/superagent-flow-sim.test.mjs`（8 条）、`superagent-flow-page.test.mjs`（6 条） |

维护要点：

- 对账：sim 测试会执行 `python3 -m superagent_flow --scenario <id> --json`，把八个场景与 JS `toDict()` 逐字段比较；本机没有 `python3` 时 skip 并打印原因。
- 只读：页面不写 `archive/`、不写 `personal/`、不联网、不用浏览器存储；Python 实验一行不改。
- 改规则时先让对账测试变红，再同步改 `engine.mjs`，最后更新本节的场景说明。

## 维护命令

```bash
cd web-astro

# 校验 226 个文件的字节数与 SHA-256（有意修改后加 --update）
node personal/harness/verify.mjs

# 改完页面/清单后重建资料库
node personal/harness/build-library.mjs

# 从旧项目重新导出（会覆盖 archive/ 与 meta/；旧项目已删除，
# 需要重导时先从 /tmp/harness-20261018.bundle 恢复一份干净工作区）
node personal/harness/migrate.mjs --source <恢复后的目录> --force

# 归档、收藏、进度、静态服务、目录、链接测试
node --experimental-strip-types --test personal/tests/harness-*.test.mjs personal/tests/exam-progress-*.test.mjs

# mini-harness 运行台：模拟器 + 页面接线
node --experimental-strip-types --test personal/tests/mini-harness-*.test.mjs
```

重新迁移依赖源目录 `git status --short` 为空；有未提交改动时脚本会中止。

## 跑实验

实验代码在归档里，本机手动运行，不新增服务、不新增端口：

```bash
cd web-astro/personal/harness/archive
python3 -m unittest discover labs/mini-harness/tests          # 67 个测试
cd labs/selfloop && python3 -m unittest discover -s tests -v  # 14 个测试
cd ../superagent-flow && python3 -m unittest discover tests  # 98 个测试
python3 -m superagent_flow --list                              # 八个场景

# 运行台引擎与 Python 对账
cd web-astro && node --experimental-strip-types --test personal/tests/superagent-flow-*.test.mjs
```

SelfLoop 的网页预览仍然只在本机按需启动（`python3 run.py` 打开 8791），用完关掉；阅读器不代理它。

## 重建构建产物

```bash
cd web-astro/personal/harness/archive

# hooks-33：5 条断言通过后重写 ../claude-code-hooks-33.html，内容不变
cd hooks-33 && python3 build.py && cd ..

# 技术分享幻灯片：需要 LibreOffice 与 python-pptx，按 _deck/README 的说明构建
```

`_deck/checks.json` 记录 16 页的版式检查结论；`_deck/qa_layout.py` 可复跑。

## 验证记录

| 检查 | 命令 | 结果 |
|---|---|---|
| 清单校验 | `node personal/harness/verify.mjs` | 226/226 通过；根 HTML 与专题页未被运行时改写 |
| 题库解析 | `node --experimental-strip-types --test personal/tests/harness-questions.test.mjs` | 7/7；212 题（97 + 115） |
| 题库收藏 | `node --experimental-strip-types --test personal/tests/harness-favorites-*.test.mjs` | 19/19（存储 7、接口 6、路由与页面 6） |
| 题库进度 | `node --experimental-strip-types --test personal/tests/exam-progress-*.test.mjs` | 23/23（存储 7、合并 6、接口 5、注入/接线 5） |
| mini-harness | `python3 -m unittest discover labs/mini-harness/tests` | 67/67 |
| mini-harness 运行台 | `node --experimental-strip-types --test personal/tests/mini-harness-*.test.mjs` | 18/18（模拟器 13、页面接线 5） |
| SelfLoop | `python3 -m unittest discover -s tests -v` | 14/14 |
| SelfLoop 运行台 | `node --experimental-strip-types --test personal/tests/selfloop-*.test.mjs` | 21/21（模拟器 16、页面接线 5） |
| superagent-flow | `python3 -m unittest discover labs/superagent-flow/tests` | 98/98（gate 17、intake 14、Eval 12、工单 15、阶段 13、Channel 6、场景 21） |
| superagent-flow 运行台 | `node --experimental-strip-types --test personal/tests/superagent-flow-*.test.mjs` | 14/14（引擎与对账 8、页面接线 6） |
| hooks-33 | `python3 build.py` | 5 条断言通过，生成页与归档页一致 |
| 任务队列深读 | `node --experimental-strip-types --test personal/tests/agent-task-queue.test.mjs` | 5/5（结构、引用、自包含、manifest） |
| 单 Agent 循环页 | `node --experimental-strip-types --test personal/tests/single-agent-loop.test.mjs` | 5/5（12 节、17 条来源、8 个交互、自包含、manifest） |
| Super-agent 页 | `node --experimental-strip-types --test personal/tests/super-agent-design.test.mjs` | 5/5（13 节、8 条来源、6 个交互、自包含、manifest） |
| 阅读器测试 | `cd web-astro && npm run test:personal` | 598/598（含收藏、进度、mini-harness、SelfLoop、superagent-flow 运行台、随页问答、简历页 10/10、题库 115 题、书稿考试、任务队列页、单 Agent 循环页、Super-agent 页与目录接线用例） |
| Anthropic 页 | `node --experimental-strip-types --test personal/tests/anthropic-workflow-shift.test.mjs` | 3/3（分组、章节与 14 条来源、离线约束） |
| 实验台测试 | `cd agent-lab && uv run pytest` | 593/593 |
| 构建 | `cd web-astro && npm run build` | 166 页；产物不含 `/harness/`、`exam-favorites` 与 `exam-progress` |
| 类型检查 | `cd web-astro && npm run check` | 0 errors（29 hints） |
| 清理 | `lsof -iTCP:8742`、`ls ~/project/harness`、`launchctl list` | 端口无监听、目录已删除、无相关 LaunchAgent |

页面侧手工检查（375px、明暗两态、旧页面浮层、键盘）：用本机临时 `astro dev` 加 headless Chrome 实测，见需求 006 的 `design.md` 变更记录。收藏页与题库星标另按需求 007 验收：4 张预置收藏、97 个题库星标、报告页 97 个、搜索/筛选/移除、空/损坏/题目下线三态、390px 无横向滚动、控制台无报错。题库进度另按需求 008 验收：迁移、清缓存恢复、首次合并、clearedAt 不复活、草稿/交卷落盘、清空、离线提示与恢复。mini-harness 运行台按需求 009 验收：1440px 三栏、390px 单栏无横向滚动、明暗两态、单步到 ask、批准/拒绝、跳到摘要、检查器三页、评测 5/5 与 0/5、控制台无报错。SelfLoop 运行台按需求 014 验收：1440px 三栏、375px 单栏无横向滚动、明暗两态、四道闸门按事件逐步展开、5 个场景、曲线 4 点、档案 8 个文件、diff 28 行、控制台无 JS 报错。简历页 v2 按需求 015 验收：1440px 七步导航、岗位/自评卡、完整简历对照；390px 无横向滚动；明暗两态；打印预览 32 页且折叠内容展开；勾选进度保留与重置；控制台无报错。任务队列页按需求 032 验收：1440px 双栏、390px 单栏无横向滚动、明暗两态、代码块与宽表可横向滚动、文内 `[n]` 可跳转到来源、控制台无 JS 报错。 单 Agent 循环页按需求 035 验收：1440px 双栏、390px 单栏无横向溢出、明暗两态、打印 PDF 为浅色并隐藏浮动导航、八个交互可点击且无控制台报错；决策器、账本、推演与翻转矩阵的默认值可复现。

## 书稿结业考试 A/B 卷（需求 010）

题库收藏与进度同步现在也覆盖《深入理解 AI Agent》书稿的 A/B 两卷：

| 内容 | 位置 | 说明 |
|---|---|---|
| 入口页 | `web-astro/personal/pages/book-exam.astro` | `/book-exam/`，选择 A/B |
| 试卷页 | `web-astro/personal/pages/book-exam/[paper].ts` | `/book-exam/a/`、`/book-exam/b/`；只读生成好的 HTML，再注入现有进度/收藏脚本 |
| 题库元数据 | `web-astro/personal/harness/exams.mjs` | `book-a`、`book-b`；`source: 'book'`，`href` 指向 `/book-exam/...` |
| 题面解析 | `web-astro/personal/harness/questions.mjs` | `readExamQuestions` 按 `source` 从 `personal/harness/archive/` 或 `personal/exams/` 读取 |
| 生成产物 | `web-astro/personal/exams/` | A 67 题 / 204 分，B 64 题 / 203 分；数据与生成命令见该目录 README |

- 收藏仍只存 `{ exam, id, addedAt }`，`exam` 为 `book-a` 或 `book-b`；收藏页 `/harness/favorites/` 会显示卷名并打开对应卷。
- 进度分别写 `personal/harness/progress/book-a.json`、`book-b.json`；两卷的 localStorage 键也分开。
- 书稿卷的页面不是归档文件，`verify.mjs` 的 190 文件校验不受影响；`static.mjs` 的 `examPages` 也不登记它们。
- 注入时通过 `data-favorites-href="/harness/favorites/"` 把收藏链接指回统一收藏页；归档两套仍用默认的 `../favorites/`。

## 随页问答注入（需求 016）

Harness 归档页也带全站悬浮问答入口，但归档 HTML 仍然只读：

| 内容 | 位置 | 说明 |
|---|---|---|
| 注入函数 | `static.mjs` 的 `injectPageAssistant` | 只在 HTML 响应的最后一个 `</body>` 前加一个 `type="module"` 标签；已有 `data-page-assistant` 时跳过 |
| 模块地址 | `personal/client/page-assistant.ts` | Vite dev 直接编译；与 Astro 页面共用同一份面板、截图和请求逻辑 |
| 样式 | `personal/client/page-assistant.css` | 由模块导入；暗色、移动端、reduced-motion、print 都在里面 |
| 测试 | `personal/tests/page-assistant-wiring.test.mjs`、`harness-static.test.mjs` | 注入一次、base 路径、片段页、模块标签；归档字节校验仍不受影响 |

维护要点：不要为了问答去改 `archive/` 页面；入口靠响应注入。若归档页没有「问 AI」，先看响应里是否有 `data-page-assistant`，再看 `/personal/client/page-assistant.ts` 是否 200。
