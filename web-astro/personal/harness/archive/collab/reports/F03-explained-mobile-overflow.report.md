# F03 完成报告

## 交付物
- `ai-harness-explained.html`：表格放进可横向滚动的容器，手机端整页不再横向溢出（diff：+2 行 CSS，9 张表格各包一层 div）
- `collab/reports/F03-explained-mobile-overflow.report.md`：本报告

## 改动清单（改前 → 改后）

1. **CSS「表格」段新增容器 class**（沿用 `harness-engineering.html` 的 `.tblwrap` 写法；本页原来没有同类 class）
   - 改前：只有 `table { width: 100%; …; margin: 28px 0; … overflow: hidden; }`
   - 改后：在 `table {…}` 前加 `.tblwrap { overflow-x: auto; margin: 28px 0; -webkit-overflow-scrolling: touch; }`，在其后加 `.tblwrap > table { margin: 0; }`
   - 说明：外边距从表格挪到容器上，数值仍是 28px，所以桌面端的间距不变；没有包进容器的表格仍按原来的 `table` 规则显示。
2. **页面全部 9 张表格都包进容器**
   - 改前：`<table> … </table>`
   - 改后：`<div class="tblwrap"><table> … </table></div>`
   - 位置：正文 tab 4 张（报告时间线、Compaction/结构化笔记/子代理、失败模式→解法、优化对象/代表工作），深挖案例、自我改进、腐烂机理、实践难点、演化各 1 张。
   - 说明：任务单只点了正文 tab 的 2 张表，但实测时其他 tab 也有表格越界：深挖案例宽 381、自我改进宽 436、实践难点宽 443。为了让所有表格的写法一致，9 张一起包了。
3. **越界的 svg：查清了原因，不需要单独改**
   - 那个 svg 是右下角主题切换按钮 `#themeFab`（`position: fixed; right: 20px`）里的月亮图标 `svg.i-moon`。
   - 原因：手机视口（mobile:true）下，表格把内容撑到 441px 后，布局视口也被扩到 441（实测 `innerWidth` 为 441）。fixed 元素是相对布局视口定位的，所以按钮右边界落在 441−20=421，图标右边界落在 411，正好是任务单里看到的数值。它本身没有负边距、没有写死宽度，也没有定位错误，只是跟着表格溢出一起被带出去了。
   - 修复后实测：`innerWidth` 为 375，按钮右边界 355，图标位置 325.5–344.5，在视口内。

## 验证方式
- 用无头 Chrome（`--headless=new`，单独的 user-data-dir，调试端口 9334），通过 Node 24 脚本走 DevTools 协议：先 `Emulation.setDeviceMetricsOverride({width:375,height:800,deviceScaleFactor:2,mobile:true})`，再打开 `file://…/ai-harness-explained.html`，等 2.5 秒。
- **依次点击 6 个 tab**，每个 tab 都测 `document.documentElement.scrollWidth`，并列出 `getBoundingClientRect().right > 视口宽+1`、且所有祖先都没有 `overflow-x: auto/scroll/hidden/clip` 的元素。
- 桌面端用 1280（mobile:false）做同样的测量，比较修改前后每张表格的 x、y、宽、高。
- 同时监听 `Runtime.exceptionThrown`。

## 验证结果

| 视口 / tab | 改前 scrollWidth | 改后 scrollWidth | 改后越界元素 |
|---|---|---|---|
| 375 正文 | 441（2 张表 + themeFab + svg） | **375** | 0 |
| 375 深挖案例 | 381（1 张表） | **375** | 0 |
| 375 自我改进 | 436（1 张表 + themeFab + svg） | **375** | 0 |
| 375 腐烂机理 | 375 | 375 | 0 |
| 375 实践难点 | 443（1 张表 + themeFab + svg） | **375** | 0 |
| 375 演化 | 375 | 375 | 0 |
| 1280 全部 6 个 tab | 1280 | 1280 | 0 |

- 375 下，原来超宽的表格现在只在自己的容器里横向滚动。例如时间线表宽 417，容器宽 327（scrollWidth/clientWidth = 417/327）。
- 1280 下，修改前后全部 9 张表格的 x、y、宽、高逐项相同（例如时间线表都是 752×504，位置 (264, 2733)）。容器 scrollWidth 等于 clientWidth，不会出现滚动条，桌面端外观不变。
- 修改前后都没有 JS 异常。
- `git status` 自查：本任务只改了 `ai-harness-explained.html` 并新增本报告。`collab/BOARD.md` 在任务开始前就是已修改状态，本任务没有动它。

## 待决问题 / 未完成项
- 没有在真机上测试 iOS Safari 的触摸滚动，`-webkit-overflow-scrolling: touch` 沿用了 harness-engineering.html 的写法。
- 窄屏下表格可以横向滚动，但没有额外加「可滑动」提示。这和库内其他页面的做法一致。

STATUS: DONE
