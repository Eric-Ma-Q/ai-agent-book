# 工程经济学与可观测性:一次 agent 会话的钱花在哪、怎么看见

> 调研日期:2026-10-04。方法:遵守 PROTOCOL 第 2 节并发限流规则,主智能体自己串行检索,未用子智能体;约 25 轮检索/抓取,精读官方文档 20+ 页(Anthropic/OpenAI/Gemini/DeepSeek/Kimi 定价与缓存文档、Claude Code 成本文档、OpenTelemetry GenAI 语义约定仓库与子页、五家观测平台文档、OpenAI Agents SDK、LiteLLM),论文 2 篇(arXiv:2604.22750 摘要+全文节选、arXiv:2305.13144 摘要),二手来源 10+ 篇;中途 1 次 WebSearch 超时,按协议等待 60 秒后重试成功。每条关键事实标注 [官方](厂商文档/官方博客/论文原文)或 [二手](媒体/社区/第三方评测),附时间与来源 URL;无出处推断标【推断】;文中价格均为"截至 2026-10"实抓口径,时效敏感处单独注明。
>
> **对象界定**:本文回答两个工程问题——①一个 agent 会话的 token 和钱花在哪里、harness 设计怎样省;②出了问题怎么看见、应该记录什么。与已有内容的分工:工具定义的 token 账本(58 工具 55K、Tool Search −85%)已在 `research/09-tools-mcp-skills.md` §2.2/§4,本文只引用;各 harness 的压缩与缓存机制横评、Composio 成本差 7 倍已在 `research/08-harness-teardown-comparison.md` §3.3/§3.9,本文只引用;多 agent token 倍数(4×/15×)与 MAST 失败分类已在 `research/12-multi-agent-orchestration.md`,本文只引用;pi 的 append-only+99.93% 缓存命中案例已在 `research/07-pi-design-philosophy.md` §3.7,本文引用其结论并补机制与价格解释。"大输出落盘只回传路径"按 T02 审核意见(ROADMAP 2026-10-04)并入本文 §四,并在 MAST 日志维度(§六)落实 T05 审核意见。
>
> **T09a 修订(2026-10-05)**:§2.3 工作示例的缓存写入量由 0.4M 改为 0.15M(60 次请求从 15K 追加增长到 150K,写入应接近增长量;原 0.4M 隐含了未写明的压缩/断前缀重写假设),并显式写明"全程追加、无压缩与 TTL 断前缀"假设;正文与汇总表、无缓存对照、Opus 重算、交叉校验段落全部重算一致。逐条对照见 collab/reports/T09a-research-fixups.report.md。

---

## 一、要点速览

1. **agent 会话的钱绝大部分花在"输入的重复计费"上**:Manus 公开平均输入:输出比约 100:1、典型任务约 50 次工具调用 [官方,2025-06,Manus 博客];arXiv 首篇系统研究证实"缓存读主导了原始 token 量和美元成本",输出 token 单价约为缓存读的 80 倍,但因上下文体量,总量上仍是缓存读贵 [官方,2026-04,arXiv:2604.22750]。
2. **官方锚点数字**:Claude Code 平均每开发者活跃日约 $13、月 $150–250,90% 用户低于 $30/活跃日;官方文档示例一次请求 94 万 cache read + 5 万 cache write 合计才 $0.55——缓存读占绝对大头 [官方,2026-10,code.claude.com/docs/en/costs]。
3. **同一任务的 token 方差可达 30 倍**:同一任务不同运行的 token 总量最高差 30×,且"准确率常在中等成本处达峰后饱和"——花得更多不等于做得更好;模型还系统性低估自己的 token 需求,自预测相关性最高仅 0.39 [官方,2026-04,arXiv:2604.22750]。
4. **prompt caching(prompt 缓存)已成全行业标配且价格口径收敛**:五厂商都提供命中折扣(约 0.05×–0.1× 原价),Anthropic/Kimi 收写价(1.25×/2×),Gemini 显式缓存另收每小时存储费,DeepSeek 错峰再半价 [官方,2026-10,各定价页,详见 §三 对比表]。
5. **缓存命中同时省约 90% 输入成本并大幅降首 token 延迟**:DeepSeek 官方实测 128K 提示的首 token 延迟从 13 秒降到 500 毫秒 [官方,2024-08];OpenAI 官方示例多轮 agent 场景缓存命中率 >90% [官方,2026]。
6. **主流省钱手段全部有公开数据支撑**:模型路由("多数任务用 Sonnet、简单子代理用 Haiku")、大输出落盘只回传摘要与路径、按需加载工具(token −85%)、批处理(五折)、错峰(DeepSeek 低谷半价)、循环检测与提前终止(arXiv"冗余往返文件访问推高成本"发现)。
7. **可观测性标准正在定型但未定型**:OpenTelemetry GenAI 语义约定 2026 年迁入独立仓库 semantic-conventions-genai,覆盖 LLM 推理、agent 编排与 MCP 操作三层,但截至 2026-10 全部指标仍标 Development(开发中),尚无正式 release [官方,2026-10,GitHub]。
8. **一条 agent trace 至少要记 15 类字段**:会话/代理标识、模型与请求参数、四分类 token 计量(input/cache_read/cache_write/output)、成本、TTFT 与工具耗时、错误与终止原因、循环标记、MAST 失败分类标签(表见 §六)。
9. **预算要在四个层级设防**:平台层(LiteLLM max_budget 超限拒答、Console 消费限额)、运行层(OpenAI Agents SDK max_turns → MaxTurnsExceeded)、子代理层(按子代理记账+努力缩放规则)、缓存层(命中率下跌先于超支报警)。
10. **"账单失控"的根源是可预测性差**:模型不能预测自己的消耗(相关性 0.39)+ 同任务 30× 方差 + Agent Teams 计划模式约 7× token [官方,2026-10,Claude Code costs]——预算必须是运行时强制的工程机制,而不是事后看报表。

---

## 二、成本结构:一次会话的钱花在哪里

### 2.1 Agent 经济学 = 复制粘贴经济学

chat 场景每轮只发新消息,agent 场景每一步都把**全部历史**重新发一遍:每读一个文件、每跑一条命令,结果都追加进上下文,下一轮整体重发。Manus 团队把这笔账说得很直白:agent 的 prefill(预填充)/decode(解码)比例严重倾斜,"Manus 平均输入:输出 token 比约 100:1","一个典型任务平均需要约 50 次工具调用" [官方,2025-06,Manus 博客 https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus]。其推论是:定义侧与历史侧每省 1 个 token,在 50 次调用的会话里近似放大 50 倍,而放大倍数是否兑现,取决于前缀缓存命中率(见 §三)【推断,由前述公开数字推演】。

arXiv:2604.22750《How Do AI Agents Spend Your Money?》(2026-04,首篇系统研究 agent token 消耗的论文)给了更大的数量级:agentic coding 任务消耗的 token 是单轮代码推理任务的约 3500 倍、多轮代码对话任务的约 1200 倍,成本"主要由输入 token 的指数增长驱动——即使开了缓存" [官方,2026-04,https://arxiv.org/abs/2604.22750]。该论文还按任务阶段拆了占比(以 Claude Sonnet-4.5 在 SWE-bench Verified 的轨迹为样本):Explore(探索)30.4%、Fix(修复)33.5%、Validate(验证)16.6%、Setup(搭建)10.0%、Closeout(收尾)9.5% [官方,2026-04,HTML 全文]——"看代码"与"改代码"合计约 64%,两头的搭建与收尾各约 10%。

### 2.2 哪一块最贵:缓存读、工具结果与"看不见的输出"

按"定义侧(每轮常驻)/ 结果侧(每调用追加)/ 输出侧"三块拆,公开数据指向三笔大头:

- **缓存读是最大的一笔**。arXiv 论文原话:"Cache reads dominate both raw token volume and dollar cost"(缓存读同时主导原始 token 量和美元成本),虽然输出 token 单价约为缓存读的 80 倍,但上下文体量让它仍是最大开销 [官方,2026-04]。Claude Code 官方文档的示例计费块印证了这一点:一次请求"1.2k input、5.3k output、940.0k cache read、50.0k cache write($0.55)"——cache read 占总 token 约 94% [官方,2026-10,code.claude.com/docs/en/costs]。
- **工具结果是增长最快的一笔**。Claude Code 官方对成本结构的解释:"Claude Code 每次请求都发送完整对话,而 Claude 每次用工具都会再发一次请求";"一个开了一整天的会话里,哪怕只问一行小问题,也要为整个对话付 usage" [官方,2026-10]。工具结果的体量账本(58 个 MCP 工具定义 55K、单次大输出 25K 截断阈值)已在 09 分册 §2.2,此处不重复。
- **"看不见的输出":思考与重试**。Claude Code 文档明确"extended thinking 按 output token 计费",并给出 MAX_THINKING_TOKENS=8000 的降档手段 [官方,2026-10]。arXiv 论文发现的另一个隐性输出源是**冗余往返**:贵的运行伴随明显更多的重复文件查看与重复编辑,"redundant back-and-forth file access and re-editing"推高成本却无进展 [官方,2026-04]。

一个正/反两面都要看的争议:**订阅价 vs API 等价值的口径差**。Claude Code 的 /usage 会显示"按目录价折算的会话金额",订阅用户真实支出是固定的(Pro $20/月起、Max 5x/20x 档位),两者可能差很多;官方文档同时警告:环境里设了 ANTHROPIC_API_KEY 就会改走 API 计费、"cause API charges" [官方,2026-10,support.claude.com]。正方认为按 API 等价值展示成本透明、可比;反方认为它会让订阅用户高估支出、把"无限量感"扭曲成"穷酸感"。我们的判断:对 harness 设计者,两套口径都要展示(真实支出 + API 等价值),并明确标注计费通道,否则用户无法回答"这个会话到底花了我多少"。

### 2.3 必答问题 1:一个"修中等 bug"会话的可复现估算

**方法**(可复现):设一轮会话共 R 次请求(每次工具调用都是一次请求),最终上下文体量 L,则:

> 总成本 ≈ cache_read_tokens × 命中价 + cache_write_tokens × 写价 + fresh_input_tokens × 原价 + output_tokens × 输出价

四类 token 的计量口径与 OTel GenAI 的 `gen_ai.usage.input_tokens / output_tokens / cache_read.input_tokens / cache_write.input_tokens` 一一对应 [官方,2026-10,OTel agent spans 文档],单价表见 §三。cache_write 与 cache_read 的比例由会话形状决定:只追加的会话里,每轮新增内容是写、重复前缀是读【推断,机制由 Anthropic"每次命中自动续期"规则推出】。

**工作示例**(假设参数全部标【推断】,单价为官方实抓):修一个中等 bug,60 次请求,上下文从 15K(系统提示+工具定义,pi 式极简会少一个量级,见 07 分册)增长到约 150K,工具结果经截断与落盘控制。**假设全程追加式增长、无压缩与 TTL 断前缀**(这是缓存友好的理想形态;对照 §3.2 规则 2 与规则 10:一旦发生压缩或 5 分钟 TTL 过期,断前缀后的重写会显著推高写价)。在此假设下,cache write ≈ 最终上下文体量(初始 15K + 追加 135K ≈ 0.15M)。累计:cache read 5.0M、cache write 0.15M、fresh input 20K、output 30K(含 thinking)。用 Claude Sonnet 5.5($2/M 输入、$10/M 输出、5 分钟档写价 $2.50/M、命中 $0.20/M):

| 块 | token 数 | 单价(每 M) | 金额 |
|---|---|---|---|
| cache read | 5,000,000 | $0.20 | $1.00 |
| cache write | 150,000 | $2.50 | $0.38 |
| fresh input | 20,000 | $2.00 | $0.04 |
| output(含 thinking) | 30,000 | $10.00 | $0.30 |
| **合计** | | | **≈ $1.72** |

同样的量若无缓存(全部按 $2/M 输入计):5.17M × $2 + 0.03M × $10 ≈ **$10.64**,是缓存版的约 6.2 倍【推断,由上表推演】。用 Opus 5.5($4/$20、写 $5、命中 $0.20)重算约为 $2.43 vs 无缓存 $21.28(约 8.8 倍)【推断,同上】。缓存收益随"输入:输出比"放大:Manus 的 100:1 会话里,缓存命中率决定的是"0.1 倍还是 1 倍的输入账单"[官方,2025-06,Manus]。

**公开数据交叉校验**:官方称 Claude Code 平均 $13/开发者/活跃日、$150–250/月,90% 用户 < $30/活跃日,后台闲置会话"typically under $0.04 per session",Agent Teams 计划模式约为普通会话 7× token [官方,2026-10,code.claude.com/docs/en/costs];Composio 同模型横评里,每成功任务成本 $0.028(pi)~ $0.195(Claude Code),差 7 倍 [二手,2026-08,经 08 分册 §3.9 转引]。我们的估算($1.7–2.4/任务)落在"官方平均值 ÷ 每日任务数"的合理区间【推断,无直接同口径公开数据】。

**「对 harness 设计的启示」**

1. 成本优化的第一杠杆是**输入侧**而不是输出侧:控制工具定义总量(09 分册阈值:>10K token 或 >10 个就该按需加载)、工具结果截断与落盘、think 档位降级,都比"让模型少说话"见效大。
2. 把"缓存命中率"当成成本系统的主指标(Manus 称其为生产 agent 的第一指标),单看"总 token 数"会掩盖命中/未命中的 10 倍价差。
3. 成本必须按**会话 × 子代理 × 技能 × MCP 服务器**归因:Claude Code 的 /usage 已支持按 skill/subagent/MCP server 归因(≥10% 用量才显示行为标记)[官方,2026-10];没有归因的账单无法优化。
4. 阶段拆账(Explore/Fix/Validate)值得内建:arXiv 的阶段占比说明"探索/修复"占约 64%,针对探索阶段的检索质量(索引、repo map,见 08 分册 §3.3)是对成本最敏感的投点。
5. 向用户展示"本次会话预计/实际成本"并支持 /usage 式自查——成本可见性是预算机制(§七)的前置条件。

---

## 三、Prompt caching:账单的十倍杠杆

### 3.1 机制与价格对比(截至 2026-10,全部官方实抓)

| 厂商 | 机制 | 写价 | 命中价 | TTL/续期 | 最小可缓存 | 备注 |
|---|---|---|---|---|---|---|
| Anthropic | 显式断点(最多 4 个)+ 自动缓存 | 5 分钟档 1.25×;1 小时档 2× | 0.1×;例外:Fable 5.1/Mythos 5.1 命中 0.025×、Opus 5.5 命中 0.05× | 5m 默认/1h 可选;**每次命中免费续期** | 512–4096(按模型) | prewarm 可 `max_tokens: 0` 预写缓存;命中不计入限流;工具定义变更/开关 web_search/换 thinking 参数等会使缓存失效 |
| OpenAI | 默认自动(隐式),GPT-5.6+ 支持显式断点 | GPT-5.6+ 1.25×;旧模型不收写价 | 多数 GPT-5.6+ 0.1×;GPT-6.1 Sol 低至 0.05×("up to 95% off") | GPT-5.6+ 统一 30m(命中续期);旧模型 in_memory(约 5–10 分钟,至多 1h)或 24h | 1,024(可见输入) | 缓存按机器、按组织隔离;需稳定 prompt cache key(建议每 key 约 15 RPM);前缀 <1024 时"扩前缀反而更省"有官方算例 |
| Google Gemini | 2.5+ 隐式缓存默认开;显式缓存走 generateContent | 无写价 | 隐式命中自动传递折扣(2.5 Pro 命中 $0.125/M vs 输入 $1.25/M) | 显式缓存可配 TTL | 2,048(2.5)/4,096(3.x Flash) | **显式缓存另收存储费**:$0.50–4.50/百万 token/小时(Pro 最贵);批量档约半价 |
| DeepSeek | 全自动磁盘缓存 | 无写价 | deepseek-flash 命中 $0.006(峰)/$0.003(谷),vs 未命中 $0.30/$0.15 | 磁盘留存,自动清理 | 64 token 存储单元 | 2024-08 上线,免存储费;**错峰(周末全谷+工作日部分时段)再半价** |
| Kimi(Moonshot) | 显式创建缓存+TTL(Anthropic 式) | k3:¥20/M(5m)、¥40/M(1h) | k3 命中 ¥2/M(vs 未命中 ¥20/M);k2.6 命中 ¥1.10/M | 默认 5 分钟,命中自动续期 | 未标注 | k3 上下文 1,048,576 token |

来源(逐格可回源):Anthropic platform.claude.com/docs/en/build-with-claude/prompt-caching 与 /docs/en/about-claude/pricing [官方,2026-10];OpenAI developers.openai.com/api/docs/guides/prompt-caching [官方,2026-10];Gemini ai.google.dev/gemini-api/docs/caching 与 /docs/pricing [官方,2026-10];DeepSeek api-docs.deepseek.com/quick_start/pricing 与 /news/news0802 [官方,2024-08/2026-10];Kimi platform.kimi.com/docs/pricing [官方,2026-10]。

三个值得注意的口径差:①**写价策略分裂**——Anthropic/Kimi 让你为"可缓存的未来"预付 1.25×,OpenAI/Gemini/DeepSeek 对旧模型不收写价,意味着"写多读少"的场景在两家更亏;②**TTL 语义不同**——Anthropic/OpenAI 命中即续期,连续 agent 循环天然保活;Gemini 显式缓存按小时收存储费,TTL 是花钱买的;③**隔离边界不同**——OpenAI 缓存按机器且不跨组织(负载均衡可能把请求路由到冷机器),Anthropic 缓存按工作区隔离、命中要求"100% 一致的提示片段" [官方,各自文档,2026-10]。

### 3.2 必答问题 2:缓存友好设计规则(10 条,每条含"破坏它会怎样")

1. **稳定前缀**:系统提示词、工具定义放最前且内容逐字节稳定,不含时间戳/随机数/会话 ID。破坏会怎样:Manus 原话——系统提示里一个**每秒变化的时间戳**"kills your cache hit rate"(杀死你的缓存命中率)[官方,2025-06];此后每个请求都是全价未命中,输入成本约 10 倍(0.1×→1×),长上下文 TTFT 从亚秒回到秒级 [官方,2024-08,DeepSeek 13s→0.5s 反例]。
2. **只追加(append-only)的历史**:不改写旧消息、不做原地编辑;序列化确定(JSON 键序固定)。破坏会怎样:任何"回头改一句"都会使其后整个前缀失效;OpenAI 文档明确"summarization/compaction/truncation 会重置复用" [官方,2026]——即压缩省下的上下文钱,可能被"全量重写"的缓存钱吃回去(压缩的净收益要算总账【推断,由官方规则推演】)。
3. **工具列表确定性排序、变更走版本**:不改运行中会话的工具顺序与 schema。破坏会怎样:Anthropic 列明"工具定义变更"是失效触发器 [官方,2026-10];MCP 2026-07 规范已把"工具列表 MUST NOT vary per-connection"写进协议(经 09 分册 §3.1 引);每轮乱序=前缀在工具区就断,后面全部白搭。
4. **动态内容放尾部**:用户相关信息、当日时间、检索结果一律放消息尾部,不进系统提示。破坏会怎样:OpenAI 官方建议"stable instructions first;timestamps/user-specific content last" [官方,2026]——违反则断点前移,命中区间缩短到零。
5. **用"禁用/掩码"代替"增删"工具**:需要限制工具面时用 `tool_choice: none`、`allowed_tools` 或解码层 logits 掩码(Manus 的 state machine 方案),不要真的从请求里移除工具定义。破坏会怎样:动态增删=前缀断裂+模型困惑双重代价(Manus:"breaks cache and confuses the model")[官方,2025-06;官方,2026-OpenAI]。
6. **显式缓存断点**:至少在系统提示末尾设断点(Anthropic 最多 4 个;OpenAI GPT-5.6+ explicit 模式同理),大段 few-shot/参考文档单独设断点。破坏会怎样:纯隐式模式下断点由厂商猜测,命中边界不可控;OpenAI 官方算例显示判官型单轮任务用显式断点可达约 70% 命中率 [官方,2026]。
7. **会话粘性路由**:自托管/网关场景按会话 ID 路由到同一后端(OpenAI prompt cache key;Manus 在 vLLM 上按 session 路由)。破坏会怎样:OpenAI 文档明示缓存"live per-machine"、溢出时走 15 RPM/key 之外的路由——无粘性轮转的负载均衡会把命中打成未命中 [官方,2026;官方,2025-06-Manus]。
8. **多会话共享大前缀**:把共用的大文档、few-shot 池做成跨会话公共前缀。破坏会怎样:每个会话各自写一遍缓存,写价 1.25× 白付 N 次;共享后写一次、全员命中(官方判官示例即此结构)[官方,2026-OpenAI]。
9. **动态注入(系统提醒/工具结果回执)放消息尾部而非 system**:harness 惯用的"每轮变化的提醒"若进了系统提示,等于自带时间戳。破坏会怎样:与规则 1 同代价;这正是 08 分册 §3.3 的推断——Claude Code 大量动态 system reminders 天然伤前缀缓存【推断,机制层面,未实测】。
10. **TTL 与调用节奏匹配**:agent 循环内的连续调用天然续期(Anthropic/OpenAI 命中即续);间歇性批处理要么买 1h TTL(Anthropic 2× 写价),要么接受冷启动。破坏会怎样:5 分钟空窗后全量冷启动,首请求既慢(全量 prefill)又贵(重新写缓存)。

**「对 harness 设计的启示」**

1. 把上述 10 条做成 harness 的**静态检查项**:系统提示内容 hash 检查(是否含易变 token)、工具列表序检查、注入点位置检查——CI 能测的不要靠自觉。
2. 缓存友好与"上下文可审计"(07 分册 pi 公理)是同一件事的两面:append-only 事件流既是审计日志又是缓存前缀,一份结构两用。
3. 给"压缩/截断"算总账再执行:压掉 20K 上下文省的是读价 0.1×,但压完断前缀、全量重写是 1.25× 写价——只有当后续请求数足够多时压缩才划算【推断,由官方价格规则推演;建议 harness 内置此计算】。
4. 跨厂商设计时按最严口径实现(Anthropic 的 100% 一致 + OpenAI 的按机器隔离),兼容性自然覆盖宽松的厂商。

---

## 四、省钱手段:六类手段与公开数据

### 4.1 模型路由:让便宜模型干便宜模型的活

- **官方推荐本身就是路由**:Claude Code 成本文档"Sonnet handles most coding tasks well and costs less than Opus"、简单子代理用 `model: haiku`、Agent Teams 队友用 Sonnet [官方,2026-10]。
- **隐藏路由处处可见**:pi 作者 120 次实测发现 Claude Code 对每条 bash 命令跑一次 Haiku 安全校验(经 08 分册 §7.1 转引)——分类、校验、标题、压缩这类高频小任务都该走小模型;Aider 的 architect 模式让"弱模型把强模型的方案转成编辑格式"(经 08 分册 §3.1 引,官方文档);Gemini CLI 为压缩单独设计提示词(08 分册 §3.3)。
- **压缩用便宜模型**:pi 的 compaction 可用便宜模型跑(07 分册 §3.7);arXiv:2604.22750 证明准确率在中等成本处达峰,"更贵"对多数任务无增益 [官方,2026-04]。
- 反面警示:路由有判断成本,错把难任务路由给弱模型会返工,返工本身最贵;arXiv 数据显示模型**自己**都预测不准任务难度("human expert difficulty ratings only weakly align with actual token costs")【推断:静态路由规则 + 按反馈动态升级,优于模型自评路由】。

### 4.2 大输出落盘,只回传路径和摘要(T02 审核并入项)

- Anthropic 多 agent 复盘的处方:子代理把工作直接写进文件系统,"只向协调者回传轻量引用",防止大段输出经对话历史层层复制(传话游戏)并降低 token 开销(经 12 分册 §3.2 引,官方原文)。
- 工程化形态三件套:工具结果截断上限(Claude Code 25K `MAX_MCP_OUTPUT_TOKENS`)、大结果落盘换路径引用、代码沙箱聚合(pi codemode"只有脚本输出进上下文",默认 10K 上限)——账本数据见 09 分册 §2.2/§六。
- 量化收益:Anthropic 官方实测,同一跨服务器任务从 150,000 token 降到 2,000(−98.7%),其中"中间结果默认不出沙箱"是关键机制(09 分册 §6.3 表);arXiv 论文发现贵运行的标志恰是"冗余往返文件访问"——落盘+引用回传同时治这两个病 [官方,2026-04]。

### 4.3 按需加载工具与渐进披露

09 分册 §4 的官方数字直接引用:Tool Search 把 72K 定义压到 8.7K(−85%)且准确率不降反升(Opus 4:49%→74%);Claude Agent SDK 默认只载 5 个工具;OpenAI 建议一轮 <20 个函数。要点:省 token 与提精度同向,不必取舍。

### 4.4 批处理与低优先级 API

- OpenAI Batch API:五折、24h 完成窗口、独立更高速率限额且**不占标准限流额度**;Flex 档按 Batch 价计费、更慢且可能 429("You will not be charged when this occurs")[官方,2026,developers.openai.com/api/docs/guides/batch 与 /flex-processing]。
- Anthropic Batch:输入输出均五折 [官方,2026-10,定价页];Gemini Batch 约 2.5 Pro $0.625/$5.00(约为标准半价)[官方,2026-10]。
- DeepSeek 错峰:低谷时段全量半价(含缓存未命中价),周末整日按谷价 [官方,2026-10,定价页]。
- 适用边界:批处理适合评测、数据增强、离线任务(官方口径),**不适合交互 agent**;Flex 的 429 重试语义决定了它只能跑"可以失败的活" [官方,2026]。

### 4.5 提前终止与循环熔断

- 证据:arXiv"准确率常在中等成本处达峰"——超预算继续跑多数是浪费 [官方,2026-04];MAST 把"过早终止"列为失败模式之一(经 12 分册 §5.2 引),说明终止时机的两难是结构性的。
- 机制:OpenAI Agents SDK `max_turns` 超限抛 `MaxTurnsExceeded`,支持 `error_handlers` 优雅回退 [官方,2026,openai.github.io/openai-agents-python/running_agents];Magentic-One 用进度账本检测"卡死/循环"(12 分册);Claude Code 的 /usage 直接给出"loops breakdown"与行为标记 [官方,2026-10]。
- 实操:重复同参数工具调用 N 次、同一文件反复读改、思考 token 连续满档,都是可程序化检测的熔断信号【推断,由官方循环标记机制归纳】。

### 4.6 会话卫生:上下文清理与结构化请求

Claude Code 官方清单(原文要点):任务切换用 `/clear`(``/rename`+`/resume` 可回)、`/compact` 带聚焦指令、CLAUDE.md 控制在 200 行内并把细节挪进按需技能、MCP 优先 CLI 工具、具体化请求避免"improve this codebase"式漫扫 [官方,2026-10]。这些是 harness 应该自动做或引导用户做的事,而不是用户手册里的一句忠告【判断】。

**「对 harness 设计的启示」**

1. 省钱是路由问题不是压缩问题:先问"这一步需要强模型吗",再问"这一步需要进上下文吗"。
2. 落盘+引用回传应做成子代理的**默认契约**而非可选优化(呼应 12 分册"消息回传只留摘要")。
3. 批处理/错峰通道要在 harness 层暴露(评测、记忆整理、标题生成全可走),并把 429 重试语义做进任务队列。
4. 循环熔断器(重复调用检测)与 max_turns 一样属于"必须默认开"的保险丝,关掉它省下的只有事故的发现时间。

---

## 五、延迟:感知比总量重要

### 5.1 首 token 时间(TTFT)由缓存决定

长上下文全量 prefill 是秒级事件:DeepSeek 官方实测 128K 提示首 token 延迟 13 秒,命中磁盘缓存后 500ms(26 倍差)[官方,2024-08]。两大厂商都把"预热"做成了 API 能力:Anthropic 的 pre-warming 用 `max_tokens: 0` 只写缓存不计输出费 [官方,2026-10];OpenAI 的 prewarm 明确宣称"reduces time to first token" [官方,2026]。结论:TTFT 的第一杠杆是缓存命中率,第二杠杆才是推理速度【推断,由上述官方数字归纳】。

### 5.2 工具执行与并行:agent 会话的时间大头在工具

- 横评数据:harness 间完成任务的中位耗时 122–272 秒(同模型同任务,8 家 harness)[二手,2026-08,Composio,经 08 分册 §3.9 转引]——量级远超单次 LLM 调用,时间大头在工具与轮次,不在模型吞吐。
- 并行的官方数字:Anthropic 研究系统领队并行开 3–5 个子代理、子代理内并行调 3+ 工具,两项改动把复杂研究时间最多缩短 90%(经 12 分册 §4.2 引);OpenAI 的立场是"最好假设一轮内有多次调用"并给 `parallel_tool_calls` 旋钮(09 分册 §2.1)。
- 隐藏延迟:每条 bash 命令前的 Haiku 安全校验本身就是一次模型调用(08 分册 §7.1)——安全与延迟的税,极简派用"沙箱内免审"逃掉(08 分册 §3.5 Cursor/Codex 的做法)。

### 5.3 用户感知:研究结论与产品答案

- 行业共识:TTFT 是聊天 UX 的一等指标、tokens/s 决定流式观感、报表要看 P50/P95 而不是均值 [二手,2026-04,digitalapplied 延迟基准文章]。
- 感知阈值研究:对话轮替的人类基线约 700 毫秒,超过即被觉察 [二手,2025,俄勒冈州立大学研究页];一项 2025-07 的自由对话用户研究发现约 4 秒是体验劣化点,"思考中"类的自然填充语能改善感知等待 [二手,2025-07,ResearchGate 收录(未钉住原文 DOI,见 §九)]。流式输出是感知延迟的最大杠杆——先出词比先算完重要 [二手,2026,多方转述;原始量化数据未回源]。
- 产品侧的答案:把"等待"变成"可审视的进度"——计划落盘(Cursor Plan Mode、pi PLAN.md)、后台子代理完成通知(08 分册 §3.4)、云端异步 agent(Codex cloud/Cursor Cloud Agents,12 分册 §8.2)都是把同步延迟转化为异步工作流的设计。OTel 已给 latency 建了标准指标:`gen_ai.client.operation.time_to_first_chunk`(流式首块)、`gen_ai.server.time_to_first_token`、`gen_ai.execute_tool.duration`(工具耗时)[官方,2026-10,OTel metrics 文档]。

**「对 harness 设计的启示」**

1. 把 TTFT、每 token 时间、工具耗时分开计量(OTel 三个指标对应三个病灶),不要只报"总耗时"。
2. 流式 + 计划可见是免费的两个感知杠杆;云端异步化是重任务的终极答案,但要把"任务跑了多久、花了多少"在异步界面常驻(12 分册"成本防火墙"条款)。
3. 每轮注入的小模型调用(安全校验、标题、分类)要计入延迟预算并允许用户关闭或合并——它们是 100ms 级的隐形税【推断,基于 Haiku 校验机制】。
4. 并行工具调用的默认值要保守:并行买时间的前提是子任务独立(12 分册),盲并只会放大 token 倍数。

---

## 六、可观测性:出了问题怎么看见

### 6.1 OpenTelemetry GenAI 语义约定:2026-10 现状

GenAI 约定已从主 semconv 仓库**迁出为独立仓库** `open-telemetry/semantic-conventions-genai`,范围自述为"LLM、agent、embeddings、retrieval 与 MCP 操作"的语义约定,注册表含 `gen_ai.*`、`mcp.*`、`openai.*` 三个命名空间 [官方,2026-10,GitHub README]。覆盖面:span 文档(gen-ai-spans)、agent span 文档(create_agent / invoke_agent / invoke_workflow / plan / execute_tool)、metrics 文档、token 指标文档、异常事件、以及 Anthropic/OpenAI/Bedrock/Azure 四家 provider 专用约定 [官方,2026-10]。关键属性:`gen_ai.agent.id/name/description/version`、`gen_ai.conversation.id`(明确不建议用请求哈希凑数)、`gen_ai.usage.input_tokens/output_tokens` 及细粒度 `gen_ai.usage.cache_read.input_tokens`、`gen_ai.usage.cache_write.input_tokens`;`gen_ai.input.messages`/`gen_ai.output.messages`/`gen_ai.tool.definitions` 为 opt-in(可能含 PII) [官方,2026-10,agent spans 文档]。

成熟度:整个文档集状态为 **Development**,指标页每一项都带 Development 徽章,仓库尚无 release、schema URL 标 TODO [官方,2026-10,README+metrics 页]。正方:范围设计(agent/workflow/plan/execute_tool 五类 span + MCP)已经把 agent 观测该有的词汇表基本收齐,且 Claude Code 已官方支持 OTel 导出 [官方,2026-10,Claude Code costs 文档];反方:Development 状态意味着属性名可能变,生产绑定需自担迁移成本;Phoenix 走的是自家 OpenInference 标准(OTel 之上),Langfuse 则"基于 OpenTelemetry 以降低厂商锁定" [官方,各自文档,2026-10]——两套词汇并存本身就是未定型的证据。我们的判断:采用 `gen_ai.*` 作为内部字段命名,观测平台按"OTel 优先"选型,自建桥接层隔离约定变更。

### 6.2 平台格局(定位表,均为官方文档口径,2026-10)

| 平台 | 定位 | 关键特性 | 部署 | 与 OTel 关系 |
|---|---|---|---|---|
| Langfuse | 开源 AI 工程平台(观测+评测+提示管理) | 全量 trace(LLM 与非 LLM 调用)、agent graph 可视化、LLM-as-judge 评测、按用户成本追踪、告警 | 云或自托管(开源) | 摄取基于 OTel;另有原生 SDK、100+ 框架集成、LiteLLM 网关 |
| LangSmith(LangChain) | agent 观测与评测,trace→数据集→评测闭环 | 生产 trace、监控告警、在线评测、Engine 自动检测重复问题与根因 | 云/混合/自托管 | 文档未强调 OTel;自家集成生态(OpenAI/Anthropic/CrewAI 等) |
| Arize Phoenix | 开源 AI 可观测性+评测(OTel 原生) | trace(模型/检索/工具)、LLM/代码/人工三路评分、数据集实验、span 回放 | Docker/K8s 自托管,`uvx arize-phoenix serve` 即起 | 基于 OTel,OTLP 摄取;OpenInference 插桩;商业版 Arize AX |
| Braintrust | "主动式" agent 观测(观测→标注→评测→部署闭环) | trace 自动提炼关键模式、评测/playground、Loop agent 自动建 scorer 与数据集、`bt` CLI 供编码 agent 接入 | 云为主 | 文档页未提 OTel(以 provider/框架集成为主) |
| Helicone | AI 网关+LLM 可观测 | 请求/会话/用户三视图、HQL 查询、速率限制与告警、Prompts/Datasets/Playground | 开源(GitHub 6.1k 星,2026-10)+ 云 | 网关形态(置于 provider 前);与 LiteLLM 互操作;已并入 Mintlify |

选型口径【判断】:要"标准与自托管"选 Phoenix/Langfuse;要"评测与 trace 深度耦合"选 Braintrust/LangSmith;要"成本与限流在网关层解决"选 Helicone/LiteLLM。harness 的正确姿势是把日志按 OTel 标准吐出,平台可换——这与 07 分册"状态可移植性五项测试(Inspection/Export/Replay/Audit/Deletion)"同构。

### 6.3 必答问题 3:agent trace 最小字段表

综合 OTel GenAI 约定(属性名标 ※ 的可直接复用)、Claude Code /usage 的字段面、与 12 分册 MAST 结论:

| 字段 | 类型 | 用途 | 例子 |
|---|---|---|---|
| trace_id / span_id / parent_span_id | ID | 重建调用树与子代理嵌套 | `4bf92f35…` / 子代理 span 指回 invoke_agent |
| session_id(※gen_ai.conversation.id) | string | 跨请求聚合一次会话;不建议用请求哈希 | `conv_20261004_01` |
| agent 标识(※gen_ai.agent.name/id/version) | string | 区分主代理/子代理;版本用于复现 | `explore-agent` v0.3 |
| harness 版本 | string | 评测披露义务(08 分册"评测必须披露 harness") | `zcode 3.4.1` |
| operation(※gen_ai.operation.name) | enum | 区分 chat/execute_tool/invoke_agent/plan | `execute_tool` |
| provider + model(※gen_ai.provider.name / gen_ai.request.model) | string | 成本与行为归因 | `anthropic` / `claude-sonnet-5-5` |
| 请求参数(※gen_ai.request.temperature/max_tokens 等) | number | 复现与回归 | temp 0.2,max 8192 |
| token 四分类(※gen_ai.usage.input/output/cache_read/cache_write) | int | 成本计算与缓存监控 | in 1,240 / out 5,310 / cr 940,021 / cw 50,012 |
| 成本 | float+币种+价目版本 | 账单与预算 | $0.55 @ price_table 2026-10 |
| TTFT / 每请求时长 | duration | 延迟归因(prefill vs decode) | TTFT 480ms;总 2.1s |
| 工具名+参数摘要+结果体量/错误 | string+int+enum | 定位坏工具与大结果;error.type 兜底 | `bash "npm test"` → 25,003 tok;`error.type=timeout` |
| finish_reasons(※gen_ai.response.finish_reasons) | enum[] | 区分正常结束/截断/熔断 | `["max_tokens"]` |
| 循环/重复标记 | bool+计数 | 熔断依据与事后分析 | 同参数 bash 重复 4 次 |
| 失败分类(MAST) | enum+标注来源 | 规格/失配/验证三类失败统计 | `misalignment:信息传递不正确`(LLM judge 标) |
| 内容(opt-in) | messages | 人工审查与评测集沉淀 | `gen_ai.input.messages`(PII 政策约束) |

### 6.4 把 MAST 三类失败做成日志维度(T05 审核并入项)

MAST 把多智能体失败分为三大类:规格与系统设计、智能体间失配、任务验证(14 种子模式,失败轨迹占比 41%–86.7%;设计+失配合计约 79%——经 12 分册 §5.2/§十 引)。落成日志维度的做法:trace 完成时由 harness 产出 `failure_class ∈ {spec, misalignment, verification, none}` 与 `failure_mode`(14 种 MAST 子模式),标注来源分三档:程序规则(循环检测、超时、验证器失败→verification)、LLM-as-judge(批量标注轨迹,Langfuse/Phoenix 原生支持)、人工复核(队列抽样)。用途:①失败归因统计——哪类失败多就修哪类基础设施(委派模板/传话机制/验证器),呼应 12 分册"80% 工程量在三处基础件"的判断;②版本回归对比——harness 升级后三类失败的占比迁移是比总分更可操作的信号;③给评测集自动喂负例。风险(正/反):正方,LLM judge 标注使三类维度可在无人工下规模化;反方,judge 本身会错,MAST 论文的专家间一致性也非完美,自动标签只能当索引不能当结论【判断,基于 12 分册对 MAST 方法的转述】。

**「对 harness 设计的启示」**

1. trace 的字段表按"OTel 能对齐就对齐"设计,PII 字段(消息全文、工具定义)默认关闭、按会话开启。
2. 成本、缓存命中率、循环标记、MAST 分类是四个**默认就要有**的维度——缺任何一个,"出了问题怎么看见"都只剩翻日志。
3. 观测平台的锁定成本按"导出格式是否 OTel"评估;harness 自身只依赖 schema 不依赖平台。
4. /usage 式的**用户侧自查命令**与 OTel 导出并行:给用户看的是账单与归因,给工程看的是全量 trace,两套界面共用一套数据。

---

## 七、预算与熔断

### 7.1 四个层级的预算机制(均为官方文档口径)

- **平台/组织层**:LiteLLM 网关按 key/team/user 记账,`max_budget` 超限拒答、`budget_duration` 周期重置、`tpm/rpm_limit` 限速、`upperbound_key_generate_params` 给所有新 key 设硬上界(超界请求直接 400)、`temp_budget_increase` 临时提额 [官方,2026-10,docs.litellm.ai virtual_keys];厂商侧有 Console 消费限额与 Rate Limits API [官方,2026-10,platform.claude.com]。Anthropic 官方文档同时提醒订阅与 API 双通道的坑:设了 ANTHROPIC_API_KEY 环境变量即改走 API 计费 [官方,2026-10,support.claude.com]。
- **运行层**:OpenAI Agents SDK `max_turns` 超限抛 `MaxTurnsExceeded`,可用 `error_handlers` 返回"请在请求范围内收窄"式优雅降级 [官方,2026];LiteLLM 层的 429 熔断是另一道网;Claude Code 用 `/status`/`/usage` 让用户自查限额 [官方,2026-10]。
- **子代理层**:Cline 给每个子代理独立"context window and token budget"(08 分册 §3.4);Anthropic 的努力缩放规则把并行度与预算挂钩(简单事实检索 1 agent/3–10 工具调用……复杂研究才 10+ 子代理,12 分册 §4.4);Agent Teams 约 7× token 的官方数字说明团队模式必须单独预算 [官方,2026-10,Claude Code costs]。
- **缓存层**:命中率是先行指标——命中率掉 10 个点,账单马上跟着涨(§三价格结构);把"cache read 占比"做成告警比"月度超支"早得多【推断,由 0.1×/1× 价差推演】。

### 7.2 超限怎么处理:熔断、降级、告警三分

工程上应三分处理(各机制官方依据):**硬熔断**——预算/轮数/限流触顶即停(LiteLLM 429、MaxTurnsExceeded、厂商限流),并保留可恢复点(pi 会话树/Claude Code /rewind,07/08 分册);**降级**——超预算自动切便宜模型、缩上下文、关 thinking(参数都有官方开关);**软告警**——LiteLLM `soft_budget` 到线只告警不阻断 [官方,2026-10],适合长任务跑完当前步骤再停。关键设计是**超限行为要可配置且可预测**:静默降级会让用户在不知情时拿到降质结果,静默熔断会让长任务死在 90% 处【判断】。

### 7.3 公开的"账单失控"证据

- **结构性证据(官方/论文)**:agent 任务比 chat 贵 1200–3500 倍 token [官方,2026-04,arXiv];同任务 30× 方差且模型低估自身消耗 [官方,2026-04];Agent Teams 7× [官方,2026-10]。三件事叠加意味着:任何按"单次调用"心智做的预算都会被 agent 会话击穿。
- **社区事件(二手)**:OpenAI 开发者社区长期存在"runaway agent costs"(失控的 agent 账单)讨论——循环与重试实时烧钱、可见性滞后 [二手,2026,OpenAI 社区帖,经搜索确认];一支匿名团队复盘称在多 agent 生产化上累计烧掉 $47,000 才想明白基础设施缺口(按 agent 拆账、上下文超限等)[二手,2025-12,知乎复盘文,经 12 分册 §4.4 转引,金额无法回源];有成本管理产品文章称 GitHub 承认订阅制定价难以覆盖重度 agent 会话与廉价 chat 之间的差距 [二手,2026,stackspend/vantage 转述,营销动机,仅供方向]。
- **厂商响应(官方)**:订阅计划共享限额(Pro/Max 各档)+ `usage credits` 超额通道 + "API 通道警告"是 Claude Code 的官方答案 [官方,2026-10,support.claude.com];平台侧的 spend limits 与限流 API 是 Console 答案 [官方,2026-10]。

### 7.4 必答问题 4:成本控制清单(16 条,必须/应该/可选)

**必须(P0,不做就是等着事故)**

1. token 四分类计量(input/cache_read/cache_write/output)入日志,成本按价目表版本化计算(§六字段表)。
2. 会话级硬预算 + 熔断(LiteLLM max_budget / max_turns),超限可恢复(检查点/会话树)。
3. 循环检测熔断:重复同参数工具调用、同文件反复读写,超阈值即停并标记。
4. 工具结果截断上限 + 大结果落盘只回传路径与摘要(25K 截断是兜底不是设计)。
5. 缓存命中率作为一等监控指标;命中率骤降先于超支报警。
6. 按"会话 × 子代理 × 技能 × MCP 服务器"归因记账(Claude Code /usage 已示范)。

**应该(P1,默认该做,特殊场景可关)**

7. 模型路由:交互主干用中档模型、分类/校验/标题/压缩走小模型,给出官方价目对照。
8. compaction/摘要用便宜模型 + 独立提示词,执行前算"压缩净收益"(省的读价 vs 断前缀的重写价)。
9. 工具按需加载(目录常驻、详情/执行按需),整套定义 >10K token 必须实现。
10. 子代理默认"产物落盘+引用回传",并行度按努力缩放规则给默认上限。
11. 批处理/错峰通道用于离线任务(评测、记忆整理、标题),with 429 重试语义。
12. 给用户常驻的成本视图(会话累计、剩余预算、本次预估)与超限前确认。

**可选(P2,场景化收益)**

13. 长会话购买 1h TTL(写价 2×)或 prewarm,用于节奏可预测的重度会话。
14. 显式缓存断点精细调优(多前缀共享、判官型任务 70%+ 命中)。
15. 多 harness 成本横评自测(Composio 口径:每成功任务成本差可达 7 倍)。
16. 成本异常检测(某会话成本超同任务分布 P95 即告警),配合 MAST 失败分类联动分析。

**「对 harness 设计的启示」**

1. 预算系统的核心不是"算得准"而是"停得下":四个层级各有一个能独立兜底的熔断器。
2. 成本指标与失败指标要联动(循环标记↔MAST verification 类):烧钱与失败高度相关,一起看才能定位。
3. 所有降级路径(换模型/缩上下文/关 thinking)都应留痕并可关闭——用户对"花了多少钱"与"为什么变笨了"有同等知情权。
4. 把 §7.4 清单直接做成 harness 的发布检查单,P0 项全绿才准发布。

---

## 八、可信度与存疑项

- **高可信(官方一手,2026-10 实抓)**:五厂商缓存/定价页(Anthropic 两页、OpenAI 缓存与 batch/flex、Gemini 缓存与定价、DeepSeek 定价与 2024-08 缓存公告、Kimi 定价)、Claude Code costs 文档、OTel semantic-conventions-genai 仓库及 agent-spans/metrics 子页、OpenAI Agents SDK running_agents、LiteLLM virtual_keys、Manus 博客、arXiv:2604.22750(摘要+HTML 全文节选)。
- **中等(二手,已交叉)**:Composio 横评数字(经 08 分册,两源)、pi 99.93% 案例(经 07 分册,智源社区)、Anthropic 多 agent 复盘与努力缩放规则(经 12 分册,官方原文已被 T05 核对)、Langfuse/Phoenix/LangSmith/Braintrust/Helicone 定位(各家官方文档,但功能细节以文档页所载为限)。
- **未核实/存疑(明示)**:①"约 4 秒 QoE 劣化点"与"流式改善感知 7 倍"两处感知研究未能钉住原始 DOI/arXiv 编号,只到 ResearchGate/行业站层级,正文按 [二手] 处理并建议后续回源;②Kimi 早期"创建缓存 ¥24/M"与"90% 命中率"宣传口径来自搜索摘要层,未在官方定价页复核到,正文只采用实抓到的现行定价;③GitHub"订阅制定价承压"一说不回源到官方声明,仅产品文章口径;④Anthropic Console spend limits 的具体操作路径未逐页核实(404 过一次,以搜索确认的 settings/usage 路径为准);⑤本文工作示例中 token 块的**数量**全部为【推断】,单价为官方实抓;⑥LiteLLM 预算超限的 429 细节以官方文档搜索摘要确认(预算专页 404,virtual_keys 页未含超限行为)。
- **方法局限**:遵守限流规则未用子智能体,深度优先官方文档;感知延迟研究的原始论文、Helicone 定价页(404 后未补抓)、LangSmith OTel 支持细节未深挖;未做任何实测(harness 计费复现实验留给 T08)。

## 九、参考资料

1. Anthropic — Prompt caching(platform.claude.com/docs/en/build-with-claude/prompt-caching,2026-10 实抓)
2. Anthropic — Pricing(platform.claude.com/docs/en/about-claude/pricing,2026-10)
3. OpenAI — Prompt caching guide(developers.openai.com/api/docs/guides/prompt-caching,2026-10)
4. OpenAI — Batch API guide(developers.openai.com/api/docs/guides/batch,2026-10)
5. OpenAI — Flex Processing guide(developers.openai.com/api/docs/guides/flex-processing,2026-10)
6. Google — Gemini API Context caching(ai.google.dev/gemini-api/docs/caching,2026-10)
7. Google — Gemini API Pricing(ai.google.dev/gemini-api/docs/pricing,2026-10)
8. DeepSeek — API Pricing(api-docs.deepseek.com/quick_start/pricing,2026-10)
9. DeepSeek — Context Caching is Available(api-docs.deepseek.com/news/news0802,2024-08-02)
10. Moonshot Kimi — 模型定价与缓存(platform.kimi.com/docs/pricing,2026-10)
11. Manus — Context Engineering for AI Agents: Lessons from Building Manus(manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus,2025-06)
12. Anthropic — Claude Code: Costs(code.claude.com/docs/en/costs,2026-10)
13. Anthropic — Claude Help Center: Using Claude Code with Pro/Max plans(support.claude.com/en/articles/11145838,2026-10)
14. Bai et al. — How Do AI Agents Spend Your Money? Analyzing and Predicting Token Consumption in Agentic Coding Tasks(arXiv:2604.22750,2026-04)
15. Zheng et al. — Response Length Perception and Sequence Scheduling(arXiv:2305.13144,2023;本篇仅用于延迟调度背景,未作承重引用)
16. OpenTelemetry — semantic-conventions-genai 仓库(github.com/open-telemetry/semantic-conventions-genai,2026-10)
17. OpenTelemetry — GenAI Agent Spans(raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md,2026-10)
18. OpenTelemetry — GenAI Metrics(raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-metrics.md,2026-10)
19. OpenAI Agents SDK — Running agents(max_turns/MaxTurnsExceeded,openai.github.io/openai-agents-python/running_agents/,2026-10)
20. LiteLLM — Virtual Keys & Budgets(docs.litellm.ai/docs/proxy/virtual_keys,2026-10)
21. Langfuse — Docs(langfuse.com/docs,2026-10)
22. LangSmith — Observability(docs.langchain.com/langsmith/home,2026-10)
23. Arize Phoenix — Docs(arize.com/docs/phoenix,2026-10)
24. Braintrust — Docs(braintrust.dev/docs,2026-10)
25. Helicone — 官网与产品页(www.helicone.ai,2026-10)
26. 二手延迟与感知(搜索层,未钉原文):ResearchGate《Mitigating Response Delays in Free-Form Conversations》(2025-07);俄勒冈州立《Effects of Response Delay on Perceived Naturalness》(2025-05);digitalapplied.com《AI Model Latency Benchmarks 2026》(2026-04)
27. 二手成本事件:OpenAI 社区 runaway agent costs 讨论;知乎 $47,000 多 agent 复盘(经 12 分册);stackspend/vantage 成本文章(GitHub 定价承压口径)
28. 本仓库内部交叉引用(不计入独立来源数):research/07 §3.7(pi 99.93%);research/08 §3.3/§3.9(压缩横评、Composio 成本差);research/09 §2.2/§4/§6(工具 token 账本、按需加载、代码执行);research/12 §3–§5/§十(4×/15×、落盘回传、MAST)
