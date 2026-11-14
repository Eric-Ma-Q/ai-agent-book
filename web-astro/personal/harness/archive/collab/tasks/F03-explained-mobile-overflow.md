# F03 · 修复 ai-harness-explained.html 手机端横向溢出

**类型**：页面小修　**优先级**：中　**预计**：小

## 现象（审核者 2026-10-05 用 Chrome 调试协议模拟 375px 手机视口实测）
页面整体宽 441px，比视口宽 66px，手机上能左右拖动。没有被横向滚动容器包住的越界元素有 3 个：

| 元素 | 右边界 | 内容开头 |
|---|---|---|
| `table`（宽 417） | 441 | 时间 / 报告 / 回答的问题 / 关键词 —— 2024.12 Building Effective… |
| `table`（宽 337） | 378 | 技术 / 怎么做 / 适用场景 —— Compaction 压缩… |
| `svg`（宽 19） | 411 | 某个小图标 |

同库其他 6 个页面在 375px 下都不溢出，可参考 `harness-engineering.html` 的表格容器写法。

## 要求
- 两张表格放进可横向滚动的容器（只让表格自己滚，不让整页滚）；如果页面已有同类容器 class，复用它。
- 找到那个越界的 svg，查清为什么越界（定位、负边距或固定宽度）并修好。
- 桌面宽度（1280px）的外观不能变。
- 只改 `ai-harness-explained.html`，加上你的报告。

## 自查
修完后在 375px 视口下确认 `document.documentElement.scrollWidth === 375`（浏览器开发者工具的设备模拟即可），并在报告里写明怎么验证的。

## 交付物
- 修改后的 `ai-harness-explained.html`
- `collab/reports/F03-explained-mobile-overflow.report.md`：改了哪几处（改前 → 改后）、验证方式与结果；末行 `STATUS: DONE`
