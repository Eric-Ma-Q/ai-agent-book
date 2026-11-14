// Build the two parallel exam pages (A/B) from the archived Harness exam
// engine and the book question bank in ./data. The archive is only read.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVEL_ORDER,
  LEVELS,
  PAPERS,
  PARTS,
  STATS,
  TOPICS,
  maxOf,
  paperQuestions,
} from './data/index.mjs';
import { AUTHOR_BOOK_BASE } from './reader-links.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.resolve(HERE, '../harness/archive/harness-exam.html');

const source = await readFile(TEMPLATE, 'utf8');
const style = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const theme = source.match(/<style>[\s\S]*?<\/style>\s*<script>([\s\S]*?)<\/script>/)?.[1];
const engineStart = source.indexOf('/* =====================================================================\n   存储设计');
const scriptEnd = source.indexOf('</script>', engineStart);
if (!style || !theme || engineStart < 0 || scriptEnd < 0) {
  throw new Error('Could not extract the Harness exam engine from the archive');
}
const baseEngine = source.slice(engineStart, scriptEnd);
const extraStyle = `
.home-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.home-sep{color:var(--ink-mute)}
`;

const chapterUrls = Object.fromEntries(
  Array.from({ length: 10 }, (_, index) => [
    `ch${index + 1}`,
    `${AUTHOR_BOOK_BASE}/book/chapter${index + 1}/`,
  ]),
);
chapterUrls.cross = `${AUTHOR_BOOK_BASE}/`;

// A small override: the archived engine points "weak topic" advice at Harness
// pages. Redirect each topic to the corresponding book chapter instead.
const adviceOverride = `
function adviceList(topicAgg){
  var map={
    ch1:['第 1 章 · 入门与 Harness','现代 Agent、消歧实验与 Harness 五要素',CHAPTER_URL.ch1],
    ch2:['第 2 章 · 上下文工程','KV Cache、Skills、状态栏与压缩',CHAPTER_URL.ch2],
    ch3:['第 3 章 · 记忆与知识库','用户记忆、RAG 与知识更新',CHAPTER_URL.ch3],
    ch4:['第 4 章 · 工具','ACI、MCP、工具规模与执行安全',CHAPTER_URL.ch4],
    ch5:['第 5 章 · Coding Agent','Coding Agent + 文件系统与故障恢复',CHAPTER_URL.ch5],
    ch6:['第 6 章 · 交互扩展','异步、语音、Computer Use 与机器人',CHAPTER_URL.ch6],
    ch7:['第 7 章 · 评估','Pass@k / Pass^k、环境与统计显著性',CHAPTER_URL.ch7],
    ch8:['第 8 章 · 模型后训练','Mid-training、SFT、RL 与奖励设计',CHAPTER_URL.ch8],
    ch9:['第 9 章 · 持续进化','轨迹评价、四种载体与安全边界',CHAPTER_URL.ch9],
    ch10:['第 10 章 · 多 Agent 协作','上下文、拓扑、失败模式与 A2A',CHAPTER_URL.ch10],
    cross:['全书主线','回到引言与各章小结',CHAPTER_URL.cross]
  };
  var weak=Object.keys(topicAgg).map(function(k){var v=topicAgg[k];return {k:k,p:v.max?v.got/v.max:0}})
    .sort(function(a,b){return a.p-b.p}).filter(function(x){return x.p<0.75}).slice(0,4);
  if(!weak.length)return '<p style="font-size:14px">本卷专题掌握度都在 75% 以上。下一步建议：把开放题导出交给 LLM 精批，或用自己的话把“为什么这样设计”讲给别人听。</p>';
  return '<ol>'+weak.map(function(w){var m=map[w.k]||map.cross;return '<li><b>'+m[0]+'</b>（'+Math.round(w.p*100)+'%）→ 重读 <a href="'+m[2]+'" target="_blank" rel="noopener">'+m[1]+'</a>，然后用“错题重练”复测。</li>'}).join('')+'</ol>';
}
`;

function pageFor(paperId) {
  const paper = PAPERS[paperId];
  const questions = paperQuestions(paperId);
  const stats = STATS.byPaper[paperId];
  const openPoints = questions
    .filter((question) => question.type === 'open')
    .reduce((sum, question) => sum + maxOf(question), 0);
  const autoPoints = stats.points - openPoints;
  const other = paperId === 'A' ? PAPERS.B : PAPERS.A;

  let engine = baseEngine
    .replace("var STORE_KEY='harness-exam:v1'", `var STORE_KEY='${paper.storeKey}'`)
    .replace('建议用时 60–75 分钟', '建议用时 90–100 分钟')
    .replace('能用 harness 的语言诊断和设计', '能用书里的语言诊断和设计')
    .replaceAll('harness-exam-backup.json', `${paper.file.replace('.html', '')}-backup.json`)
    .replaceAll("'harness-exam-'+fmtDate", `'${paper.file.replace('.html', '')}-'+fmtDate`)
    .replace(
      "var md='# Harness 结业考试 · 作答记录",
      `var md='# ${paper.title} · 作答记录`,
    );

  const preamble = `
var PAPER='${paperId}';
var PAPER_TITLE=${JSON.stringify(paper.title)};
var TOPICS=${JSON.stringify(TOPICS, null, 0)};
var LEVELS=${JSON.stringify(LEVELS, null, 0)};
var LEVEL_ORDER=${JSON.stringify(LEVEL_ORDER)};
var PARTS=${JSON.stringify(PARTS, null, 0)};
var Q=${JSON.stringify(questions, null, 0)};
var CHAPTER_URL=${JSON.stringify(chapterUrls, null, 0)};
`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${paper.title}</title>
<style>${style}${extraStyle}</style>
<script>${theme}</script>
</head>
<body>

<header class="masthead">
  <div class="wrap">
    <div class="home-links">
      <a class="home-link" href="../">← 试卷选择</a>
      <span class="home-sep">·</span>
      <a class="home-link" href="../${other.id.toLowerCase()}/">切换到 ${other.short}</a>
    </div>
    <div class="brand" style="margin-top:12px">
      <div class="tile" aria-hidden="true">${paperId}</div>
      <div>
        <h1>${paper.title}</h1>
        <p class="kicker">EXAM · ${paperId} PAPER · ${stats.total} QUESTIONS · ${stats.points} POINTS</p>
      </div>
    </div>
    <p class="lede">依据 bojieli《深入理解 AI Agent》书稿出题，不取自 Harness 学习页。考三层能力：<b>记得住</b>核心概念与关键阈值，<b>想得通</b>每条设计原则背后的因果，<b>用得上</b>——面对真实的上下文、工具、评估、训练与多 Agent 问题，能定位首错并给出可验证的方案。本卷与${other.short}平行，覆盖十章；客观题自动判分，开放题按评分细则自评，也可一键导出交给 LLM 批改。</p>
  </div>
</header>

<main class="wrap">
  <div id="introView">
    <div class="intro">
      <div class="panel">
        <h2>试卷结构</h2>
        <table class="blueprint" id="blueprint"><thead><tr><th>部分</th><th>题型</th><th>考查层级</th><th class="num">题数</th><th class="num">分值</th></tr></thead><tbody></tbody></table>
        <p style="margin-top:12px">判分规则：多选<b>错选不得分、少选得一半</b>；填空按空计分，答案忽略大小写、空格与常见标点；排序按“两两相对顺序正确的比例”计分（低于一半记 0）；连线按对数计分；开放题按细则逐条自评。</p>
        <p>本卷覆盖第 1–10 章，共 ${stats.total} 题、${stats.points} 分；A–F 客观与情境题 ${autoPoints} 分，G 开放论述 ${openPoints} 分。建议用时 <b>90–100 分钟</b>；只想快速自测，可只做 A–F。</p>
        <p>每题解析都附书中章节出处；数字与结论以当前 <code>book/</code> 版本为准。开放题改编自各章末思考题与 <code>book/reference-answers.md</code> 的参考答案提纲，已按考试场景改写。</p>
      </div>
      <div class="panel">
        <h2>选择模式</h2>
        <div class="modes" role="radiogroup" aria-label="考试模式">
          <label class="mode"><input type="radio" name="mode" value="exam" checked><div><b>正式考试</b><span>全卷作答，交卷后统一判分与出报告，计时。最能检验真实水平。</span></div></label>
          <label class="mode"><input type="radio" name="mode" value="practice"><div><b>练习模式</b><span>每题可单独“核对”，立刻看对错与解析，适合边学边考。</span></div></label>
          <label class="mode" id="modeWrongWrap"><input type="radio" name="mode" value="wrong"><div><b>错题重练</b><span id="wrongDesc">只出历次考试中答错、还没连续答对两次的题。</span></div></label>
        </div>
        <div class="start-row">
          <button class="btn primary" id="btnStart" type="button">开始答题</button>
          <button class="btn ghost" id="btnResume" type="button" hidden>继续上次作答</button>
        </div>
        <div class="resume-note" id="resumeNote" hidden></div>
        <p style="margin-top:14px;font-size:12.5px">在阅读器中打开时，作答进度、历次成绩与错题本保存在服务端，浏览器只留缓存；换设备打开同一卷可恢复。独立文件只存本机浏览器。收藏与进度按卷分开（${paper.short}）。</p>
      </div>
    </div>
    <div class="panel" id="historyPanel" hidden style="margin-top:20px">
      <h2>历次成绩</h2>
      <table class="history" id="historyTable"></table>
      <div class="actions">
        <button class="btn small" id="btnImport" type="button">导入备份 JSON</button>
        <button class="btn small" id="btnExportAll" type="button">导出全部记录</button>
        <button class="btn small ghost" id="btnWipe" type="button">清空全部记录</button>
      </div>
    </div>
  </div>

  <div id="examView" class="exam hidden">
    <aside class="side" aria-label="答题卡">
      <h3 id="modeLabel">正式考试</h3>
      <div class="side-row">
        <div class="timer" id="timer">00:00</div>
        <div class="grow"><div class="progress-line"><i id="progFill"></i></div><div class="progress-txt" id="progTxt">已答 0 / 0</div></div>
        <button class="btn small" id="btnPal" type="button" aria-expanded="false">答题卡</button>
      </div>
      <div class="palette" id="palette"></div>
      <div class="legend-mini" id="paletteLegend">
        <span style="--c:var(--accent-soft)">已答</span><span style="--c:var(--warn)">标记</span>
      </div>
      <button class="btn primary" id="btnSubmitSide" type="button">交卷</button>
      <button class="btn ghost" id="btnQuit" type="button">返回首页（保留进度）</button>
    </aside>
    <div id="paper"></div>
  </div>

  <div id="reportView" class="report hidden"></div>
</main>

<footer><div class="wrap"><p>${paper.short} · 依据 bojieli《深入理解 AI Agent》书稿出题 · 与 Harness 学习页无关 · 进度与收藏按卷分开 · 题目与解析可在 <code>web-astro/personal/exams/data/</code> 维护</p></div></footer>
<div class="tip" id="tip" role="tooltip"></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<input type="file" id="fileInput" accept="application/json" hidden>

<script>
${preamble}
${engine}
${adviceOverride}
</script>
</body>
</html>
`;
}

await mkdir(HERE, { recursive: true });
for (const paperId of Object.keys(PAPERS)) {
  const paper = PAPERS[paperId];
  const html = pageFor(paperId);
  await writeFile(path.join(HERE, paper.file), html, 'utf8');
  console.log(`wrote ${paper.file} (${Buffer.byteLength(html)} bytes, ${paper.total} questions / ${paper.points} points)`);
}
