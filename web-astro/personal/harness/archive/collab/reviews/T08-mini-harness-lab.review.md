# T08 审核意见 · 最小 harness 实验

**审核日期**：2026-10-05　**结论**：**返工（T08-r1）**——整体质量高，但审核实测发现 2 个真 bug，其中一个正好是 13 分册警告过的"判分器漏洞"。

## 审核者亲自做了什么

| 检查 | 结果 |
|---|---|
| `python3 -m unittest discover labs/mini-harness/tests` | 34/34 通过（Python 3.12.12） |
| 行数约束 | loop.py 168 行（≤300），最大文件 evals.py 247 行（≤400） |
| 密钥扫描（sk-/Bearer/api_key=） | 无；地址、模型、密钥全部读环境变量 |
| 改动范围 | 只有 `labs/` 和报告；仓库根无 `.harness/` 残留 |
| **真模型 eval**（本机 local-llm-gateway，密钥由审核者从本地配置注入环境变量，未写入任何文件） | big-pickle **4/5**、mimo-v2.6-flash-free **4/5**，两个模型**都只挂在 T3** |
| 只读子代理与规则引擎的绕过实测 | 见问题 2、3 |

真模型结果表（2026-10-05 审核者实跑，判分器修复前）：

```text
== big-pickle
| T1 找函数与调用者 | PASS | 4 | 3 | 3399 | 定义与两个调用者都找到 |
| T2 精确改配置     | PASS | 4 | 4 | 5324 | 只改了 retries |
| T3 统计代码行数   | FAIL | 5 | 5 | 6416 | 行数 9（应为 8） |
| T4 建 TODO 索引   | PASS | 3 | 2 | 3229 | TODO 索引正确 |
| T5 找高频报错     | PASS | 4 | 4 | 4961 | 答案: 'ERROR: disk full on /data' |
== mimo-v2.6-flash-free
| T1 PASS 3/2 | T2 PASS 4/3 | T3 FAIL 4/3 行数 9（应为 8） | T4 PASS 5/6 | T5 PASS 4/4 |
```

## 必须修（阻塞）

### 问题 1：T3 判分器的期望值是错的，假模型把错误掩盖了
- fixture：`a.py` 3 行 + `b.py` 6 行（`def f / return 1 / 空 / 空 / def g / return 2`）= **9 行**。`wc -l` 实测 9。
- 判分器写死 `n == 8`，FakeModel 脚本也写死 `"8"`——**参考解是抄的答案，不是算出来的**，所以假模型 5/5 只证明"脚本和判分器错得一致"。
- 两个真模型都答对了 9，却被判 FAIL。这正是 13 §4.2"判分器本身是攻击面 / 判分 bug"的活例子（Anthropic 修判分 bug 后 42%→95% 那一段）。
- **修法**：
  1. 期望值在判分时**从 fixture 现算**（例如对 `src/*.py` 逐个数行），不写死数字；T1/T4/T5 同样改为能现算的就现算。
  2. 新增两道**判分器自检闸门**（13 §4.6 / §八的做法），作为测试：
     - **no-op 必不过**：一个什么都不做、直接回"已完成"的假模型跑全部 5 题，必须 5/5 FAIL；
     - **独立参考解必过**：参考答案由测试里**另写的纯 Python** 从 fixture 算出（不能复用 FakeModel 脚本里的字面量），写进工作区后判分器必须 5/5 PASS。
  3. FakeModel 脚本里的答案也改为由 fixture 计算得出（或至少与判分器共用同一个计算函数），并在注释里写清"脚本答案不是证据"。

### 问题 2：只读子代理可以删文件、写文件
审核实测（`readonly_bash_execute` 直接调用）：

| 命令 | 结果 |
|---|---|
| `find . -name victim.txt -delete` | 放行，**文件被删** |
| `find . -name in.txt -exec rm {} +` | 放行（`+` 不在元字符黑名单），**文件被删** |
| `sort -o out.txt in.txt` | 放行，**新建了文件** |
| `git branch evil` | 放行（在有提交的仓库里会**新建分支**） |

模块文档和 S5 测试都声称"只读"，这与事实不符。
- **修法**：白名单按"命令 + 参数"判断，而不只看首词：`find` 拒 `-delete/-exec/-execdir/-ok/-okdir/-fprint/-fprint0/-fprintf/-fls`；`sort` 拒 `-o/--output`；`git branch` 只放行无参数或 `--list/-a/-r/-v/-vv`；其他白名单命令逐个过一遍有没有写文件的旗标（如 `diff --output`、`uniq` 的第二个位置参数是输出文件）。
- 每条绕过加一个回归测试，断言文件没被删 / 没被建。
- README S5 和"设计取舍"节把这件事写成教学点：**命令名白名单不够，旗标也是攻击面**；首词白名单 → 参数级检查 → 进程级沙箱是三个强度档，对照 10 分册。

## 应该修

### 问题 3：rules.example.json 的 rm 正则太容易绕过
实测 `rm -R x`、`rm --recursive x`、`rm -f -r x`、`find . -delete` 均为 allow。
- 加强示例正则，至少覆盖 `-R`、`--recursive`、旗标分开写；并加测试。
- 解释器绕过（`python3 -c "shutil.rmtree(...)"`）不必拦，但在 S2 练习题里列出来，让读者体会"形态匹配的上限"。

### 问题 4：有真实 usage 时 completion token 被重复计算
`loop.py` 中：有 `usage` 时已加上 `prompt_tokens + completion_tokens`，随后又无条件 `tokens += estimate_tokens([amsg])`。改为：有 usage 用 usage，没有才估算；加一个带 usage 的测试（可让 FakeModel 支持返回 usage）。

### 问题 5：README 附录 3 换成真实结果
把附录 3 的 401 记录换成本审核里的真模型结果表，注明"2026-10-05 审核者实跑、判分器修复前"，并说明 T3 FAIL 暴露了判分器 bug。修复后的复跑由审核者在 r1 验收时补。**不要在任何文件里写密钥或密钥的位置。**

## 可选

- S3：原始用户任务目前只活在摘要里。常见做法是**第一条 user 消息原样保留**，不进压缩。可改代码，也可只写成 S3 练习题。
- S6：`run_evals` 共用一个 FakeModel 时，上一题没用完的脚本会漏到下一题。每题新建假模型或在每题开始前清空脚本。

## 做得好的地方（保留）
- 压缩边界不切开 assistant(tool_calls) 与 tool 消息，并有专门测试——这是真坑。
- `ask` 的无人值守语义、落盘与截断的复合顺序都写成了显式取舍，有正反两面。
- 自己发现并修掉了 S4 测试污染仓库根目录的问题，还加了防回归断言。
- 模型层用标准库 mock server 测了请求格式和 401 路径。
- 报告诚实地写明真模型没跑通及原因。

## 给教学的意义
这次两个 bug 都应该进 README，作为"动手才会遇到"的案例：
1. **假模型全过 ≠ 判分器正确**：脚本答案和判分器同源时，测试只验证一致性。必须有独立参考解与 no-op 闸门。
2. **"只读"要靠参数级检查乃至沙箱保证**，首词白名单挡不住 `find -delete`。

---

# T08-r1 复审（2026-10-05）　**结论：通过**

| 检查 | 结果 |
|---|---|
| 测试 | 46/46 通过（审核者实跑） |
| 行数 | loop.py 171、evals.py 332，均在限额内 |
| 原 4 条只读绕过 + 审核者追加的 `sort --output=`、`find -fprint`、`diff --output=`、`uniq a b`、`git -C . branch x`、`git branch -m`、`find -execdir` | 全部被拒，文件和分支状态不变 |
| rm 正则变体（`-R`/`--recursive`/`-f -r`/`-fr`/`rm x -r`/`/bin/rm -rf`） | 全部 deny；`rm -f x` 仍 allow（正确） |
| 闸门测试 | no-op 5/5 FAIL；参考解在测试内独立实现（不 import evals.py 的计算函数），5/5 PASS |
| **真模型复跑**（修复后） | big-pickle **5/5**、mimo-v2.6-flash-free **5/5**，T3"行数 9，正确" |
| README | 新增「审核发现的两个真 bug」一节；附录 3 已换成修复前的真模型表 |

## 遗留（不阻塞，进 F02）
- **新绕过**：`git log --output=o6` 被放行并写出了文件（`git log/show/diff` 都支持 `--output`）。这恰好说明"参数级检查也是打地鼠"，正好印证 README 的三档论述。F02 修掉并加测试，README 练习题加一条。
- README 附录 3 需要补"修复后 5/5"结果表（F02 一并做，数据见上）。
