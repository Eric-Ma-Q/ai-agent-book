# T09a 审核意见 · 分册收尾修订

**审核日期**：2026-10-05　**结论：通过**

## 审核者核对
| 抽查 | 结果 |
|---|---|
| MCP 2026-07-28 弃用 sampling / roots / logging（SEP-2577） | 实抓 client/sampling、client/roots、deprecated 注册表三页，原文一致（含"至少保留 12 个月、最早 2027-07-28 后移除"） |
| tools "designed to be model-controlled" | server/tools 页原文一致 |
| 11 ZCode 物证 | `zcode.cjs` 中 `["user","feedback","project","reference"]` 与 "lines after 200 will be truncated" 均可 grep 到 |
| 14 §2.3 重算 | 逐项复算：Sonnet 1.00+0.375+0.04+0.30=1.715；无缓存 5.17M×2+0.3=10.64（6.2 倍）；Opus 2.43 vs 21.28（8.8 倍）。全部正确 |
| pi "如 Tenki" | 10 §3.1 所引两处出处（npm 包页、pi-1-0 博文）抓取后均未见 Tenki；执行者以 containerization.md 为准的处理正确 |
| 改动范围 | 只动了 research/08、09、11、12、13、14 |

## 做得好
- 新发现 MCP 弃用 sampling/roots，这是 2026-07 规范的重要变化，之前的分册都没写到。
- 13 主动删掉一句超出"标题级"口径的审计转述，并说明原因——口径自洽。
- 无法回溯的深链如实写"仅站点级 + 原因"，没有硬凑 URL。
- 坏工具→好工具示例质量高，九行对照表每行都有官方出处。

## 小问题（进 F02）
1. 09 E 示例：返回体提到 `response_format` 参数和 `page_token` 参数，但改写后的 schema 里没有这两个参数。教学示例前后不一致，学习者会被绊住。
2. 10 §3.1 pi 行"（如 Tenki）"改为与官方 containerization.md 一致。
3. 11 §2.1 把一篇英文综述称作"中文综述"（T04 审核遗留）。
4. 08 参考资料 43（Niharika）原文疑已下线：删除该条，或换成可核实来源；正文依赖它的句子相应弱化。
