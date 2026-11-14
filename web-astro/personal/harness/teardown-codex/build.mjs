// Build the Codex source teardown: 10 chapters + index + one shared stylesheet.
// Source lives in personal/harness/teardown-codex/; output is committed under
// personal/harness/archive/codex-source-teardown/.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSS } from './theme.mjs';
import { SHA, RETRIEVED, COMMIT_AT, READING_PATHS, link } from './data.mjs';
import { intro } from './chapters/00-intro.mjs';
import { scope } from './chapters/01-scope.mjs';
import { map } from './chapters/02-map.mjs';
import { loop } from './chapters/03-loop.mjs';
import { tools } from './chapters/04-tools.mjs';
import { context } from './chapters/05-context.mjs';
import { permission } from './chapters/06-permission.mjs';
import { agents } from './chapters/07-agents.mjs';
import { surface } from './chapters/08-surface.mjs';
import { difference } from './chapters/09-difference.mjs';
import { lessons } from './chapters/10-lessons.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../archive/codex-source-teardown');
const CHAPTERS = [scope, map, loop, tools, context, permission, agents, surface, difference, lessons];

export const DIR = 'codex-source-teardown';

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
  <a class="brand" href="index.html">Codex 源码拆解</a>
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
  <p class="fine">代码引用来自 <a href="${link('README.md', 1, 1)}">openai/codex</a> 固定提交 <code>${SHA}</code>（${COMMIT_AT}）；行号以该提交为准。源码以 Apache-2.0 发布，引用仅用于评论与分析。</p>
</section>`;
};

function page(chapter) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${chapter.no} ${chapter.title} · Codex 源码拆解</title>
<meta name="description" content="${chapter.lead.replace(/<[^>]+>/g, '').slice(0, 150)}">
${THEME_BOOT}
<link rel="stylesheet" href="teardown.css">
</head>
<body>
${topbar(chapter.slug)}
<main data-chapter="${chapter.slug}">
<div class="wrap">
  <nav class="crumbs" aria-label="位置"><span>Harness 学习</span><span>/</span><span>产品功能拆解</span><span>/</span><a href="index.html">Codex 源码拆解</a></nav>
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
  <p>本页是基于 <code>openai/codex</code> 固定提交的研究笔记，不是 OpenAI 官方文档。桌面 App、Codex Web / 云端服务与模型服务不在本仓库，内部实现不可验证；本页只描述仓库里能看到的客户端、协议与运行时。</p>
  <p><a href="index.html">阅读地图</a> · 生成于 <code>personal/harness/teardown-codex/</code> · 源码 Apache-2.0 · 固定提交 <code>${SHA.slice(0, 8)}</code></p>
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
<title>Codex 源码拆解 · 本地 Agent 的运行时、工具与权限分层</title>
<meta name="description" content="基于 openai/codex 固定提交 ${SHA.slice(0, 8)}：五条产品判断切入，十章拆运行时与 App Server、工具可编程层、权限组合、条件后台压缩、角色与协作生命周期，每条断言带文件行号与固定 SHA 链接。">
${THEME_BOOT}
<link rel="stylesheet" href="teardown.css">
</head>
<body data-teardown-index>
${topbar('index')}
<main>
<div class="wrap">
  <nav class="crumbs" aria-label="位置"><span>Harness 学习</span><span>/</span><span>产品功能拆解</span></nav>
  <div class="hero">
    <p class="kicker">产品功能拆解 · 源码级</p>
    <h1>一个本地 Agent，怎样把运行时、工具与权限拆成产品层</h1>
    <p class="lede">Codex 的源码价值不在功能数量，而在五个产品选择：<b>运行时与 App Server 分层、工具可编程、权限组合、条件后台压缩、角色与协作生命周期</b>。这份拆解按「用户问题 → 选择 → 用户价值 → 代价」逐条展开，再给可复核的代码行；仓库外的 App、Cloud 与模型服务只标边界，不补内部实现。</p>
  </div>
  ${intro()}
  <section><h2><span class="num">§</span>十章阅读地图</h2>
    <p>先读五条判断，再按机制跳读；每章末尾都有取舍与自测。</p>
    <ol class="chap-list">${list}</ol>
  </section>
  <section><h2><span class="num">§</span>三种读法</h2>
    <div class="grid g3">
      ${READING_PATHS.map((r) => `<div class="card"><h3>${r.title}</h3><p>${r.body}</p></div>`).join('')}
    </div>
  </section>
  <section><h2><span class="num">§</span>证据怎么读</h2>
    <div class="grid g4">
      <div class="card"><h3>A</h3><p>固定 SHA 的源码可直接指到 <code>path:line</code>，给代码块、行号与链接。</p></div>
      <div class="card"><h3>B</h3><p>仓库内官方 README、文档或配置注释；给链接与原文摘要。</p></div>
      <div class="card"><h3>C</h3><p>从调用链推断，代码没有直接断言；标「推断」并给依据。</p></div>
      <div class="card"><h3>D</h3><p>不在本仓库或材料不足；标「不可验证」，不补细节。</p></div>
    </div>
    <p class="fine">固定提交 <code>${SHA}</code>，读取日期 ${RETRIEVED}，提交时间 ${COMMIT_AT}。数字只描述这个提交，不代表线上默认值。</p>
  </section>
</div>
</main>
<footer><div class="wrap">
  <p>本页是基于 <code>openai/codex</code> 固定提交的研究笔记，不是 OpenAI 官方文档。桌面 App、Codex Web / 云端服务与模型服务不在本仓库，内部实现不可验证。</p>
  <p>生成于 <code>personal/harness/teardown-codex/</code> · 源码 Apache-2.0 · 固定提交 <code>${SHA.slice(0, 8)}</code></p>
</div></footer>
${FOOT_SCRIPT}
</body>
</html>
`;
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'teardown.css'), CSS);
await writeFile(path.join(OUT, 'index.html'), indexPage().replace(/[ \t]+$/gm, ''));
for (const chapter of CHAPTERS) await writeFile(path.join(OUT, `${chapter.slug}.html`), page(chapter).replace(/[ \t]+$/gm, ''));
const names = ['index.html', 'teardown.css', ...CHAPTERS.map((c) => `${c.slug}.html`)];
const bytes = (await Promise.all(names.map(async (name) => (await readFile(path.join(OUT, name))).length))).reduce(
  (a, b) => a + b,
  0,
);
console.log(`wrote ${CHAPTERS.length + 2} files, ${bytes} bytes to ${OUT}`);
