# T11b 审核意见

**结论：有条件通过，派小返工 T11b-r1（补深链）。** → **r1 后通过**（2026-10-07 13:30）

## 核查（全部一致）
- AWS-2025-015 原文："the malicious code was distributed with the extension but was unsuccessful in executing due to a syntax error"——交付对流行叙事的纠正成立。
- Anthropic 复盘原文："Claude often recovers well from isolated mistakes"、08-29 负载均衡变更、08-31 最坏时 16% Sonnet 4 请求受影响。
- gov.uk CMA 立案 2026-07-29，Personal £84.99 vs £59.99。
- ABC：Microsoft 道歉邮件 "fell short of our standards"；Guardian：270 万、Microsoft 发言人原话。
- Gemini CLI issue #4586 当事人更正原话 "Okay, my bad. I did find these files in the C:\ root upon a deeper search."——"文件没丢、核心是 agent 自述失真"的重新定性成立，是本批最有价值的发现之一。
- 21 世纪经济报道（豆包二代与 SAEP）可访问。

## 优点
- 两个流行叙事被一手材料推翻（Gemini CLI 没删、Amazon Q 已分发），按事实写并注明差异。
- 跨案例规律 3（agent 自述的两个方向都会错）、4（自然语言载荷进入供应链）、5（反馈链路与变更链路没接上）都是 casebook 没有的新东西。
- 换下 Taco Bell、Snapchat 的理由充分。

## 问题
1. **30 处"域名级"引用**（Sora 2、Rabbit R1、豆包、番茄小说及参考资料末尾）没有具体 URL，番茄小说案整案无一条可点链接。PROTOCOL 第 3 节要求关键事实带 URL → 返工 T11b-r1。
2. 案例 4 标题行写"2026-03 关停"，正文未见出处 → 并入 r1 核实。

## 审核者已直接修改
- 案例 6 一句话定性"五天后当事人承认"与时间线、表格（7 天）不一致 → 改为"七天后（07-28）"。
- 案例 2 ACCC 主席英文引语后附的中译是另一句话 → 改为对应译文。

## r1 复审（2026-10-07）
**通过。** 正文域名级引用清零；抽查新补 8 个 URL 全部 200 且内容一致（Altman 博客 "opt-in model for likeness""including not at all"；TMTPost "perpetual, irrevocable"；Asia IP Law 07-23 解除功能；CNBC 关停与迪士尼交易；Rest of World 回顾；Deadline Rivkin 声明；Verge Decoder 访谈；Ars 关停报道）。执行者另外自查出两处归源错误（TechRadar 实为 Rabbitude 密钥事件、Verge 文无 Perplexity 表述）并删去无法链接的细节，处理得当。
