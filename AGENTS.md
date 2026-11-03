# 仓库规则

本仓库是《深入理解 AI Agent》阅读器的非官方扩展分支。书稿与阅读器来自上游（Apache-2.0，Copyright 2025 Bojie Li），扩展部分由本分支维护。给 AI 编码助手读的规则都在这里；事实与命令见 [docs/架构.md](docs/架构.md) 与 [docs/部署.md](docs/部署.md)。

## 1. 只读边界

- `book/`、`book-*/`、`web-astro/src/`、`web-astro/public/`、`web-astro/scripts/` 属于上游作者，只读。需要改行为时优先在扩展目录里包装，不要直接改这些文件；确实必须改，先说明原因与影响面。
- 不批量给上游文件加版权头或改写格式，避免下一次合并上游时产生冲突。
- `book*/` 的 Markdown 是唯一书稿来源，不存在第二份可编辑副本；不要为了改渲染效果去改书稿。

## 2. 扩展写在哪

- 阅读器侧的扩展一律写在 `web-astro/personal/`：服务端 `api.mjs`、`routes.mjs`、`paths.mjs`，页面在 `personal/pages/`，浏览器脚本在 `personal/client/`，测试在 `personal/tests/`。
- 实验台、评估、MCP、随页问答后端写在 `agent-lab/`，Python 包为 `agent_lab/`，测试在 `agent-lab/tests/`。
- 扩展只通过 dev 集成挂载（`astro.config.mjs` 引入 `personal/integration.mjs`）。不要在 `src/` 里加入个人逻辑，也不要让 `npm run build` 的产物带上扩展。

## 3. 个人数据

- `personal/` 是读者数据目录，路径只能经 `web-astro/personal/paths.mjs` 推导；不要自己拼字符串，否则会把文件写到目录之外。
- 新增数据文件时同时更新 `paths.mjs`、`personal/README.md` 的表格与 `.gitignore`。
- 不提交 `.env`、`*.keys.json`、`personal/` 下的任何运行数据与日志。

## 4. 测试

改动逻辑后至少跑：

```bash
cd web-astro && npm run test:personal
cd agent-lab && uv run pytest
```

只改文档时可以不跑，但要在提交信息里说明。测试失败先复现、再定位，不要为了让测试通过而放宽断言。

## 5. 更新与发布

- 更新脚本 `scripts/update.sh` 只允许 fast-forward，不允许 `reset --hard`、`rebase` 或强制推送；工作区有已跟踪改动时必须中止。
- 版本号与 GitHub Release 的 tag 保持一致，更新检查只读 Releases 与 tags。
- 不向上游仓库推送、不开 PR、不做任何写操作；上游只用于对照与合并。

## 6. 写作

- 中文简洁，不写 emoji，术语沿用书里的叫法（Agent、Harness、上下文、工具）。
- 文档之间用相对路径互链；不引用仓库里不存在的路径。
- 公开文档不写内网主机名、固定 IP、密钥、个人姓名与内部需求编号。

## 7. 提交

- 一次提交一件事，信息写明类型与影响面（例如 `feat(settings): 新增项目更新区块`）。
- 提交前确认没有把 `personal/`、`run-logs/`、`.env` 带入暂存区。
