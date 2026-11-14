// Export printable Markdown versions of both papers. The HTML pages are for
// taking the exam; these files are for reading, printing and reviewing.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVELS,
  PAPERS,
  PARTS,
  STATS,
  TOPICS,
  maxOf,
  paperQuestions,
} from './data/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const letter = (index) => String.fromCharCode(65 + index);

function inline(text) {
  return String(text ?? '')
    .replace(/<code>([\s\S]*?)<\/code>/g, (_, code) => `\`${code.replace(/`/g, '\\`')}\``)
    .replace(/<b>([\s\S]*?)<\/b>/g, '**$1**')
    .replace(/<i>([\s\S]*?)<\/i>/g, '*$1*')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function fillStem(stem) {
  return inline(stem).replace(/\{\{(\d+)\}\}/g, (_, index) => `____（${Number(index) + 1}）`);
}

function optionsBlock(q) {
  if (q.type === 'judge') return '正确 / 错误';
  if (!q.options) return '';
  return q.options.map((option, index) => `- ${letter(index)}. ${inline(option)}`).join('\n');
}

function answerText(q) {
  if (q.type === 'judge') return q.answer ? '正确' : '错误';
  if (q.type === 'single') return `${letter(q.answer)}. ${inline(q.options[q.answer])}`;
  if (q.type === 'multi' || q.type === 'code') return q.answer.map(letter).join('、');
  if (q.type === 'fill') return q.blanks.map((accepted, index) => `第 ${index + 1} 空：${accepted[0]}`).join('；');
  if (q.type === 'order') return q.items.map((item, index) => `${index + 1}. ${inline(item)}`).join(' → ');
  if (q.type === 'match') return q.left.map((left, index) => `${inline(left)} ↔ ${inline(q.right[index])}`).join('；');
  return '';
}

async function exportPaper(paperId) {
  const paper = PAPERS[paperId];
  const questions = paperQuestions(paperId);
  const stats = STATS.byPaper[paperId];
  const lines = [];
  lines.push(`# ${paper.title}`);
  lines.push('');
  lines.push('> 依据 bojieli《深入理解 AI Agent》书稿出题，不取自 Harness 学习页。');
  lines.push(`> ${paper.short}：${stats.total} 题，满分 ${stats.points} 分；建议用时 90–100 分钟。`);
  lines.push(`> ${paper.description}`);
  lines.push('');
  lines.push('## 试卷结构');
  lines.push('');
  lines.push('| 部分 | 题型 | 题数 | 分值 |');
  lines.push('| --- | --- | ---: | ---: |');
  for (const part of PARTS) {
    const list = questions.filter((question) => question.part === part.id);
    lines.push(`| ${part.id} · ${part.name} | ${part.types} | ${list.length} | ${list.reduce((sum, q) => sum + maxOf(q), 0)} |`);
  }
  lines.push(`| **合计** | | **${stats.total}** | **${stats.points}** |`);
  lines.push('');
  lines.push('判分规则：多选错选不得分、少选得一半；填空按空计分；排序按两两相对顺序正确的比例计分；连线按对数计分；开放题按细则逐条自评。');
  lines.push('');

  for (const part of PARTS) {
    const list = questions.filter((question) => question.part === part.id);
    if (!list.length) continue;
    lines.push(`## ${part.id} · ${part.name}`);
    lines.push('');
    lines.push(part.desc);
    lines.push('');
    for (const q of list) {
      lines.push(`### ${q.id}（${maxOf(q)} 分 · ${TOPICS[q.topic]} · ${LEVELS[q.level]}）`);
      lines.push('');
      if (q.scenario) {
        lines.push(`> ${inline(q.scenario)}`);
        lines.push('');
      }
      lines.push(fillStem(q.stem));
      lines.push('');
      if (q.code) {
        lines.push('```text');
        lines.push(...q.code);
        lines.push('```');
        lines.push('');
      }
      if (q.type === 'order') {
        lines.push('待排序项：');
        lines.push('');
        q.items.forEach((item) => lines.push(`- ${inline(item)}`));
        lines.push('');
      } else if (q.type === 'match') {
        lines.push('左栏：' + q.left.map(inline).join(' / '));
        lines.push('');
        lines.push('右栏：' + q.right.map(inline).join(' / '));
        lines.push('');
      } else if (q.type === 'open') {
        lines.push('评分细则：');
        lines.push('');
        q.rubric.forEach(([text, points]) => lines.push(`- [${points} 分] ${inline(text)}`));
        lines.push('');
      } else {
        const options = optionsBlock(q);
        if (options) {
          lines.push(options);
          lines.push('');
        }
      }
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## 参考答案与解析');
  lines.push('');
  for (const q of questions) {
    lines.push(`### ${q.id}`);
    lines.push('');
    if (q.type === 'open') {
      lines.push('**参考思路**：' + inline(q.reference));
      lines.push('');
    } else {
      lines.push('**答案**：' + answerText(q));
      lines.push('');
      lines.push('**解析**：' + inline(q.explain));
      lines.push('');
    }
    if (q.src?.length) {
      lines.push('**出处**：' + q.src.map(([label, href]) => `[${label}](${href})`).join(' · '));
      lines.push('');
    }
  }

  const out = path.join(HERE, paper.markdown);
  await writeFile(out, `${lines.join('\n').trim()}\n`, 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), out)} (${Buffer.byteLength(lines.join('\n'))} bytes)`);
}

for (const paperId of Object.keys(PAPERS)) await exportPaper(paperId);
