# superagent-flow：一条消息如何变成工单与结果

`dsh-superagent-prototype` 是 DeepSeek Harness 团队 2026-10-31 公开的研究原型：面向单个 GitHub 仓库的主动式编码 Agent。它监听 GitHub（可选飞书），被授权的人提出工作后，开一张工单，在自己的 Session 与目录里执行，最后回到原对话给出结果，例如一个 PR。

042 解读讲架构，本实验补中间那段：**一条消息进来，经过哪些判定才变成工单；工单怎么派给 Executor；Executor 的报告又怎么回到原对话。** 规则取自原型的 `docs/001-domain.md`、`002-authorization.md`、`003-execution.md`，固定提交 `6337fc8`。

- 纯 Python 标准库，Python 3.9+，零第三方依赖；
- 不联网、不调模型、不启进程、不写盘，重复运行输出逐字节一致；
- 每条记录都标来源：`docs/00n §节名`；原文没给结论的地方标「本实验判断」。

## 快速开始

```bash
cd web-astro/personal/harness/archive/labs/superagent-flow

python3 -m superagent_flow --list                         # 八个场景与各自终态
python3 -m superagent_flow --scenario explicit-request    # 走一遍主链路
python3 -m superagent_flow --scenario policy-change --json
python3 -m superagent_flow --all                          # 每个场景一行摘要

# 测试（98 个）
cd ../.. && python3 -m unittest discover labs/superagent-flow/tests
```

进程退出码只有两种：回放跑完 `0`，参数或场景 id 有问题 `2`。没有模拟状态码，结论都在记录与工单终态里。

## 两条路径

```
Source ── Trigger ──► Intake ──┬─ 订阅扇出 ──► Ticket Inputs（不过 gate）
                              └─ Eval（gate → assessment → Decision）
                                        └─ accept ──► Ticket + Mandate + Assignment
                                                          └─ Report ──► Channel
```

- **Eval** 判断要不要开新工作：先过 gate，再由模型研判。显式请求可直接接单，推断候选必须评估。
- **订阅扇出**只给已有工单送上下文：人的消息到达工单后不再进 Eval；机器人消息照常走 Eval；已结束工单只被人的消息唤醒。

这条分工是「工单和 Session 是什么关系」的答案：Session 是执行容器，工单是授权与状态；一个工单可以换多个 Assignment，Session 与目录跟着工单走。

## 四个对象

| 对象 | 作用 | 关键规则 |
|---|---|---|
| Trigger / Thread | 一条不可变事件，按时间归入线程 | Trigger 幂等；一个 Thread 同时只跑一个 Eval，后来的合并进下一批 |
| Ticket / Mandate | 工单是授权的工作单元，Mandate 记录凭什么做、能做多远 | 只有 Eval 能建工单；重复 accept 同一 Trigger 只建一个；停止只由人发起 |
| Assignment | 工单与一次 Executor 实例的绑定 | `pending → running → ended`，与工单状态独立；重试沿用同一 Session、目录、分支与 PR |
| Report / Channel | 执行器回报进度与结果，渠道把结果写回原对话 | 六种 Report；GitHub 只看 PR，聊天渠道才收最终通知 |

## 工单阶段

按 `003 §Ticket stages` 从上到下取第一条：

| 阶段 | 条件 |
|---|---|
| `person / delivery` | Input 投递失败，等待重试 |
| `person / answer` | 有等待回答的问题 |
| `person / review` | 最新 Report 是 `ready` |
| `person / blocked` / `failed` | 最新 Report 是 `blocked` / `failed`，且此后没有人的消息 |
| `working / queued` | 没有 Assignment，或 Assignment 还是 `pending` |
| `idle` | 最新 Report 是 `waiting`，或 Assignment 已结束 |
| `working` | 其余情况 |

## 八个场景

| id | 情形 | 看什么 | 终态 |
|---|---|---|---|
| `explicit-request` | 名单内点名，改完合并 | 接单、审阅、follow-up 不走 Eval | 1 工单，已结束，1 条回执 |
| `noise-filter` | 自身消息、未登记机器人、名单外的人、CI | 哪些停在 Source、哪些停在 gate | 0 工单 |
| `observe-then-auto` | 同一条规则从 observe 切到 auto | `would accept` 与真正接单的差别 | 1 工单，inferred |
| `duplicate-accept` | 同一个 Trigger 投递两次 | 幂等，不重复扇出与接单 | 1 工单，1 个 Assignment |
| `resume-followup` | 结束后再说话，范围外请求 handback | 恢复不重评；handback 才重评 | 1 工单，恢复一次 |
| `policy-change` | 规则被禁用 | 在办工单收通知、Eval 重排、恢复时撤销 | 1 工单，恢复被撤销 |
| `blocked-recovery` | 缺凭据后阻塞，失败后重试 | 人的一句话把工单拉回 working | 3 个 Assignment |
| `eval-timeout` | Eval 连续超时 | 两次重排，第三次 `unavailable` | 1 个问题，最终接单 |

## 三种 accept mode

| 模式 | 推断候选的处理 |
|---|---|
| `off` | 不入场；显式请求照常 |
| `observe`（默认） | 照常评估，正向结果记 `ignore` 并标 `would accept`，不接单 |
| `auto` | 正向评估且命中至少一条启用规则时接单 |

`observe` 的 `ignore` 不是拒绝：它记录的是「如果开着 auto，这里会接单」。切换前先看记录，是原型推荐的上线路径。

## 六个容易读错的点

1. **扇出不等于授权**：订阅扇出绕过 gate，但不产生 Decision、不扩大 Mandate；工单仍受自己的 Mandate 限制。
2. **重复 accept 只有一个工单**：幂等键是 Trigger，不是消息文本。
3. **恢复不重新评估**：人的消息在未停止的已结束工单上恢复，沿用同一 Mandate；只有重校验失败才撤销。
4. **重校验看依据**：显式直接过；机器人看名单、模式与规则；准入表格看今天还能不能给出同等强度；其他看发送者是否仍在名单。
5. **超时第三次才 `unavailable`**：前两次把 Trigger 重新排队，第三次才留下问题；后来的事件可以重新开始。
6. **GitHub 不重复发结果**：PR 本身就是结果，最终通知只发给聊天渠道；来源关闭时消息丢弃并记账。

## 边界与简化

- **模型是脚本**：评估结果由场景给定，不调用任何模型；本实验看的是判定与状态迁移，不是模型能力。
- **只实现通用 Source**：名单、机器人名单、准入表、监听范围四项；不覆盖飞书专有行为，场景统一用 GitHub。
- **不模拟运行时设施**：数据库、effect 队列、worker slot 上限、30 分钟后台任务、进程重启、面板与 HTTP API 都不在范围内。
- **阶段表照抄**：`person / blocked` 与 `person / failed` 是两行，输出里保留这个区别。
- **一次只演示一条批**：Thread 串行与合批逻辑在代码里，但场景没有并发批量评估。
- **上游会变**：规则集中在 `gate.py`、`evals.py`、`stage.py`；原文更新时改这三处，并同步 README 与需求 044 的实现文档。

## 维护

| 改动 | 改哪里 |
|---|---|
| 准入表、名单、强度 | `superagent_flow/gate.py` |
| 评估结果、observe 行为、超时 | `superagent_flow/evals.py` |
| 工单、Mandate、恢复与重校验 | `superagent_flow/tickets.py` |
| 阶段表 | `superagent_flow/stage.py` |
| 渠道与最终通知 | `superagent_flow/channel.py` |
| 场景与预期终态 | `superagent_flow/scenarios.py`、`tests/test_scenarios.py` |
| 新增文件 | `manifest.json` 条目 → `verify.mjs --update` → `build-library.mjs` |

改完跑：

```bash
cd ../../.. && python3 -m unittest discover labs/superagent-flow/tests
node personal/harness/verify.mjs && node personal/harness/build-library.mjs
```

上游：`github.com/deepseek-ai/dsh-superagent-prototype`（研究原型，非正式产品）。
