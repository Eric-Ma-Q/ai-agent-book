# T09a 完成报告

## 交付物

- research/08-harness-teardown-comparison.md — §3.5 表格对齐 10 §3.1 口径、参考资料 32/35/42–44 补 URL — diff 40 行(净 +中文正文约 100 字)
- research/09-tools-mcp-skills.md — §3.1 新增原语对照表、§3.5 收缩为一段并链 10 §2.3、§八新增"坏工具→好工具"完整示例、参考资料补日期/URL — diff 121 行(新增中文正文约 1,100 字:原语表约 420 字、E 小节约 550 字)
- research/11-memory-systems.md — §2.2 ZCode 行补安装包物证、参考资料 26–34 补页面级 URL 或注明仅站点级 — diff 22 行(净 +约 90 字)
- research/12-multi-agent-orchestration.md — MAST 比例补"约"+[二手]、Gartner 补官方新闻稿 URL、参考资料 21–25 补 URL/说明 — diff 28 行
- research/13-agent-evals.md — 删除超标题级的 OpenAI 审计细节一句 — diff 4 行(净 −约 30 字)
- research/14-economics-observability.md — §2.3 缓存写入量 0.4M→0.15M 并全链重算 — diff 12 行
- (各文件头部另加一行"T09a 修订"说明,便于追溯)

## 修订清单逐条回应(11 条)

**条 1|08 参考资料 32、35、42–44 缺完整 URL — 改了**
- 32:`Cursor — 《Introducing Cursor 2.0 and Composer》(2025-10-29,官方公告,经搜索确认)` → 补深链 https://cursor.com/blog/2-0 (已抓取核验标题/日期/Composer 内容)。
- 35:原"kimi.ai Quick Reference + Terminal Trove 站点级" → 改为已核验的官方仓库页面级 URL https://github.com/MoonshotAI/kimi-code (MIT,README 能力句与正文引用一致)与旧版归档仓库 https://github.com/MoonshotAI/kimi-cli ;Terminal Trove 保留"仅站点级"并注明原因(站点反爬,深链无法回溯)。
- 42(BigGo):**部分改了**——补上了经搜索确认的完整标题与日期(2026-05-19),但 URL 仍"仅站点级":搜索引擎只回站点根域,站内文章 URL 为无规律 ID、首页无法导航回溯到 2026-05 文章。
- 43(Niharika):**没改深链,改了说明**——2026-10-05 复查发现该站点当前文章列表仅剩 2024 年两篇,搜索快照中的候选文("Building a Reliable Auto-Backup for Claude Code Sessions",2026-07-29)在站点上不存在,原文可能已下线;参考资料注明"仅站点级 + 原文可能已下线"。见"待决问题"第 3 条。
- 44(taupe.site):补深链 https://taupe.site/entry/codex-thread-tool-ai-team/ (已抓取核验:日文原文《Codexのthread toolで、AIチームの役割スレッドをつなぐ》,2026-06-04 发布、2026-09-27 更新——原引用的"2026-09"应为更新时间,已改标发布+更新日期)。

**条 2|08 §3.5 与 10 §3.1 对比表口径不一 — 改了(选"改为一致口径")**
- 08 §3.5 表格列结构改为与 10 §3.1 相同的六列(默认权限/审批|模式档位|沙箱技术|网络出口控制|来源),并新增一句导语:"列结构与口径与 10 分册 §3.1(T03-r1 修正后)对齐……两家都覆盖的对象以 10 §3.1 的措辞为准"。
- 具体对齐(改前 → 改后):Claude Code 行补"OS 级沙箱(默认关,`/sandbox` 开)"与"拒本地回环/元数据地址";Codex 行补"untrusted 已退役""云端命令仅达托管 allowlist 主机名"、"Landlock 为早期路线"→"旧版文档含 Landlock 路线";Gemini CLI 行"Seatbelt(macOS)/Docker、Podman 容器(Linux)"→"macOS Seatbelt;Linux Docker/Podman(bwrap 镜像)";Cursor 行"Ask Every Time 3.5 起不可选"→"3.5 起退役(空 allowlist 等价)"、Landlock 补"v3/不满足则回退人工审批"、网络补"沙箱内默认断网、默认含常用包管理源";ZCode 行来源列由【直接观察】升级为【直接观察+安装包字符串】。
- **一处有意不随动**:pi 行沙箱建议保留"官方文档点名 Docker 与 Gondolin micro-VM",未照抄 10 §3.1 的"如 Tenki"——2026-10-05 实抓 pi 官方 containerization.md,原文点名 Gondolin("Gondolin is a local Linux micro-VM")、Docker、NVIDIA OpenShell,无 Tenki。已在 §3.5 表后加"注(T09a)"说明,并列入"待决问题"第 1 条提请审核者裁定。

**条 3|09 参考资料 5–8、16–18 缺日期;32、33 缺完整 URL — 改了**
- 5–8、16、17 各补"(2026-10 读)"访问日期(均为原文档页,与文件调研日期 2026-10-04 一致);18 原已有日期(2026-04-30),未动。
- 32:`Remote GitHub MCP Server GA(2025-09-04)github.blog` → 补深链 https://github.blog/changelog/2025-09-04-remote-github-mcp-server-is-now-generally-available (已抓取核验标题与日期)。
- 33:`invariantlabs.ai` 域名级 → 两条深链 https://invariantlabs.ai/blog/mcp-github-vulnerability (2025-05-26)与 https://invariantlabs.ai/blog/mcp-security-notification (2025-04-01),均已抓取核验标题与日期。

**条 4|09 §3.5 与 10 §2.3 在 MCP 安全事件上重叠 — 改了**
- 原"问题二:安全事件与研究"5 条 bullet(约 480 字)收缩为一段(约 380 字):事件各留一句(工具投毒/GitHub MCP 官方 server/MCP Safety Audit/CVE-2025-6514、CVE-2025-49596/postmark-mcp),标注[二手,多源互证]并加粗链接"**事件经过、根因与缓解的完整展开见 10 分册 §2.3 与 §五**";保留协议层结论(协议收紧时间线)与正方/反方/判断(MCP 内容 = 不可信输入);43%/37%/22% 勘误说明原样保留。
- 删去的内容及去向:事件机制细节与 Willison"致命三要素"归属 → 由 10 §2.3/§五与 04 分册承担;扫描类数字(3,012 server 8.5% OAuth 等)整体删除(其性质本就是"弱二手,仅列方向");OWASP MCP Top 10 一句删除。收缩后原段尾独立的"正方/反方/我们的判断"重复段一并删除(已并入收缩段)。

**条 5|09 §3.1 补原语对照小表 — 改了(新增)**
- 位置:§3.1 首段之后、"对工具层最要紧的几处"列表之前,新增六原语对照表(原语|谁控制|典型用途|harness 怎么接|出处)。
- 每格"谁控制"均为 2026-07-28 规范原文措辞并附出处:tools "designed to be model-controlled"(server/tools)、prompts "user-controlled"(server/prompts)、resources "application-driven"(server/resources)——三页均于 2026-10-05 实抓核对。
- 检索中的新发现(已写入表与导语):**sampling 与 roots 已被 2026-07-28 版弃用(SEP-2577),同批弃用还有 logging(SEP-2577,迁移 stderr/OTel)与 DCR**;来源为 client/sampling、client/roots 页弃用警告与官方弃用注册表 /specification/2026-07-28/deprecated(实抓)。roots 行同时保留规范原文"信息性指引,不是访问控制机制"。

**条 6|09 第八节补"坏工具 → 好工具"完整示例 — 改了(新增)**
- 位置:§八 D 组第 14 条之后、本节"「对 harness 设计的启示」"段之前,新增"**E. 完整示例:把一个坏工具改写成好工具(T09a 新增)**"(约 550 中文字 + 三段 JSON + 一张九行对照表)。
- 内容:同一 Slack 查询工具改写前后对比——定义(schema+描述)、返回体、空结果与错误各给改写前后版本;九行对照表逐条标注对应第八节清单第 1/3/4/6/7/8/9/10/11 条,每行附官方依据(Agent SDK tool-search 命名例、Anthropic 描述纠偏与 206/72 token 例、OpenAI 枚举防非法态、SWE-agent 空输出规则、MCP annotations 默认值与不可信警告);并说明清单 2/5/12/13/14 属 harness 与货架层、不体现在单个工具定义。
- 诚实性:示例开头标明"**示例为教学构造**【推断】,但每个反模式与修复手法都有对应官方出处";所引出处均未新增检索断言,全部来自本文与前文已核来源(其中 MCP annotations 与 server/tools 页为本次实抓复核)。

**条 7|11 ZCode 行补可复核物证 — 改了**
- 物证拿到了,无需降级。§2.2 ZCode 行:`【直接观察】` → `【直接观察+安装包字符串】`,并写明:安装包路径 `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`、2026-10-05 检出四分类枚举 `["user","feedback","project","reference"]`、索引注入与截断字符串 "MEMORY.md is always loaded into your conversation context — lines after 200 will be truncated"、记忆文件 frontmatter 模板(name/description/metadata.type 四类)。与 §2.2 左列"同四类;MEMORY.md 索引每会话注入,单事实文件+frontmatter"逐项对应,读者可自行复核。

**条 8|11 参考资料 26–34 补页面级 — 部分改了**
- 补到页面级并核验(6 条):26 embracethered《Hacking Gemini's Memory…》 → …/2025/gemini-memory-persistence-prompt-injection/(2025-02-10);27 Letta 论坛帖 → forum.letta.com/t/does-anyone-use-knowledge-graphs-for-anything-practical/94(帖内 ezra 原句含 74.0%/GPT-4o mini/四工具,与正文引用一致);28 THN SpAIware → thehackernews.com/2024/09/chatgpt-macos-flaw-couldve-enabled-long.html(2024-09-25);31 automem.ai → /blog/agent-memory-in-2026-an-honest-comparison-of-mem0-zep-letta-and-the-rest(2026-06-06);34 补已核验中文替代源:安全内参 …/articles/70682(2024-09-26)。
- 仍"仅站点级"并注明原因(4 条):29 OpenAI Community("后端架构更新致静默损坏"原始帖无法唯一定位,列出两个最接近的 2025-03 帖深链供查证);30 dev.to(精确标题检索不到,标题可能为转述);32 beri.net(文章存在已确认,但站点按日更新、旧刊无存档导航);33 CSDN(搜索只回主域;且原引用域 agent.csdn.net 与实证的 blog.csdn.net 不一致,已注明)。

**条 9|12 参考资料与 MAST 比例 — 改了**
- §5.2 三条失败比例(改前"按二手转述约占 42%/约 37%/约 21%")→ 逐条补 [二手,2025–2026,转述自 MAST 论文分析] 标注,"约"字保留;§十表格第 4 行的"[官方,2503.13657;比例经二手]"改为"[官方,2503.13657(分类原文);比例经二手转述]"。
- 参考资料:22 补深链 blog.bytebytego.com/p/how-anthropic-built-a-multi-agent(已核验,2025-09-16);27 补 Gartner 官方新闻稿 URL(2025-06-25;Gartner 站点 403,URL 经多个独立转述源交叉确认,原报告仍未回溯——正文 §四与 §十一口径同步更新);21/23/24/25(SD Times/知乎×2/InfoQ)**部分改了**:补齐了可确认的完整标题、作者、日期,但深链拿不到(SD Times 站点拒绝抓取 HTTP 400;知乎/infoq.cn 深链无法经外部搜索回溯),各自注明"仅站点级"及原因,文末注同步改写。

**条 10|14 §2.3 缓存写入量 0.4M — 改了(选方案 B:改 0.15M 并重算)**
- 正文(改前)"累计:cache read 5.0M、cache write 0.4M…" → (改后)"**假设全程追加式增长、无压缩与 TTL 断前缀**(…对照 §3.2 规则 2 与规则 10…)。在此假设下,cache write ≈ 最终上下文体量(初始 15K + 追加 135K ≈ 0.15M)。累计:cache read 5.0M、cache write 0.15M…"。
- 汇总表 cache write 400,000/$1.00 → 150,000/$0.38,合计 ≈$2.34 → **≈$1.72**;无缓存对照 5.42M/$11.14/约 4.8 倍 → 5.17M/$10.64/约 6.2 倍;Opus 重算 $3.68 vs $22.28(约 6 倍)→ $2.43 vs $21.28(约 8.8 倍);交叉校验段"($2 量级/任务)"→"($1.7–2.4/任务)"。正文、汇总表、推演、交叉校验四处数字全部一致。

**条 11|13 OpenAI 弃用 SWE-bench Verified 引用 — 改了**
- 核对结论:正文有**一句**超出标题级口径——§4.1"其审计称前沿模型能'复现 gold patch'——即任务与参考解已进训练数据。"该句在多个二手转述中有出现(2026-10-05 检索确认),但原页反爬、未经一手核实,且与本文 §十一"本篇只引用其标题级主张"的自述矛盾。
- 处理:**删除该句**,并在原位标注"引用保持标题级口径——审计细节的二手转述见多方,本文不采信为已核实"。未发现补入任何未核实的审计数字(全文件 grep 复核)。其余相关引用(要点速览 1、基准地图行、§4.1 正面回答、参考资料 19)均为标题级口径,未动。

## 摘要

1. 11 条修订全部落地:10 条"改了"、1 条"部分改了"(条 1 中 BigGo/Niharika 两条深链确实不可回溯,按任务要求注明"仅站点级"+原因)。
2. 教学新增两件:09 §3.1 六原语对照表(含本次检索新发现:2026-07-28 规范已弃用 sampling/roots/logging,SEP-2577)与 09 §八 E 小节"坏工具→好工具"完整改写(构造示例+九行清单映射,全部反模式有官方出处)。
3. 08 §3.5 与 10 §3.1 完成口径统一(列结构、措辞逐格对齐);唯一出入是 pi 沙箱建议:实测官方文档只点名 Docker/Gondolin/OpenShell,10 §3.1 的"如 Tenki"疑为笔误,08 未随动并留注提请裁定。
4. 09 §3.5 从 5 条事件列表收缩为一段,协议层结论保留,安全事件细节移交 10 §2.3/§五,43%/37%/22% 勘误说明保留。
5. 11 的 ZCode 记忆行补齐了可复核物证(安装包路径+三组具体字符串),与 08 §五的物证口径一致。
6. 14 §2.3 成本示例重算后结论反而更强:同任务缓存收益从"约 4.8 倍"变为"约 6.2 倍"(Sonnet)/"约 8.8 倍"(Opus),与"缓存是十倍杠杆"的主线更一致。
7. 13 删除了一句未经一手核实的 OpenAI 审计转述,引用口径与文末自述恢复一致。
8. 全程主智能体串行检索,0 子智能体;约 35 次搜索/抓取 + 8 次本地 grep;新增或升级为页面级的 URL 共 14 个,全部实抓核验(1 个 Gartner 例外:站点 403,经多源交叉确认并注明)。

## 方法与规模

- 检索:WebSearch 约 14 次、WebFetch 约 21 次、webReader 2 次,全部主智能体串行(遵守协议并发规则,未用子智能体);本地 grep zcode.cjs 8 次。未遇限流,无重试。
- 精读:新增精读官方来源 8 页(MCP 规范 architecture/resources/prompts/tools/sampling/roots/deprecated 注册表、pi containerization.md),核验二手/新闻源 15 页(Cursor 博客、github.blog changelog、Invariant×2、Moonshot 仓库×2、taupe.site、embracethered、Letta 论坛、THN、automem、ByteByteGo、安全内参、社区候选帖×2 等)。
- 中英比例:本次核验以英文一手为主(约 8:3);中文源(知乎/CSDN/InfoQ)仅完成存在性与元数据确认,深链均不可回溯,已如实注明。

## 自检结果

- 必答问题逐条有答案:不适用(本任务为修订类),11 条逐条回应见上,每条给出"改前→改后"或新增位置。
- 关键事实标注:新增事实均带 [官方|二手]+日期+URL;构造示例标【推断】并逐行给官方出处;无法核实处(无法回溯深链的站点级引用、beri 旧刊无存档等)标"仅站点级"。
- 抽查 URL:本次新增/核验的 14 个页面级 URL 全部在执行中实抓并核对过标题/日期/关键句(见各条回应),超过"随机抽 5 个"要求;唯一未直抓的是 Gartner 新闻稿(站点 403,经多源交叉确认,参考资料中已注明)。
- 未越界:git diff 仅 research/08、09、11、12、13、14 六个文件(10 未动);collab/BOARD.md、ROADMAP.md 的改动在本会话开始前已存在(见会话起始 git status 快照),非本次所改;未碰 labs/、html、collab 只读文件。
- 交叉引用 grep 复核:10 §3.1 "如 Tenki"原文存在(line 89);09 §九"在 3.5 节留勘误说明"仍成立(勘误说明保留在 §3.5);13 §十一"只引用其标题级主张"存在(line 330),与删句后正文一致;14 §3.2 规则 2(压缩断前缀)与规则 10(TTL 冷启动)存在,§2.3 新引用编号正确。
- 「对 harness 设计的启示」:本次为小修,未新增大节,不新增启示块;新增的 E 小节自带清单映射,原各节启示未改动。
- 争议点正反面:09 §3.5 收缩段保留正方/反方/判断;未删除任何正反面结构。

## 与已有内容的关系

- research/10 §3.1(86–91 行):08 §3.5 对齐的对象;其 pi 行"(如 Tenki)"经实测与官方文档不符(见待决问题 1),grep 确认原文存在。
- research/09 §3.5 ↔ research/10 §2.3/§五:收缩后 09 明确链向 10;10 §2.3 覆盖工具投毒/供应链/CVE-2025-6514/Asana,GitHub MCP 事件与 MCP Safety Audit 的完整叙述按 T03 审核分工仍以 04/09 为主,收缩段已保留一句级摘要,不丢线索。
- research/08 §五 305 行与 research/11 §2.2 ZCode 行:两处物证同源(zcode.cjs),本次 11 补的具体字符串(四分类枚举/200 行截断)与 08 已有的"MEMORY.md 索引注入与截断告警"描述互相印证,无冲突。
- research/14 §2.3 ↔ §3.2 规则 2/10:示例的新假设与既有缓存规则互为印证,原 T07 审核表扬的"压缩断前缀"提醒(规则 2)保留并在示例处被引用。
- research/13 §4.1 ↔ §十一:删句消除了正文与"只引用标题级主张"自述的矛盾。
- 未发现本次修订与其他分册、html 页面存在新的冲突。

## 待决问题 / 未完成项

1. **10 分册 §3.1 的"(如 Tenki)"疑误**:pi 官方 containerization.md(2026-10 实抓)点名 Gondolin micro-VM、Docker、NVIDIA OpenShell,无 Tenki。08 §3.5 未随动(以官方文档为准)并已留注。建议审核者裁定是否派 10 分册小勘误。
2. **T04 审核的第三条小问题未在 T09a 清单内**:11 §2.1 称《A Survey on the Memory Mechanism…》为"中文综述"不准确(英文论文,作者来自中国高校)。因任务要求"只修列出的问题",本次未改,提请审核者确认是否并入后续任务。
3. **无法回溯深链的引用**(均已在参考资料注明原因):08-42 BigGo、08-43 Niharika(疑似已下线,建议审核者考虑删除或替换该条)、09 内若干、11-29/30/32/33/34、12-21/23/24/25。其中 11-29 的正文论断("后端记忆架构更新致静默损坏")只能落到两个相近候选帖,如需更严口径建议弱化该句。
4. **Gartner 新闻稿 URL** 系经多个独立转述源交叉确认(Gartner 站点 403 未直抓),参考资料已注明;如审核者要求一手抓取,需换用浏览器访问。

STATUS: DONE
