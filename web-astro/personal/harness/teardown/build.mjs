// Build the Claude Code source teardown: renders every chapter into
// personal/harness/archive/cc-source-teardown/. Run from anywhere:
//   node personal/harness/teardown/build.mjs
// The output is committed; this script is the only source of the HTML.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS } from './theme.mjs';
import { intro } from './chapters/00-intro.mjs';
import { event } from './chapters/01-event.mjs';
import { map } from './chapters/02-map.mjs';
import { loop } from './chapters/03-loop.mjs';
import { tools } from './chapters/04-tools.mjs';
import { ctx } from './chapters/05-context.mjs';
import { permission } from './chapters/06-permission.mjs';
import { agents } from './chapters/07-agents.mjs';
import { unreleased } from './chapters/08-unreleased.mjs';
import { business } from './chapters/09-business.mjs';
import { lessons } from './chapters/10-lessons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../archive/cc-source-teardown');
const CHAPTERS = [event, map, loop, tools, ctx, permission, agents, unreleased, business, lessons];

export const DIR = 'cc-source-teardown';

const THEME_BOOT = `<script>
try{
  var k=localStorage.getItem('harness-theme');
  var d=k==='dark'||(k!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);
  if(d)document.documentElement.classList.add('dark');
}catch(e){}
</script>`;

const FOOT_SCRIPT = `<script>
(function(){
  var bar=document.getElementById('progress');
  function paint(){
    var h=document.documentElement;
    var max=h.scrollHeight-h.clientHeight;
    bar.style.width=(max>0?(h.scrollTop/max)*100:0)+'%';
  }
  addEventListener('scroll',paint,{passive:true});
  addEventListener('resize',paint);
  paint();
  document.querySelectorAll('[data-theme-toggle]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var dark=document.documentElement.classList.toggle('dark');
      try{localStorage.setItem('harness-theme',dark?'dark':'light')}catch(e){}
      btn.textContent=dark?'浅色':'深色';
    });
    btn.textContent=document.documentElement.classList.contains('dark')?'浅色':'深色';
  });
})();
</script>`;

function topbar(current) {
  const links = CHAPTERS.map(
    (c) =>
      `<a href="${c.slug}.html"${c.slug === current ? ' aria-current="page"' : ''} title="${c.nav}">${c.no} ${c.nav}</a>`,
  ).join('');
  return `<div class="topbar"><div class="topbar-inner">
  <a class="brand" href="index.html">Claude Code 源码拆解</a>
  <nav class="chapters" aria-label="章节">${links}</nav>
  <button class="theme" type="button" data-theme-toggle>深色</button>
</div></div>
<div id="progress" aria-hidden="true"></div>`;
}

const pager = (chapter) => {
  const i = CHAPTERS.indexOf(chapter);
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  const left = prev
    ? `<a href="${prev.slug}.html"><small>← 上一章</small><b>${prev.no} ${prev.nav}</b></a>`
    : `<a href="index.html"><small>← 返回</small><b>阅读地图</b></a>`;
  const right = next
    ? `<a class="next" href="${next.slug}.html"><small>下一章 →</small><b>${next.no} ${next.nav}</b></a>`
    : `<a class="next" href="index.html"><small>读完 →</small><b>回到阅读地图</b></a>`;
  return `<nav class="pager" aria-label="翻页">${left}${right}</nav>`;
};

const sourcesBlock = (chapter) => {
  if (!chapter.sources?.length) return '';
  const items = chapter.sources
    .map((s) => `<li>${s.url ? `<a href="${s.url}">${s.label}</a>` : s.label}${s.note ? ` <span>· ${s.note}</span>` : ''}</li>`)
    .join('');
  return `<section id="sources"><h2><span class="num">§</span>来源与证据</h2>
  <ul class="src">${items}</ul>
  <p class="fine">代码引用均来自本地副本 <code>claude-code v2.1.88</code>；行号以该副本为准，其他镜像可能因文件截断而偏移。</p>
</section>`;
};

function page(chapter) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${chapter.no} ${chapter.title} · Claude Code 源码拆解</title>
<meta name="description" content="${chapter.lead.replace(/<[^>]+>/g, '').slice(0, 150)}">
${THEME_BOOT}
<link rel="stylesheet" href="teardown.css">
</head>
<body>
${topbar(chapter.slug)}
<main>
<div class="wrap">
  <nav class="crumbs" aria-label="位置"><span>Harness 学习</span><span>/</span><span>产品功能拆解</span><span>/</span><a href="index.html">Claude Code 源码拆解</a></nav>
  <p class="kicker">第 ${chapter.no} 章 · ${chapter.kicker}</p>
  <h1>${chapter.title}</h1>
  <p class="lead">${chapter.lead}</p>
  <div class="tldr"><h2>30 秒版</h2><ol>${chapter.tldr.map((t) => `<li>${t}</li>`).join('')}</ol></div>
  ${chapter.body()}
  ${sourcesBlock(chapter)}
  ${pager(chapter)}
</div>
</main>
<footer><div class="wrap">
  <p>本页是基于泄露源码副本的研究笔记，不是 Anthropic 官方文档。源码为闭源软件，引用仅用于评论与分析，不构成再分发。</p>
  <p><a href="index.html">阅读地图</a> · 生成于 <code>personal/harness/teardown/</code></p>
</div></footer>
${FOOT_SCRIPT}
</body>
</html>
`;
}

function indexPage() {
  const list = CHAPTERS.map(
    (c) => `<li><a href="${c.slug}.html"><span class="no">${c.no}</span><span class="t">${c.nav}<small>${c.oneLine}</small></span><span class="arrow">→</span></a></li>`,
  ).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Code 源码拆解 · 从 51 万行泄露代码看一个 Agent 产品怎么组装</title>
<meta name="description" content="用 2026-03-31 npm sourcemap 泄露的 Claude Code v2.1.88 源码（1,884 个 TypeScript 文件 / 512,664 行），拆解主循环、工具、上下文、权限、多 Agent、未发布功能与远程控制，附代码行号证据。">
${THEME_BOOT}
<link rel="stylesheet" href="teardown.css">
</head>
<body>
${topbar('index')}
<main>
<div class="wrap">
  <nav class="crumbs" aria-label="位置"><span>Harness 学习</span><span>/</span><span>产品功能拆解</span></nav>
  <div class="hero">
    <p class="kicker">产品功能拆解 · 源码级</p>
    <h1>一个 Agent 产品，是怎么用 51 万行代码装起来的</h1>
    <p class="lede">2026 年 3 月 31 日，Anthropic 把 Claude Code 的源码随 npm 包一起发了出去。这份拆解不聊八卦，只回答一个问题：<b>把一个「会自己干活的编程助手」做成产品，需要在模型外面搭多少东西</b>。每一章都给出代码位置，能点开、能复核。</p>
  </div>
  ${intro()}
  <section><h2><span class="num">§</span>十章阅读地图</h2>
    <p>按顺序读是「先看事故，再看结构，再拆机制，最后取结论」；也可以按角色跳读。</p>
    <ol class="chap-list">${list}</ol>
  </section>
  <section><h2><span class="num">§</span>三种读法</h2>
    <div class="grid g3">
      <div class="card"><h3>产品经理</h3><p>先读 01、03、06、10。你会拿到一张「Agent 产品的能力清单」和每条能力背后的取舍，能直接搬进 PRD 评审。</p></div>
      <div class="card"><h3>工程师</h3><p>先读 02、03、04、05。循环、工具契约、上下文预算三件事决定你的 Agent 能不能跑长任务。</p></div>
      <div class="card"><h3>安全 / 合规</h3><p>先读 06、09。权限裁决顺序、沙箱边界、遥测开关与远程控制面都在这里。</p></div>
    </div>
  </section>
</div>
</main>
<footer><div class="wrap">
  <p>本页是基于泄露源码副本的研究笔记，不是 Anthropic 官方文档。源码为闭源软件，引用仅用于评论与分析，不构成再分发。</p>
  <p>生成于 <code>personal/harness/teardown/</code></p>
</div></footer>
${FOOT_SCRIPT}
</body>
</html>
`;
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'teardown.css'), CSS);
await writeFile(path.join(OUT, 'index.html'), indexPage());
for (const chapter of CHAPTERS) await writeFile(path.join(OUT, `${chapter.slug}.html`), page(chapter));
const bytes = (await Promise.all(
  ['index.html', 'teardown.css', ...CHAPTERS.map((c) => `${c.slug}.html`)].map(async (name) =>
    (await readFile(path.join(OUT, name))).length,
  ),
)).reduce((a, b) => a + b, 0);
console.log(`wrote ${CHAPTERS.length + 2} files, ${bytes} bytes to ${OUT}`);
