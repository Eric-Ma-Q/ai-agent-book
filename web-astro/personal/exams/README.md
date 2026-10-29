# 《深入理解 AI Agent》结业考试 · A/B 卷

依据 bojieli《深入理解 AI Agent》书稿（`book/chapter1.md`–`chapter10.md`、`book/introduction.md`、`book/reference-answers.md`）出题，不取自 Harness 学习页。按 2026-10-18 工作区书稿生成。

全库 **131 题 / 407 分**，拆成两套平行卷：

| 卷 | 题数 | 分值 | 建议用时 | 入口 |
| --- | ---: | ---: | --- | --- |
| A 卷 | 67 | 204 | 90–100 分钟 | `/book-exam/a/` |
| B 卷 | 64 | 203 | 90–100 分钟 | `/book-exam/b/` |

两卷都覆盖第 1–10 章和 A–G 七个部分；D 部分 A 卷 3 排序 + 3 连线，B 卷 3 排序 + 2 连线。题库与分卷映射在 [`data/`](data/)，页面和 Markdown 是生成产物。

## 打开方式

- 阅读器内：页眉「结业考试」→ `/book-exam/`，选 A 卷或 B 卷；或直接访问 `/book-exam/a/`、`/book-exam/b/`。
- 独立文件：直接打开 [`ai-agent-book-exam-a.html`](ai-agent-book-exam-a.html)、[`ai-agent-book-exam-b.html`](ai-agent-book-exam-b.html)。这是单文件版本，不依赖阅读器服务；但独立文件不会连接服务端进度，只有阅读器路由会注入进度与收藏。
- 出处链接：阅读器里由 [`reader-links.mjs`](reader-links.mjs) 映射为本站 `/book/chapterN/`，点开落在自己的书里；直接打开单文件时仍指作者线上书。
- 可打印/可检索：[`ai-agent-book-exam-a.md`](ai-agent-book-exam-a.md)、[`ai-agent-book-exam-b.md`](ai-agent-book-exam-b.md)，题目在前、答案解析在后。

## 收藏与进度

- 收藏：`personal/harness/favorites.json`，`exam` 为 `book-a` 或 `book-b`；收藏页 `/harness/favorites/` 统一展示。
- 进度：`personal/harness/progress/book-a.json`、`book-b.json`，存草稿、历次成绩与错题本；浏览器 localStorage 只是缓存。
- 两卷的进度、错题本和 localStorage 键都按卷分开，互不覆盖。

## 章节覆盖

| 章节 | A 卷 | B 卷 |
| --- | ---: | ---: |
| 第 1 章 · 入门与 Harness | 7 | 6 |
| 第 2 章 · 上下文工程 | 11 | 11 |
| 第 3 章 · 记忆与知识库 | 7 | 6 |
| 第 4 章 · 工具 | 7 | 7 |
| 第 5 章 · Coding Agent | 6 | 7 |
| 第 6 章 · 交互扩展 | 4 | 4 |
| 第 7 章 · 评估 | 6 | 6 |
| 第 8 章 · 模型后训练 | 5 | 6 |
| 第 9 章 · 持续进化 | 5 | 4 |
| 第 10 章 · 多 Agent 协作 | 8 | 7 |
| 全书主线 | 1 | 0 |

## 维护

题目、答案、解析与出处都在 [`data/`](data/)：`questions-a.mjs`–`questions-g.mjs` 按部分拆分，`parts.mjs` 放章节/题型元数据，`papers.mjs` 放 A/B 归属，`index.mjs` 汇总。不要直接改生成的 HTML/Markdown。

```bash
cd web-astro

# 结构校验：题号唯一、A/B 都覆盖十章与 A–G、答案下标合法、评分细则求和
node --experimental-strip-types personal/exams/data/validate.mjs

# 重新生成 A/B HTML
node --experimental-strip-types personal/exams/build.mjs

# 重新生成 A/B Markdown
node --experimental-strip-types personal/exams/export-markdown.mjs

# 相关测试
node --experimental-strip-types --test personal/tests/book-exam.test.mjs personal/tests/book-exam-wiring.test.mjs personal/tests/book-exam-links.test.mjs
```

页面引擎复用 `personal/harness/archive/harness-exam.html` 的样式、计时、判分与报告逻辑；构建脚本只读取归档，不改归档文件，因此不会触发 `verify.mjs` 的 182 文件校验。

出处链接在生成的单文件里指向作者在线书稿（`https://bojieli.github.io/ai-agent-book/book/chapterN/`）；阅读器提供该页时由 [`reader-links.mjs`](reader-links.mjs) 换成本站 `/book/chapterN/`，点击在新标签页打开自己那本书。离线作答不受影响。

## 接入位置

- 入口页：`web-astro/personal/pages/book-exam.astro`（`/book-exam/`）
- 试卷 endpoint：`web-astro/personal/pages/book-exam/[paper].ts`（`/book-exam/a/`、`/book-exam/b/`）
- 页眉入口：`web-astro/personal/client/book-exam-entry.ts`
- 题库元数据：`web-astro/personal/harness/exams.mjs`
- 需求文档：[`README.md`](../../../README.md)
