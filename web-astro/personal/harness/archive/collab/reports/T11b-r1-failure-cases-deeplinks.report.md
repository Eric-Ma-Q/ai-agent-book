# T11b-r1 完成报告（补深链）

## 交付物
- `research/16-ai-failure-cases-b.md` — 原地修订：正文"域名级"引用清零，案例 4/5/9 的来源全部换成打开核实过的具体文章 URL，案例 8 锚定到可打开的 21 世纪经济报道综述，案例 4 的"2026-03 关停"补上出处；删除/降级了无法链接的事实 — 646 行，17,441 汉字

## 方法与规模
- 全程 0 子智能体，主会话串行约 25 轮 WebSearch/WebFetch + 2 次 curl 批量状态检查；检索手段：HN Algolia API（拿英文报道完整 URL）、Wayback 快照与 CDX（openai.com、ACCC、help.openai.com、rabbit.tech/lam-playground 等被反爬站点的核实）、Wikipedia 引注反查、精确标题搜索。约 12 个新增 URL 逐一 WebFetch 核对了标题/日期/引语，其余做了状态检查。

## 逐处清单

### 案例 4（Sora 2）——新增/替换的可核实链接（12 个，全部打开核对内容）
1. Altman 博客原文升级为 [官方] 一手：https://blog.samaltman.com/sora-update-number-1 （2025-10-03；"First, we will give rightsholders more granular control over generation of characters, similar to the opt-in model for likeness…""including not at all""very high rate of change""We are going to try sharing some of this revenue with rightsholders" 逐句核实——opt-in 承诺原句就在博客里）
2. The Guardian 2025-10-04（替代 PCMag，含"无整包退出+版权争议表单"实测）：https://www.theguardian.com/us-news/2025/oct/04/openai-sora-violence-racism
3. Deadline 2025-10-06（MPA/Rivkin，逐句核实）：https://deadline.com/2025/10/mpa-sora-2-openai-copyright-infringement-1236571849/
4. Variety 2025-10-06/07（MPA+opt-out 机制+Altman "edge cases"）：https://variety.com/2025/film/news/motion-picture-association-openai-sora-2-copyright-1236541775/
5. The Register 2025-10-15（日本知识产权大臣木内孝胤、《AI 振兴法》16 条）：https://www.theregister.com/2025/10/15/japan_openai_copyrighted_anime/
6. Automaton West 2025-10-30（CODA 10-28 书面请求，Aniplex/万代南梦宫/吉卜力/Square Enix/KADOKAWA/集英社）：https://automaton-media.com/en/news/sonys-aniplex-bandai-namco-and-other-japanese-publishers-demand-end-to-unauthorized-training-of-openais-sora2-through-coda/
7. The Verge 2025-10-17（MLK 暂停 + 遗产方机制，逐句核实）：https://www.theverge.com/news/801539/open-ai-sora-mlk
8. TechCrunch 2026-01-29（Appfigures 用户下滑数字，逐句核实）：https://techcrunch.com/2026/01/29/openais-sora-app-is-struggling-after-its-stellar-launch/
9. OpenAI Help Center 关停文（Wayback 2026-05-27 快照逐句核实："The Sora web and app experiences were discontinued on April 26, 2026.""The Sora API will be discontinued on September 24, 2026."）：https://help.openai.com/en/articles/20001152
10. Ars Technica 2026-03-24（关停+"distracted by side quests"）：https://arstechnica.com/ai/2026/03/openai-plans-to-shut-down-sora-just-15-months-after-its-launch/
11. CNBC 2026-03-24（关停+归因+迪士尼交易未完成，逐句核实）：https://www.cnbc.com/2026/03/24/openai-shutters-short-form-video-app-sora-as-company-reels-in-costs.html
12. Wikipedia 引注反查得到 Variety/Deadline/MLK/CODA 等 URL 后均已单独打开；**"2026-03 关停"已核实为 2026-03-24 官宣**，标题行保留、正文补上出处。

### 案例 5（Rabbit R1）——新增/替换的可核实链接（7 个，全部打开核对内容）
1. The Verge 首批实测 2024-04-24（"unfinished"、仅四项服务）：https://www.theverge.com/24138746/rabbit-r1-hands-on-ai-gadget-chatgpt
2. Engadget 评测 2024-05-03（40/100、Uber 不可用）：https://www.engadget.com/rabbit-r1-review-a-199-ai-toy-that-fails-at-almost-everything-161043050.html
3. Android Authority 2024-04-30（APK 跑在 Pixel 6a）：https://www.androidauthority.com/rabbit-r1-is-an-android-app-3438805/
4. The Verge 2024-04-30（Rabbit 官方 X 声明 "rabbit r1 is not an Android app…"）：https://www.theverge.com/2024/4/30/24145838/rabbit-r1-android-app-pixel-6a
5. Tom's Guide 2024-05-02《Gaslighting and gotchas》（Jason England）：https://www.tomsguide.com/ai/gaslighting-and-gotchas-breaking-down-the-rabbit-r1-is-just-an-app-controversy
6. rabbit.tech/lam-playground 官方页（Wayback 2024-10-08 快照；现跳转 r1 产品页；"one of our new experiments""redesigned from the ground up"）：https://web.archive.org/web/20241015/https://www.rabbit.tech/lam-playground
7. The Verge Decoder 访谈 2024-10-07（架构真相：LLM 合作方 "Anthropic, OpenAI and Gemini"、AWS 虚拟机 VNC 浏览器操作）：https://www.theverge.com/24260181/rabbit-r1-large-action-model-lam-playground-generative-ai-jesse-lyu-interview-users

### 案例 9（番茄小说）——整案换用 3 个可打开核实的深链
1. Asia IP Law 2024-07-26（全叙事：协议内容、微博 1800 万阅读、07-23 解除功能、作者引语）：https://asiaiplaw.com/article/bytedance-web-novel-platforms-ai-clause-sparks-author-outrage
2. TMTPost 英文站 2024-07-24（条款 "worldwide, perpetual, irrevocable, and free rights"、法律专家意见）：https://en.tmtpost.com/post/7180717
3. Rest of World 2026-07-06（回顾："In 2024, web novel writers protested… Tomato Novel later allowed them to opt out of the program."）：https://restofworld.org/2026/china-ai-web-novels/

### 案例 8（豆包）——处理方式
- 深链检索多轮（搜索引擎反爬：baidu/sogou/mojeek 拦截、bing 返回无关内容、CDX 无法按标题匹配），仅 21 世纪经济报道综述取得可打开 URL（已核实，含 12-03 事件、微信回应原句、INJECT_EVENTS、《调整说明》、SAEP），整案时间线锚定该稿并在来源处注明。
- **删除**（无法取得链接的关键事实）：淘宝/建设银行/招商银行拦截细节；马化腾 2025 年度员工大会表态；微信"阶梯处罚"条款细节；cnBeta 转载的豆包公告原句（"将陆续解封"）。
- **降级**：账号"陆续解封"改写为弱表述并标【推断】（注明依据为 2025-12 多家媒体检索摘要、原文链接未取得）。

### 其他删改（无链接事实按任务单处理）
- 案例 5：删除"rabbit_technical.txt/Playwright/硬编码 Perplexity key"细节——打开核实后发现原引 TechRadar 文实为 Rabbitude 密钥事件（2024-06-27）、The Verge 文无"Perplexity 查询"表述，两处归源错误已修正；"Playwright"无可核实来源，一句话定性/标题/根因改用 Decoder 访谈公开的架构口径；删除 Obscurity Labs（未打开核实）与"Discord 回应"（实为 X 声明）、"泄漏 APK 是测试用旧版"（Verge 文明确无此说法）、"原定 2024 年春季 teach mode"（未核实到承诺时间）。
- 案例 4：删除"皮卡丘奥本海默"（改用 Guardian 已核实的海绵宝宝/皮卡丘例子）、"2025-10-09 退出机制漏洞报道"（Yahoo 域名级）、"峰值 100 万日活→不足 50 万、每日约 100 万美元"（未核实，改用 TechCrunch Appfigures 数字）、Robin Williams/Kobe Bryant 名单（The Verge 文无）、Axios/Futurism/Reuters/PCMag/Mediagazer 引用。
- 案例 9：删除"向 12315 投诉""不同意就完成不了签约""日更万字不敌一键成文"（虎嗅系无链接细节）及虎嗅回应引语，改用已核实表述；标题相应调整。
- 参考资料：重写为 62 条（全部具体 URL，Obscurity Labs 删除、新增 19 条）；文末新增"未能取得深链的报道"说明块，保持透明。

## 自检结果
- 正文"域名级"引用清零（grep 确认仅 r1 头部说明与两处"未能取得深链"注记提及该词）。
- 被删事实无残留（grep：Playwright/rabbit_technical/皮卡丘奥本海默/Robin Williams/马化腾/12315/Obscurity/每日 100 万美元等均只在说明性注记中出现）。
- 审核者两处修改完好：案例 6"七天后（07-28）"、案例 2 ACCC 引语中译（"Microsoft 在沟通中刻意不提 Classic 方案……"），未改回。
- 案例编号、五段式结构、对比表、跨案例规律、启示、检查项均未动；全文 17,441 汉字（含注记）。
- git 自查：仅 research/16-ai-failure-cases-b.md（r1 修订）与本报告为本次会话产物。

## 待决问题
1. 豆包案的 2025-12 即时报道（新浪财经、SCMP、Reuters 等）与番茄案的中文即时报道（虎嗅、红星、澎湃）确认存在但深链在本环境不可得，已用替代锚点+删除/降级处理；若审核者环境可打开，建议并入 HTML 时直接引用原文。
2. SCMP 2025-12-02（"ByteDance-powered AI phone sparks online rush"）与 2025-12-07 豆包报道、Reuters 2025-12-01 经多源确认存在，路径未取得，未写入正文。

STATUS: DONE
