# AI 部署提示词

这份文档给「让 AI 帮你装一遍」用：先准备三样东西，把第二段整段发给编码助手，最后自己完成三步。架构与目录说明见 [架构.md](架构.md)，长期运行的部署方式见 [部署.md](部署.md)。

## 你需要准备

| 项目 | 说明 | 是否必需 |
|---|---|---|
| 模型接口 `base_url` | 兼容 OpenAI 的地址，通常以 `/v1` 结尾，例如 `https://api.example.com/v1` | 必需 |
| `api_key` | 该接口的密钥，只写进本机 `.env` 或设置页 | 必需 |
| `model` | 模型 ID，例如 `gpt-4.1-mini` 或服务商自定义名称 | 必需 |
| MCP token | 外部应用（Claude Code、Cursor 等）接入 `/__lab/mcp` 时用的口令，至少 16 位 | 可选 |
| 空闲端口 | 阅读器 4321、实验台 4330 | 必需 |

先确认端口没被占用：

```bash
lsof -nP -iTCP:4321 -sTCP:LISTEN
lsof -nP -iTCP:4330 -sTCP:LISTEN
# Linux 没有 lsof 时：ss -ltnp | grep -E ':(4321|4330)'
```

## 复制给 AI

把下面整段复制给编码助手，替换尖括号里的内容。

```text
请在这台机器上部署「AI Agent 阅读器扩展版（非官方分支）」。

环境信息
- 仓库地址：https://github.com/Eric-Ma-Q/ai-agent-book.git
- 模型接口 base_url：< https://.../v1 >
- 模型 api_key：<只写进本机文件，不要回显>
- 模型 ID：<model-id>

步骤
1. 版本检查：node -v（>= 22.12）、python3 -V（>= 3.12）、uv --version、git --version。缺什么先列出来问我，不要擅自改系统配置或安装全局包。
2. 端口检查：4321 与 4330 必须空闲；被占用时告诉我占用进程，不要直接 kill。
3. git clone https://github.com/Eric-Ma-Q/ai-agent-book.git，进入仓库根目录。
4. 安装依赖：cd web-astro && npm ci；cd ../agent-lab && uv sync --frozen。
5. 生成配置：若 agent-lab/.env 不存在，由 agent-lab/.env.example 复制后写入 LAB_LLM_BASE_URL、LAB_LLM_API_KEY、LAB_MODEL；若已存在，先给我看差异再合并，不要覆盖我已有的值。仓库根的 .env 由 .env.example 复制，填入 UPDATE_REPO（没有就留空）。
6. 启动：在仓库根运行 bash scripts/start.sh（前台，阅读器 4321、实验台 4330，默认只监听 127.0.0.1）。用后台方式启动时把输出留在 run-logs/ 下。
7. 健康检查：curl -sS http://127.0.0.1:4321/__lab/health，确认 success 为 true；再确认 http://127.0.0.1:4321/ 与 http://127.0.0.1:4321/book/chapter1/ 返回 200。
8. 打开页面走查：首页、章节页、/settings/、/lab/ 各开一次，确认没有报错。
9. 输出结果：访问地址、日志目录 run-logs/、管理员 token 的位置 personal/update/token（没有就说明如何生成）。

禁止事项
- 不修改 book*/、chapter*/、web-astro/src/ 下的任何文件。
- 不把密钥、.env、personal/ 下的任何数据写进 git，也不执行 git push。
- 不执行仓库之外的删除、移动或权限变更。
- 失败时先读 run-logs/ 下的日志再动手，不要凭猜测改代码；定位不了就把日志末尾贴给我。
```

## 用户自己必须做的 3 件事

1. **填模型接口**：编辑 `agent-lab/.env` 的 `LAB_LLM_BASE_URL`、`LAB_LLM_API_KEY`、`LAB_MODEL`，或在 `/settings/` 里新建模型档案；两者都没有时问答会提示鉴权失败。
2. **首次打开设置页加模型档案**：进入 `/settings/`，填接口地址、密钥、模型 ID，点「测试连接」，通过后「设为默认」；实验台、随页问答、模拟面试共用这份配置。
3. **配置更新仓库地址（可选）**：把 `UPDATE_REPO` 设为 `owner/repo` 形式，并生成管理员 token：

```bash
mkdir -p personal/update
openssl rand -hex 24 > personal/update/token
chmod 600 personal/update/token
```

之后在设置页「项目更新」里检查更新；不配置时该区块显示「未启用」，不影响阅读。

## 验证清单

| 检查 | 命令 | 通过标准 |
|---|---|---|
| 依赖版本 | `node -v`、`uv --version` | Node 不低于 v22.12，uv 能输出版本 |
| 阅读器在跑 | `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/` | `200` |
| 章节页可读 | `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/book/chapter1/` | `200` |
| 实验台连通 | `curl -sS http://127.0.0.1:4330/health` | `success` 为 `true` |
| 阅读器到实验台的代理 | `curl -sS http://127.0.0.1:4321/__lab/health` | 与上一条相同的 JSON |
| 模型接口 | 上一条 JSON 里的 `data.llm.ok` | `true`；为 `false` 时看 `data.llm.error` |
| 设置页 | `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/settings/` | `200` |
| 实验台页面 | `curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/lab/` | `200` |
| 管理员 token | `ls -l personal/update/token` | 文件存在且权限为 `600` |
| 日志 | `ls run-logs/` | 有 `reader.*.log`、`agent-lab.*.log` |

## 常见失败

| 现象 | 通用原因 | 处理 |
|---|---|---|
| `start.sh` 报找不到 node 或 uv | 依赖没装或不在 PATH | 先装 Node 22.12+ 与 uv；确认 `node -v`、`uv --version` 在新终端也可见 |
| `start.sh` 报缺 `node_modules` | 只跑了 `npm install` 之外的东西，或从没装 | `cd web-astro && npm ci` |
| `start.sh` 报缺 `.venv` | 没同步 Python 依赖 | `cd agent-lab && uv sync --frozen` |
| 4321 端口被占用 | 上一次的进程没退出 | `lsof -nP -iTCP:4321 -sTCP:LISTEN` 找到进程后自行决定，或换端口 `READER_PORT=4421 LAB_PORT=4430 bash scripts/start.sh` |
| 首页能开，问答报鉴权失败 | 模型接口或密钥不对 | 打开 `/settings/` 测试连接；核对 `agent-lab/.env` 是否以 `/v1` 结尾 |
| `/lab/` 白屏或提示实验台没启动 | 4330 没起或崩了 | 看 `run-logs/agent-lab.err.log`；`curl http://127.0.0.1:4330/health` |
| `/__lab/health` 返回 502 | 阅读器在跑但实验台没起 | 同上；`start.sh` 会同时拉起两者，检查是否只启动了阅读器 |
| `/settings/`、`/harness/` 404 | 用了 `npm run build` 的静态产物 | 这些页面只在 dev 模式存在，用 `scripts/start.sh` 启动 |
| 局域网手机打不开 | 默认只监听回环地址 | `bash scripts/start.sh --lan`，并确认防火墙放行 4321 |
| 更新区块显示「未启用」 | 没配 `UPDATE_REPO` 或没有管理员 token | 见上文第 3 件事 |
| 更新中止，提示工作区有改动 | 更新只做 fast-forward，不覆盖本地修改 | 先提交或还原已跟踪文件的改动，再重试；`personal/` 不受影响 |
| 检查更新报网络错误 | 访问不了 GitHub API 或被限流 | 保持旧缓存，稍后重试；内网环境可改用代理或镜像 |

更多长期运行与排障内容见 [部署.md](部署.md)。
