# superagent-setup：亲手走一遍 dsh-superagent 的部署流程

`dsh-superagent-prototype` 是 DeepSeek Harness 团队 2026-10-31 公开的研究原型：一个面向单个 GitHub 仓库的主动式编码 Agent，以 DSH 插件包形态发布。它的 `SETUP.md` 不是安装脚本，而是写给 coding agent 读的交互流程：探针 → 一问一答 → 一次性计划 → 执行 → 校验。README 自己也写明「研究原型，非官方产品」。

真跑一遍要装 DSH、开专用 GitHub 账号、配模型接口，还要让一个 `danger-full-access` 的 Agent 在你机器上读写。所以这个实验换一种做法：**把流程实现成一台离线状态机**，用假机器、假账号、假配置走完五个阶段，看的是「哪些能自动、哪些只能人工、哪条配置会被拒、拒了怎么修」。

- 纯 Python 标准库，Python 3.8+，零第三方依赖；
- 不联网、不调模型、不启进程、不写盘，重复运行输出逐字节一致；
- 每条判定都标来源：`SETUP.md §n` 或 `docs/006-deployment.md §n`；原文没给结论的地方标「本实验判断」。

## 快速开始

```bash
cd web-astro/personal/harness/archive/labs/superagent-setup

python3 -m superagent_setup --list              # 六个场景与各自的状态码
python3 -m superagent_setup --scenario clean    # 走一遍完整流程
python3 -m superagent_setup --scenario bad-config --json   # 结构化记录
python3 -m superagent_setup --scenario clean --answers my.json

# 测试（77 个）
cd .. && cd .. && python3 -m unittest discover labs/superagent-setup/tests
```

进程退出码只有两种：走查跑完即 `0`，参数或答案文件有问题 `2`。**模拟状态码单独输出**（`status=0/1/2/3`），免得把假机器的结论当成命令本身的成败。

## 五个阶段

| 阶段 | 做什么 | 依据 |
|---|---|---|
| 探针 | 判 Node / pnpm / git / tmux / python3 / gh / dsh，缺的变成计划里的安装项，不当提问 | `SETUP.md §1`、`docs/006-deployment.md §2–§3` |
| 一问一答 | 九问固定顺序，一次一问，每问带推荐值；只接 GitHub 时跳过两个飞书问题 | `SETUP.md §2` |
| 计划 | 五段：要装的、账号与 CLI、要保存的设置、只能人工做的、默认值 | `SETUP.md §3` |
| 执行 | 按 github → feishu → policy → executor → prompts 提交配置；首拒即停，后面记 `skipped` | `SETUP.md §4`、`docs/006-deployment.md §10` |
| 校验 | 映射 `status` 退出码，正常时给出交接三项 | `SETUP.md §5`、`docs/006-deployment.md §5` |

## 三类别前置，分别卡在谁身上

| 类别 | 内容 | 谁来完成 |
|---|---|---|
| 宿主与系统依赖 | Node 22.19+ 或 24+、pnpm、git 2.32+、tmux、Python 3.8+、GitHub CLI 2.48+、DSH 满足 `^0.2.1-alpha.2` | 能自动装，但实验里只把它们写成计划项 |
| 身份 | 专用 GitHub 账号（不是 GitHub App，它要读通知）+ 仓库写权限 + `gh-agent` 包装器隔离 `GH_CONFIG_DIR` | **只能人工**：建账号、接受邀请、`auth login` |
| 机器配置 | 绝对路径 `stateDir`（装完不能改）、端口 `3082`、profile `superagent`、sqlite 迁移前备份 | 半自动：能通过 Management API 存，但值要人定 |

这三类就是「不能直接部署」的答案：第二类永远需要人，第三类的值一旦定下就不能改。

## 六个场景

| id | 情形 | 状态码 | 看什么 |
|---|---|---|---|
| `clean` | 干净机器，只接 GitHub | 0 | 五段依次保存，交接三项 |
| `missing-tools` | 缺 tmux、pnpm、DSH | 1 | 缺失项进计划而不是进提问 |
| `existing-profile` | 已有 profile | 0 | 走升级路径，计划里没有「创建 profile」 |
| `bad-config` | `stateDir` 写成相对路径 | 3 | 首拒即停，后四段全 `skipped` |
| `thin-policy` | 允许名单为空 | 3 | 没有允许账号就永远不会有工单 |
| `feishu-no-lark` | 要接飞书但没装 `lark-cli` | 2 | 只关飞书来源，GitHub 五段照常 |

## 六条拒绝，与在哪能看到

| 拒绝 | 原文 | 场景 | 单测 |
|---|---|---|---|
| `stateDir` 非绝对路径 | `006 §10` | `bad-config` | `test_validation` |
| 机器配置出现未知键 | `006 §10` | — | `test_validation` |
| 允许名单为空 | `006 §10` | `thin-policy` | `test_validation` |
| 非 loopback 或缺 `x-orchestrator-request: 1` | `006 §4` | — | `test_validation` |
| `worker-bin` / `worker-gitconfig` 有外来文件 | `006 §6` | — | `test_probe` |
| `auto-merge` 但只有一个 CLI 账号 | `SETUP §2` | — | `test_validation` |

每条拒绝文案都带「修法：」，因为原型的 setup 流程就是让 Agent 读响应体、自己修、再继续，只把修不了的交给人。

单测里想单看某一条：

```bash
python3 -m unittest discover labs/superagent-setup/tests -k validation -v
```

## 状态码

| 码 | 含义 | 本实验里的触发条件 |
|---|---|---|
| 0 | 正常 | 探针全过、五段配置都保存成功 |
| 1 | 未运行 | 缺 dsh / tmux / pnpm 等前置，进程根本没起来 |
| 2 | 部分错误（重启不会修好） | 飞书来源降级、`worker-bin` 外来文件、数据库版本更高 |
| 3 | 待配置（重启不会修好） | 任一配置段被拒，或有只能人工完成的前置没做 |

## 边界与简化

- **版本比较只覆盖用到的形状**：`major.minor.patch` + prerelease、下界比较、caret（`^0.2.1-alpha.2` 即 `>= 0.2.1-alpha.2` 且 `< 0.3.0`）。`~`、`||`、`*`、`latest` 一概不支持。
- **Node 只认原文写的两个区间**：`22.19+` 与 `24+`，所以 `23.x` 不通过；这是照原文，不是我们的偏好。
- **一次只报一个错**：真实宿主返回一个 400，实验也停在一个拒绝上，后续记 `skipped`；想看六条拒绝请跑单测。
- **实验不等于真机**：真机上还有 `danger-full-access` 的越权风险、`PATH` 被插件改写、Session 预设丢失等运行时问题，这里不模拟。要真跑，按 `SETUP.md` 让 coding agent 带着做，并优先考虑独立系统账号。
- **上游会变**：规则取自 2026-10-31 的原型提交与 `docs/006-deployment.md`；规则集中在 `superagent_setup/versions.py` 与 `superagent_setup/validation.py`，原文更新时改这两处即可。

## 维护

| 改动 | 改哪里 |
|---|---|
| 版本门槛或 dsh 范围 | `superagent_setup/versions.py` 顶部常量 |
| 拒绝规则与修法文案 | `superagent_setup/validation.py` |
| 提问顺序与跳过条件 | `superagent_setup/questions.py` |
| 计划五段的内容 | `superagent_setup/plan.py` |
| 场景与预期状态码 | `superagent_setup/scenarios.py`、`tests/test_scenarios.py` |
| 新增文件 | `manifest.json` 条目 → `verify.mjs --update` → `build-library.mjs` |

改完跑：

```bash
python3 -m unittest discover labs/superagent-setup/tests
cd ../../.. && node personal/harness/verify.mjs && node personal/harness/build-library.mjs
```
