# 06 前沿产品与商业（截至 2026 年 10 月）

> 调研模块：各大公司 AI 产品与商业层面的前沿内容——最新产品形态、商业动作、生态卡位。
> 说明：2026 年的多数收入/估值数据为媒体披露或二级来源（未经审计），文中尽量标注口径与来源；个别传闻已做交叉验证并注明存疑。

---

## ① 要点速览（截至 2026.10 的一览）

- **OpenAI 大转型**：2025-10-28 完成 PBC（公益公司）重组，Microsoft 持股约 27%（约 $135B），OpenAI 承诺采购 $250B Azure 服务（Wikipedia: OpenAI）。2026-02 融资 $110B（$730B 估值，Amazon/SoftBank/Nvidia 各出资）→ 2026-04 扩至 $122B（投后 $852B）；2026-06-08/09 向 SEC 递交（保密）S-1，Altman 9 月确认 IPO 推迟至 2027（Fortune, 2026-06-09；Wikipedia）。
- **收入座次变化**：OpenAI 2025 年收入 $13.1B、2026 年 Q1 约 $6B、Q2 约 $6.7B；Anthropic 2026 年 Q2 季度收入据报道 $11.5B，年化收入多处报道（$30B–$65B）已反超 OpenAI（Economic Times / SaaSRise，二级来源）。Claude Code 从 2025-07 的 ~$4 亿年化涨到 2025 年末 ~$10 亿、2026-02 run-rate 超 $25 亿（TechCrunch 2025-11-04；aeovision）。
- **消费端产品大收缩**：Sora 社交 App 2026-03-24 宣布关停（App 4-26 停服、API 9-24 停服，品牌终结），Disney $1B 授权合作随之告吹；ChatGPT Atlas 独立浏览器 2026-03 宣布与桌面 App/Codex 合并为"桌面超应用"，2026-08-09 正式停服（Wikipedia: Sora / ChatGPT Atlas）。OpenAI 转向企业、健康（ChatGPT Health）、存储（Habitat）与广告（2026-08 年化 $1B）。
- **Musk 系大整合**：2026-02-02 SpaceX 全股票收购 xAI（SpaceX 估值 $1T、xAI $250B，1 股 xAI 换 0.1433 股 SpaceX），2026-07 更名 SpaceXAI；SpaceX 于 2026-05-20 递交 S-1、6 月完成 IPO；8 月斥资 $60B 收购 Cursor 母公司 Anysphere（Wikipedia: SpaceXAI / Cursor）。xAI/SpaceX 系在一个月内连吃两家头部 AI coding 公司。
- **Anthropic 登顶估值**：2026-02-12 Series G 融 $30B（投后 $380B）→ 2026-05 融 $65B（投后 $965B，Reuters），6-01 递交保密 IPO 文件、目标 2026 秋上市；同步签下 AMD 2GW、TeraWulf、Nscale（~$45B）等巨额算力合同（Wikipedia: Anthropic）。
- **中国 IPO 元年**：智谱 2026-01-08 港股上市（SEHK 2513，募资 ~$5.6 亿，8 月市值 $62B）；MiniMax 2026-01-09 上市（发行价 165 港元，3 月冲破千元、最高 1330 港元，较发行价涨超 7 倍）；DeepSeek 2026-05 完成 $7B Series A（投后 $52B）并筹备 IPO；月之暗面 2026-07-30 以 $35B 估值完成新一轮（新浪财经 2026-04-13；Wikipedia：Zhipu/MiniMax/DeepSeek/Moonshot）。
- **Agentic Commerce 标准混战**：OpenAI/Stripe 的 ACP（Instant Checkout）+ Google 的 AP2（已捐给 FIDO Alliance）与 UCP（Google+Shopify）+ Coinbase x402 + Visa TAP/Mastercard Agent Pay 并立；但 OpenAI Instant Checkout 因商品匹配/库存数据问题于 2026-03 收缩（agenticcommerceprotocol.info；digitalapplied）。
- **就业冲击显性化**：WEF（2026-03）：美国 entry-level 岗位 18 个月减少约 35%；SignalFire：应届生仅占大厂招聘 7%；2026-08 研究：采用 GenAI 的企业初级岗位招聘减少约 22%。

---

## ② Agent 编码赛道：格局与收入

**收入/估值梯队（编码赛道 2026）**

| 公司 | 关键节点 |
|---|---|
| Cursor (Anysphere) | 2025-06 $9.9B 估值/$500M ARR → 2025-11 $2.3B Series D、$29.3B 估值、ARR 破 $1B → 2026-05 ARR $3B（Bloomberg 2026-05-21）→ 2026-08-14 被 SpaceX 以 $60B 全股票收购（389,289,254 股 SpaceX A 类股） |
| Claude Code (Anthropic) | 2025-07 ~$400M 年化 → 2025 年末 ~$1B → 2026-02 run-rate >$2.5B（TechCrunch/aeovision，二级） |
| Cognition (Devin) | 2025-09 $400M 融资、$10.2B 估值 → 2026-04 传 $25B 估值洽谈 → 2026-09 传 $2B 融资、$48B 估值、ARR $1B（HN/二级来源） |
| Replit | Agent 3（2025-09）后：2025-09 $3B → 2026-03 Series D ~$4 亿、$9B 估值；2026-04 年化收入 ~$5.25M→$525M；2026 目标 $1B ARR |
| GitHub Copilot | agent mode（2025-02-06）→ coding agent（2025-05-17，云端环境自动出 PR）→ 2025 末-2026 初上线 agent 会话"mission control"与基于 Actions 的 Agentic Workflows（2026-01 起 Actions 计费 $0.002/分钟） |
| Google | Antigravity agentic IDE（2025-11-18，围绕 Gemini 3）+ Jules 异步编码 agent（云 VM 运行），2026 持续迭代 |
| AWS Kiro | spec-driven agentic IDE，2025 年 7 月预览，2025-11/12 GA；Free/$20 Pro 定价，2026 推 Kiro CLI 2.0、自主 agent 预览 |

**关键叙事**

1. **Cursor 被 SpaceX 收购是赛道分水岭**：2026-04-21 xAI 与 SpaceX 获得收购权（$60B 收购或 $10B 联合研发），6-16 行权，8-14 交割；随后 2026-08 OpenAI 以"马斯克旗下公司违约蒸馏"为由停止向 Cursor 供模，Cursor 数据被用于训练 Grok 4.7（Wikipedia: SpaceXAI / Grok）。这使"模型厂—应用厂"的垂直整合以最激烈的方式落地，也再次引爆"AI 公司沦为巨头收购标的"的讨论（Cursor 三年从 $60M 估值到 $60B 卖身）。
2. **Claude Code 成为 Anthropic 收入引擎**：2026-02 起 Anthropic 约每两周一个产品发布（Opus 4.6 于 2026-02-05，Opus 5 于 2026-07-24，Opus 5.5 于 2026-09-22）；Claude Code 在 2025-2026 年冬季假期"vibe coding"破圈，被微软、谷歌员工使用（OpenAI 2025-08 被撤销访问）。恶意使用事件（GTG-2002 勒索、中国团伙 80-90% 自动化间谍攻击）也同步出现（Wikipedia: Claude）。
3. **模型-应用边界模糊**：Cursor 的 Composer（2025-10-29 随 Cursor 2.0 发布，多 agent 并行/git worktree）二代（2026-03）被发现基于 Moonshot 开源 Kimi 2.5，仅约 1/4 算力为自有后训练——开源模型正在"喂养"美国头部 coding 产品（Wikipedia: Cursor / Moonshot）。
4. **中国开源模型反向输出**：Kimi K2（2025-07，1T MoE）→ K2 Thinking（2025-11）→ K2.5（2026-01，Agent Swarm/Kimi Code CLI）→ K3（2026-07-16，2.8T 参数、1M 上下文，当时最大开源权重模型），成为 Cursor Composer 2、Thinking Machines Inkling 的基座（Wikipedia: Moonshot AI）。

---

## ③ 消费级产品前沿

**Sora 2 与"关停求证"**（已交叉验证，非传闻）
- 2025-09-30 Sora 2 与 iOS 社交 App 同步发布，因默认 opt-out 版权政策遭 MPA、日本 CODA（吉卜力/史克威尔艾尼克斯等）抗议，2025-10-03 改为 opt-in；全球用户峰值约 100 万后跌破 50 万，日运行成本估算 $1M（Wikipedia: Sora）。
- 2025-12-11 Disney 宣布 $1B 投资 + 三年授权（200+ 角色），SAG-AFTRA/WGA 发公开信抗议；2026-03-24 OpenAI 宣布关停 Sora App 与 API，App 于 4-26 停服、API 于 9-24 停服，Disney 合作流产，媒体称 OpenAI 为"product-killer"（Wikipedia；KTVB/Chicago Tribune 2026-03-24）。转向企业/生产力场景。
- 视频生成赛道由 Grok Imagine、Midjourney 等接棒：Grok Imagine 2025-07-28 上线，Imagine 1.0（2026-02-01）、3 月"Chibi"模板病毒式传播、2026-09-21 Imagine 1.5 Preview 进 API；Midjourney 2026 重心在 V8/V8.2 图像编辑模型，视频仍为 V1（2025-06，5-21 秒）无官方 V2。

**OpenAI 消费端**：ChatGPT WAU 2025-10 为 800M → 2026-02 约 900M（Altman），付费订阅 ~5%（>50M）；2026-01 收购 Torch（~$60M）推出 ChatGPT Health；2026-09-03 发布 GPT-6 Astra；2026-09-14 存储平台 Habitat（70M+ QPS、500+ PB）。
- **广告**：2026 年 4 月报道预计全年广告收入 ~$2.5B；2026-08 广告业务年化达 $1B（上线约 200 天）；$100B/2030 广告目标需要 WAU 达 27.5 亿（Wikipedia: OpenAI；The Information）。
- **Atlas 浏览器始末**：2025-10-21 macOS 独占发布（Chromium），Windows/iOS/Android 跳票；2026-01 加 tab groups/"Auto"搜索模式；2026-03 宣布与 ChatGPT 桌面 App、Codex 合并为桌面"超应用"（CNBC/WSJ），2026-08-09 停服。浏览器入口叙事受挫，入口回归 ChatGPT 本体。

**AI 硬件**
- OpenAI × Jony Ive（io，2025-05 以 ~$6.5B 收购）：2026-02 因商标纠纷弃用"io"名；由前 Apple 工业设计负责人 Evans Hankey 主导的无屏 AI 设备，目标 2027 年发布；郭明錤称 OpenAI 在追一款 2027 年 AI 手机；2025-11 Altman 曾否认"技术延期"报道（daily.dev 2026-09-13；MacRumors）。
- Meta 眼镜：EssilorLuxottica（2026-02）披露 2025 年卖出 700 万+ 副 Meta AI 眼镜（为 2023/24 年 200 万副的 3 倍+）；2026-01 Meta 寻求把产能翻倍至年产 2000 万副；但带显示的 Ray-Ban Display 仍是利基（TrendForce：2026 年全球 AR 眼镜 95 万副，其中 Display 段 ~15 万副，+87.5%）；IDC：2026Q1 智能眼镜出货 225 万副（+167% YoY），全年预计 1360 万副/$51 亿。
- Rabbit/Limitless 等早期硬件厂商未见重大翻身消息，风头被眼镜与耳机形态掩盖。

**Grok 与 X 整合**：Grok 4（2025-07-09，$300/月 Heavy）→ Grok 4 Fast（2025-09，2M 上下文）→ 4.1（2025-11）→ 4.20（2026-02）→ 4.3（2026-04）→ 4.5（2026-07-08，数万块 GB300 训练）→ 4.6（2026-08-12）→ 4.7（2026-09-21，用 Cursor 数据训练）；Grokipedia 2025-10-27 上线（80 万+词条）；Grok for Government 获 DoD $200M 合同（2025-07）。合并后 Grok/X/Cursor/Colossus（孟菲斯，近 2GW、规划 100 万 GPU）都归 SpaceXAI。

---

## ④ 企业级前沿与采用数据

**企业 Agent 平台**
- Salesforce Agentforce：上线 15 个月签下 29,000 单（付费单 2025 年末超 9,500）；FY2026 总收入 $41.5B（+10%）；Agentforce ARR 2026-04 约 $8 亿（+169% YoY）→ 2026-08（Q2 FY27）超 $15 亿，Agentforce+Data 360 合计 ARR ~$39 亿（+210% YoY）；Flex Credits 按量计费驱动复购（Quartr/Zacks，2026-08 财报）。
- Microsoft：2026 Work Trend Index（2026-05-05）：M365 生态活跃 agent 数同比增长 15 倍（大企业 18 倍）；M365 Copilot 实际使用率约 35.8%（有席位者中不足 4/10）；Copilot 全家桶活跃用户 ~3300 万、Copilot Chat 周活 ~2000 万；PwC：79% 企业在采用 AI agent（Avantiico/SEOProfy，2026-04~08）。ServiceNow 的 AI Pro Plus 等平台未检索到硬数据，从略。
- Anthropic 企业底盘：API/企业占收入 80–85%；2025-09 报告称与 Claude 合作的企业 3/4 用于"整任务委托"；Ramp 数据：2026-02 为 Anthropic 付费的企业占比单月 +4.9pct 至 24.4%（史上最大单月涨幅）；Palantir 合作使 Claude 成为机密任务唯一模型（2026-02）。
- Anthropic 把 Claude 变成"办公平台"：Claude for Excel（共享上下文扩展至 Excel/PowerPoint，2026 下放至 Pro 档）、Claude Cowork（2026-01-12 研究预览，操作电脑/浏览器/表格；2026-02 企业版+Google Drive/Gmail/Docusign 连接器；3 月 Dispatch 手机派活；8 月 Chrome 侧边栏；9 月全端可用）——直接对打 M365 Copilot（VentureBeat/CNBC；Wikipedia: Claude）。
- OpenAI 企业侧：Agents API 公测（2026-09-10）取代 AgentKit 中 Agent Builder/Evals（2026-11-30 后停用，2026-06-03 官宣）；92% Fortune 500 在用 OpenAI 产品；Codex Sites（2026-06，合作 Wix/Replit/Figma/Lovable）。

**职能渗透**：客服/编码/销售是 Agent 渗透最快三职能；2026-08 报道称 AI 在电商中 62% 用于商品比较、交易环节仍滞后——"AI 导购强、AI 收银弱"是全行业现状（Yahoo Finance 2026-08）。

---

## ⑤ 资本与算力军备

**OpenAI**：2026-02 $110B（$730B，Amazon $50B/SoftBank $30B/Nvidia $30B）→ 3 月扩至 $120B → 4 月 $122B、投后 $852B；6 月 S-1，9 月确认推迟至 2027 上市。2025 收入 $13.1B、亏损 ~$9B，预计 2029 年盈亏平衡（Wikipedia）。
**Anthropic**：2025-09 Series F $13B（$183B）→ 2026-02-12 Series G $30B（$380B）→ 2026-05 $65B（$965B，Reuters 称超越 OpenAI）→ 6-01 保密 IPO 文件，目标 2026 秋；另与 Blackstone/H&F/Goldman 设立 AI 服务公司 "Ode"（2026-05）。Anthropic 曾自估 2028 年收入 $70B（TechCrunch 2025-11-04）。
**xAI/SpaceX**：2026-02-02 合并（$1T+$250B），5-20 S-1、6 月 IPO；2026-04-21 拿下 Cursor $60B 收购权并于 8 月交割——马斯克系完成"火箭+卫星+社交+模型+编码工具"的全栈闭环；合并后 4 人联创团队中过半出走、CFO 离职（Wikipedia: SpaceXAI）。
**算力循环交易与争议**
- 核心 loop：Nvidia 投资 OpenAI（宣布至多 $100B/10GW，2025-09）→ OpenAI 买 Oracle $300B 算力（2025-09，五年）→ Oracle 买 Nvidia 芯片；AMD（2025-10，6GW MI450+1.6 亿股认股权证 ~10%）；Broadcom 自研芯片"Jalapeño"（2026-06-24，TSMC 3nm，2026 年末投产）；WSJ 2026-01-31 称 Nvidia-OpenAI $100B 交易"搁置"，2026-08 修订为 Nvidia 以 $105B 为 SB Energy 俄亥俄 8GW 数据中心租赁提供兜底（Seeking Alpha 2026-03-05；Wikipedia: OpenAI）。
- FTC 关切 Microsoft Azure credits 等构成"循环支出"；Nvidia 2026-07 宣布累计 ~$750B 投资后，"循环融资推高需求"的警告达到顶峰（AV Press 2026-07-28）。Anthropic 也在 loop 内：Nvidia/微软拟投至多 $15B、买 $30B Azure（2025-11）；2026-07 AMD 2GW MI450（AMD 至多投 $5B）；2026-08 Nscale ~$45B（西弗吉尼亚 ~460MW）；5 月还成了 xAI Colossus 的客户、Google 每月向 xAI 支付 $920M 算力费（CNBC）。
- **电力/核能**：Microsoft 与 Constellation 签 20 年 PPA（~$16B）重启三里岛 1 号机组（Crane Clean Energy Center，835MW）；Meta 为 Prometheus 超算签三份核电协议；预计 2035 年核电可满足数据中心 ~10% 用电（DCD/Introl）。AI 数据中心的瓶颈从芯片转向电力。
**收入榜（2026 现实 vs 预测）**：年化收入口径下 Anthropic（$30B–$65B 区间报道）反超 OpenAI（~$25B 上下），打破了 2025 年底"OpenAI 一骑绝尘"的预测；但 OpenAI 靠广告+消费订阅+企业 API 三线仍在绝对值上保持总盘子领先（口径分歧大，均未审计）。

---

## ⑥ 生态卡位与新入口

- **个人 AI 助理**：Cowork（Claude）、ChatGPT 桌面超应用、MS Copilot agents、Grok Bot 等都在做"记忆+主动执行"；OpenAI 2026-03 的"桌面超应用"合并与 Atlas 停服说明：入口不是浏览器，而是常驻桌面的 agent 本体。
- **Agentic Commerce/支付**：Instant Checkout 2025-09-29 随 Etsy 上线（ACP，Apache 2.0），Shopify 百万商家在途；2026-02-16 扩至 Free/Plus/Pro；但 2026-03 因商品匹配/库存问题收缩。协议层四强并立：ACP（OpenAI+Stripe，Beta）、UCP（Google+Shopify，Beta；2026-08-25 扩展到零售以外）、AP2（Google 发起→捐 FIDO Alliance，扩展 A2A/MCP）、x402（Coinbase，稳定币 HTTP 原生支付，x402 Foundation）；MCP 进入 Linux Foundation Agentic AI Foundation；Visa TAP/Mastercard Agent Pay 打通卡组织；Amazon Bedrock AgentCore Payments 2026-08-18 GA。2026-09 实测：500 商家中仅 64 家发布有效 UCP profile，24% 法/美商户主页 403 拦截爬虫——落地仍早期（agenticcommerceprotocol.info）。
- **AI 广告模式**：ChatGPT 广告 2026 年跑通（年化 $1B）；Perplexity 年化收入从 2026 年初 <$250M 升至年中 >$750M（Comet Plus：$5/月、80% 分成、$42.5M 池子）；Grok Imagine 视频生成向 API/营销场景开放。AI 搜索/问答的广告与分成模式正式成为第二增长曲线。
- **超应用之争**：中国大厂 2026-08 已有超 20 款桌面端 Agent 产品；美国以 OpenAI 桌面超应用、SpaceXAI（Grok Build/Grok Bot/Cursor）为先。浏览器入口争夺以"Atlas 之死"暂告一段落——被 ChatGPT 内化。

---

## ⑦ 中国产品前沿

- **豆包**：2026-05 用户 3.3 亿，同月推出订阅制；Seed 2.0（2026-02-14）；日消耗 120 万亿 token（China Daily）；但 6 月出现 600 万用户流失（SCMP）；2026-07-15 因"拟人化 AI"新规下线 App 内智能体功能（千问同日执行）；扣子（Coze）2026-07-01 下架"发布到豆包"渠道（Wikipedia: Doubao；docs.coze.cn）。
- **千问 App**：2025-11-17 通义更名千问（CEO 吴泳铭拍板，更名前月活仅 ~305 万），一周下载破千万、Q4 月活 +900%；2026 春节投入 ~30 亿推广；2026-08-03 把 QoderWork、悟空、MuleRun 整合为"千问办公"（QwenWork）（新浪财经 2025-11-17；腾讯新闻 2026-08-25）。QuestMobile 2026-05：豆包 3.45 亿、千问 1.66 亿、DeepSeek 1.27 亿 MAU（四强未去重合计 7.1 亿）。
- **元宝×微信**：2026 春节 10 亿红包推广后 DAU 一度破 5000 万、月活 1.14 亿；年中月活 ~4100 万；2026-05 支持总结微信聊天记录、6 月打通微信文章/文件/聊天记录一键转发；2026-06-08 微信发布开发者接入微信 AI 生态指引（滴滴、美团接入）；The Information 2026-03 报道腾讯在微信内秘密开发 AI，引发"元宝弃子"讨论——腾讯真正底牌是微信（搜狐/51CTO/网易 2026）。
- **Kimi（月之暗面）**：全面转向开源+Agentic：K2（2025-07）→ K2 Thinking（2025-11）→ K2.5（2026-01，MoonViT 多模态、Agent Swarm、Kimi Code CLI）→ K3（2026-07-16，2.8T 参数、1M 上下文、Swarm 扩至 300 子 agent，商用收入超 $20M/年需签分成协议）；2026-05 ARR ~$300M、$2B 融资（$20B 估值）→ 7-30 $35B 估值成中国第二贵 AI 独角兽；2026-03 考虑港股 IPO；与农行/Amex 发联名卡（2026-07-10）。被 Anthropic 两度指控"蒸馏"（2026-02/09，5380 个欺诈账号、2300 万次对话），美国众议院国土安全委员会致函 DoorDash/Anysphere 问询 Kimi 使用（Wikipedia: Moonshot）。
- **DeepSeek**：C 端克制、开源激进：V3.2（2025-09/12）→ V4 预览（2026-04-24：Flash 284B/Pro 1.6T，1M 上下文，MIT）→ 正式版（2026-07-31/08-13，华为昇腾、寒武纪适配）→ V4.1-Flash（2026-09-10）；未发布"R2"；2026-05 完成 $7B Series A（投后 $52B）、2026-07 筹备 IPO（传 $70B pre-money）；Anthropic 指控其蒸馏（2026-02）；开源 agent 底座 DeepSeek Harness 2026-08 开发者预览（Wikipedia: DeepSeek）。
- **Manus**：2025 年中总部迁新加坡（~40 核心员工随迁、其余裁员，弃中文社区、屏蔽大陆访问）；2025-12 被 Meta 宣布以 $2–3B 收购 → 2026-01 中国商务部"评估性调查"+高管出境禁令 → 2026-04-27 发改委否决交易 → 6-15 Meta 切割 → 8-11 宣布独立运营；2025-12 收入 run-rate $125M；2026-05 传 $2B 估值融资、9 月传 $4B（Wikipedia: Manus；Caproasia）。
- **上市潮**：智谱 2026-01-08 港股上市（SEHK 2513，~$558M，8 月市值 $62B；GLM-5 2026-02-12、GLM-5.3 2026-08-14）；MiniMax 2026-01-09 港股上市（165 港元发行，3-09 破千元、最高 1330 港元，+7 倍；2025 收入仅 $79M、净亏 $18.7B——含可转换优先股公允价值变动口径，市场用"AI 千元股"叙事定价）；中国 AI 资本化呈"一级市场巨额轮 + 港股高波动"双轨。
- **腾讯/百度**：百度 AI 搜索 2026-05 月访问 3943 万（+20.65%），文心助手回暖；腾讯 ima 升级 Agent 化、元宝+ima+WorkBuddy 多线布局；行业观察到 AI 人才从百度→六小虎→阿里/DeepSeek/字节/腾讯的三次迁徙，组织调整比产品发布更密集（雷峰网 2026-09-07；腾讯新闻 2026-09-01）。

---

## ⑧ 来源清单（主要）

**Wikipedia（交叉验证主源）**
- https://en.wikipedia.org/wiki/OpenAI
- https://en.wikipedia.org/wiki/Anthropic
- https://en.wikipedia.org/wiki/Sora_(text-to-video_model)
- https://en.wikipedia.org/wiki/ChatGPT_Atlas
- https://en.wikipedia.org/wiki/Cursor_(code_editor)（条目带 AI 生成疑虑横幅，相关细节已用多方报道旁证）
- https://en.wikipedia.org/wiki/SpaceXAI
- https://en.wikipedia.org/wiki/Grok_(chatbot)
- https://en.wikipedia.org/wiki/Claude_(language_model)
- https://en.wikipedia.org/wiki/Manus_(AI_agent)
- https://en.wikipedia.org/wiki/Moonshot_AI
- https://en.wikipedia.org/wiki/DeepSeek
- https://en.wikipedia.org/wiki/Doubao
- https://en.wikipedia.org/wiki/MiniMax_(company)
- https://en.wikipedia.org/wiki/Zhipu_AI
- https://en.wikipedia.org/wiki/GitHub_Copilot

**行业/媒体**
- Agentic Commerce Protocol Registry：https://agenticcommerceprotocol.info（ACP/AP2/UCP/x402 时间线）
- Fortune（2026-06-09，OpenAI 保密 S-1）：https://fortune.com
- Reuters via US News（2026-02-11，xAI 重组）：https://money.usnews.com
- CNBC（2026-01-27，Anthropic $350B 轮关闭）：https://www.cnbc.com
- TechCrunch（2025-11-04，Claude Code ~$1B/Anthropic $70B 预测）：https://techcrunch.com
- Microsoft 2026 Work Trend Index（2026-05-05）：https://www.microsoft.com
- Quartr（Salesforce FY26 财报摘要）：https://quartr.com
- Seeking Alpha（2026-03-05，循环交易 unraveling）：https://seekingalpha.com
- Antelope Valley Press（2026-07-28，Nvidia $750B 循环融资之忧）：https://www.avpress.com
- Data Center Dynamics（三里岛 835MW PPA）：https://www.datacenterdynamics.com
- WEF（2026-03，entry-level -35%）：https://www.weforum.org
- SignalFire State of Tech Talent（2025-05-20）：https://www.signalfire.com
- KTVB/Chicago Tribune（2026-03-24，Sora 关停）：https://www.ktvb.com
- 新浪财经（2025-11-17，千问更名；2026-04-13，港股 AI 千元股）：https://finance.sina.com.cn / https://finance.sina.cn
- 腾讯新闻（2026-08-25，大厂 Agent 混战）：https://news.qq.com
- 雷峰网（2026-09-07，AI 人才迁徙）：https://www.leiphone.com
- x.ai News（2026-09-21，Grok Imagine 1.5）：https://x.ai
- VentureBeat（Claude Excel/PowerPoint 共享上下文）：https://venturebeat.com
- Caproasia（2026-05-23，Manus 融资）：https://www.caproasia.com
- Sacra（Manus/Replit 收入追踪）：https://sacra.com
- Coze 更新日志（2026-07，豆包渠道下架）：https://docs.coze.cn/recent-updates
