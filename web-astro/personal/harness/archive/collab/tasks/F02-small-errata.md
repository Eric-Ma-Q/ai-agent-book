# F02 · 小勘误：T08-r1 与 T09a 审核遗留的 6 个小问题

**类型**：勘误　**优先级**：中　**预计**：小

## 必读
- `collab/PROTOCOL.md`
- `collab/reviews/T08-mini-harness-lab.review.md` 末尾「T08-r1 复审」
- `collab/reviews/T09a-research-fixups.review.md`

## 清单

| # | 文件 | 问题 | 要求 |
|---|---|---|---|
| 1 | research/09 第八节 E 示例 | 返回体提到 `response_format`、`page_token`，改写后的 schema 里没有 | 把两个参数加进改写后的 schema（带 enum / 描述 / 默认值），并在对照表里对应行注明；保证"定义—返回体—说明"三者一致 |
| 2 | research/10 §3.1 pi 行 | "（如 Tenki）"在所引出处里找不到 | 改为与 pi 官方 containerization.md 一致（Docker、Gondolin micro-VM、NVIDIA OpenShell），出处补该文档 URL 与日期；删掉 08 §3.5 表后那条"提请审核者裁定"的注，改成"已与 10 §3.1 统一" |
| 3 | research/11 §2.1 | 把一篇英文论文称作"中文综述" | 改为准确措辞（英文综述，作者单位如属实可注明） |
| 4 | research/08 参考资料 43（Niharika） | 原文疑已下线 | 删除该条或换成可核实来源；正文引用它的句子相应弱化或改引；参考资料编号如有变化，正文引用编号同步 |
| 5 | labs/mini-harness/harness/subagent.py | `git log --output=x` 被放行并写出文件（`git log/show/diff` 都支持 `--output`） | 拒绝 git 只读子命令的 `--output` / `--output=`；加回归测试（断言被拒且文件没被创建）；README S5 练习题加一条："还能找到哪些'只读命令的写旗标'？这说明了什么？" |
| 6 | labs/mini-harness/README.md 附录 3 | 缺修复后的真模型结果 | 在现有"修复前"表之后追加"修复后（2026-10-05 审核者实跑）"小节，数据见下 |

第 6 条的数据（照抄，不要改数字）：

```text
== big-pickle
| T1 找函数与调用者 | PASS | 4 | 3 | 3341 | 定义与调用者都找到 |
| T2 精确改配置     | PASS | 5 | 4 | 6171 | 只改了 retries |
| T3 统计代码行数   | PASS | 6 | 7 | 8366 | 行数 9，正确 |
| T4 建 TODO 索引   | PASS | 4 | 3 | 4111 | TODO 索引正确 |
| T5 找高频报错     | PASS | 5 | 5 | 6573 | 答案: 'ERROR: disk full on /data' |
通过率: 5/5
== mimo-v2.6-flash-free
| T1 PASS 3/3 2836 | T2 PASS 4/3 3676 | T3 PASS 3/2 2546 行数 9，正确 | T4 PASS 4/4 4803 | T5 PASS 4/4 3944 |
通过率: 5/5
```

## 约束
- 只改上表涉及的文件（research/08、09、10、11，labs/mini-harness/ 下的 subagent.py、tests/、README.md），加上你的报告。
- 不要动任何 html 文件（另一个任务 T09b 正在并行改 html）。
- 任何文件里都不写密钥或密钥位置。

## 交付物
- 修改后的文件
- `collab/reports/F02-small-errata.report.md`：6 条逐条回应（改前 → 改后）；附 `python3 -m unittest discover labs/mini-harness/tests` 真实输出；末行 `STATUS: DONE`
