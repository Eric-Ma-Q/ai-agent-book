# T08-r1 完成报告（返工）

## 交付物

- `labs/mini-harness/`（原地修订）：
  - `harness/evals.py` — 期望值全部改为 fixture 现算；FakeModel 脚本答案与判分器共用计算函数；每题独立假模型防脚本泄漏（247→332 行，≤400 上限）
  - `harness/subagent.py` — 只读 bash 升级为三层闸：元字符黑名单 → 首词白名单 → 参数级旗标/位置检查
  - `harness/loop.py` — 修复真实 usage 时 completion token 被重复估算的 bug（168→171 行，≤300 上限）
  - `harness/compaction.py` — 首条 user 消息（原始任务）常驻不进压缩
  - `rules.example.json` — rm 正则覆盖 `-R/--recursive/旗标分开写`，新增 find 写旗标规则
  - `tests/` — 34→**46 个测试**：新增判分器双闸门、脚本防泄漏、4+3 条只读绕过回归、rm 正则变体、usage 记账；S3 两个测试适配首条保留语义
  - `README.md` — 新增「审核发现的两个真 bug」一节（现象→为什么没发现→修法→分册章节），S2/S3/S5/S6/设计取舍同步，附录 3 换成审核者真模型结果表
- `collab/reports/T08-r1-mini-harness-lab.report.md` — 本报告

## 逐条回应审核意见

### 必须修

**问题 1（T3 判分器期望值错，假模型掩盖）— 已修，三个修法全做**
- 期望值现算：T3 判分时对 `src/*.py` 现数行数（`evals.py::_calc_py_lines`），T1 现算定义文件与调用者集合（`_calc_callers`）、T4 现算 TODO 索引（`_calc_todo_index`）、T5 现算高频 ERROR 行（`_calc_top_error`）、T2 期望终态由 fixture 常量现算；计算函数是唯一真相源，改 fixture 期望值自动跟着变。
- FakeModel 脚本答案改由同一组函数从 fixture 算出，注释写明"脚本答案不是证据"。
- **两道闸门已作为测试**（`tests/test_s6_evals.py::TestCheckerGates`）：
  `test_noop_model_fails_all_five`（空跑假模型 5/5 FAIL）、
  `test_independent_reference_solution_passes_all_five`（测试内另写的纯 Python
  参考解从 fixture 现算写入工作区，与 evals.py 实现零共享，5/5 PASS）。
- 另加 `test_scripts_do_not_leak_across_cases`（见可选项 2）。

**问题 2（只读子代理可删/写文件）— 已修**
- `subagent.py::_readonly_violation` 参数级检查：`find` 拒 `-delete/-exec/-execdir/-ok/-okdir/-fprint/-fprint0/-fprintf/-fls`；`sort` 拒 `-o/--output`（含 `--output=x` 形式）；`uniq` 拒第二个位置参数；`git branch` 只放行无参数与 `--list/-a/-r/-v/-vv/--all/--remotes`；`diff` 拒 `--output`。
- **审核 4 条绕过命令每条一个回归测试**（`TestReadonlyParameterChecks`），断言被拒且文件状态不变：
  `test_find_delete_blocked`、`test_find_exec_blocked`、`test_sort_output_flag_blocked`、`test_git_branch_creation_blocked`；
  另加 `test_sort_output_long_form_blocked`、`test_uniq_second_positional_blocked`、`test_git_branch_list_flags_allowed`（看分支仍放行）、
  正面用例 `sort in.txt` 仍可用。审核者的 4 条原始命令另在 r1 会话手工复验：全部 REJECT，victim.txt/in.txt 仍在、out.txt 未创建。
- README S5 节与「设计取舍」节改写为"首词白名单 → 参数级检查 → 进程级沙箱"三档教学点（对照 10 分册 §3.4/§3.5）。

### 应该修

**问题 3（rules.example.json rm 正则易绕）— 已修**：正则改为
`\brm\b[^|;&]*\s-{1,2}[a-zA-Z]*[rR][a-zA-Z]*`，覆盖 `-r/-R/-fr/--recursive/旗标分开写`；
新增 `find` 写旗标 deny 规则；`test_rules_example_blocks_rm_variants_and_find_write`
覆盖 9 条必须 deny（含审核实测的 `rm -R x`、`rm --recursive x`、`rm -f -r x`、`find . -delete`）
与 5 条必须 allow（`rm notes.txt`、`npm test` 等）。解释器绕过（`python3 -c "shutil.rmtree(...)"`）
按审核建议写进 S2 练习题 3，标明"形态匹配的上限"。

**问题 4（usage 重复计算）— 已修**：`loop.py` 有真实 usage 时只累计
`prompt_tokens + completion_tokens`，无 usage 才退回字符/4 估算；
`test_real_usage_tokens_not_double_counted` 用带 usage 的 ModelResponse 断言
`token_estimate == 120`（100+20，分毫不差）。

**问题 5（README 附录 3）— 已换**：附录 3 现为审核者 2026-10-05 的真模型结果表
（big-pickle 4/5、mimo-v2.6-flash-free 4/5，均只挂 T3），注明"判分器修复前"、
说明 T3 FAIL 暴露的是判分器 bug 而非模型答错；修复后复跑由审核者在 r1 验收时执行。
未在任何文件写密钥或密钥存放位置（复跑命令只有 `<key>` 占位符）。

### 可选（两条都做了）

- **S3 首条 user 消息常驻**：`compact_messages` 保留第一条 user 消息原样不进压缩
  （摘要后紧跟的是最近窗口）；`if not old` 保护避免空压缩消耗模型调用。
  S3 两个测试适配（boundary 测试加长历史、prompt 文件测试改断言 goal 不进压缩但原样保留），
  `test_triggers_and_keeps_system_prompt` 新增"原始任务仍在上下文"断言。
- **S6 脚本泄漏**：`run_evals` 每题用独立 FakeModel——调用方预置了脚本就按题原样重放
  （no-op 闸门依赖此语义），否则用 case 自带脚本；`test_scripts_do_not_leak_across_cases`
  验证跑题脚本不会让其他题意外通过。

## 摘要

1. 两个阻塞 bug 的共同教训是"测试只验证了它自己"：判分器与脚本答案同源、
   白名单只看命令首词——都通过了全部 34 个初版测试，被真模型 eval 和人肉绕过测试当场戳穿。
2. 判分器期望值现算 + 双闸门（no-op 必不过 / 独立参考解必过）落地为 3 个测试；
   参考 T3 期望 9 由 fixture 现算，假模型表已显示"行数 9，正确"。
3. 只读子代理三层闸落地，审核 4 条绕过 + 3 条变体全部有回归测试且手工复验通过。
4. rules.example.json 的 rm/find 规则覆盖审核全部绕过样本，9 deny / 5 allow 有测试。
5. 46 个测试全绿；loop.py 171 行、最大文件 evals.py 332 行，均在限额内。

## 方法与规模

- 返工无外部检索；输入为审核意见（含实测证据）+ 返工单 + 协议第 6 节。
- 迭代：修代码 5 个文件 → 测试 2 轮（T3/T4 setup 漏建父目录、T4 参考解用绝对路径 2 处小错）→ 全绿。
- 审核者绕过命令在 r1 会话用原命令手工复验（输出见上），测试之外多一道确认。

## 自检结果（对照协议第 5 节与返工验收标准）

- **全部测试通过**：`python3 -m unittest discover labs/mini-harness/tests` →
  `Ran 46 tests in 0.748s OK`（2026-10-05 实跑，Python 3.12.12）。
- **4 条绕过命令每条有测试**：见上，均断言被拒 + 文件状态不变。
- **双闸门存在且通过**：`TestCheckerGates` 3 个测试 ok。
- **审核者真模型复跑 T3 不再因判分器失败**：期望值现算（fixture 即 9 行），
  答案 9 将判 PASS；双闸门保证判分器与 fixture 一致。
- 关键事实出处：审核意见引用的分册结论（13 §4.2 判分器漏洞、10 §3.4/§3.5）已 grep 原文核实；
  README 新增章节的分册链接均指向真实文件与真实章节标题。
- 改动范围：`git status` 仅 `labs/`（本任务）与审核者维护的 collab 文件（BOARD/ROADMAP/review/返工单/T09a，非本会话所改）。
- 未写任何密钥或密钥位置：`grep sk-/Bearer` 为 0。

## 与已有内容的关系

- 13 §4.2（判分器漏洞/判分器是攻击面）、13 §4.6 与 §八（自建 eval 闸门）是 Bug 1 修法的直接出处；
  10 §3.4（沙箱失效模式）、10 §3.5（形态匹配上限）是 Bug 2 三档强度表述的出处——均已 grep 确认原文。
- 初版报告（T08-mini-harness-lab.report.md）保持原样不回改；本报告按协议第 6 节逐条回应。

## 待决问题 / 未完成项

1. 修复后的真模型 eval 复跑需审核者带 key 执行（命令在 README 附录 3）；预期两个模型 5/5。
2. 参数级检查仍是形态级防御的加强而非安全边界：`sort -T`（临时目录）、未来新旗标、
   解释器间接执行均在 README"设计取舍"里明示为残余风险，彻底解法是进程级沙箱。
3. T1 判分对 answer.md 只断言"包含定义文件与全部调用者"，不校验行格式——规则/断言档
   的固有取舍（13 §4.2"过硬"风险），保持宽松以减少真模型误杀。
4. `uniq -s 2 in.txt` 这类"带值的短旗标"会被保守判为写操作（误杀），README 未展开，
   在 `_readonly_violation` 注释与"设计取舍"中定性为"宁可误杀"。

STATUS: DONE
