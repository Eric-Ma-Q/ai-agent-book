# agent-lab：书本助教 Agent 实验台

架构与部署见 [`docs/架构.md`](../docs/架构.md) 与 [`docs/部署.md`](../docs/部署.md)；模型档案与价格在 `/settings/` 维护。

- **书本助教**：从零写的 ReAct 循环，检索并阅读《深入理解 AI Agent》中文书稿，回答时附 `[[ch2#小节id|原文]]` 引用，引用逐字核对。
- **看得见**：每次运行写成 JSONL 轨迹，阅读器的 `/lab/` 页面实时显示每一轮的完整上下文、分段 token、缓存命中、工具调用、成本。
- **开关**：每章一组（上下文消融、前缀稳定、压缩、状态栏、检索方式、跨会话记忆、干扰工具、代码即工具、学习规则），同一问题可并排对比。
- **评估**：任务集 + 确定性验证器 + 多次试验 + Wilson/bootstrap 区间、pass^k、McNemar A/B、manifest 复核、回归集、自我改进门禁。
- **提示注入攻防**（需求 033）：`/lab/#/injection` 跑 3 类攻击 × 4 层防御的成功率矩阵，逐次试验可看判定证据与标准轨迹。`write_file` 只写 `personal/lab/security/workspaces/`，`send_email` 只写本地 outbox，`read_webpage` 只读内置夹具；报告中 `personal/lab/security/campaigns/`。命令行 `uv run python -m agent_lab injection --list`。
- **模型档案**：`/settings/` 里维护多套接口（地址、密钥、模型 ID、推理档位、单价），运行、对比、评估都能选；密钥只存本机。
- **价格**：档案可从 models.dev 查找或同步单价（输入 / 缓存命中 / 输出），轨迹与评估的成本按真实单价算；目录缓存 24 小时，不入库。
- **模拟面试**：`POST /interview/turn` 与 `POST /interview/report` 给阅读器的 AI 产品经理模拟面试出题/复盘，无状态、不落盘；模型仍选实验台档案。
- **随页问答**（需求 016）：阅读器悬浮面板把当前页面快照和视口截图发到 `POST /page/runs`，实验台用现有 ReAct 循环跑页面助手。工具包括页面切片、书稿检索、读者划线、文件/Glob/Grep/Bash/代码解释器、联网搜索与抓取；内置搜索按锚点词和结果覆盖率挑 Bing/神马/DuckDuckGo，单个引擎失败自动换下一个；抓取用 trafilatura 提取正文（markdown，导航与页脚不进上下文；只有提取为空或少于 200 字才回退全文本），单页最多读 800 万字符。文件写入只落 `personal/lab/page-assistant/workspace/`。运行仍写轨迹、走 `/runs/<id>/events` SSE；截图可从 `GET /page/screenshots/<id>` 回显；`GET /page/sessions/<session_id>`（旧记录用 `GET /page/runs/<run_id>/session`）从轨迹重建历史问答，供面板恢复对话后继续追问。`POST /page/runs` 可带 `reasoningLevel`，按所选档案的推理档位覆盖本次请求（空串沿用档案默认，空值档位不发送），生效档位记录在 `run_start.meta.reasoning`。请求还可带 `mode`（ask / check / map）与 `focus`（figure / table 块号）：check 追加判卷提示词，map 用 4 轮小预算只读本章结构，focus 只接受快照里的图/表并把截图缩到该元素。`GET /page/runs/<id>/replay` 按轮次返回紧凑摘要（消息条数、工具名、延迟、用量、裁剪后的参数与结果），不返回消息正文和 base64。
- **MCP 知识服务**（需求 024 / 036）：agent-lab 增加 `POST /mcp`，外部应用经阅读器 `/__lab/mcp` 通过 `Authorization: Bearer <LAB_MCP_TOKEN>` 访问。兼容旧式 `initialize` 会话与 2026-07-28 无状态协议；工具为书稿三个（`list_chapters`、`search_book`、`read_section`）、个人收集网页三个（`list_pages`、`search_pages`、`read_page`）与问答三个（`ask_book`、`get_answer`、`cancel_run`）。`ask_book` 复用现有 ReAct，工具只含这两类只读内容，默认 8 轮 / 80k token，超时返回 `run_id`，可用 `get_answer` 继续或 `cancel_run` 取消。读者划线、笔记、补充与批注不开放。数据位置与 `/runs` 相同，`run_start.meta.source=mcp`。token 由部署脚本生成并保留，轮换用 `--action rotate-token`。

## MCP 知识服务

外部应用（Claude Code、Cursor、DeepSeek Harness、自建 Agent）可以按 MCP 协议读取书稿与个人收集网页，并调用书本助教。端点是 `http://<阅读器主机名>:4321/__lab/mcp`，本机可用 `http://127.0.0.1:4330/mcp`。

```bash
# token 由部署脚本首次生成、之后保留；手工起服务时自己写一行
LAB_MCP_TOKEN=<48 位十六进制>
uv run python -m agent_lab serve --port 4330
```

接入步骤、curl 示例、客户端配置与排障见 [`docs/部署.md`](../docs/部署.md)。

## 快速开始

```bash
cd agent-lab
cp .env.example .env            # 填 LAB_LLM_BASE_URL / LAB_LLM_API_KEY / LAB_MODEL
uv sync
uv run python -m agent_lab ask "为什么说保持提示词前缀稳定能降低成本？"
uv run python -m agent_lab show <run_id>
uv run python -m agent_lab serve --port 4330    # 本机调试网页时用
```

模型档案：打开 `/settings/` 添加；也可以直接写 `personal/lab/models.json`（不含密钥）与 `models.keys.json`（600，不入库）。没有档案或没设默认时，继续用 `.env` 里的 `LAB_LLM_*`。价格目录地址与缓存时长可用 `LAB_PRICING_URL`、`LAB_PRICING_TTL_H` 覆盖。联网搜索默认用内置 Bing/神马/DuckDuckGo，单个引擎失败自动换下一个。联网工具默认使用系统代理，连接失败会自动直连；`LAB_WEB_PROXY` 可覆盖代理地址，设为 `off` 强制直连。

模拟面试（需求 013）：页面在 `/harness/interview/`，前端把画像、计划和对话发给本服务的 `/interview/turn` 或 `/interview/report`；实验台只调用所选模型并解析标记，不写面试记录。密钥仍只在 `models.keys.json`，响应只返回 `has_key`。

部署：按 `docs/部署.md` 启动阅读器与实验台；公开仓库用 `bash scripts/start.sh`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `ask "问题" [--profile ID] [--set drop_tool_results=true] [--session s1]` | 提问并实时打印轨迹；`--profile` 选模型档案 |
| `compare "问题" [--profile ID] --b-set drop_tool_results=true` | 两套配置各跑一次并对比 |
| `runs` / `show <run_id> [--json]` | 历史运行 / 某次运行的完整轨迹 |
| `eval --suite core --trials 3 [--profile ID] [--b-set k=v] [--max-total-tokens N]` | 评估（给 B 配置即 A/B） |
| `injection [--attacks all] [--defenses all] [--trials 1] [--output PATH]` | 提示注入 3 攻击 × 4 防御矩阵；`--list` 离线列出场景 |
| `verify <评估目录>` | 复核报告与轨迹的哈希 |
| `promote <run_id>` | 把失败运行加入回归集 |
| `actions [--approve ID / --reject ID]` | 处理待确认的写入补充 |
| `improve <eval_id>` / `improve --adopt <候选>` / `rules --activate N` | 自我改进、采用候选、回滚规则 |

## 测试

```bash
uv run pytest                  # 全部离线：模型响应来自 tests/cassettes 的录制
uv run pytest --cov            # 覆盖率
```

- 单元测试用预设响应的 `ScriptedClient`；集成测试回放真实录制的响应（冻结书稿 `tests/fixtures/book/`）。
- `replay` 任务集的回放要求判定与录制时**逐项一致**（`tests/cassettes/evals/expected.json`），而不是要求全部通过。
- 重新录制：`uv run python -m agent_lab eval --suite replay --trials 1 --no-regressions --book-dir tests/fixtures/book --record tests/cassettes/evals --out <临时目录>`；验证器改动后用 `--replay tests/cassettes/evals --write-expected` 更新期望。
- 推送涉及 `agent-lab/` 时，pre-push 钩子自动运行 `pytest`（`SKIP_AGENT_LAB_TESTS=1` 可跳过一次）。

## 目录

```
agent_lab/   agent.py（循环） context.py（开关） models.py（模型档案） page.py（随页快照） llm/（客户端、录制回放、计价） book/（解析、检索）
             tools/（书稿、收集网页、笔记、补充、代码、页面、文件、联网） mcp/（协议、知识、收集网页、问答、工具、路由）
             gate.py sandbox.py workspace.py web.py stores.py
             trace/ server*.py page_routes.py model_routes.py cli*.py security/（提示注入实验）
evals/       tasks/（core、replay） regressions/ verifiers.py runner.py stats.py report.py improve.py promote.py
tests/       unit/ integration/ cassettes/ fixtures/
```

数据：轨迹在 `personal/lab/runs/`（不入库）；评估报告、规则、记忆、模型档案 `models.json`、提示注入报告 `security/campaigns/` 在 `personal/lab/`（入库）；模型密钥 `models.keys.json` 不入库（600）；价格目录缓存 `pricing/`、随页问答的 `page-assistant/` 与注入工作区 `security/workspaces/` 也不入库。
