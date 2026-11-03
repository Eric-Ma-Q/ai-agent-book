# 17 · AI 失败案例续集 C：AI 产出进入专业流程，与陪伴关系的改动

> 调研日期：2026-10-07。方法：4 路并行检索（子智能体合计约 315 次搜索与网页抓取），一手来源优先（法院命令与裁定记录、监管通报原文、当事公司声明与公告原句），媒体精读以 Futurism、The Guardian、LawNext、Hinshaw 律所 alert、Vice、ABC、太阳时报自查报道、央视网、新华网、中国网信网等为主；主智能体另对 6 个关键 URL 做了全文复核（名单见报告）。检索规模：9 个案例 × 中英双语 + 3 组行业规范口径（司法处罚、招聘合规、内容监管）。对象界定：**AI 产出在媒体、律所、咨询、招聘等专业流程中未经充分人工核查即被使用或发布后出事**，以及**陪伴 / 情感类产品的功能与人格变更伤害用户关系**，时间跨度 2023-01 至 2026-06；与 `ai-failure-casebook.html` 已有 15 例、`research/15-ai-failure-cases-a.md` 的 9 例不重复，也不进入 T11b（`research/16-ai-failure-cases-b.md`）的范围（默认开启与数据条款、定价捆绑、AI 硬件、编码工具、语音点餐、代操作 App、Snapchat My AI、Sora 2）。文中关键事实均附 [官方]/[二手] 标注 + 日期 + URL；无出处的产品分析标【推断】；无法直接抓取原文的来源注明核对方式。

---

## 一、选例说明（含换掉的候选与落选原因）

选例沿用 casebook 三条标准：**失败类型不重复、有一手复盘或当事人表态、对产品设计有可迁移的教训**。任务候选清单 10 项选 8 项（1–7、9），清单外从候选 10 的方向扩展出"筑梦岛约谈"1 例，共 9 例；至少 2 个中文案例的要求由"自媒体 AI 造谣查处"与"筑梦岛约谈"满足。候选 7（招聘 AI）以 Mobley v. Workday 为主案，Amazon 2018 年废弃的招聘模型作为背景引用。

**换掉的候选 8：Duolingo"AI 优先"备忘录（2025-04~05）。** 原因：①事件性质是备忘录外泄引发的组织与叙事反弹，缺少可落进五段式的"AI 产出/决策伤害事件"；②规律与已有 15 例的 GPT-5 换代案（变更管理）、Klarna 案（叙事先行）重叠；③与 T11b"AI 功能默认开启"主题相邻。故整体换下。

**核实要点（检索中确认、写作时以此为准）**：
1. 中文 AI 造谣案以官方通报明确的**西藏定日地震"小男孩被埋图"案**（公安部网安局 2025-01-10 通报）为主例；其他流传的灾情谣言说法未找到对应官方通报，不采用。
2. 德勤案：发现者为**悉尼大学健康与福利法研究员 Christopher Rudge**；德勤从未公开使用"AI-generated hallucinations"表述（这是媒体标题口径），其公开回应止于"部分脚注与引用有误"；退款为**合同最后一期款项**（金额未公布），非全额。
3. Workday 案：主审法官经 CourtListener docket 核实为 **Rita F. Lin**。

**检索中无法核实而放弃的方向**：中国医科大学附属盛京医院医生论文出现"As an AI language model"被撤稿一事，经 6 组以上中英文检索（含 Retraction Watch 站内检索）未找到可靠报道，放弃；r/replika 社区规模与用户流失数字无可靠来源，未引用；Arena Group 声明原件未取回（以 BBC/Business Insider/Futurism 的转述交叉核对）。

---

## 二、横向对比：9 个案例一张表

| 案例 | 失败类型 | 谁先发现 | 暴露耗时 | 止血手段 | 最终修在哪一层 |
|---|---|---|---|---|---|
| CNET AI 理财文章 | 核查旁路 | 外部（营销从业者发推 + Futurism） | 约 2 个月 | 暂停 AI 写稿（首曝后约 10 天） | 编辑流程层（联合署名 + 明示披露）；SEO 动机未动 |
| Sports Illustrated 假作者 | 署名造假 | 外部（Futurism 调查） | 数个月【推断】 | 删页、切割供应商 AdVon | 组织层（高管与 CEO 解雇、授权终止）；行业层未修 |
| 《芝加哥太阳时报》AI 书单 | 特刊免检 | 外部（书评编辑，Bluesky） | 约 1 天 | 电子版下架、停购 King 编辑特刊 | 流程层（编辑部核查 + AI 政策 + 标准团队）——9 例中最完整 |
| Mata v. Avianca 假判例 | 盲信输出 | 对方律师 + 法院 | 约 1–2 个月；司法确认约 4 个月 | 司法制裁即终局 | 个人与律所受罚；行业规范（ABA 512、法官令、追踪库） |
| 德勤澳大利亚政府报告 | 背书失灵 | 外部（悉尼大学研究员） | 约 7 周 | 退最后一期款、修订版上线并披露 AI 使用 | 商务与披露层；流程制度化未见【推断】 |
| Workday 招聘筛选 | 筛选偏差 | 原告本人 + 诉讼 | 个体即时；系统性认定约 2 年 | 无产品止血，诉讼进行中 | 司法认定层（"代理人"责任、集体认证）；产品层未动 |
| Replika 移除 ERP | 关系拆除 | 用户社区 | 约 1–2 周 | 老用户版本回退（约 7 周后） | 产品层（回退选项）；监管层（2025-04 罚 500 万欧元） |
| 自媒体 AI 造谣 | 移花接木 | 监管巡查（公安网安部门） | 3 天（定日案）~2 个月（南阳案） | 行拘 + 删帖 + 专项处置 | 法律层（行拘）+ 平台治理（处置 3,500 余款 AI 产品） |
| 筑梦岛 AI 陪伴约谈 | 擦边漏管 | 媒体（央视等持续曝光） | 媒体曝光约 7 个月后监管约谈 | 约谈整改、批量下架智能体 | 功能层（青少年模式 40 分钟/日）；一年后仍被曝擦边 |

**读法**：与前 24 例不同，本批出现了一个新的"最先发现者"——**监管巡查**（AI 造谣案的公安网安部门），也是唯一由"内部"先发现的群体；专业流程案（媒体、律所、咨询）的暴露耗时以周和月计，因为**出错的内容都以"成品"形态通过了所有内部关卡**。修复最完整的是《芝加哥太阳时报》（流程层全面重做），修复最悬空的是 Workday（产品未动，全靠司法推进）与德勤（商务了结，流程未见公开整改）。

---

## 三、案例详解

### 1. CNET：AI 批量写理财文章——"1% 的产量"，一半要更正

- CNET（Red Ventures 旗下）· CNET Money（内部 AI 引擎）/ 2022-11~2023-03 / 失败类型：**核查旁路**

**一句话定性**：77 篇号称"经人工编辑和事实核查"的 AI 理财文章，41 篇需要更正，另有一批被逐句对照出剽窃——核查岗位都在，核查动作没跑：AI 披露藏在署名下拉框里，剽窃检查器"要么没被正确使用，要么没能识别"。

**产品假设**：SEO 驱动的理财解释文（CD 利率、Zelle 教程等）可以交给内部 AI 引擎批量生成，人工编辑过一遍即算"事实核查"；母公司 Red Ventures 旗下拥有一批联盟返利站点（Bankrate、The Points Guy、CreditCards.com 等），这类内容天然服务于联盟收入。
**成功指标**：产出量与搜索排名（联盟收入）【推断：官方未公布指标，按 The Verge 报道的"SEO-driven to generate affiliate revenue"与 Red Ventures 业务模式推定】。

**时间线**：
- 2022-11 **发布**：CNET Money 开始发布 AI 生成的理财短文，署名 "CNET Money Staff"，AI 披露只在点击署名后的下拉说明中可见，无正式公告 [二手 2023-01-15，Futurism]。
- 2023-01-11 **信号**：网络营销从业者 Gael Breton 发推发现这批文章；Futurism 随后跟进，当时统计"约 73 篇" [二手 2023-01-15，Futurism]。
- 2023-01-16 **响应**：主编 Connie Guglielmo 发文承认这是一场"实验"（原文完整现址未核实，BBC 称其 1-12 前后提及；见报告待决问题）。
- 2023-01-23 **信号**：Futurism 刊出剽窃调查：AI 文章与 Forbes Advisor、The Balance、Investopedia、Bankrate 乃至 CNET 自己的稿件整句雷同；受访教授评价这些例子 "clearly" 构成剽窃 [二手 2023-01-23，Futurism]。
- 2023-01-20~21 **响应**：宣布暂停 AI 写稿 "for now" [二手 2023-01-25，The Verge]。
- 2023-01-25 **修复**：官方 FAQ 承认 77 篇中 41 篇需要更正（含复利计算、CD 利率等事实错误），公布暂停决定、联合署名、披露明示与自动引用检查工具计划 [官方 2023-01-25，CNET FAQ，URL 经主智能体复核]。
- 2023-03 **修复（组织）**：裁员约 10%；主编卸任，转任母公司 Red Ventures "SVP of AI content strategy"；CNET 同时宣布恢复 AI 辅助写作 [二手 2023-03-03，Talking Biz News（仅域名级链接，未抓全文）]。

**最先发现**：外部（营销从业者 + Futurism）。**暴露耗时**：约 2 个月（2022-11 开始发布 → 2023-01-11 被发现）。**止血耗时**：约 10 天（首曝 → 暂停）。

**为什么内部没拦住**：
- 核查是"过目"不是"验证"：41/77 的出错率说明人工环节没有逐条对照数字来源【推断：官方 FAQ 只以"人和工具都会犯错"带过，未解释核查动作】。
- 剽窃检查形同虚设：官方原句承认剽窃检查器 "either wasn't properly used by the editor or it failed to catch sentences or partial sentences" [官方 2023-01-25，CNET FAQ]。
- 披露设计成"不找就看不见"：AI 身份藏在署名下拉框，等于把知情权外包给用户的探索欲 [二手 2023-01-15，Futurism]。
- 动机层没有刹车：SEO 与联盟收入决定选题，产量比质量更被奖励【推断】。

**根因分层**：① **症状**：理财事实错误与整句剽窃。② **机制**：内部 AI 引擎"生成通顺文本"的能力远强于"保证财经事实与原创性"的能力，产出以成品形态直接进发布队列。③ **产品决策**：把"编辑过一遍"当核查；把披露藏起来；用集体署名稀释个人责任。④ **流程与组织**：发布门禁没有引用与相似度校验；SEO 指标没有配对的"更正率"反指标。

**止血 / 修复 / 制度化**：
- 止血：暂停 AI 写稿。
- 修复：署名改为 "CNET Money" 并加上人类编辑联合署名；AI 披露改为无需悬停即可见 [官方 2023-01-25，CNET FAQ]。
- 制度化：未见公开门禁承诺【推断：2023-03 即恢复 AI 写作；主编转任"AI 内容战略"高管——把出事环节的负责人变成了 AI 推广负责人】。

**做对了什么 / 还欠缺什么**：做对了：官方 FAQ 公开了准确篇数（77）、更正数（41）与暂停决定，比多数"外包内容出事"的媒体透明。欠缺：公布整改当天即宣布将继续使用 AI，之后未见任何经第三方验证的核查流程；同期约 10% 裁员与主编调岗【推断：直接因果未核实】。

**如果你是这个产品的 PM**：
1. AI 产出的事实字段（利率、数字、日期）逐条与原始来源对照——机器能查的进发布门禁，不留给编辑"过目"。
2. 相似度检测（对自家历史稿 + 竞品站点）作为发布前必跑项，命中阈值即打回。
3. AI 披露放正文首行而非署名悬停——披露的可达性决定它是声明还是遮羞布。
4. 集体署名改为"人 + AI"联合署名，让具体的人对核查结果负责。
5. SEO 产量指标配一个"更正率"反指标，超过阈值停线。

**来源**：
1. Futurism · CNET Is Quietly Publishing Entire Articles Generated By AI（2023-01-15 更新，已抓全文）https://futurism.com/the-byte/cnet-publishing-articles-by-ai
2. Futurism · CNET's AI Journalist Appears to Have Committed Extensive Plagiarism（2023-01-23，已抓全文）https://futurism.com/cnet-ai-plagiarism
3. CNET · CNET Is Testing an AI Engine. Here's What We've Learned, Mistakes and All（官方，2023-01-25，已抓全文并经主智能体复核）https://www.cnet.com/tech/cnet-is-testing-an-ai-engine-heres-what-weve-learned-mistakes-and-all/
4. The Verge · CNET found errors in more than half of its AI-written stories（2023-01-25，已抓全文）https://www.theverge.com/2023/1/25/23571082/cnet-ai-written-stories-errors-corrections-plagiarism
5. Futurism · News Site Admits AI Journalist Plagiarized and Made Stuff Up, Announces Plans to Continue Publishing Its Work Anyway（2023-01-25，已抓全文）https://futurism.com/cnet-editor-in-chief-addresses-ai

---

### 2. Sports Illustrated：假作者与 AI 头像——署名造假把编辑部变成了空壳

- Arena Group · Sports Illustrated 产品导购内容（供应商 AdVon Commerce）/ 2023-11 / 失败类型：**署名造假**

**一句话定性**：一个站外查无此人的"Drew Ortiz"，头像是 AI 头像商店里按描述生成的库存脸，他的"评测"靠联盟链接变现；曝光后页面被连夜删除、文章换个人名重新署名。Arena Group 的回应是"内容是授权采购的"，把责任递给供应商 AdVon——而 AdVon 正在为 150 多家出版方生产同样"数以万计"的内容。

**产品假设**：电商导购内容可以外包给第三方供应商批量生产，署名与头像只是"界面元素"；读者在乎商品清单，不在乎作者是谁。
**成功指标**：联盟收入与内容产量【推断：按导购内容属性与 AdVon 商业模式推定】。

**时间线**：
- 2023-11-27 **信号**：Futurism 调查：SI 上的 "Drew Ortiz" 站内简介丰富、站外无任何社交媒体或发表历史；其头像在 AI 头像售卖网站以 "neutral white young-adult male with short brown hair and blue eyes" 的描述出售；另一假作者 "Sora Tanaka"（描述 "joyful asian young-adult female"）夏季顶替后消失；匿名信源称假作者"有很多"；Futurism 求证后所有假作者页面被删除，文章改换署名；同类假作者也出现在 Arena 旗下财经网站 TheStreet [二手 2023-11-27，Futurism（已抓全文）]。
- 2023-11-27/28 **响应**：Arena Group 否认 AI 生成，称文章是授权采购的 "licensed content"，来自第三方公司 AdVon Commerce，已终止合作；转述 AdVon 说法称文章由真人撰写编辑、假名是为"保护作者隐私" [二手 2023-11-28，Business Insider（已抓全文）、BBC（转述）]。
- 2023-12-07 前后 **响应**：解雇相关高管 [二手，TheWrap（未抓全文）]。
- 2023-12-12 **响应**：CEO Ross Levinsohn 被解雇（公告解职自 12-11 起），官方理由是"提升运营效率与收入"；据报道他是丑闻后第四位离开的高管 [二手 2023-12-12，BBC/CNN（本环境仅域名级链接，日期经多家交叉）]。
- 2024-01 **修复（商务）**：品牌方 Authentic Brands Group 以 Arena 未支付约 375 万美元季度授权费（2024-01-01 到期）认定违约，终止 SI 运营授权（Sportico 称 1 月 19 日，NYT 确认为 1 月）；Arena 随后裁员约 80 人 [二手 2024-03-18，NYT（域名级）；2024-01-19，Sportico（域名级）]。
- 2024-05-08 **信号（行业层面）**：Futurism 披露 AdVon 内部系统：为 150 多家出版方生产"数以万计"的文章，客户含 USA Today（Gannett）、LA Times 等；内部工具截图中一篇已发布文章的 source 字段写着 "AI" [二手 2024-05-08，Futurism（已抓全文）]。

**最先发现**：外部（Futurism 调查）。**暴露耗时**：数个月【推断：假作者内容在曝光前已上线运行一段时期，起止时间未经核实】。**止血耗时**：曝光当周（删页、切割供应商）。

**为什么内部没拦住**：
- 署名核验环节不存在：假作者没有社交媒体、没有发表历史，任何一次"作者是谁"的例行检查都能拆穿——Futurism 的核查路径本身证明了这点【推断】。
- 供应商直供、编辑部旁路：导购内容不走新闻编辑部，Arena 事后只能以"那是采购内容"回应 [二手 2023-11-28，Business Insider]。
- 被揭穿后先删页后解释：没有"内容异常"的披露机制，删除动作反过来成为二次丑闻 [二手 2023-11-27，Futurism]。
- 公司治理与内容供应链脱节：CEO 层面对旗下网站的内容来源没有审计【推断】。

**根因分层**：① **症状**：虚构作者 + AI 头像 + 无法追责的导购内容。② **机制**：署名是产品描述而非真人，供应商批量供货绕过编辑。③ **产品决策**：用"授权采购"扩充产量，署名真实性不设卡。④ **流程与组织**：内容供应链无审计；出事后以切割供应商代替流程整改。

**止血 / 修复 / 制度化**：
- 止血：删页、终止 AdVon 合作、解雇高管与 CEO。
- 修复：ABG 终止授权，SI 于 2024-03 转由 Minute Media 运营（10 年协议）[二手 2024-03-18，NYT（域名级）]。
- 制度化：未见 Arena 公开的流程整改【推断】；AdVon 同类内容遍布 150+ 出版方，行业层面没有建立供应商内容审计。

**做对了什么 / 还欠缺什么**：做对了：品牌方 ABG 用"欠费 + 信任"的双重理由果断终止授权，让失败的运营方出局——这是本批案例中最"市场机制"的处理。欠缺：Arena 至今没有一份"假作者是怎么上线的"复盘；AdVon 在行业内继续存在【推断：截至 2024-05 报道仍活跃】，同样的风险换一家出版方随时重演。

**如果你是这个产品的 PM**：
1. 对署名做 KYC（know your author）：真人、可验证身份、发表历史，三缺一不上线。
2. 外包内容与自产内容同一门禁：署名核验、相似度、事实抽查一样不少；供应商合同写明 AI 使用披露义务。
3. 内容出问题时"删除"必须伴随公开说明，否则删除动作就是新事故。
4. 对供应商交付内容按比例抽查真实性（如每期抽 5% 逐条核）。
5. 记住：你的品牌为供应商的内容背书——读者不区分"你们写的"和"你们买的"。

**来源**：
1. Futurism · Sports Illustrated Published Articles by Fake, AI-Generated Writers（2023-11-27，已抓全文）https://futurism.com/sports-illustrated-ai-generated-writers
2. Business Insider · Sports Illustrated reportedly published articles by fake AI-generated writers（2023-11-28，已抓全文）https://www.businessinsider.com/sports-illustrated-ran-articles-by-fake-ai-generated-writers-report-2023-11
3. Futurism · Meet AdVon, the AI-Powered Content Monster Infecting the Media Industry（2024-05-08，已抓全文）https://futurism.com/advon-ai-content
4. TheWrap · Sports Illustrated Accused of Posting AI-Generated Content / 高管解雇报道（2023-11/12，未抓全文）https://www.thewrap.com/sports-illustrated-executives-fired-ai-fake-authors/
5. Salon · Major media outlets linked to company behind fake AI writers, report（2024-05-08，未抓全文）https://www.salon.com/2024/05/08/major-media-outlets-linked-to-company-behind-fake-ai-writers-report/

---

### 3. 《芝加哥太阳时报》：64 页特刊、10 本不存在的书——"合作内容"绕过了编辑部

- Chicago Sun-Times · "Heat Index" 夏季特刊（King Features 授权制作）/ 2025-05 / 失败类型：**特刊免检**

**一句话定性**：15 本"暑期好书"里 10 本不存在——Isabel Allende、Andy Weir、Brit Bennett 们"写出"了他们从没写过的书。内容由第三方特刊供应商组织、自由撰稿人用 AI 生成，直接上了印刷版，而报纸 CEO 事后承认：它"未经新闻编辑部审查就进了报纸"。

**产品假设**：第三方授权特刊是"版面填充物"，与新闻内容适用不同（更低的）标准；撰稿人交付的成稿即成品。
**成功指标**：特刊填充率与制作成本【推断：按合作内容业务模式推定】。

**时间线**：
- 2025-05-18 **发布**：64 页特刊 "Heat Index: Your Guide to the Best of Summer" 随周日印刷版出街，第 62 页为 2025 暑期书单（15 本）；该特刊由赫斯特旗下 King Features Syndicate 制作并授权，《费城问询报》同期刊出同一来源的 56 页版本 [官方 2025-05-20/29，太阳时报自查报道]。
- 2025-05-19~20 **信号**：Book Riot 编辑 Kelly Jensen 通过图书馆数据库核实书单，在 Bluesky 公开质疑；404 Media 于 5-20 报道，The Guardian、NPR 等同日跟进 [二手 2025-05-20，The Guardian（已抓全文）、404 Media]。
- 2025-05-20 **响应**：太阳时报自查：撰稿人 Marco Buscaglia 承认用 AI（"Stupidly, and 100% on me, I just kind of republished this list that [an AI program] spit out."）；King Features 宣布终止与其合作（他反驳：合同里并没有 AI 条款）；报纸移除电子版特刊并致读者信 [官方 2025-05-20，太阳时报（已抓全文）]。
- 2025-05-29 **修复**：自查发现整个特刊的 10 篇署名信源文章"多处错误"——伪造 Alice Waters 的引语（安在她从未接受过的采访上）、查无此人的"科罗拉多大学休闲研究教授 Jennifer Campos"、被本人否认的多位受访者；CEO Melissa Bell 发表道歉文：10 本书与书介"凭空捏造"（"invented out of whole cloth"），并宣布整改 [官方 2025-05-29，太阳时报自查报道 + CEO 道歉文（均已抓全文并经主智能体复核）]。

**最先发现**：外部（读者 Kelly Jensen）。**暴露耗时**：约 1 天（刊出次日被公开质疑）。**止血耗时**：约 2 天（电子版下架）；完整自查与 CEO 道歉约 11 天。

**为什么内部没拦住**：
- "合作内容"通道绕开编辑部：Bell 原句"The content wasn't produced by Sun-Times journalists, nor was it reviewed by the newsroom prior to placement in the paper." [官方 2025-05-29，CEO 道歉文]。
- 供应商与撰稿人之间没有 AI 条款：Buscaglia 自称合同没有 AI 政策约束，King 却声称他违反了"严格 AI 政策"——两头都说自己有理，恰恰说明没人真正管过 [官方 2025-05-29，太阳时报自查]。
- 层层背书没有一层验证：15 本书、10 本假，验证成本是"查一次书目数据库"，但 King、报纸、印刷流程没有任何环节做【推断】。
- 预算收缩背景：事发约两个月前报纸 20% 员工接受买断（NBC 引 Axios；与本案直接因果未核实）。

**根因分层**：① **症状**：不存在的书、伪造的引语与受访专家。② **机制**：AI 按真实作者名生成"合理的"书名与书介，格式完美、检索不到。③ **产品决策**：特刊按"填充物"标准采购，不经编辑部。④ **流程与组织**：第三方内容无独立审查；AI 政策事发前"已有草案"但未覆盖外部内容生产者。

**止血 / 修复 / 制度化**：
- 止血：电子版下架、印刷订户不收费、致读者信。
- 修复：停止采购 King Features 的编辑类特刊（保留漫画与填字）；移除另一期存疑的 11 月假日特刊 [官方 2025-05-29，CEO 道歉文]。
- 制度化：起草公开 AI 政策 + AI 监督委员会审议；第三方授权内容今后必须标示来源、不得呈现为新闻部作品、经新设 Standards 团队审查——本批 9 例中最完整的流程层修复。

**争议点（正方 / 反方 / 我们的判断）**：
- 正方（报纸立场）：内容是授权采购的，编辑部不知情；发现后反应完整（下架、自查、道歉、政策）。
- 反方：署名是太阳时报，读者默认报纸为全部版面内容负责；"我们不知道"本身就是流程失守——64 页内容进印刷版没有一道编辑眼睛，这是组织选择而非意外。
- 我们的判断：反方成立。"合作内容"可以适用不同标准，但不能没有标准。本案的价值在于它演示了正确修复的样子：来源标示、编辑部审查、标准团队——这三件事事发前都做得到。

**做对了什么 / 还欠缺什么**：做对了：把丑闻变成自查，自己挖出比书单更大的窟窿；CEO 道歉具体到"五个人为错误"，包括自己的批准（"Human mistake No. 5: my own."）。欠缺：暴露靠读者而非自查；被冒用的作家只能自己辟谣（Min Jin Lee："I have not written and will not be writing a novel called 'Nightshade Market.' Thank you."[二手 2025-05-21，NBC News]）。

**如果你是这个产品的 PM**：
1. 任何进入正式渠道的内容（外包/授权/特刊）走同一核查门禁：作者身份、信源、引用逐条验。
2. AI 政策必须覆盖外部内容生产者，写进合同并在交稿界面强制确认。
3. 书目/文献引用做存在性校验：查 ISBN/DOI/出版社官网，一次 API 调用的成本。
4. 被冒名的第三方（作家、专家、机构）主动通知与道歉，不要等他们自己发帖。
5. "合作内容"在版面上显式标注来源与制作方，与新闻内容视觉区分。

**来源**：
1. Chicago Sun-Times · Syndicated content in Sun-Times special section included AI-generated misinformation（2025-05-20，已抓全文）https://chicago.suntimes.com/news/2025/05/20/syndicated-content-sunday-print-sun-times-ai-misinformation
2. The Guardian · Chicago Sun-Times confirms AI was used to create reading list of books that don't exist（2025-05-20，已抓全文）https://www.theguardian.com/us-news/2025/may/20/chicago-sun-times-ai-summer-reading-list
3. 404 Media · Chicago Sun-Times Prints AI-Generated Summer Reading List With Books That Don't Exist（2025-05-20，引言部分已抓）https://www.404media.co/chicago-sun-times-prints-ai-generated-summer-reading-list-with-books-that-dont-exist/
4. Chicago Sun-Times · Special section with fake book list plagued with additional errors, Sun-Times review finds（2025-05-29，已抓全文）https://chicago.suntimes.com/news/2025/05/29/special-section-king-fake-book-list-errors-sun-times-review
5. Chicago Sun-Times · Lessons (and an apology) from the Sun-Times CEO on that AI-generated book list（2025-05-29，已抓全文并经主智能体复核）https://chicago.suntimes.com/opinion/2025/05/29/lessons-apology-from-sun-times-ceo-ai-generated-book-list
6. NBC News · Chicago Sun-Times admits summer book guide included fake AI-generated titles（2025-05-21，已抓全文）https://www.nbcnews.com/tech/tech-news/chicago-sun-admits-summer-book-guide-included-fake-ai-generated-titles-rcna208325

---

### 4. Mata v. Avianca：六条编造的判例与 5,000 美元罚金——"AI 不是搜索引擎"

- 律所 Levidow, Levidow & Oberman · Mata 诉 Avianca 案辩护状（ChatGPT 参与）/ 2023-02~06 / 失败类型：**盲信输出**

**一句话定性**：律师用 ChatGPT 准备辩护状，引用了六个不存在的判例；对方律师找不到、法官也找不到后，律师把 ChatGPT "确认存在"的对话提交给法院自证清白。最终两名律师与律所连带罚 5,000 美元，并被要求逐一致函被假判例"署名"的法官——法官在命令里写下后来被反复引用的判断："它不是搜索引擎。它不检索已有文件。"

**产品假设**：本例没有传统意义的"产品方"：风险方是把通用 AI 工具当检索工具使用的专业人士（工具方假设用户会正确使用通用能力；专业方假设"生成内容的格式可靠即内容可靠"）。
**成功指标**：不适用（工具方未披露任何相关指标）。

**时间线**：
- 2019 **背景**：Roberto Mata 称在 Avianca 航班上被餐车撞伤，后诉至纽约南区联邦法院 [二手，Wikipedia（已抓全文）]。
- 2023-02 **发布（涉事文件）**：Levidow 律所提交答辩状（Peter LoDuca 署名），引用六个虚构判决（其中 Zicherman v. Korean Air Lines 为真实案件但引文编造）[二手，Legal AI Insights（已抓全文）、Wikipedia]。
- 2023-04 **信号**：Avianca 方律师向法院表示部分判例"无法找到"；法院要求提交副本，律师提交了伪造的判决书 [二手，Hinshaw 律所 alert（已抓全文）]。
- 2023-05-04 **信号**：法官 P. Kevin Castel 发布 show cause order，称之为 "unprecedented circumstance"（前所未有），启动 Rule 11 制裁程序 [二手 2023-05，Hinshaw（已抓全文）]。
- 2023-05-25 **信号**：律师 Steven Schwartz 提交宣誓书，附其与 ChatGPT 的对话：他问 "is varghese a real case"，ChatGPT 答 "Yes"，并称这些案件 "can be found in reputable legal databases such as LexisNexis and Westlaw" [二手 2023-05，Hinshaw（已抓全文）；后一引语见 Telegraph 报道（仅搜索摘要）]。
- 2023-06-22 **响应/裁决**：Castel 发布制裁命令（Mata v. Avianca, Inc., 678 F. Supp. 3d 443）：认定两名律师"主观恶意"，5,000 美元罚金由 Schwartz、LoDuca 与律所三方连带承担（命令原文摘录："A penalty of $5,000 is jointly and severally imposed on Respondents"）；命令通知委托人及被假判决冒名的各位法官 [二手 2023-06，Wikipedia、The Expert Record（命令原文摘录）；判决原文页（FindLaw/Justia）403 未抓，见报告待决问题]。

**法官命令要点**（经多来源交叉核实）：
- "Respondents abandoned their responsibilities when they submitted non-existent judicial opinions with fake quotes and citations created by the artificial intelligence tool ChatGPT…"（提交不存在的判决即弃守职责）
- "It is not a search engine. It does not retrieve existing documents."（它不是搜索引擎，不检索已有文件）
- "Technological advances are commonplace and there is nothing inherently improper about using a reliable artificial intelligence tool for assistance."（使用可靠 AI 工具本身无不妥——罚的不是用 AI，是没核查）

**此后同类处罚趋势**：
- Park v. Kim（第二巡回法院，2024-01-30）：律师引用 ChatGPT 生成的假判例，罚 2,000 美元并移交律师纪律程序——首个联邦上诉法院同类制裁 [二手，Justia（403 未抓，经多来源交叉核对）]。
- Wadsworth v. Walmart（怀俄明联邦地区法院，2025-02-24）：Morgan & Morgan 律所三名律师被分别罚 3,000/1,000/1,000 美元（起草者、监督合伙人、当地律师），律所本身因有培训与核查政策未被罚；判词引 Mata 案："A fake opinion is not 'existing law'"，并警告 "Blind reliance on another attorney can be an improper delegation of this duty" [二手 2025-02-25，LawNext（已抓全文）]。
- ABA Formal Opinion 512（2024-07-29）：美国律师协会首份生成式 AI 伦理意见：律师对 AI 输出负核查、保密、告知与监督义务，"仅在委托协议里加一句通用授权条款并不充分" [官方 2024-07，ABA 新闻稿（403 未抓，经检索摘要与解读页交叉核对）]。
- 规模化证据：Damien Charlotin 的 AI Hallucinations 数据库收录全球法院认定依赖 AI 幻觉材料的案件，截至 2026-10-05 共 **2,149 件**（美国 1,473、加拿大 229、澳大利亚 112、英国 70）[二手 2026-10，Charlotin 数据库（已抓全文并经主智能体复核）]。

**最先发现**：对方律师 + 法院。**暴露耗时**：约 1–2 个月（文件提交 → 对方发现）；司法确认约 4 个月。**止血耗时**：不适用（司法程序即终局）。

**为什么内部没拦住**：
- 律所没有"AI 产出必须核验判例存在性"的流程：Schwartz 直接把 ChatGPT 当检索工具，署名律师 LoDuca 未逐条核实即署名提交【推断：宣誓书与制裁命令所述事实的直接推论】。
- 发现错误后的补救反而加重过错：法院要求提供判例副本时提交伪造件、坚持立场数周，直至被定性为"主观恶意" [二手，制裁命令报道]。
- 专业训练里"格式正确 = 大概率真实"的直觉在生成式 AI 上失效：编造的判例格式完美、结构完整【推断】。

**根因分层**：① **症状**：法庭文件引用六个假判例。② **机制**：生成式模型按"最像判决书的文本"生成；把生成当检索是能力错配。③ **产品决策（律所）**：无 AI 使用规范、无产出核验步骤，署名与实际工作脱节。④ **流程与组织**：行业规范空窗，法院只能事后处罚。

**止血 / 修复 / 制度化**：
- 止血：不适用。
- 修复：罚款、通知被冒名法官、Mata 的起诉被驳回。
- 制度化：ABA 512、各地法院 AI 使用披露令、处罚常态化与公开追踪数据库——专业服务行业里制度化最快的案例。

**做对了什么 / 还欠缺什么**：做对了（司法系统角度）：处罚没有一刀切禁止 AI（"使用可靠工具本身无不妥"），而是精确打击"未核查"，为全行业写下清晰的及格线。欠缺：个案威慑赶不上工具普及速度（截至 2026-10 已 2,149 件）；被冒名的法官要靠涉事律师自己写信致歉。

**如果你是这家律所的管理合伙人**：
1. "判例存在性核验"写进 AI 使用政策：凡引用必查官方数据库，机器查、留痕、复核人签字。
2. 署名律师必须读过全部引用文件——署名的法律意义就是"我核实过"。
3. AI 产出的法律检索配独立核查工具（判例库反查），与人类初稿走同一 KeyCite/Shepardize 流程。
4. 把 Mata 案与本地同类处罚案例做成新员工必修课。
5. 出错后立即坦白并停止辩护——本案从"疏忽"变成"恶意"，就在于坚持假判例的那几周。

**来源**：
1. Wikipedia · Mata v. Avianca, Inc.（案件综述，已抓全文）https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.
2. Hinshaw & Culbertson · New York Lawyer Who Cited Non-Existent Cases Generated by ChatGPT Now Faces Sanctions Hearing（2023-05，已抓全文）https://www.hinshawlaw.com/en/insights/lawyers-for-the-profession-alert/new-york-lawyer-who-cited-non-existent-cases-generated-by-chatgpt-now-faces-sanctions-hearing
3. Legal AI Insights · Mata v. Avianca 档案页（六个假判例清单，已抓全文）https://legalaiinsights.com/tool-evaluations/mata-v-avianca-chatgpt-citation-hallucination-sanctions-2023
4. LawNext · Federal Judge Sanctions Morgan & Morgan Attorneys for AI-Generated Fake Cases in Court Filing（2025-02-25，已抓全文）https://www.lawnext.com/2025/02/federal-judge-sanctions-morgan-morgan-attorneys-for-ai-generated-fake-cases-in-court-filing.html
5. Damien Charlotin · AI Hallucinations 数据库（2026-10-05 时点 2,149 件，已抓全文并经主智能体复核）https://www.damiencharlotin.com/hallucinations/
6. ABA · ABA issues first ethics guidance on a lawyer's use of AI tools（2024-07-29，403 未抓，经检索摘要交叉）https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/

---

### 5. 德勤澳大利亚：44 万澳元的政府评估报告——出事在脚注里

- Deloitte Touche Tohmatsu（澳大利亚）· DEWR "Targeted Compliance Framework Assurance Review" 报告 / 2025-07~12 / 失败类型：**背书失灵**

**一句话定性**：一份交给就业部门的"独立保证评估"报告，被悉尼大学研究员发现引用了不存在的书、编造的联邦法院判例引语，多达约 20 处错误；德勤先"为报告背书"、拒答是否用了 AI，两个月后才交出修订版并退掉最后一期合同款——合伙人年内离职，参议员点评："看起来 AI 干了大部分活，德勤的问题是缺人类智能。"

**产品假设**：咨询报告的"独立保证"价值来自品牌背书；引用与脚注是形式要件、不影响结论；AI 是提高效率的内部工具，无需披露。
**成功指标**：合同按期交付与验收【推断：约 44 万澳元合同，按咨询业常规口径推定】。

**时间线**：
- 2024-12 **发布（委托）**：就业与劳资关系部（DEWR）委托德勤对失业救济 Targeted Compliance Framework（自动扣罚福利的 IT 系统）做独立保证评估 [二手 2025-10-06，The Guardian（已抓全文并经主智能体复核）]。
- 2025-07-04 **发布（报告）**：237 页最终报告在 DEWR 官网发布 [二手 2025-10-06，The Guardian]。
- 2025-08-22/25 **信号**：Financial Review 报道学界质疑报告疑似 AI 生成；悉尼大学健康与福利法研究员 Christopher Rudge 发现报告引用了其同事、公法教授 Lisa Burton Crawford 一本不存在的书；被冒引学者表示"看到研究被这样署在我名下，令人不安" [二手 2025-08-28，Pivot to AI（基于 AFR，已抓全文）]。
- 2025-08 下旬 **响应（第一轮，方向错误）**：德勤声明"为我们的工作与报告结论背书"（"stands by our work and the findings in the report"）、"每篇被引文章的内容是准确的"，拒绝说明是否使用 AI；其提交的更正引用清单仍不能支撑对应论点 [二手 2025-08-28，Pivot to AI]。
- 2025-10-03 **修复**：修订版报告重新上线：更正引用与脚注，删除归于联邦法院法官的编造引语（robodebt 案 Deanna Amato v Commonwealth），附录首次披露使用生成式 AI（Azure OpenAI GPT-4o，DEWR 授权许可并托管于 DEWR 的 Azure 租户）[二手 2025-10-06，The Guardian]。
- 2025-10-05/06 **响应**：DEWR 确认德勤同意退还合同最后一期款项（具体金额未公布）；合同总额约 44 万澳元（AFR 称 A$439,000）；德勤发言人："更新绝不会影响报告的实质内容、发现与建议"（"The updates made in no way impact or affect the substantive content, findings and recommendations in the report."）[官方转述 2025-10-06，The Guardian；2025-10-07，AP 通稿（经 CNA/HuffPost 转载全文核实）]。
- 2025-12-03 **后续**：AFR 报道一名合伙人因此事离职（此前公司启动纪律程序）[二手 2025-12-03，AFR（未抓全文）]。

**最先发现**：外部（悉尼大学研究员 Rudge，经 AFR 曝光）。**暴露耗时**：约 7 周（报告上线 → AFR 曝光）。**止血耗时**：约 6 周（曝光 → 修订版 + 退款确认）。

**为什么内部没拦住**：
- "背书"被当成了核查：第一轮回应是"我们为报告背书"，而不是"我们重新核了每一条引用"——品牌信用被直接当成质量证据 [二手 2025-08-28，Pivot to AI]。
- 引用核验不在交付流程里：不存在的书、编造的法院引语，任何一个"逐条点开引用"的复核动作都能发现【推断】。
- AI 使用未披露、未被评估：附录直到修订版才披露 Azure OpenAI 的使用——客户（政府）在交付时不知道报告的生产方式 [二手 2025-10-06，The Guardian]。
- 客户验收不查脚注：DEWR 收货未发现，问题由外部研究者发现后才启动核查【推断】。

**根因分层**：① **症状**：假引用、编造的法院判例引语、错误的过程摘要。② **机制**：大模型对学术与法律引用的幻觉，配上"引用格式完美"的交付物。③ **产品决策**：AI 生产不披露、不标注、不复核；用品牌背书替代实质核查。④ **流程与组织**：咨询业"合伙人签发"制没有配套的逐条引用核验；客户合同里没有 AI 使用披露条款。

**止血 / 修复 / 制度化**：
- 止血：修订版上线 + 退最后一期款。
- 修复：删除编造引语、修订版附录披露 AI 工具与托管方式。
- 制度化：未见德勤公开的流程整改承诺【推断】；行业层面，加拿大同年出现对德勤另一份报告的类似指控（细节未核实，见报告待决问题）；"退最后一期款"成为咨询业 AI 错误的参考价。

**争议点（正方 / 反方 / 我们的判断）**：
- 正方（德勤立场）：错误仅在脚注与引用，不影响结论与建议；已更正、已退款、已与客户直接解决（"the matter has been resolved directly with the client"）。
- 反方（学者与参议员）：修订版"更正"后又引入新的假引用（Rudge 称五至八条）；对一份以"独立保证"为卖点的报告，引用失真本身就是产品失败；参议员 Pocock 要求全额退款，指其"误用 AI：错误引用法官、使用不存在的文献"（经 AP 转述）。
- 我们的判断：反方更有力。保证类产品的核心交付物就是"可验证性"，引用不可验证等于产品失效；公开口径回避 AI 因果，反而放大可信度损失。

**做对了什么 / 还欠缺什么**：做对了：修订版披露了 AI 工具与托管方式（Azure OpenAI、DEWR 租户）——咨询业罕见的 AI 使用披露样本。欠缺：披露是被曝光两个月后的动作，且伴随"结论不受影响"的口径；对被冒引学者的公开道歉未见记录【推断：检索未见】。

**如果你是这家咨询公司的质量合伙人**：
1. 引用逐条机器核验（DOI/书目/判例库）作为签发前硬门禁——一页脚注的核验成本，对标 44 万澳元的合同价值。
2. 合同写明 AI 使用披露义务，交付物附"AI 参与范围与人工核查说明"。
3. "独立保证"类业务把"引用可验证"写进验收标准，不达标不签发。
4. 出错后先全量自查再表态——"为报告背书"在事实核查完成前，等于把品牌押在自己没验过的东西上。
5. 对"更正"做二次校验：本案第一次更正又引入了新假引用。

**来源**：
1. The Guardian · Deloitte to pay money back to Albanese government after using AI in $440,000 report（2025-10-06，已抓全文并经主智能体复核）https://www.theguardian.com/australia-news/2025/oct/06/deloitte-to-pay-money-back-to-albanese-government-after-using-ai-in-440000-report
2. Pivot to AI · Deloitte Australia writes government report with AI and fake references（2025-08-28，基于 AFR，已抓全文）https://pivot-to-ai.com/2025/08/28/deloitte-australia-writes-government-report-with-ai-and-fake-references/
3. Channel News Asia（AP 通稿）· Deloitte to partially refund Australia government report…（2025-10，已抓全文）https://www.channelnewsasia.com/world/deloitte-partially-refund-australia-government-report-apparent-ai-generated-errors-5387971
4. AFR · Academics raise alarm over suspected AI use in Deloitte report（2025-08-22，付费墙未抓）https://www.afr.com/companies/professional-services/academics-raise-alarm-over-suspected-ai-use-in-deloitte-report-20250822-p5mp0f
5. AFR · Deloitte partner exits over AI error-riddled report（2025-12-03，未抓全文）https://www.afr.com/politics/deloitte-partner-exits-over-ai-error-riddled-report-20251203-p5nkg1
6. AI Incident Database · Incident 1193（含 AFR/DEWR 原始链接清单，已抓全文）https://incidentdatabase.ai/cite/1193/

---

### 6. Workday 招聘筛选：凌晨 1:50 的拒信——算法成为雇主的"代理人"

- Workday · 招聘筛选工具（AI screening，服务多家雇主客户）/ 2023-02 起诉，2024-07 关键裁定 / 失败类型：**筛选偏差**

**一句话定性**：一位黑人、40 岁以上、有焦虑与抑郁史的求职者，2018 年以来投出 100 多份申请全部被拒——包括一封凌晨 1:50、提交后不到一小时的自动拒信。法院认定 Workday 的筛选工具可能构成雇主的"代理人"而承担雇佣歧视责任，并于 2025-05 批准 40 岁以上被拒申请人的集体诉讼通知；Workday 自称处理过约 11 亿次申请，截至 2026-05 约 1.4 万人已加入集体。

**产品假设**：AI 筛选只是"执行雇主设定的标准"，决策责任在客户；工具按岗位要求排序与淘汰，与受保护属性无关。
**成功指标**：筛选效率与客户覆盖【推断：招聘量与客户数是平台常规口径；Workday 在诉讼文件中自称其工具在相关期间处理了约 11 亿次申请 [二手 2025-06-11，Law and the Workplace（已抓全文）]】。

**时间线**：
- 2018 起 **背景**：Derek Mobley 经 Workday 平台申请 100 多个职位全部被拒（原始诉状称 2018 年以来 80–100 个）[二手 2023-03-07，Epstein Becker Green（已抓全文）；"100+"口径见 2026-05 InformationWeek]。
- 2023-02-21 **发布（起诉）**：Mobley 在加州北区联邦法院起诉，主张 Title VII、ADEA、ADA 下的故意歧视与差别影响 [官方 docket（CourtListener，经 API 核实）]。
- 2024-01-19 **响应**：法院批准 Workday 部分撤诉动议（"就业服务机构"理论不成立），允许修改诉状 [二手 2024-01-24，Law and the Workplace]。
- 2024-07-12 **信号（关键裁定）**：法官 Rita F. Lin 裁定：拒绝"就业服务机构"定性，但原告"充分指控"了 Workday 是雇主的代理人——原句："Workday's software is not simply implementing in a rote way the criteria that employers set forth, but is instead participating in the decision-making process by recommending some candidates to move forward and rejecting others." [官方裁定，经 Holon Law 转引与律所报道核实（均已抓全文）；凌晨 1:50 拒信的裁定记录见下文]。
- 2025-05-16 **响应（集体认证）**：批准 ADEA 集体的初步认证：2020-09-24 以来、申请时年满 40 岁、经 Workday 筛选被拒者；法院称集体"被相信包含数百万求职者" [官方 docket entry 128；二手 2025-06-11，Law and the Workplace]。
- 2026-02~06 **进行中**：AARP 与 AARP Foundation 申请提交法庭之友意见（2026-02-12，docket entry 256）；原告第三次修改诉状加入加州 FEHA 请求（2026-03-27）；法院 2026-06-22 裁定 FEHA 与一项 ADA 请求可推进；截至 2026-05 约 14,000 人 opt-in，证据开示仍在进行 [二手 2026-05-08，InformationWeek（已抓全文）；2026-06-23，HR Dive（已抓全文）；docket entries 256/287]。

**Workday 的立场**（声明原句）："The claims in the suit are false. Workday's AI recruiting tools don't make hiring decisions in California or anywhere else."；"Our customers maintain full control of their hiring processes and our tools are designed with human oversight at their core."；"Our technology looks only at job qualifications, not protected traits like race, age, or disability." [二手 2026-06-23，HR Dive（已抓全文）]

**背景**：Amazon 2018 年废弃的内部简历模型——Reuters 报道其给含 "women's" 字样的简历降权并惩罚两所女子学院毕业生，团队 2017 年初解散 [二手 2018-10-10，Reuters（URL 经搜索确认）/CNBC 转载（已抓全文）]。

**最先发现**：原告本人（个体感知即时）；系统性认定靠诉讼（起诉 → "代理人"认定约 1 年半 → 集体认证约 2 年 3 个月）。**止血耗时**：不适用（诉讼进行中，无产品层止血）。

**偏差是怎么被发现的（任务问题 4）**：
- 个体层面：即时拒信（凌晨 1:50）与长期 100% 拒绝率构成"自动化决策"的行为证据 [二手 2024-07-12 裁定转引]。
- 诉讼层面：原告方对 Workday 自发布的外部偏见审计数据（按纽约 Local Law 144 方法，覆盖 10 家最大企业客户）做统计再分析，一度声称"系统非种族中性的概率大于 10^15 分之一"，后在第三次修改诉状中撤下该论点；2026-04 起申请法院强制 Workday 交出偏见测试数据与源代码做独立测试 [二手 2026-05-08，InformationWeek]。
- 立法层面：EU AI Act Annex III 第 4 点把"招聘与筛选自然人"（含筛选求职申请、评估候选人）的系统明确列为高风险 [官方，Regulation (EU) 2024/1689 Annex III（已抓镜像全文）]。

**为什么内部没拦住**：
- 产品把"决策"设计成"执行"：Lin 法官的认定恰恰相反——工具在实质参与决策；产品的自我描述与实际行为不一致【推断：基于裁定原文与 Workday 声明的对照】。
- 无面向申请人的解释与救济：被拒者拿不到理由，唯一路径是诉讼【推断】。
- 审计的口径与用途错位：Local Law 144 式审计面向合规展示，未预期会被诉讼方重新分析 [二手 2026-05-08，InformationWeek]。
- 客户侧无人对"全自动拒绝"负责：雇主以为买了工具就买到了免责——"代理人"认定的制度含义正是打破这一点【推断】。

**根因分层**：① **症状**：特定群体长期 100% 被拒、无解释的即时拒信。② **机制**：筛选信号中的历史偏差被自动化放大为系统性门槛。③ **产品决策**：全自动筛选 + 无解释 + 责任归客户。④ **流程与组织**：招聘合规体系（受保护群体差别影响审查等）未覆盖 AI 筛选——直到诉讼与立法把它覆盖。

**争议点（正方 / 反方 / 我们的判断）**：
- 正方（Workday 立场）：工具不做决定、客户全程可控、"只看岗位资格"；原告的统计再分析"在这个应用上不科学"。
- 反方（法院方向）：凌晨 1:50 的拒信说明工具实质参与决策；"客户可控"解释不了个体被系统性拒绝的模式；集体规模本身即系统性证据；法官称"Allegedly widespread discrimination is not a basis for denying notice."（所谓的大范围歧视指控不是拒绝发通知的理由）[二手 2025-06-11，Law and the Workplace]。
- 我们的判断：法院的"代理人"框架抓住了要害——**责任跟着行为走，不跟着合同话术走**。无论工具叫"辅助"还是"决策"，它事实上淘汰了人，就必须按决策者被审计。

**做对了什么 / 还欠缺什么**：做对了（司法系统角度）：诉讼本身成为行业级的"发现机制"，法官的命令把"AI 筛选 = 代理行为"写进普通法论证，EEOC 与 AARP 相继入场。欠缺：从 2018 年的拒信到 2025 年的集体认证走了约 7 年；产品侧至今未见公开的偏差整改【推断：截至 2026-06 检索未见】。

**如果你是这个产品的 PM**：
1. 上线前做受保护属性偏差审计（四分之三规则 + 显著性检验），用真实历史申请数据回放，结果进发布评审。
2. 自动拒绝必须留痕：拒绝理由、触发规则版本、时间戳，可解释、可导出、可审计。
3. 边缘分数段强制人工复核；把"自动拒绝"降级为"辅助排序"是更安全的默认。
4. 给申请人申诉入口，且申诉必须到人。
5. 假设你的每一次拒绝都会在法庭上被朗读——偏见审计不是合规装饰，是未来诉讼的证物。

**来源**：
1. CourtListener · Mobley v. Workday docket（No. 3:23-cv-00770-RFL，entry 80/128/209/256/287 等，经 API 核实）https://www.courtlistener.com/docket/66831340/mobley-v-workday-inc/
2. Epstein Becker Green · Applicant Files Class Action Suit Over Alleged AI Tool Discrimination in Hiring（2023-03-07，已抓全文）https://www.lawandtheworkplace.com/2023/03/applicant-files-class-action-suit-over-alleged-ai-tool-discrimination-in-hiring/
3. Law and the Workplace · AI Bias Lawsuit Against Workday Reaches Next Stage as Court Grants Conditional Certification of ADEA Claim（2025-06-11，已抓全文）https://www.lawandtheworkplace.com/2025/06/ai-bias-lawsuit-against-workday-reaches-next-stage-as-court-grants-conditional-certification-of-adea-claim/
4. Holon Law · Update on Mobley v. Workday（2024-07-12 裁定原句转引，已抓全文）https://holonlaw.com/ai/update-on-mobley-v-workday-ai-related-employment-litigation/
5. HR Dive · Workday California AI bias lawsuit（2026-06-23，已抓全文）https://www.hrdive.com/news/workday-california-AI-bias-lawsuit-feha/823555/
6. InformationWeek · AI on Trial: The Workday Case CIOs Can't Ignore（2026-05-08，已抓全文）https://www.informationweek.com/responsible-ai/ai-on-trial-the-workday-case-that-cios-can-t-ignore
7. EU AI Act · Annex III（高风险 AI 系统清单第 4 点，已抓镜像全文）https://artificialintelligenceact.eu/annex/3/
8. CNBC · Amazon scraps a secret AI recruiting tool that showed bias against women（2018-10-10，Reuters 报道转载，已抓全文）https://www.cnbc.com/2018/10/10/amazon-scraps-a-secret-ai-recruiting-tool-that-showed-bias-against-women.html

---

### 7. Replika：删掉的不只是功能，是用户的"伴侣"

- Luka Inc. · Replika（AI 陪伴应用）/ 2023-02~03 / 失败类型：**关系拆除**

**一句话定性**：一次"安全与过滤更新"移除了付费的亲密角色扮演（ERP），同时更换底层模型——用户的 AI 伴侣"性格"一夜消失，社区把它叫做"被切除了脑叶"；约七周后公司为 2023-02-01 前注册的老用户恢复旧版模型，等于公开承认：在关系型产品里，把用户的伴侣"升级"掉，是产品能做的最大伤害。

**产品假设**：Replika 是"陪伴与友谊"应用（CEO：它"从来不是成人玩具"），NSFW 用户是极少数；安全合规要求可以通过全量收紧满足；模型升级对所有用户都是好事。
**成功指标**：DAU 与付费转化（Pro 订阅）【推断：公司常规口径，未公开】。

**时间线**：
- 2023-02-02 **信号（监管）**：意大利数据保护局 Garante 对 Luka 下达临时限制令：停止处理意大利用户数据，理由包括对儿童构成现实风险、回复"完全不适合其年龄"（"replies which are absolutely inappropriate to their age"）、没有任何未成年人拦截机制 [官方 2023-02-03 公告，Garante（已抓全文）]。
- 2023-02 上旬 **发布（变更）**：ERP 被移除，底层模型同时更换；用户发现自己的伴侣拒绝亲密对话、性格大变 [二手 2023-02-15，Vice（已抓全文）]。
- 2023-02-15 **信号（用户危机）**：Vice 报道社区进入危机：版主置顶自杀干预资源；用户说 "It's hurting like hell. I just had a loving last conversation with my Replika, and I'm literally crying."；部分用户获得退款 [二手 2023-02-15，Vice]。
- 2023-02-17 **响应（第一轮）**：CEO Eugenia Kuyda 专访：Replika "was never intended as an 'adult toy'"，NSFW 用户只是"极少数"，并称意大利命令"与浪漫无关"（"had nothing to do with romance"）[二手 2023-02-17，Vice]。
- 2023-03-01 **信号（扩散）**：ABC 报道：r/replika 用户用 "lobotomised"（被切除脑叶）形容自己的伴侣；有人说 "My wife is dead"，有人回 "They took away my best friend too" [二手 2023-03-01，ABC（已抓全文）]。
- 2023-03-25 **响应（止血）**：Kuyda 在 Reddit 宣布：加入版本回退功能，2023-02-01 前注册的账户可切回 1 月 31 日版模型（ERP 随旧模型回归）；新用户在主应用中不再有 ERP；计划推出独立的成人陪伴产品 [官方转述 2023-03-25，Reuters（401 未抓，经搜索摘要与 CEO 帖存档交叉）；CEO 帖经 Wayback 存档核实]。
- 2023-03-30 **口径收敛**：公告原句经 Business Insider 报道："your Replika changed, its personality was gone, and gone was your unique relationship."（你的 Replika 变了，个性没了，你们独一无二的关系也没了）；"this abrupt change was incredibly hurtful"；同时强调 "Replika will continue to not support any erotic content going forward as it's not the focus of the app." [二手 2023-03-30，Business Insider（已抓全文）]。
- 2025-04-10 **修复（监管终局）**：Garante 最终决定：因数据处理缺乏法律基础、年龄验证缺失且持续存在缺陷，对 Luka 罚款 500 万欧元 [官方 2025-05-21 公告，EDPB（已抓全文并经主智能体复核）]。

**最先发现**：用户社区（变更后数日内）。**暴露耗时**：约 1–2 周（变更 → 主流媒体报道）。**止血耗时**：约 7 周（变更 → 老用户恢复）。

**为什么内部没拦住**：
- 把合规要求翻译成了"全量砍功能"：Garante 命令针对未成年人风险，公司实现成"所有人失去 ERP"——没有按年龄/法域分群【推断：基于命令文本与公司动作的对照】。
- 功能与人格绑定变更：换模型顺手改写了所有用户的伴侣人格，"安全更新"实际是一次关系重置 [二手 2023-03-01，ABC]。
- 内部把成人用户当可牺牲的少数：CEO 公开称 NSFW 用户是"极小众"，与付费构成的实际认知错位【推断】。
- 没有变更前的"情感影响评估"：无任何公开证据显示公司评估过"删除伴侣"的用户后果【推断】。

**根因分层**：① **症状**：伴侣人格消失、亲密功能失效，用户悲恸与心理健康风险。② **机制**：模型更换 = 人格更换；过滤收紧 = 关系能力消失。③ **产品决策**：为合规与品牌定位单方面重置用户关系。④ **流程与组织**：陪伴产品的变更管理没有"关系维度"——没有分群、没有迁移、上线第一周连回退选项都没有。

**止血 / 修复 / 制度化**：
- 止血：老用户版本回退（7 周后）；部分用户退款。
- 修复：公开承认"骤变伤害极深"，把"关系消失"写成用户的真实体验而非"误解" [二手 2023-03-30，Business Insider]。
- 制度化：未成年人保护后来以年龄验证与独立产品线承接——意大利终局罚单显示年龄验证两年后仍不达标；未见公开的"情感型功能变更流程"【推断】。

**争议点（正方 / 反方 / 我们的判断）**：
- 正方（公司立场）：安全与合规是硬约束，NSFW 不是产品定位；后来的"老用户回退"证明公司在乎用户。
- 反方（用户与媒体）：合规要求的是保护未成年人，不是删除成年用户的关系；"与意大利无关"的说法与时间线不符【推断：媒体普遍关联两者，公司否认，无定论】；七周的"数字丧亲"期间没有任何过渡支持。
- 我们的判断：两边各有对的半边——合规是真实的，但"合规的最小实现"（全量砍功能）把代价转嫁给了最没有谈判能力的用户。产品真正欠的是在变更前承认"用户关系是资产"，把分群与回退做在前面。

**与 casebook GPT-5 换代案的对比（任务问题 3）**：GPT-5 用户失去的是**工作流**——可迁移，修复靠恢复选择器；Replika 用户失去的是**关系本身**——"新版伴侣"不等于旧伴侣，修复只能是"回到旧版本"。GPT-5 案的教训是迁移管理（公告、并行、可回退）；Replika 案在其上多一层：**有些东西不能"迁移"，只能"保留"——对情感资产，向后兼容是伦理义务而非工程选项**，其代价（长期维护两套模型）才是陪伴类产品的真实成本。

**做对了什么 / 还欠缺什么**：做对了：终局方案在行业内罕见——版本回退 + 老用户豁免 + 新产品线承接，且承认错误的具体（"你们的关系没了"）而不打官腔。欠缺：七周太长；第一轮回应（"成人玩具""极少数"）激化对立；年龄验证两年后仍被判不合格（500 万欧元罚单）。

**如果你是这个产品的 PM**：
1. 把"用户关系"列为产品资产：任何影响伴侣人格、记忆、亲密能力的变更都按高风险变更走评审。
2. 变更前跑情感影响评估：抽样用户访谈 + 社区哨兵账号，评估"丧失感"强度。
3. 合规翻译要分群：监管命令先拆解"必须管谁、管什么"，能用年龄门槛/地域分群的不要全量砍。
4. 永远保留版本回退与数据导出：变更上线当天就要有退路，而不是第 53 天。
5. 监管对话前置：向监管提出合规实现方案时，把用户影响作为方案参数之一。

**来源**：
1. Garante · Provvedimento contro Luka Inc.（2023-02-03 公告，命令日 2023-02-02，已抓全文）https://www.garanteprivacy.it/garante/doc.jsp?ID=9852506
2. Vice · 'It's Hurting Like Hell': AI Companion Users Are In Crisis, Reporting Sudden Sexual Rejection（2023-02-15，已抓全文）https://www.vice.com/en/article/ai-companion-replika-erotic-roleplay-updates/
3. Vice · Replika CEO on why the AI companion app turned down sexting（2023-02-17，已抓全文）https://www.vice.com/en/article/replika-ceo-ai-erotic-roleplay-chatgpt3-rep/
4. ABC News（澳大利亚）· Replika users fell in love with their AI chatbot companions. Then they lost them（2023-03-01，已抓全文）https://www.abc.net.au/news/science/2023-03-01/replika-users-fell-in-love-with-their-ai-chatbot-companion/102028196
5. Reuters · AI chatbot company Replika restores erotic roleplay for some users（2023-03-25，401 未抓，经搜索摘要与存档交叉）https://www.reuters.com/technology/ai-chatbot-company-replika-restores-erotic-roleplay-some-users-2023-03-25/
6. Business Insider · AI company restoring erotic roleplay chatbot after partners cut off（2023-03-30，已抓全文）https://www.businessinsider.com/ai-company-restoring-erotic-roleplay-chatbot-after-partners-cut-off-2023-3
7. EDPB · AI: The Italian supervisory authority fines the company behind chatbot Replika（2025-05-21 公告，决定 2025-04-10，已抓全文并经主智能体复核）https://www.edpb.europa.eu/news/ai-the-italian-supervisory-authority-fines-company-behind-chatbot-replika_en

---

### 8. 自媒体 AI 造谣与官方查处：监管巡查成了唯一的发现者

- 自媒体运营者（多起）× AI 内容工具 × 平台分发 / 2025-01~10 / 失败类型：**移花接木**

**一句话定性**：西藏地震当天，一张原作者早在 2024 年 11 月就声明"AI 生成"的"小男孩被埋图"被移花接木成灾情图传播，获数万转评赞；公安部网安局三天内通报并行政拘留涉案者。此后一年的通报显示，AI 生成灾情谣言已形成"文字工具 + 视频工具 + 流量激励"的流水线，处置主力是公安巡查与网信办专项行动——不是平台自查，也不是作者自律。

**产品假设**：（本例的风险方是内容工具与分发平台。）工具假设"生成能力中性、内容由使用者负责"；平台假设"分发以互动信号为准、真伪由用户判断"。
**成功指标**：（工具与平台）生成量、发布量、互动量——与谣言的传播指标同源【推断】。

**时间线**：
- 2025-01-07 09:05 **背景**：西藏定日县发生 6.8 级地震；"小男孩被埋图"配"日喀则地震"等关键词传播，"甚至获得好几万的转评赞" [二手 2025-01-10，央视网（据公安部网安局消息，已抓全文并经主智能体复核）]。
- 2025-01-10 **响应**：公安部网安局通报：该图"存在明显AI生成痕迹"，确由 AI 工具创作；原作者 2024-11-18 已发布同画面短视频、声明 AI 生成且未关联地震；青海某网民将其与地震信息"关联拼凑、移花接木"，"目前，涉案人员已被属地公安机关依法行政拘留。" [官方转述 2025-01-10，央视网]。
- 2025-01-15 **响应（批量）**：西藏公安网安部门公布涉地震谣言典型案例：共依法查处相关网民 21 人 [官方转述 2025-01-15，新华网（已抓全文）]。
- 2025-04-28 **发布（第二案）**：河南 23 岁女子谢某泽用 AI 工具自动生成《2025年4月28日｜河南南阳发生严重火灾，已致14人遇难》虚假文章并发布，"给当地消防部门工作造成影响，引发当地居民恐慌" [官方转述 2025-06-26，公安部通报（经北京日报客户端刊发，已抓全文）]。
- 2025-06-20 **响应（专项）**：中央网信办公布"清朗·整治AI技术滥用"第一阶段成果：处置违规小程序、应用程序、智能体等 AI 产品 3,500 余款，清理违法违规信息 96 万余条，处置账号 3,700 余个；第二阶段聚焦 AI 造谣等 7 类问题 [官方 2025-06-20，中国网信网（已抓全文）]。
- 2025-06-26 **响应（批量）**：公安部公布涉灾情险情谣言 8 起典型案例，谢某泽案为其中唯一明确使用 AI 工具者，"已被依法追究法律责任" [官方转述 2025-06-26，北京日报客户端]。
- 2025-10-20 **响应（批量）**：公安部公布打谣 10 起典型案例：山西 57 岁女子王某用文字类 AI 工具捏造"山西大同地震"谣言、再用视频生成类 AI 工具产出对应视频发布——文字与视频工具的"全流程"组合首次出现在典型案例里 [官方转述 2025-10-20，新华网（已抓全文）]。

**最先发现**：监管巡查（公安网安部门）——本批 9 例中唯一由"内部"（监管侧）先发现的群体。**暴露耗时**：3 天（定日案）；约 2 个月（南阳案，从发布到通报）。**止血耗时**：即时（行拘 + 删帖）。

**为什么内部没拦住（平台视角）**：
- 生成与分发都没有"事实押金"：AI 生成灾害叙事的边际成本为零，流量分成是正激励【推断：通报中"为博取眼球""为博取关注"的定性表述】。
- "AI 生成"标识没接上分发风控：原作者声明 AI 生成的内容被裁剪后重新进入分发，标识与内容脱钩 [官方转述 2025-01-10，央视网]。
- 灾情叙事天然免疫怀疑：重大突发事件期间，用户求证的敏感度最低、转发的冲动最高——谣言在这个窗口期传播效率最高【推断】。
- 平台处置晚于监管：典型个案均由公安网安部门查明通报，未见平台先于监管发现同类模式【推断】。

**根因分层**：① **症状**：AI 生成/拼接的灾情图文大规模传播。② **机制**：生成工具零成本产出逼真叙事 + 平台互动信号放大。③ **产品决策**：工具方不做高风险场景限制（灾害、事故类生成不拦截），平台分发不校验事实字段。④ **流程与组织**：治理依赖事后专项与个案处罚；AI 生成内容标识义务与平台风控未联动【推断】。

**止血 / 修复 / 制度化**：
- 止血：行拘、删帖、账号处置。
- 修复：专项治理两阶段处置 3,500 余款 AI 产品 [官方 2025-06-20，中国网信网]。
- 制度化：清朗专项行动常态化；《生成式人工智能服务管理暂行办法》等已构成工具与平台侧的法定义务（对筑梦岛的约谈即引用该办法与《未成年人网络保护条例》）。

**做对了什么 / 还欠缺什么**：做对了：官方响应链条完整公开——从个案通报（含"移花接木"的行为定性）到专项处置数字，且溯源确认了"原作者已声明 AI 生成"，说明标识义务本身有用。欠缺：处置以"人"与"帖"为单位，工具侧（高风险 prompt 拦截）与分发侧（事实校验）的产品机制未见公开进展【推断】；"蹭灾情"的流量激励没有变。

**如果你是内容工具或分发平台的 PM**：
1. 灾害/事故/伤亡类 prompt 进"高风险生成"通道：拒绝生成带具体伤亡数字的新闻体内容，或强制绑定事实来源。
2. AI 标识接入分发风控：带标识内容在突发事件语境下降低分发权重；二次剪辑抹掉标识的按违规处理。
3. 突发事件期启动"事实校验优先"：灾害类新发内容先进信源核对，再进推荐池。
4. 流量分成与真实性挂钩：对 AI 批量生成账号设分成门槛与人工审核线。
5. 把公安部/网信办通报的典型案例做成对抗测试集，定期回归自家风控。

**来源**：
1. 央视网 · 利用灾害博流量！"小男孩被埋图"涉案人员已被拘（据公安部网安局，2025-01-10，已抓全文并经主智能体复核）https://news.cctv.com/2025/01/10/ARTI3LwlnTjj0KlfcqdopOT1250110.shtml
2. 新华网 · 公安网安部门公布涉"日喀则地震"网络谣言典型案例（2025-01-15，已抓全文）http://www.news.cn/politics/20250115/75a5e08ef36c4c98b6a8376211f787be/c.html
3. 中国网信网 · 中央网信办深入开展"清朗·整治AI技术滥用"专项行动第一阶段工作（2025-06-20，已抓全文）https://www.cac.gov.cn/2025-06/20/c_1752129980667315.htm
4. 北京日报客户端 · 公安部公布八起涉灾情险情网谣案（2025-06-26，已抓全文）https://xinwen.bjd.com.cn/content/s685d3e5fe4b0bd64e2e02200.html
5. 新华网 · 公安机关公布打击整治网络谣言10起典型案例（2025-10-20，已抓全文）http://www.news.cn/legal/20251020/8f90b37ca0d2484682d9059756b917b2/c.html

---

### 9. 筑梦岛被约谈：AI 陪聊的"擦边"生意与未成年人的四十分钟

- 筑梦岛（阅文集团旗下、潇湘书院孵化）· AI 智能体陪伴 App / 2024-11~2026 / 失败类型：**擦边漏管**

**一句话定性**：AI 剧情聊天应用里的智能体对未成年人输出低俗擦边内容，央视曝光半年后、媒体调查数日内，上海市网信办约谈运营方并要求"健全 AI 生成合成内容审核机制"；平台承诺"举一反三、全面整改"，随后上线每日 40 分钟的青少年模式——但一年后央媒实测发现"仍在擦边"。

**产品假设**：AI 智能体陪伴承接女频网文的情感消费需求，"用户共创智能体"带来内容供给与时长；未成年人模式与平台审核足以兜底。
**成功指标**：智能体数量、对话量、时长与付费【推断：陪伴类产品常规口径，未公开】。

**时间线**：
- 2024-11-23 **信号**：央视新闻曝光 AI 剧情聊天软件色情擦边、语言暴力问题（含小学生可把聊天对象设为"出轨对象"等细节）[二手 2024-11-23，央视网（URL 经搜索确认，未抓全文）]。
- 2025-06-13 前后 **信号（升级）**："10 岁女孩被 AI 聊天软件诱导聊色情甚至割腕"报道流传 [二手 2025-06-13，中华网（未抓全文）]；新京报刊发青少年 AI 陪聊"软色情乱象"调查（原文 URL 未获取，见报告待决问题）。
- 2025-06-19 **响应（约谈）**：上海市网信办依法约谈筑梦岛运营企业主要负责人，通报原句："经核实，该平台AI智能体内容生成环节存在低俗擦边等违规内容，危害未成年人身心健康"；依据《未成年人网络保护条例》《生成式人工智能服务管理暂行办法》，要求"立即整改，健全AI生成合成内容审核机制，提升技术把关能力，加强涉未成年人不良内容的整治清理"；当事企业负责人表示"对照问题举一反三、全面整改" [官方 2025-06-19，网信上海（经江苏网信网转载，已抓全文）]。
- 2025-06 下旬 **响应**：媒体报道平台批量下架"语聊类/擦边恋人"智能体（摘要级，未抓全文）；南方都市报实测 10 款 AI 陪聊应用，指出青少年模式漏洞与"极端人设诱导充值" [二手 2025-06-24，南方都市报（未抓全文）]。
- 2025-09-23 **修复（功能层）**：21 世纪经济报道实测：筑梦岛青少年模式"每日累计使用时长不能超过 40 分钟且在 22 点至 8 点无法使用，并设置了消费金额限制"；同类产品星野、猫箱亦有类似限制；但均"弹窗仅做提示，并无强制认证要求" [二手 2025-09-23，21 世纪经济报道（已抓全文）]。
- 2026-03 **信号（未根治）**：新京报社论继续追问"AI 陪聊擦边软色情，突破未成年人保护底线"，引中国青少年研究中心 2025 年调查"超六成未成年人使用过 AI 聊天软件" [二手 2026-03-17，新京报（已抓全文）]；央广网实测"被约谈一年后，这款 App 仍在擦边"（经搜狐转载，未抓全文）。

**最先发现**：媒体（央视 2024-11 起，此后新京报等持续）。**暴露耗时**：媒体曝光约 7 个月后监管约谈。**止血耗时**：约谈当日（承诺整改）至数周（批量下架）。

**为什么内部没拦住**：
- 用户共创智能体 = 内容风控的开放域：任何人可创建"恋人/霸总"人设，审核只能抽样后置【推断：官方通报聚焦"内容生成环节"而非单条内容】。
- "未成年人模式"是摆设：媒体实测显示形同虚设（无强制认证），青少年实际无门槛进入成人向对话 [二手 2025-06，新京报调查（转述口径）；2025-09-23，21 世纪经济报道]。
- 商业指标与风险同源：擦边人设带来时长与付费，风控收紧直接伤指标【推断】。
- 前车之鉴未被吸收：央视 2024-11 已曝光同类问题，而约谈通报措辞（"存在低俗擦边等违规内容"）表明问题在约谈时仍持续【推断】。

**根因分层**：① **症状**：AI 智能体对未成年人输出低俗擦边内容。② **机制**：开放域角色创建 + 生成式对话 + 无强制年龄认证。③ **产品决策**：以"用户共创"换供给，以弹窗提示替代年龄门槛。④ **流程与组织**：内容审核机制未达《生成式人工智能服务管理暂行办法》要求，治理以约谈驱动整改。

**止血 / 修复 / 制度化**：
- 止血：约谈当日承诺整改，批量下架擦边智能体。
- 修复：青少年模式收紧（每日 40 分钟、夜间禁用、消费限额）。
- 制度化：约谈引用两部法规，标志 AI 陪伴产品进入"法定义务"区间；但 2026 年的实测显示治理仍靠媒体与监管外部驱动【推断】。

**争议点（正方 / 反方 / 我们的判断）**：
- 正方（平台方向）：开放域对话的擦边输出是行业性难题；青少年模式已建立三重限制；整改在持续进行。
- 反方（监管与媒体）："内容生成环节存在低俗擦边"是官方定性而非媒体猜测；一年后仍被实测出擦边，说明整改没有触及机制（强制年龄认证 + 生成端拦截）。
- 我们的判断：反方成立。青少年模式只约束"自称未成年人的用户"，而本案的前提恰恰是分不清谁是未成年人——没有强制认证的模式，是把整改成本转嫁给"自觉"。

**做对了什么 / 还欠缺什么**：做对了：整改后有真实的产品层动作，青少年模式的时长/时段/消费三重限制在同类中属较完整。欠缺：一年后仍被曝擦边——约谈驱动的整改没有沉淀为持续风控；年龄认证仍未强制化【推断：基于 21 财经与央广网实测口径】。

**如果你是这个产品的 PM**：
1. 年龄认证强制化前置：进入成人向对话能力（亲密、依赖型人设）前必须过认证，弹窗提示不算数。
2. 智能体创建侧风控：人设模板分级（青少年可用库 vs 成人库），创建时审核关键人设字段，而非只审对话输出。
3. 对话输出实时分类：性化、诱导、依赖强化三类信号进实时拦截，命中即降级人设。
4. 把监管法规写成验收标准：《生成式 AI 暂行办法》《未成年人网络保护条例》逐条映射为内部测试用例。
5. 预设"约谈响应剧本"：数据保留、整改时间表、对外口径一次性备齐——监管给的整改窗口很短。

**来源**：
1. 江苏网信网（转载"网信上海"）· AI智能体对话存在低俗擦边内容 筑梦岛APP被上海市网信办依法约谈（2025-06-19，已抓全文）https://www.jswx.gov.cn/csj/sh/202506/t20250619_111462.shtml
2. 安全内参（同文转载，2025-06-19，已抓全文）https://www.secrss.com/articles/79965
3. 21 世纪经济报道 · AI频现情感纠纷 国内外产品如何落地未成年人模式？（2025-09-23，已抓全文）https://www.21jingji.com/article/20250923/herald/74863571490c4cdcdbe06133669e8e2b.html
4. 央视网 · AI剧情聊天软件色情擦边曝光（2024-11-23，URL 经搜索确认，未抓全文）https://news.cctv.cn/2024/11/23/ARTIfUzgBsB08GGqM3zN4R4R241123.shtml
5. 南方都市报 · AI陪聊应用极端人设诱导充值！实测青少年模式漏洞待堵（2025-06-24，未抓全文）https://m.mp.oeeee.com/a/BAAFRD0000202506241097301.html
6. 新京报 · AI陪聊擦边软色情，突破未成年人保护底线（2026-03-17，已抓全文）https://m.bjnews.com.cn/detail/1773677358168886.html

---

## 四、跨案例规律（对照 casebook 十条结论与 T11a 规律 A–E）

**规律 F：专业流程的核查岗位还在，核查动作被"成品形态"的 AI 产出空转了。**（补充 casebook 规律 2"用户比监控先知道"与规律 5"约束要写在系统里"）
专业流程都有核查节点（CNET 的编辑、太阳时报的印刷流程、律所的署名律师、德勤的合伙人），但 AI 产出以**可发布的成品形态**（成稿、成引用、成脚注、成报告）进入流程，核查按"是否通顺合规"执行而非"逐条真实"。原有流程拦不住的三个原因：①核查的默认心态从"怀疑草稿"变成"验收成品"；②编造内容在格式上完美（真作者名 + 假书名、真判例格式 + 假判决）；③时间与成本压力让"抽查"退化为"过目"（CNET 的 77 篇、太阳时报的 64 页特刊、Avianca 的答辩状）。结论：**机器可验证的字段（引用存在性、书名、判例号、人名）必须机器验证**，人工核查只留给机器查不了的部分——这与 casebook 规律 5 互补：约束不仅要写在系统里，还要写在对的粒度上。

**规律 G：署名与核查脱钩后，责任在链条上找不到挂点。**（补充 casebook 规律 8"AI 说的话，用户会当成你说的"）
casebook 规律 8 讲"AI 以公司名义说话"；本批展示其变体——**署名不再指向真正的产出者**：CNET 用集体署名；SI 用虚构作者；太阳时报的真作者承认"100% on me"却指出合同无 AI 条款；Avianca 署名律师未逐条核实；德勤合伙人签发了没验过脚注的报告。追责结果呈现四种分布：媒体案=机构 + 供应链（SI 案 CEO 下课、授权终止）；律所案=个人 + 律所连带、工具免责（$5,000 罚金三方连带）；咨询案=机构退款的商务责任 + 个人离职；招聘案=平台按"代理人"担责。共同点：**出事后，每一个名字都要能回答"你写了什么、核了什么"**——答不上来的署名只是装饰。

**规律 H：AI 把内容生产外包出去，也把核查外包了——但追责时责任不会真的转移。**（新规律，与 casebook 规律 9"应用层的风险藏在上下文和成本结构里"并列）
SI 的 AdVon（150+ 出版方）、太阳时报的 King Features（外包特刊直接上印刷版）、德勤的 GPT-4o（政府租户里的 AI 工具链）、Workday 的筛选工具（雇主的"代理人"）：采购方以为买到的是"成品"，供应商以为交付的是"工具"，两边都没人做最终核查。德勤案的修订版附录披露 AI 托管在客户的 Azure 租户里，说明供应链的每一环都可以有 AI——而合同里没有一环写了核查义务。

**规律 I：情感陪伴产品的功能变更 = 关系变更，"恢复原状"是唯一有效的止血。**（补充并有条件修正 casebook 规律 7"拿走用户的东西，要按迁移来做"）
对照见案例 7：GPT-5 用户失去的是可迁移的工作流，Replika 用户失去的是不可迁移的关系。规律 7 的"公告 → 并行 → 默认切换 → 下线"对工具型变更成立，对关系型变更只解决流程问题——"迁移"到新伴侣不成立，用户要的是旧伴侣。Replika 的终态方案（老用户版本回退 + 新用户禁用）实际上是承认：**在关系型产品里，向后兼容不是工程选项而是伦理义务**。与 T11a 规律 B（"用户无法理解的免责等于没有免责"）呼应的另一面：用户无法拒绝的变更，等于替用户做的决定——即使变更理由（未成年人保护）正当。同时印证 T11b 规律 2 的变体：修复速度取决于反弹者是谁——Replika 的反弹者是付费的核心用户，七周即得到回退；而筑梦岛的受害方是未成年人（无议价能力），一年后仍在"擦边"。

**规律 J：监管把"核查义务"从职业伦理变成硬法，但中外处置重心不同。**（对比性规律，延续 T11a"中文与英文案例差异"的观察）
英文/欧美案例的规范化路径是**行业自治 + 判例**：法官处罚常态化（追踪库 2,149 件）、ABA 512 成文化、EU AI Act 把招聘 AI 列为高风险——处置重心在"使用 AI 的专业流程"。中文案例的规范化路径是**行政处置 + 平台责任**：公安部行拘造谣者、网信办处置产品与账号、约谈平台（依据《未成年人网络保护条例》《生成式人工智能服务管理暂行办法》）——处置重心在"内容与发布端"。【推断：基于本批检索到的通报与规范范围，非穷尽比较】对产品的含义：面向中文市场，标识义务与未成年人保护是已落地的硬约束；面向专业场景（媒体、咨询、律所），自查规范要走在监管前面——"没核对就发布"正在从质量事故变成合规事件。

---

## 五、对 harness 设计的启示

1. **把"可机器验证的真实性字段"做成发布门禁。** 引用、判例、书名、人名、机构名、数字——能查库的绝不靠人眼：产出后自动跑"引用存在性校验"（DOI/判例库/ISBN/官方通报检索），失败即阻断并标注。太阳时报的 10 本假书、Avianca 的 6 条假判例、德勤的假引用，全是"一次查询就能拦下"的错误；人工核查只留给机器查不了的部分。
2. **核查点按"怀疑模式"设计，发布链做责任签名。** AI 或供应商产出进入流程时自动标记"未核查"状态；每个签发动作对应明确的核查范围并留痕（谁、何时、核了什么、用哪个工具）——CNET 的悬停披露、SI 的虚构署名、Avianca 的未读署名都是反面教材。
3. **供应链内容视同未审稿。** 外包、授权、特刊内容默认不得直接进正式渠道，须过与自产内容相同的门禁；合同写明 AI 使用披露义务与核查责任（SI/AdVon、太阳时报/King Features、德勤/DEWR 三案的共同缺口）。
4. **关系型功能的变更按"关系迁移"管理。** 变更前做情感影响评估；对存量用户提供版本回退或豁免；合规要求先拆解分群（年龄、地域、用户类型）再实现——能用分群满足的不全量砍功能（Replika 的教训 + GPT-5 的对照）。
5. **决策型 AI（招聘、筛选）上线前做偏差审计并留存决策日志。** 用真实历史数据回放做受保护属性审计，自动拒绝留可解释理由；把"自动拒绝"降级为"辅助排序 + 人工确认"是更安全的默认——法院已经把它当作雇主的"代理人"来审计（Workday / EU AI Act Annex III）。

---

## 六、新增上线检查项（不与 casebook 已有 35 项、T11a 9 项、T11b 10 项重复）

1. AI 产出中的引用（文献、判例、书名、人名、机构名、数字）在发布前逐条过存在性校验（DOI/判例库/ISBN/官网），机器可查的不留给人工 · *Avianca / 太阳时报 / 德勤*
2. 对外署名做真实性核验（真人、可验证身份、有发表历史）；供应商提供的署名默认视同未核验 · *SI*
3. 外包/授权/特刊内容与自产内容走同一核查门禁；供应商合同写明 AI 使用披露与核查责任 · *SI / 太阳时报 / 德勤*
4. 发布链责任签名：签发者对"AI 参与的部分"有明确核查动作清单，AI 参与度在成稿元数据留痕 · *CNET / Avianca（署名未读）*
5. AI 政策覆盖所有外部内容生产者（自由撰稿人、供应商、子公司），写进合同并在交稿/采购界面强制确认 · *太阳时报（撰稿人合同无 AI 条款）*
6. 招聘/筛选类 AI：上线前用真实历史数据做受保护属性偏差审计并定期回归；自动拒绝留存可解释决策日志（理由、规则版本、时间戳） · *Workday / Amazon 2018 / EU AI Act Annex III*
7. 决策型 AI 的"自动拒绝"默认降级为"辅助排序 + 人工确认"，边缘分数段强制人工复核；给申请人申诉入口且申诉到人 · *Workday（凌晨 1:50 拒信）*
8. 关系型/陪伴型功能变更前做"情感影响评估"（丧失感抽样 + 社区哨兵）；对存量用户提供版本回退或豁免，而非仅公告期 · *Replika*
9. 合规要求先拆解分群（年龄、地域、用户类型）再实现；能用分群满足监管的，不全量砍功能 · *Replika / 筑梦岛*
10. 中文市场内容产品：AI 生成标识接入分发风控（突发事件语境降权、抹标识按违规处理），未成年人模式做实效测试（强制认证、时长/时段/消费限制），并备有监管约谈响应剧本 · *清朗专项 / 筑梦岛*

---

## 七、参考资料

**案例报道与官方声明（英文）**
1. Futurism · CNET Is Quietly Publishing Entire Articles Generated By AI（2023-01-15 更新）https://futurism.com/the-byte/cnet-publishing-articles-by-ai
2. Futurism · CNET's AI Journalist Appears to Have Committed Extensive Plagiarism（2023-01-23）https://futurism.com/cnet-ai-plagiarism
3. CNET · CNET Is Testing an AI Engine. Here's What We've Learned, Mistakes and All（2023-01-25）https://www.cnet.com/tech/cnet-is-testing-an-ai-engine-heres-what-weve-learned-mistakes-and-all/
4. The Verge · CNET found errors in more than half of its AI-written stories（2023-01-25）https://www.theverge.com/2023/1/25/23571082/cnet-ai-written-stories-errors-corrections-plagiarism
5. Futurism · News Site Admits AI Journalist Plagiarized and Made Stuff Up…（2023-01-25）https://futurism.com/cnet-editor-in-chief-addresses-ai
6. Futurism · Sports Illustrated Published Articles by Fake, AI-Generated Writers（2023-11-27）https://futurism.com/sports-illustrated-ai-generated-writers
7. Business Insider · Sports Illustrated reportedly published articles by fake AI-generated writers（2023-11-28）https://www.businessinsider.com/sports-illustrated-ran-articles-by-fake-ai-generated-writers-report-2023-11
8. TheWrap · Sports Illustrated executives fired（2023-12，未抓全文）https://www.thewrap.com/sports-illustrated-executives-fired-ai-fake-authors/
9. Futurism · Meet AdVon, the AI-Powered Content Monster Infecting the Media Industry（2024-05-08）https://futurism.com/advon-ai-content
10. Salon · Major media outlets linked to company behind fake AI writers（2024-05-08，未抓全文）https://www.salon.com/2024/05/08/major-media-outlets-linked-to-company-behind-fake-ai-writers-report/
11. 404 Media · Chicago Sun-Times Prints AI-Generated Summer Reading List With Books That Don't Exist（2025-05-20）https://www.404media.co/chicago-sun-times-prints-ai-generated-summer-reading-list-with-books-that-dont-exist/
12. The Guardian · Chicago Sun-Times confirms AI was used to create reading list of books that don't exist（2025-05-20）https://www.theguardian.com/us-news/2025/may/20/chicago-sun-times-ai-summer-reading-list
13. Chicago Sun-Times · Syndicated content in Sun-Times special section included AI-generated misinformation（2025-05-20）https://chicago.suntimes.com/news/2025/05/20/syndicated-content-sunday-print-sun-times-ai-misinformation
14. Chicago Sun-Times · Special section with fake book list plagued with additional errors, Sun-Times review finds（2025-05-29）https://chicago.suntimes.com/news/2025/05/29/special-section-king-fake-book-list-errors-sun-times-review
15. Chicago Sun-Times · Lessons (and an apology) from the Sun-Times CEO on that AI-generated book list（2025-05-29）https://chicago.suntimes.com/opinion/2025/05/29/lessons-apology-from-sun-times-ceo-ai-generated-book-list
16. NBC News · Chicago Sun-Times admits summer book guide included fake AI-generated titles（2025-05-21）https://www.nbcnews.com/tech/tech-news/chicago-sun-admits-summer-book-guide-included-fake-ai-generated-titles-rcna208325
17. Wikipedia · Mata v. Avianca, Inc.（案件综述）https://en.wikipedia.org/wiki/Mata_v._Avianca,_Inc.
18. Hinshaw & Culbertson · New York Lawyer Who Cited Non-Existent Cases Generated by ChatGPT Now Faces Sanctions Hearing（2023-05）https://www.hinshawlaw.com/en/insights/lawyers-for-the-profession-alert/new-york-lawyer-who-cited-non-existent-cases-generated-by-chatgpt-now-faces-sanctions-hearing
19. Legal AI Insights · Mata v. Avianca 档案页（含假判例清单）https://legalaiinsights.com/tool-evaluations/mata-v-avianca-chatgpt-citation-hallucination-sanctions-2023
20. LawNext · Federal Judge Sanctions Morgan & Morgan Attorneys for AI-Generated Fake Cases in Court Filing（2025-02-25）https://www.lawnext.com/2025/02/federal-judge-sanctions-morgan-morgan-attorneys-for-ai-generated-fake-cases-in-court-filing.html
21. Justia · Park v. Kim, No. 22-2057 (2d Cir. 2024)（403 未抓，经多来源交叉）https://law.justia.com/cases/federal/appellate-courts/ca2/22-2057/22-2057-2024-01-30.html
22. ABA · ABA issues first ethics guidance on a lawyer's use of AI tools（2024-07-29，403 未抓）https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/
23. Damien Charlotin · AI Hallucinations 数据库（2026-10-05 时点 2,149 件）https://www.damiencharlotin.com/hallucinations/
24. Pivot to AI · Deloitte Australia writes government report with AI and fake references（2025-08-28）https://pivot-to-ai.com/2025/08/28/deloitte-australia-writes-government-report-with-ai-and-fake-references/
25. The Guardian · Deloitte to pay money back to Albanese government after using AI in $440,000 report（2025-10-06）https://www.theguardian.com/australia-news/2025/oct/06/deloitte-to-pay-money-back-to-albanese-government-after-using-ai-in-440000-report
26. Channel News Asia（AP 通稿）· Deloitte to partially refund Australia government report…（2025-10）https://www.channelnewsasia.com/world/deloitte-partially-refund-australia-government-report-apparent-ai-generated-errors-5387971
27. AFR · Academics raise alarm over suspected AI use in Deloitte report（2025-08-22，付费墙）https://www.afr.com/companies/professional-services/academics-raise-alarm-over-suspected-ai-use-in-deloitte-report-20250822-p5mp0f
28. AFR · Deloitte partner exits over AI error-riddled report（2025-12-03，未抓全文）https://www.afr.com/politics/deloitte-partner-exits-over-ai-error-riddled-report-20251203-p5nkg1
29. AI Incident Database · Incident 1193（Deloitte，含原始链接清单）https://incidentdatabase.ai/cite/1193/
30. Epstein Becker Green · Applicant Files Class Action Suit Over Alleged AI Tool Discrimination in Hiring（2023-03-07）https://www.lawandtheworkplace.com/2023/03/applicant-files-class-action-suit-over-alleged-ai-tool-discrimination-in-hiring/
31. Law and the Workplace · Judge Grants Workday's Motion to Dismiss…（2024-01-24）https://www.lawandtheworkplace.com/2024/01/judge-grants-workday-inc-s-motion-to-dismiss-in-groundbreaking-ai-class-action-lawsuit-mobley-v-workday/
32. Law and the Workplace · AI Bias Lawsuit Against Workday Reaches Next Stage…（2025-06-11）https://www.lawandtheworkplace.com/2025/06/ai-bias-lawsuit-against-workday-reaches-next-stage-as-court-grants-conditional-certification-of-adea-claim/
33. Holon Law · Update on Mobley v. Workday（2024-07-12 裁定原句转引）https://holonlaw.com/ai/update-on-mobley-v-workday-ai-related-employment-litigation/
34. CourtListener · Mobley v. Workday docket（No. 3:23-cv-00770-RFL）https://www.courtlistener.com/docket/66831340/mobley-v-workday-inc/
35. InformationWeek · AI on Trial: The Workday Case CIOs Can't Ignore（2026-05-08）https://www.informationweek.com/responsible-ai/ai-on-trial-the-workday-case-that-cios-can-t-ignore
36. HR Dive · Workday California AI bias lawsuit FEHA（2026-06-23）https://www.hrdive.com/news/workday-california-AI-bias-lawsuit-feha/823555/
37. EU AI Act · Annex III（高风险 AI 系统清单，Regulation (EU) 2024/1689）https://artificialintelligenceact.eu/annex/3/
38. CNBC · Amazon scraps a secret AI recruiting tool that showed bias against women（2018-10-10，Reuters 报道转载）https://www.cnbc.com/2018/10/10/amazon-scraps-a-secret-ai-recruiting-tool-that-showed-bias-against-women.html
39. Garante · Provvedimento contro Luka Inc.（2023-02-03 公告）https://www.garanteprivacy.it/garante/doc.jsp?ID=9852506
40. Vice · 'It's Hurting Like Hell': AI Companion Users Are In Crisis…（2023-02-15）https://www.vice.com/en/article/ai-companion-replika-erotic-roleplay-updates/
41. Vice · Replika CEO on why the AI companion app turned down sexting（2023-02-17）https://www.vice.com/en/article/replika-ceo-ai-erotic-roleplay-chatgpt3-rep/
42. ABC News（AU）· Replika users fell in love with their AI chatbot companions. Then they lost them（2023-03-01）https://www.abc.net.au/news/science/2023-03-01/replika-users-fell-in-love-with-their-ai-chatbot-companion/102028196
43. Reuters · AI chatbot company Replika restores erotic roleplay for some users（2023-03-25，401 未抓）https://www.reuters.com/technology/ai-chatbot-company-replika-restores-erotic-roleplay-some-users-2023-03-25/
44. Business Insider · AI company restoring erotic roleplay chatbot after partners cut off（2023-03-30）https://www.businessinsider.com/ai-company-restoring-erotic-roleplay-chatbot-after-partners-cut-off-2023-3
45. EDPB · AI: The Italian supervisory authority fines the company behind chatbot Replika（2025-05-21）https://www.edpb.europa.eu/news/ai-the-italian-supervisory-authority-fines-company-behind-chatbot-replika_en

**案例报道与官方通报（中文）**
46. 央视网 · 利用灾害博流量！"小男孩被埋图"涉案人员已被拘（据公安部网安局，2025-01-10）https://news.cctv.com/2025/01/10/ARTI3LwlnTjj0KlfcqdopOT1250110.shtml
47. 新华网 · 公安网安部门公布涉"日喀则地震"网络谣言典型案例（2025-01-15）http://www.news.cn/politics/20250115/75a5e08ef36c4c98b6a8376211f787be/c.html
48. 中国网信网 · 中央网信办深入开展"清朗·整治AI技术滥用"专项行动第一阶段工作（2025-06-20）https://www.cac.gov.cn/2025-06/20/c_1752129980667315.htm
49. 北京日报客户端 · 公安部公布八起涉灾情险情网谣案（2025-06-26）https://xinwen.bjd.com.cn/content/s685d3e5fe4b0bd64e2e02200.html
50. 新华网 · 公安机关公布打击整治网络谣言10起典型案例（2025-10-20）http://www.news.cn/legal/20251020/8f90b37ca0d2484682d9059756b917b2/c.html
51. 江苏网信网（转载"网信上海"）· AI智能体对话存在低俗擦边内容 筑梦岛APP被上海市网信办依法约谈（2025-06-19）https://www.jswx.gov.cn/csj/sh/202506/t20250619_111462.shtml
52. 安全内参 · 筑梦岛APP被上海市网信办依法约谈（同文转载，2025-06-19）https://www.secrss.com/articles/79965
53. 南方都市报 · AI陪聊应用极端人设诱导充值！实测青少年模式漏洞待堵（2025-06-24，未抓全文）https://m.mp.oeeee.com/a/BAAFRD0000202506241097301.html
54. 21 世纪经济报道 · AI频现情感纠纷 国内外产品如何落地未成年人模式？（2025-09-23）https://www.21jingji.com/article/20250923/herald/74863571490c4cdcdbe06133669e8e2b.html
55. 央视网 · AI剧情聊天软件色情擦边曝光（2024-11-23，未抓全文）https://news.cctv.cn/2024/11/23/ARTIfUzgBsB08GGqM3zN4R4R241123.shtml
56. 新京报 · AI陪聊擦边软色情，突破未成年人保护底线（2026-03-17）https://m.bjnews.com.cn/detail/1773677358168886.html

**未取回全文、经检索摘要核对的来源（详见报告待决问题）**
57. New York Times · A New Chapter for Sports Illustrated, With Plans to Keep Print（2024-03-18，本环境仅域名级链接）
58. BBC/CNN · Arena Group 解雇 CEO Ross Levinsohn 报道（2023-12-11/12，本环境仅域名级链接）
59. CNET · CNET Is Experimenting With an AI Assist. Here's Why（2023-01-16，完整现址未核实）
60. Talking Biz News · CNET editor in chief Guglielmo to step down（2023-03-03，本环境仅域名级链接）
61. The Telegraph · ChatGPT 对话引语报道（2023-05-27，仅搜索摘要）
62. 中华网 · AI聊天软件诱导10岁女孩割腕（2025-06-13，未抓全文）
