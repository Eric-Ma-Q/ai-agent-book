# T11b-r1 · 续集 B 小返工：把"域名级"引用补成可访问的文章链接

**类型**：返工（原地修改）　**依据**：`collab/reviews/T11b-failure-cases-defaults-agents.review.md`

## 要做的事
`research/16-ai-failure-cases-b.md` 中有 30 处来源只写了域名（标"域名级"），集中在案例 4 Sora 2、案例 5 Rabbit R1、案例 8 豆包手机助手、案例 9 番茄小说，以及参考资料末尾。PROTOCOL 要求关键事实带 URL，域名不算。

1. 逐条补成**具体文章 URL**，打开确认标题、日期、引用内容一致后再写进去；"（域名级）"标记随之删除。
2. 优先一手：豆包官方公告 / 微博、番茄小说或番茄作家助手的官方回应、OpenAI / Altman 博客原文（openai.com 抓不到可用 Wayback 快照）。
3. 实在找不到可访问链接的事实：改写成更弱的表述并标【推断】，或删掉；不要保留无链接的关键事实。**严禁编造 URL。**
4. 顺带核实案例 4 标题行里的"2026-03 关停"——正文要有出处，没有就删掉。
5. 不改其他案例和结构；审核者已改两处（Gemini CLI"七天后"、ACCC 引语中译），不要改回。

## 并发
T11c 正在另一个会话里跑子智能体，本返工**不开子智能体**，自己串行做。

## 交付物
- 原地修改 `research/16-ai-failure-cases-b.md`
- `collab/reports/T11b-r1-failure-cases-deeplinks.report.md`：列出每处补上的链接（或降级 / 删除的事实），末行 `STATUS: DONE`
