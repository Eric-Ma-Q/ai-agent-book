# 归属说明

本仓库是 [ai-agent-book](https://github.com/bojieli/ai-agent-book) 的非官方扩展分支。书稿与阅读器由 Bojie Li 创作，扩展部分由Eric-Ma-Q编写；两部分都以 Apache License 2.0 发布。

## 上游信息

| 项 | 内容 |
|---|---|
| 项目 | ai-agent-book |
| 作者 | Bojie Li |
| 地址 | https://github.com/bojieli/ai-agent-book |
| 版权 | Copyright 2025 Bojie Li |
| 许可 | Apache License 2.0 |
| 本分支引用的快照 | commit `dbc046eb896ac4e39aa19c7774c8bf49583b89a6` |

本仓库的 Git 历史是重新建立的单一快照提交，不包含上游的提交历史。要对照上游，请按上面的 commit 在作者仓库中检出，再与本仓库逐目录比较。

## 目录归属

### 原作者部分（原样保留）

| 路径 | 说明 |
|---|---|
| `book/`、`book-ar/`、`book-en/`、`book-es/`、`book-he/`、`book-hu/`、`book-id/`、`book-ja/`、`book-ko/`、`book-ptbr/`、`book-ru/`、`book-ta/`、`book-tr/`、`book-vi/`、`book-zhtw/` | 15 个语言版本的书稿、插图与章节 Markdown；正文原样保留，指向 `chapter*/` 实验的相对链接在导出时改为上游 GitHub 链接 |
| `web-astro/src/` | 阅读器的 Astro 页面、布局、组件与 `lib/`，含图表布局脚本的调用方 |
| `web-astro/public/` | 阅读器静态资源（字体、图形变体入口等） |
| `web-astro/scripts/` | 图表布局、资源准备与构建检查脚本 |
| `assets/logo.svg` | 首页图标 |
| `LICENSE` | Apache License 2.0 原文 |

### 本分支新增

| 路径 | 说明 |
|---|---|
| `web-astro/personal/` | 读者扩展：划线与笔记、插入补充、批注、全部划线、文件预览、随页问答前端、Harness 学习站、题库与结业考试、模拟面试、设置页、更新入口；服务端为 dev 集成 |
| `agent-lab/` | Python 服务：书本助教（ReAct 循环）、轨迹、开关对比、评估、模型档案、随页问答、MCP 知识服务、模拟面试接口 |
| `scripts/start.sh` | 前台启动阅读器与实验台 |
| `scripts/update.sh` | fast-forward 更新、按需装依赖、重启 |
| `docs/` | 架构、部署、AI 部署提示词与架构图（由本分支撰写） |
| `.gitignore`、`.env.example` 相关条目 | 公开配置样例与忽略规则中属于扩展的部分 |
| `README.md`、`AGENTS.md`、`NOTICE`、`ATTRIBUTION.md` | 本分支的公开文档与归属声明 |

### 不属于本仓库

上游的章节实验（`chapter*/`）、幻灯片、多语言站点构建脚本、上游 CI 配置与实验数据未包含在本仓库中。它们仍属于上游项目，需要时请从上游获取。

## 修改过的上游文件

以下上游文件在本分支中被修改，改动保持最小，便于下一次合并上游：

| 文件 | 改动 |
|---|---|
| `web-astro/src/components/Reader.astro` | 在章节正文前插入流程导读组件（第 3 章导读与其余章节的流程图） |
| `web-astro/astro.config.mjs` | 挂载 `personal/integration.mjs` 提供的 dev-only 集成，构建行为不变 |
| `web-astro/package.json` | 新增 `test:personal` 脚本，用于运行扩展的单元测试 |
| `book*/` 的章节 Markdown | 不改变正文；导出公开快照时把 `../chapter*/...` 链接改写为上游同一 commit 的 GitHub 链接，因为这些实验目录不随快照分发 |

上面三个文件之外，`web-astro/src/` 里被改动或新增的内容集中在章节流程导读，均为本分支新增的文件：

- 组件：`web-astro/src/components/ChapterFlow.astro`、`ChapterThreeFlow.astro`、`FlowNode.astro`
- 数据与类型：`web-astro/src/lib/chapter-flow.ts` 与 `chapter-two-flow.ts` 到 `chapter-ten-flow.ts`
- 客户端与样式：`web-astro/src/scripts/chapter-three-flow.ts`、`web-astro/src/styles/chapter-three-flow.css`
- 校验：`web-astro/scripts/chapter-*-flow.test.mjs`、`web-astro/scripts/chapter-flow.browser.mjs`

核对完整差异的方式：在上游仓库检出上文列出的 commit，与本仓库同路径文件比较即可。其余上游文件按该 commit 原样保留；若发现未列出的差异，请按上游许可保留其版权声明，并在本文件补充说明。

## 许可

- 上游书稿、插图与阅读器：Apache License 2.0，Copyright 2025 Bojie Li。
- 本分支新增与修改部分：Apache License 2.0，Copyright 2026 Eric-Ma-Q。
- 许可原文见 [LICENSE](LICENSE)；再分发时请保留 [NOTICE](NOTICE) 中的归属声明。
- Apache License 2.0 不授予商标许可。上游项目名、书名与作者署名仅用于说明来源，不代表作者认可或参与本分支。

## 致谢

书稿内容、插图与原始阅读器来自 Bojie Li 的 ai-agent-book 项目；阅读器依赖 Astro、KaTeX、remark-math 与 rehype-katex，实验台依赖 FastAPI、Uvicorn、Pydantic、httpx、PyYAML 与 trafilatura，模型价格目录来自 models.dev。各项目版权归其各自作者，遵循各自的许可。
