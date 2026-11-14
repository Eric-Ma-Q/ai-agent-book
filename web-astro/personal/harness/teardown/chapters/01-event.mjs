import { section, ev, table, note, quote, ul, stats, cards, analogy } from '../ui.mjs';

export const event = {
  no: '01',
  slug: '01-event',
  nav: '事件与证据',
  kicker: '事故、可信度与法律边界',
  title: '一次打包疏忽，把产品说明书发到了公网',
  lead:
    '一个调试用的 <code>.map</code> 文件跟着 npm 包一起发布，里面嵌着全部原始 TypeScript。这一章把时间线、数字冲突和「你能信到什么程度」讲清楚，后面九章的所有结论都建立在这份材料上。',
  oneLine: '泄露怎么发生、数字为什么对不上、哪些结论能当事实用。',
  tldr: [
    '2026-03-31，<code>@anthropic-ai/claude-code@2.1.88</code> 的 npm 包里带了 <code>cli.js.map</code>，其 <code>sourcesContent</code> 字段是完整未混淆源码；包随后被撤下。',
    'Anthropic 的定性是「发布打包问题、人为失误，不是安全事件」，并称未涉及客户数据或凭证。',
    '维权动作一度覆盖约 8,100 个 GitHub 仓库，随后收缩为 1 个仓库 + 96 个 fork —— 这个反复本身影响了「哪些副本还在」。',
    '二手报道的文件数与体积互相矛盾；本报告一律用本地副本实测值（1,932 个文件 / 1,884 个 TS 文件 / 512,664 行）。',
    '泄露 ≠ 开源：代码没有开源许可证，复制与再分发有法律风险。',
  ],
  body: () => `
${section('01', '事故是怎么发生的', `
  <p>Source map 是给压缩后的 JS 做「反查原始位置」用的：它不仅能映射行号，还能把<b>原始源码原文</b>塞进 <code>sourcesContent</code> 数组。前端工程里这是调试标配，发布到生产包则是典型事故。</p>
  ${ev('cli.js.map（结构示意，非原文）', 'sourcemap v3', `{
  "version": 3,
  "sources": ["../src/main.tsx", "../src/tools/BashTool.ts", "..."],
  "sourcesContent": [
    "// 每个文件未压缩的完整源码，逐字保存",
    "..."
  ],
  "mappings": "AAAA,SAAS,OAAO..."
}`, '只要包里有这个文件，还原源码不需要任何逆向技术')}
  <p>这次的包是 <code>v2.1.88</code>。发现者是安全研究者 Chaofan Shou（@Fried_rice），他在 X 上贴出结论：「Claude Code 的源码通过 npm registry 里的一个 map 文件泄露了」。几小时内 GitHub 上出现大量镜像，<b>fork 数一度超过 star 数</b> —— 大家都在抢在删库前备份。</p>
  ${analogy('相当于把「建筑图纸」和「装修好的样板间」一起交给了客户：你以为只交付了样板间，图纸却钉在了包装箱底。')}
`)}

${section('02', '官方怎么说', `
  ${quote('这次 Claude Code 发布包含了一些内部源码。没有敏感客户数据或凭证被涉及或暴露。这是人为失误导致的发布打包问题，不是安全漏洞。我们正在落实措施避免再次发生。', 'Anthropic 发言人给 PCMag 的声明，2026-04-01')}
  <p>这段声明定了三件事，后面每一章都要遵守：<b>是内部源码</b>（不是开源）、<b>不涉及客户数据</b>（所以不要从代码里找「用户数据长什么样」）、<b>是流程问题</b>（所以泄露的是构建产物，不是模型）。</p>
  ${note('', '<b>没被泄露的东西同样重要：</b>模型权重、训练数据、API 基础设施、用户会话内容都不在此次范围内。任何声称「泄露了模型」的说法可以直接排除。')}
`)}

${section('03', '维权动作，以及它为什么影响你读到的版本', `
  <p>GitHub 的 DMCA 仓库里先后出现两份通知：先是一份覆盖「约 8,100 个仓库的整个网络」的删除请求，第二天又提交了收缩版，最终只保留 1 个仓库与 96 个 fork 地址。这种「先广后窄」的做法制造了两个后果：</p>
  ${ul([
    '大批<b>无关仓库</b>被误伤（包含只是引用了相似名字的项目），社区对「连坐式下架」的批评集中在这一点；',
    '被下架的副本并没有消失，而是换语言重写（Python、Rust、Bash 版本）继续流传 —— 这也解释了为什么你今天能 clone 到的「源码」质量参差。',
  ])}
  ${note('warn', '<b>读副本的第一个坑：</b>不同镜像可能被删过文件、改过 README、混入二次创作。看到「1900 个文件」的说法先别信，自己数。')}
`)}

${section('04', '数字对不上：三套口径', `
  <p>公开报道里的关键数字至少有三种说法，我把它们和本地实测放在一起。差别主要来自「算不算 README / 算不算 .tsx / 有没有去重」。</p>
  ${table(
    ['口径', '文件数', '代码行', 'map 体积', '出处'],
    [
      ['媒体报道（常见）', '1,900+', '512,000+', '59.8 MB', 'Zscaler、PCMag、Cybernews 等'],
      ['中文技术复盘', '1,902 / 1,906', '51 万+', '59.8 MB', 'imooc、博客园等二手整理'],
      ['<b>本报告实测</b>', '<b>1,932 总 / 1,884 TS</b>', '<b>512,664</b>', '—（副本无 map）', '本地 <code>find</code> + <code>wc -l</code>'],
    ],
  )}
  <p>体积也有 57 MB 与 59.8 MB 两种说法，差值来自「压缩前 / 压缩后」与是否计入 <code>mappings</code> 字段。这类差异不影响结论，但提醒一件事：<b>凡是能自己数的数字，就不要引用别人的</b>。</p>
  ${stats([
    ['1,332', '.ts 文件', 'find | grep'],
    ['552', '.tsx 文件', 'React + Ink 的界面层'],
    ['18', '.js 文件', '构建/脚本残留'],
    ['512,664', 'TS/TSX 总行数', 'wc -l'],
  ])}
`)}

${section('05', '这份材料能支撑什么结论：A / B / C 三级', `
  <p>后面九章会反复用到这个分级。写报告时我把每条断言归到一级，读者可以按级取用。</p>
  ${table(
    ['级别', '含义', '典型例子', '本报告怎么标'],
    [
      ['<b>A</b>', '代码里直接可读，行号可查', '工具并发靠 <code>isConcurrencySafe</code> 判定', '给 <code>文件:行号</code>'],
      ['<b>B</b>', '从代码结构与注释推断，合理但非官方确认', '某个 flag 对应的产品意图', '写「推断」并给依据'],
      ['<b>C</b>', '只有二手报道支持', '2025 年 2 月曾发生同类泄露', '标「据报道」，不当论据'],
    ],
  )}
  ${note('good', '<b>一条实用规则：</b>看到「代码里发现了 X 功能」时，先问它被什么挡住 —— <code>feature()</code> 编译期裁剪、<code>USER_TYPE</code> 账号判断、环境变量、还是服务端下发。挡住它的东西决定了它离上线有多远。')}
`)}

${section('06', '这份副本本身的完整性', `
  <p>读之前要先知道：它不是一个干净的仓库快照，而是<b>某个对外构建的 sourcemap 反解</b>。三个证据：</p>
  ${ul([
    '部分 <code>.tsx</code> 里 <code>process.env.USER_TYPE</code> 已被替换成字符串 <code>"external"</code>（构建期 <code>--define</code> 的痕迹），同时残留 React Compiler 的 <code>_c()</code> 包装；',
    '有 <b>143 个以上被 import/require 的模块缺失</b>，包括 <code>query/transitions.ts</code>、<code>types/message.ts</code>、<code>assistant/index.ts</code> 这类核心文件；',
    '缺失不全是 bug：编译期常量折叠会把某些 <code>require()</code> 目标整段摇掉，所以「文件不存在」有时正是「这个功能没进这个构建」的证据。',
  ])}
  ${note('warn', '<b>因此：</b>类型定义层面的断言要谨慎（本报告的终态枚举是从 <code>return</code> 字面量反推的）；运行时路径的断言是可靠的（函数体都在）。凡是依赖缺失文件的判断，第 08 章会单独标出。')}
`)}

${section('07', '如果你想自己复核', `
  <p>包已被撤下，所以直接 <code>npm pack</code> 那个版本通常拿不到。可行的复核路径有两条：</p>
  ${ul([
    '<b>从镜像取副本</b>：GitHub 上仍有个别未被下架的存档仓库（例如把 <code>sourcesContent</code> 还原成目录树的镜像）。取一份后先核对文件数与行数，再开始读。',
    '<b>从任意 sourcemap 验证机制</b>：随便找一个自己项目的 <code>.map</code>，用 Node 读 <code>JSON.parse(fs.readFileSync(map)).sourcesContent</code>，就能看到「源码原文确实在 map 里」这件事，不需要碰泄露副本。',
  ])}
  ${ev('还原思路（伪代码，不针对特定包）', '—', `const map = JSON.parse(readFileSync('cli.js.map', 'utf8'))
map.sources.forEach((src, i) => {
  // sourcesContent[i] 就是该文件的完整原文
  writeFileSync(src.replace('../', ''), map.sourcesContent[i])
})`)}
  ${note('warn', '<b>法律与伦理：</b>只读、只分析、只引用短片段。不要把你 clone 到的副本再发布，也不要把其中的系统提示词搬进自己的产品 —— 那是明确的版权风险。')}
`)}
`,
  sources: [
    { label: 'PCMag：Anthropic Issues 8,000 Copyright Takedowns to Scrub Claude Code Leak', url: 'https://www.pcmag.com/news/anthropic-issues-8000-copyright-takedowns-to-scrub-claude-code-leak', note: '官方声明原文、DMCA 收缩' },
    { label: 'Cybernews：Full source code for Anthropic’s Claude Code leaks', url: 'https://cybernews.com/security/anthropic-claude-code-source-leak', note: '发现者、57MB 口径' },
    { label: 'Zscaler：Claude Code Leak 分析', url: 'https://www.zscaler.com/blogs/security-research/anthropic-claude-code-leak', note: '59.8MB、v2.1.88' },
    { label: 'GitHub DMCA 通知（2026-03-31）', url: 'https://github.com/github/dmca/blob/master/2026/03/2026-03-31-anthropic.md', note: '8.1K 仓库' },
    { label: 'GitHub DMCA 收缩通知（2026-04-01）', url: 'https://github.com/github/dmca/blob/master/2026/04/2026-04-01-anthropic-retraction.md', note: '1 仓库 + 96 fork' },
    { label: 'imooc：51 万行源码泄露复盘', url: 'https://www.imooc.com/article/390586', note: '二手，仅用于对照口径' },
  ],
};
