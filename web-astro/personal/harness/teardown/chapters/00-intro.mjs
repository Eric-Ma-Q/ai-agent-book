import { stats, cards, note, ul, table } from '../ui.mjs';

export const intro = () => `
  ${stats([
    ['1,884', 'TypeScript 文件（.ts 1,332 + .tsx 552）', '本地副本实测'],
    ['512,664', '行 TypeScript 代码', 'wc -l 统计'],
    ['89', '编译期功能开关（feature()）', '去重后计数'],
    ['659', '遥测事件名（tengu_*）', '去重后计数'],
  ])}

  <section>
    <h2><span class="num">§</span>先说结论：五件事</h2>
    <div class="grid g2">
      <div class="card"><h3>1. 它是一个「运行时」而不是一个「提示词」</h3><p>51 万行里，直接调用模型的那部分只有几千行。其余是工具执行、权限裁决、上下文预算、会话持久化、终端 UI —— 这些才是产品差异所在。</p></div>
      <div class="card"><h3>2. 长任务能力来自四道压缩闸门</h3><p>snip → microcompact → context collapse → autocompact，按代价从低到高排队，先做无损的，再做有损的。这是「能连续干几小时」的真正原因。</p></div>
      <div class="card"><h3>3. 权限不是弹窗，是一条 11 步的裁决流水线</h3><p>deny 规则、工具自检、只读分类、AI 分类器、用户询问、hook 覆盖，各有明确位置；连「连续被拒」都有熔断。</p></div>
      <div class="card"><h3>4. 泄露的代码不等于线上二进制</h3><p>89 个 <code>feature()</code> 开关在打包时做常量折叠，164 个文件按 <code>USER_TYPE</code> 分支。你读到的是「所有分支的并集」，不是任何一台机器上跑的版本。</p></div>
      <div class="card"><h3>5. 最值得抄的是「约束」而不是「功能」</h3><p>工具结果预算、并发安全标记、子 Agent 权限继承、压缩失败熔断 —— 这些不起眼的设计决定了 Agent 是玩具还是工具。</p></div>
      <div class="card"><h3>边界</h3><p>本拆解只做产品与工程分析：不提供可运行的分支、不复制大段源码、不评价模型能力。代码片段均为评论性引用，每段不超过十余行。</p></div>
    </div>
  </section>

  <section>
    <h2><span class="num">§</span>先对齐八个词</h2>
    <p>不熟悉 Agent 的读者，读完这张表就能看懂后面九章在争什么。</p>
    ${table(
      ['词', '一句话解释', '在这份代码里对应什么'],
      [
        ['Agent', '能自己决定下一步做什么的 AI 程序', '<code>query.ts</code> 的主循环'],
        ['工具调用', '模型请求「执行一个动作」，拿到结果再继续', '<code>Tool.ts</code> 与 <code>tools/</code>'],
        ['上下文窗口', '模型一次能读到的全部文字上限', '<code>utils/context.ts</code> 的窗口表'],
        ['压缩', '历史太长时，把旧内容折叠或摘要', '<code>services/compact/</code>'],
        ['权限模式', '决定「拿不准时问不问人」', '<code>utils/permissions/</code>'],
        ['子 Agent', '派出去干活、只把结论带回来的分身', '<code>tools/AgentTool/</code>'],
        ['Hook', '在固定时机自动执行的外部脚本', '27 个事件，见 <code>HOOK_EVENTS</code>'],
        ['MCP', '让外部工具接入的标准协议', '<code>services/mcp/</code>'],
      ],
    )}
  </section>

  <section>
    <h2><span class="num">§</span>这份报告怎么来的</h2>
    ${ul([
      '<b>一手材料</b>：2026-03-31 泄露的 <code>v2.1.88</code> 源码副本，本地 <code>git clone</code> 后只读分析，共 1,932 个文件。',
      '<b>取证方式</b>：每一章的关键断言都配 <code>文件:行号</code>；数字用命令行现场数出来，不抄二手文章。',
      '<b>交叉核对</b>：外部事实（泄露时间、npm 版本、DMCA 数量、官方声明）走公开报道核对；与代码冲突时以代码为准，并记录冲突。',
      '<b>不做什么</b>：不把「代码里存在」说成「线上已开启」；不把「社区推断」写成「官方设计」。凡推断都标出来。',
    ])}
    ${note('warn', '<b>先说清楚一件事：</b>这次泄露的是<b>闭源软件被误发布的源码</b>，不是开源。代码没有附任何开源许可证，复制、再分发、拿其中的提示词做产品都有法律风险。本报告引用片段属于评论与分析，读者不要把它当 MIT/Apache 代码用。')}
  </section>
`;
