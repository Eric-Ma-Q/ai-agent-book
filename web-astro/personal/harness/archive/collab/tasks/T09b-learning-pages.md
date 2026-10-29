# T09b · 学习页整合 + 题库扩充

**模块**：M9　**类型**：页面制作 + 出题　**优先级**：高

## 目标
把 research/08–14 七份分册和 labs/mini-harness 实验，做成学习者能读的页面，并把考试题库扩充到覆盖这些新内容。读者读完新页面、做完新题，应能独立设计一个最小编码 harness 并说清每个取舍。

## 必读
- `collab/PROTOCOL.md`
- research/08–14 全部（以当前版本为准）
- `labs/mini-harness/README.md`（尤其「审核发现的两个真 bug」）
- `collab/reviews/` 下 T01–T09a 的审核意见中所有写着"学习页 / T09"的条目（下面"口径红线"已汇总）
- 现有页面：`index.html`、`ai-harness-explained.html`（版式参考）、`harness-exam.html`（题库数据格式）

## 交付物 1：新页面 `harness-engineering.html`
一页长文，标题「Harness 工程：从拆解到动手」，按下面 8 节组织。每节结构固定：**一句话结论 → 核心内容（表格/图示优先）→ 对 harness 设计的启示 → 「延伸阅读」链到对应分册的具体章节**。

1. 横评拆解（08）：主流 harness 的主循环、上下文管理、子代理的对比；§4.4 最佳组合清单；T01-r1 新增的"工具格式靠形式语法约束而不是靠提示词说明"重点呈现
2. 工具层（09）：工具设计审查清单；**MCP 六原语对照表（含 2026-07-28 弃用 sampling/roots）**；**"坏工具 → 好工具"前后对比**（这是本页最重要的教学素材，做成左右对照或可切换的两栏）
3. 安全（10）：权限档位与沙箱对比表（以 10 §3.1 为准）；hooks 与策略即代码；"首词白名单 → 参数级检查 → 进程级沙箱"三档，用 labs 的 `find -delete` 案例举例
4. 记忆（11）：文件型记忆证据链、写入闸门、记忆投毒
5. 多智能体（12）：什么时候该拆、什么时候不该拆（正反受控实验）；子代理三段式契约；MAST 失败分类
6. 评测（13）：基准的四个坑；四档判分器；5 人团队第一周最小 eval；**labs 的判分器 bug 作为案例**（假模型 5/5 掩盖、真模型暴露、两道闸门）
7. 成本与可观测性（14）：缓存价格表；10 条缓存友好规则；§2.3 成本示例（用 T09a 重算后的数字）；trace 最小字段表
8. 动手实验（labs）：6 个阶段各一张卡片（解决什么问题 / 核心代码在哪个文件 / 练习题），并给出运行命令

### 页面技术要求
- 单文件、**完全自包含**（与现有页面一致，不引任何外部脚本、字体、CSS），文件 ≤ 250KB
- 视觉风格、配色、字体与 `ai-harness-explained.html` 保持一致（复用它的 CSS 变量与组件写法）；支持系统深色模式
- 顶部有目录，可跳到 8 节；手机宽度（375px）下不出现横向滚动，宽表格放进可横向滚动的容器
- 所有数字、引语保留分册里的出处标注（可做成悬浮或脚注），不新增分册里没有的事实

## 交付物 2：更新 `index.html`
- 加一张新卡片指向 `harness-engineering.html`，写法与现有卡片一致
- 现有卡片不删不改顺序；新卡片放在 `ai-harness-flow.html` 卡片之后

## 交付物 3：扩充 `harness-exam.html` 题库
- 在现有 58 题基础上**新增 ≥ 30 题**，严格沿用现有 `Q` 数组的数据格式（id、part、type、topic、level、pts、stem、explain、src 等字段）和现有题型
- 新增 topic 取值：`teardown`、`mcp`、`security`、`memory`、`multiagent`、`evals`、`economics`、`lab`；每个 topic ≥ 3 题
- 7 个 part（A–G）都要有新题；`level` 覆盖 remember 到 create 六档，其中 analyze / evaluate / create 合计 ≥ 10 题
- 每题的 `src` 指向新页面的对应锚点（`harness-engineering.html#...`）
- 必出的题：
  - 判分器 bug 案例（为什么假模型全过不能证明判分器正确；两道闸门分别防什么）
  - `find -delete` 绕过（为什么命令名白名单不够）
  - 坏工具改写（给一个坏工具定义，多选找出违背清单的地方，放 E 部分）
  - 缓存友好规则（哪些做法会破坏前缀缓存）
  - MCP 弃用 sampling/roots 后的迁移路径
- 新题编号接在各 part 现有编号之后，不改动已有题目
- 如果页面里有题目数量、分值、topic 列表等统计或筛选，同步更新

## 口径红线（来自各审核意见，页面和题目都必须遵守）
- MAST 失败比例 42/37/21 只能写"约"并标二手，不能出成精确数字的题
- "辩论趋同于多数派错误"是推断，不能当结论呈现或出题
- 感知延迟的两个数字（约 4 秒阈值、流式改善 7 倍）只有二手来源，不进页面结论、不出题
- OpenAI 弃用 SWE-bench Verified 只用标题级口径，不写审计细节
- 14 §2.3 成本示例用重算后的数字（cache write 0.15M，合计约 $1.72，无缓存约 6.2 倍）
- pi 的沙箱建议写"官方文档点名 Docker、Gondolin micro-VM、NVIDIA OpenShell"，不写 Tenki
- 09 E 示例的 schema 正由另一个任务 F02 补 `response_format`、`page_token` 两个参数：页面上的改写后 schema 请直接包含这两个参数（`response_format` 枚举 concise/detailed，默认 concise；`page_token` 字符串，取上一页返回的 cursor）

## 约束
- 只改 `harness-engineering.html`（新建）、`index.html`、`harness-exam.html`，加上你的报告
- 不改 research/ 和 labs/（F02 正在并行改）
- 改完在浏览器里打开三个页面自查：页面能渲染、目录跳转可用、考试页能正常出题判分、浏览器控制台无报错

## 交付物 4：报告
`collab/reports/T09b-learning-pages.report.md`：
- 新页面 8 节各自用了哪些分册章节
- 新增题目清单（id、topic、level、一句话考点）
- 口径红线逐条自查
- 自查方式与结果（打开了哪些页面、控制台是否有报错、手机宽度是否横向滚动）
- 末行 `STATUS: DONE`
