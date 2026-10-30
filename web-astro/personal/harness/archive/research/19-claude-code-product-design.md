# Claude Code 产品设计拆解 · 调研分册

> 抓取与核验日期：2026-10-21 ｜ 对应页面：[`claude-code-product-design.html`](../claude-code-product-design.html) ｜ 版本基线：Claude Code v2.1.305（npm `latest`，2026-10-20 发布）

本分册记录页面事实的来源、抽取命令与口径，供复核时重跑。正文只引用本分册列出的材料；社区逆向文章不进入事实链。

## 1. 资料基线

| 类型 | 数量 | 位置 | 说明 |
|---|---|---|---|
| 官方文档 | 65 篇 | `code.claude.com/docs/en/*.md`（本地 `/tmp/cc-research/docs`） | 由 `llms.txt` 索引挑选，覆盖概念、工具、权限、沙箱、扩展、多端、商业化、Agent SDK |
| 官方博客 | 6 篇 | Anthropic / claude.com | 3.7 发布、Claude 4 GA、2.0 发布、Series G、harness 三模式、上下文工程 |
| 版本数据 | 550 条 | npm registry | `npm view @anthropic-ai/claude-code time --json` |
| 变更记录 | 425 个版本条目 | `code.claude.com/docs/en/changelog.md` | 1.08 MB，按版本分组 |
| 开源仓库 | 3 个 | GitHub tarball | Agent SDK（Python，MIT）、sandbox-runtime（Apache-2.0）、Agent SDK（TypeScript） |
| 原生二进制 | 1 个 | npm `@anthropic-ai/claude-code-darwin-arm64` | 260 MB Mach-O；本机运行 `--version` 与 `--help` |

未抓取：X/Twitter、付费墙内容、需要登录的 Console 页面。页面中没有以这些材料为依据的断言。

## 2. 抓取命令

```bash
# 文档索引与正文
curl -sL https://code.claude.com/docs/llms.txt -o cc-llms.txt
grep -o 'https://code.claude.com/docs/en/[a-z0-9./-]*\.md' cc-llms.txt | sort -u
curl -sfL https://code.claude.com/docs/en/<page>.md -o <page>.md

# 版本节奏
npm view @anthropic-ai/claude-code time --json > npm-time.json
python3 - <<'PY'
import json,collections
d=json.load(open('npm-time.json'))
items=[(k,v) for k,v in d.items() if k not in ('created','modified')]
print(len(items), min(items,key=lambda x:x[1]), max(items,key=lambda x:x[1]))
print(sorted(collections.Counter(v[:7] for _,v in items).items()))
PY

# 开源仓库
curl -sL https://codeload.github.com/anthropics/claude-agent-sdk-python/tar.gz/refs/heads/main -o sdk.tgz
curl -sL https://codeload.github.com/anthropics/sandbox-runtime/tar.gz/refs/heads/main -o srt.tgz
tar xzf sdk.tgz && tar xzf srt.tgz
```

## 3. 数字口径

| 数字 | 值 | 抽取方式 | 备注 |
|---|---|---|---|
| npm 版本数 | 550 | `npm view … time`（去掉 `created`/`modified`） | 首次发布 2025-02-24；月均约 27 |
| 工具条目 | 46 | `tools-reference.md` 表格行去重，去掉规则表里的 `protocols`/`url` | 含 v2.1.277 已移除的 `TaskOutput`，在册 45 |
| hook 事件 | 33 | `hooks.md` 的 `### EventName` 小节，去掉 `Limitations`/`Disclaimer` | 与既有《Hooks · 33 事件》页一致 |
| 权限模式 | 6 | `permission-modes.md` 的 Available modes 表 | default / acceptEdits / plan / auto / dontAsk / bypassPermissions |
| hook 执行器 | 5 | `hooks.md` 配置表 `type` | command / http / mcp_tool / prompt / agent |
| CLI 旗标 | 80 | `cli-reference.md` 表格 `--*` 去重 | 另有 24 个子命令 |
| 斜杠命令 | 67 | `commands.md` 表格 `/name` 去重 | 含 bundled skills |
| SDK 选项 | 49 | `types.py` 的 `ClaudeAgentOptions` 字段 | Python SDK 0.2.169 |
| 沙箱源码 | 49 个 TS 文件 | `find src -name '*.ts'` | sandbox-runtime v0.0.81 |
| 原生二进制约 | 273 MB | `npm view @anthropic-ai/claude-code-darwin-arm64 dist.unpackedSize` | 单平台解包大小 |

## 4. 开源边界

- `anthropics/claude-code`：`LICENSE.md` 写明 “All rights reserved”，仓库只含插件、示例、变更记录与发布元数据，不含 CLI 源码；2026-10-21 元数据：152,663 stars、语言 TypeScript、大小 32,681 KB。
- `anthropics/claude-agent-sdk-python`：MIT；`src/claude_agent_sdk/*.py` 7 个文件共 4,628 行（`types.py` 2,901 行）；通过子进程驱动 CLI，暴露权限、hooks、subagents、sandbox、session store 等选项。
- `anthropics/sandbox-runtime`：Apache-2.0；macOS 用 Seatbelt、Linux 用 bubblewrap，网络走本地代理白名单；源码含 `decider` 协议与凭据遮蔽模块。
- `anthropics/claude-agent-sdk-typescript`：仓库仅含包装层与类型，真正的 SDK 由 npm 分发。

结论：**可下载、可阅读、可复用的是「骨架」**（SDK 接口、沙箱实现、插件示例）；**不可复用的是「编排」**（主循环、提示词、权限分类器、界面与云端服务）。

## 5. 已知限制

1. Claude Code 核心闭源，页面中关于内部结构的说法只来自公开行为、官方文档与 SDK 暴露的接口，不声称读到源码。
2. 官方文档持续更新，数字以 2026-10-21 抓取为准；正文与版权页都标注了日期与版本。
3. 成本数据来自官方文档的「企业部署平均值」，不是审计口径；页面引用时保留原区间。
4. 版本节奏按 UTC 月份统计；月初月末的分布会受发布窗口影响。
5. 只运行了原生二进制的 `--version` 与 `--help`：本机没有可用的 Anthropic 账号与 API key，未做一次真实会话；页面没有把「未运行」写成「已验证」。

## 6. 本机运行产物

```bash
curl -sL "https://registry.npmjs.org/@anthropic-ai/claude-code-darwin-arm64/-/claude-code-darwin-arm64-2.1.305.tgz" -o cc-arm64.tgz
tar xzf cc-arm64.tgz
./package/claude --version        # 2.1.305 (Claude Code)
./package/claude --help > help.txt
grep -oE "^\s+--[a-z0-9-]+" help.txt | sort -u | wc -l   # 67 个可见旗标
grep -A4 "permission-mode" help.txt                       # 6 个取值
```

产物：Mach-O 64-bit arm64，260 MB；`--permission-mode` 的 choices 为 acceptEdits / auto / bypassPermissions / manual / dontAsk / plan。没有发起会话，也没有读取或写入任何 Claude 配置。

## 7. 页面数字抽检清单

复核时优先抽查这 10 项，全部能在来源里对上：

- [ ] 550 个 npm 版本、首次发布 2025-02-24
- [ ] 46 个工具条目 / 45 个在册
- [ ] 33 个 hook 事件、5 类执行器
- [ ] 6 种权限模式、auto 自 v2.1.283 起为内置默认
- [ ] 9 个运行界面
- [ ] 100 个 checkpoint、30 天快照保留
- [ ] auto memory 200 行 / 25 KB；CLAUDE.md 建议 200 行以内
- [ ] 压缩后重读最多 5 个文件；skill 正文上限 5,000 / 25,000 tokens
- [ ] 49 个 SDK 选项、49 个沙箱 TS 文件
- [ ] $2.5B run-rate（2026-02-12 官方）
