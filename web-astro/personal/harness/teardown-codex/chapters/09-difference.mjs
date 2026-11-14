import { section, ev, table, note, tradeoff, judgment, verdict } from '../ui.mjs';
import { link, DIFFERENCES } from '../data.mjs';

export const difference = {
  no: '09',
  slug: '09-difference',
  nav: '差异判断',
  kicker: '哪些是共有，哪些只是实现不同',
  title: '差异判断：Codex 与 Claude Code 不在同一个证据层',
  lead:
    '把 Codex 与 039 的 Claude Code 放在一起，最容易滑向「谁更强」。这一章只做三件事：先说明材料不对称，再按同一用户问题逐行对照，最后把判断限制在四种类型里。大部分机制是共有的；真正的差异集中在协议层、执行层、记忆管线与仓库边界。',
  oneLine: '11 行差异表：共有机制、实现差异、本副本新增面与不可验证。',
  tldr: [
    '039 是泄露副本，本专题是官方仓库；证据等级不同，不能把「039 没看到」当成「Claude Code 没有」。',
    '循环、工具、压缩、权限、子 Agent、hooks、项目指令都是共有问题，差别多在实现结构。',
    '协议层、unified exec、code mode、两阶段记忆与 message board 是本副本更显式的面；只写「这一版新增了」，不写无法证伪的最高级判断。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>Codex 与 Claude Code 到底哪里不同，哪些不同只是材料造成的？</div>
${judgment(
  'unverifiable',
  '两边材料不在同一证据层：039 是泄露的 sourcemap 反解副本，本专题是 Apache-2.0 官方仓库。差异章只比较两边都有材料的问题。',
  'C01-C22',
)}

${section('01', '先看材料，再看产品', `
  <p>039 的强项是「非公开源码产品也能逐行复核」，弱项是类型定义、feature-gated 模块与构建态代码可能缺失；Codex 的强项是官方仓库完整，弱项是 App / Cloud / 模型服务不在仓库。把两者放在一张表里，先标证据等级，再谈差异。</p>
  ${table(
    ['材料', '能证明', '不能证明'],
    [
      ['039：Claude Code v2.1.88 泄露副本', '运行时函数体、工具契约、部分未发布功能接线', '缺失模块的实现、线上开关、其他版本行为'],
      ['046：openai/codex 官方仓库', 'CLI / 协议 / 沙箱 / 记忆 / 多 Agent 的当前实现', 'App / Cloud / 模型服务内部、账号默认值'],
    ],
  )}
  ${ev(
    'codex-rs/app-server-protocol/src/protocol/common.rs',
    '522-523',
    `client_request_definitions! {
    Initialize => "initialize" {`,
    link('codex-rs/app-server-protocol/src/protocol/common.rs', 522, 523),
    '协议层是本副本更显式的面',
  )}
  ${ev(
    'codex-rs/memories/README.md',
    '29-38',
    `## When it runs

The pipeline is triggered when a root session starts, and only if:

- the session is not ephemeral
- the memory feature is enabled
- the session is not a sub-agent session
- the state DB is available`,
    link('codex-rs/memories/README.md', 29, 38),
    '记忆是会话外管线，不是循环里的顺手一笔',
  )}
`)}

${section('02', '11 行差异表', `
  <p>每一行只回答一个用户问题。判断类型写在最后一列：<b>共有机制</b>、<b>实现差异</b>、<b>本副本可证的新增面</b>、<b>不可验证</b>。</p>
  ${table(
    ['#', '用户问题', 'Codex 的选择', '039 的对照', '判断'],
    DIFFERENCES.map((d, i) => [
      String(i + 1),
      d.question,
      d.codex,
      d.cc,
      `${verdict(d.kind)}<br><small>${d.note}</small>`,
    ]),
  )}
  ${note(
    'warn',
    '「本副本可证的新增面」只表示：在这个 SHA 能指到实现，且 039 的材料里没有对应实现。它不表示其他产品没有，也不表示它是最早出现的。',
  )}
`)}

${section('03', '四种判断，四种写法', `
  ${judgment('shared', '两边都有同类机制，问题相同；写结构差异，不写优劣。例：循环、工具、压缩、权限、子 Agent。', 'C04-C05')}
  ${judgment('implementation', '问题相同、实现不同；写清换来什么、付出什么。例：Codex 的 unified exec 把 PTY 会话做成一等工具。', 'C09')}
  ${judgment('new-surface', '本副本能指到实现、039 材料未见对应实现；只写「这一版新增了」。例：app-server 协议层。', 'C21')}
  ${judgment('unverifiable', '不在仓库或材料不足；写清「只能看到什么」。例：App / Cloud / 模型服务的内部行为。', 'C01-C22')}
`)}

${section('04', '取舍：可比，但不能比「谁更强」', `
  <p>同问题对照能帮读者理解设计空间；但材料不对称、版本不同、产品边界不同，任何「谁更好」的结论都会超出证据。页面能给的，是一张可复核的差异表和四种判断类型。</p>
  <div data-tradeoff>${tradeoff(
    '读者能按同一问题比较结构，而不是背功能列表。',
    '材料与版本不对称；仓库外部分不可验证；差异不等于优劣。',
  )}</div>
`)}

${section('05', '一张表读完后，记住三件事', `
  <ol>
    <li><b>共有机制占多数</b>：循环、工具、压缩、权限、子 Agent、hooks、项目指令，两边都要解决。</li>
    <li><b>真正的结构差异在协议与执行层</b>：app-server 把多端复用做成产品面；unified exec 把 PTY 会话做成一等工具；code mode 把工具调用变成可编程 cell。</li>
    <li><b>仓库边界不是产品优劣</b>：App / Cloud / 模型不在仓库，只能标不可验证；不能把「看不到」写成「没有」。在 039 那边同理，不能把「副本缺失」写成「产品没有」。</li>
  </ol>
`)}
`,
  sources: [
    { label: 'openai/codex README', url: link('README.md', 1, 8), note: '产品入口' },
    { label: 'app-server-protocol/common.rs:522', url: link('codex-rs/app-server-protocol/src/protocol/common.rs', 522, 530), note: '协议层' },
    { label: 'unified_exec/mod.rs:74-77', url: link('codex-rs/core/src/unified_exec/mod.rs', 74, 77), note: 'PTY 上限' },
    { label: 'memories/README.md:29-38', url: link('codex-rs/memories/README.md', 29, 38), note: '记忆管线' },
    { label: '039 Claude Code 源码拆解', url: '../cc-source-teardown/index.html', note: '对照材料' },
  ],
};
