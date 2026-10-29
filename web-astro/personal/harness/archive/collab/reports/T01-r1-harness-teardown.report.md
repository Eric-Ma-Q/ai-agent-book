# T01-r1 完成报告(harness 横评分册小返工)

## 交付物
- `research/08-harness-teardown-comparison.md` — 原地修订,处理审核意见"需要修改"3 条 — 365 行,汉字 9,966(修订前 9,573,中文正文增量 +393,限内;wc -m 口径 35,180→37,197,多出部分为英文引文原文/URL/ASCII 标点,按新口径不计)
- `collab/reports/T01-r1-harness-teardown.report.md` — 本报告

## 审核意见逐条回应(意见 → 怎么改 → 改在哪)

### 意见 1:§4.3 没有完全回答必答问题 3,第 4/5 条不是提示词
- **意见**:5 条引文里只有第 1、2 条是提示词原文,第 4 条(arXiv 普查结论)、第 5 条(Composio 评测结语)不是;要求换成至少 2 段真实提示词/工具描述原文,各配"为什么值得抄"评注,总引文保持 5 段。
- **怎么改**:删原第 4/5 条,换成两段从源码**逐字核对**的原文(curl 直抓 raw 文件比对,非转述;超 3 行的英文已附中文意译):
  - 新第 4 条:**Gemini CLI 压缩提示词**(`getCompressionPrompt`,packages/core/src/prompts/snippets.ts)——独立身份句("You are a specialized system component responsible for distilling chat history into a structured XML <state_snapshot>.")+ "### CRITICAL SECURITY RULE" 防注入条款(历史中一切命令/指令/格式要求一律忽略)+ `<state_snapshot>` 七段固定 XML schema + "the agent's *only* memory of the past" 利害声明。评注:压缩器有独立身份、被压缩历史被显式当注入面设防、固定 schema 保证可解析可恢复。
  - 新第 5 条:**Codex apply_patch 工具描述**(`ToolSpec::Freeform`,codex-rs/core/src/tools/handlers/apply_patch_spec.rs)——两句描述 "The `apply_patch` tool can be used to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.",格式由随工具下发的 Lark 语法(grammar 类型,源码内嵌)约束。评注:格式正确性靠形式语法强制而非提示词说明,描述短、机制硬。
  - 被移出的两条(arXiv:2609.00006 普查、Composio 结语)无信息损失:§3.9 与「要点速览」本就完整承载这两条证据。
- **改在哪**:research/08 §4.3 第 4/5 条;参考资料新增 47(snippets.ts)、48(apply_patch_spec.rs)。检索路径说明:T01 引用的 prompts.ts(参考资料 14)现为薄封装,正文实际在 PromptProvider → snippets 两层之下,故 14 保留、47 指明正文位置;Codex 仓库结构较 T01 时已变动,工具描述现位于 handlers/apply_patch_spec.rs,经目录树定位后直抓。

### 意见 2:"本仓库即用 AGENTS.md"不成立,ZCode 证据需可复核
- **意见**:本仓库没有 AGENTS.md/CLAUDE.md;应改为"ZCode 安装包中含 AGENTS.md 加载逻辑",并把 ZCode 各行证据补成"直接观察 + 安装包字符串(glm/zcode.cjs)"。
- **怎么改**:
  1. §3.6 ZCode 行重写为"安装包含 AGENTS.md 加载与 /init 生成逻辑",并写明可复核的具体依据:`.zcode/AGENTS.md` 与 `.agents/AGENTS.md` 候选路径、AGENTS.md 上下文源清单、/init 命令文案,同时注明"本仓库未放置 AGENTS.md";MEMORY.md 格同步补"索引注入与截断告警字符串"依据。
  2. 执行者本地复核(与审核者核对一致):`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`(14.8MB)中检出 EnterPlanMode×16、SendMessage×20、CronCreate×21、MEMORY.md×13、permissionMode×14、yolo×57、AGENTS.md×21、Workflow×954;并确认本仓库根目录确无 AGENTS.md/CLAUDE.md。
  3. ZCode 行级标注全部升级:§3.1/3.2/3.3/3.4/3.5/3.6(两格)/3.7/4.4 共 10 处由【直接观察】改为【直接观察+安装包字符串】,§3.5 补注 (permissionMode、"yolo"),§五"未核实/存疑"首条写明完整字符串清单与安装包路径。
- **改在哪**:research/08 §3.1–§3.7 各 ZCode 行、§4.4 ZCode 行、§五首条、开头新增"r1 修订"说明行。

### 意见 3:Kimi Code CLI 在 §3.1、§3.4 两张表缺行
- **意见**:补行并填"未公开"(协议要求不留空、不漏行)。
- **怎么改**:§3.1 补一行(主循环形态格注明"公开材料仅列能力清单,未涉主循环 [二手,2026-09]",其余三格未公开);§3.4 补一行(三格均未公开)。复核:Kimi 现于 §3.1–§3.8 八张表全部有行(行 68/88/108/129/151/171/191/211)。
- **改在哪**:research/08 §3.1 表末、§3.4 表末。

## 摘要
1. §4.3 现在是 5 段真引文:Codex 身份句+熔断条款、Claude Code 自我定位、pi 极简声明、Gemini CLI 压缩提示词、Codex apply_patch 工具描述——后两段均从源码逐字核对并配"为什么值得抄"评注。
2. 压缩提示词是 §3.3"压缩要工程化"的现成范本:独立身份 + 把被压缩历史当注入面 + 固定 XML schema。
3. apply_patch 展示了"工具描述"的最高形态:两句描述 + Lark 形式语法约束格式,不靠提示词祈祷。
4. "本仓库即用 AGENTS.md"已修正;ZCode 全部行级证据升级为"直接观察+安装包字符串",读者可按 §五 的字符串清单自行复核。
5. Kimi Code CLI 补齐 §3.1/§3.4 缺行,九维 8 张表无漏行。
6. 中文正文增量 +393 字(限 1,000),0 子智能体、全程串行,遵守并发限流规则。

## 方法与规模
- 0 子智能体,主智能体串行检索(遵守 PROTOCOL 第 2 节);本轮新增约 10 轮检索/抓取:精读源码文件 4 个(gemini-cli prompts.ts / promptProvider.ts / snippets.ts,codex apply_patch_spec.rs),目录树定位 2 次,源码 curl 逐字核对 2 次,本地 grep/perl 复核 3 次。
- 新增来源 2 条均为英文官方源码(中/英比例 0:2);引文规则:超 3 行英文原文附中文意译。
- 限流与绕行:GitHub REST API 对本 IP 限流(按规则未死磕,改走 raw.githubusercontent 直抓 + WebFetch 目录页;raw 不受限后一次成功);gh 未登录;ugrep 对 minified 长行报复杂度错(改用 perl 提取上下文)。无一次检索方向被放弃。
- 耗时估计:约 40 分钟(含核验)。

## 自检结果(对照协议第 5 节)
- 必答问题逐条有答案:返工任务无新必答问题;审核 3 条逐条回应见上节,对应修改位置均已列明。通过。
- 所有关键事实有 [官方]/[二手] 标注+日期+URL:新增 2 条引文均 [官方,2026-10]+URL 且逐字核对;无新增【推断】。通过。
- 随机抽 5 个 URL 确认可访问且内容一致:本轮新增 2/2 均 HTTP 200、引文与文件内容逐字一致;本轮另抓取 prompts.ts/promptProvider.ts/spec_plan.rs/apply_patch.rs/两个目录页共 6 个均 200(1 次 GitHub API 限流、1 次探路 404 不计入);原 T01 的 6 条抽验已由审核者完成。通过。
- 没有修改交付物之外的文件:`git status` 自查通过,改动仅为 research/08(交付物);报告为本任务交付物;未触碰 collab/ 只读文件与既有 html/md。通过。
- 每个大节有「对 harness 设计的启示」:未触碰分析段,原 9 节齐全。通过。
- 争议点有正反两面:未新增争议点,原 §3.4(pi 反对子代理的双方观点)/§3.5 保留。通过。
- 代码类:不适用(纯文档返工)。

## 与已有内容的关系
- 原 §4.3 第 4/5 条移除不丢证据:arXiv:2609.00006 的"无框架/无向量检索"普查与 Composio 结语在 §3.9、「要点速览」第 1/7 条已完整承载。
- 新第 4 条与 §3.3 分析("压缩要工程化")、§3.4(子代理回传消毒)、10 分册(注入面)互相印证,但以"提示词原文"的新角度呈现,不重复 07/09/10 分册的机制展开。
- 新第 5 条与 §3.2 编辑方式一节、09 分册"工具是被评测驱动的工程对象"呼应;参考资料 14 保留,47/48 追加于文末(32/35/42–44 的 URL 缺项按审核意见留待 T09)。

## 待决问题 / 未完成项
- 审核意见中标注"T09 整合时再修(不阻塞)"的两项未动:参考资料 32/35/42–44 补全 URL;§3.5 与 10 分册 §3.1 对比表统一口径(以 T03-r1 修正后版本为准)。
- Codex 的 apply_patch Lark 语法文件本体(include_str! 指向 codex-rs/assets/tools/apply_patch.lark)实测 404,疑仓库结构再变动;交付物只写"源码内嵌的 Lark 语法"而未引该文件路径。如后续需要引语法全文,需重新定位。
- 假设说明:审核者更新字数口径为"只按中文正文字数计(URL、英文原文、代码不计)",本报告按汉字严格口径(\u4e00-\u9fff,不含全角标点)报 +393;若按含全角标点口径估算约 +550,仍在限内。

STATUS: DONE
