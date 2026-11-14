// Read the archived and book exam pages and turn their inline question banks
// into display-ready records for the favorites page. The source files are never
// written: the question data is the source of truth, and the favorites file
// only stores exam + question id.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EXAMS } from './exams.mjs';

const TYPE_LABELS = {
  fill: '填空',
  judge: '判断',
  single: '单选',
  multi: '多选',
  order: '排序',
  match: '连线',
  code: '代码诊断',
  open: '开放题',
};
const DEFAULT_LEVEL_ORDER = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
];

const letter = (index) => String.fromCharCode(65 + Number(index));

// Walk the Q array literal and stop at its matching closing bracket. Quotes,
// escapes and comments are skipped so brackets inside text do not count. The
// exam banks do not contain regex literals or template expressions.
function arrayLiteralAt(source, start) {
  if (source[start] !== '[') throw new Error('Question bank must start with [');
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error('Unterminated question bank');
}

// The page declares file constants and the topic/level/part taxonomies before
// `var Q=[`. Evaluate that small preamble and the Q literal in an isolated
// context so labels stay in sync with the page.
function extractBank(html, file) {
  const qIndex = html.indexOf('var Q=[');
  if (qIndex === -1) throw new Error(`${file}: cannot find "var Q=["`);
  const scriptIndex = html.lastIndexOf('<script>', qIndex);
  if (scriptIndex === -1)
    throw new Error(`${file}: question bank is not inside a script`);
  const beforeQ = html.slice(scriptIndex, qIndex);
  const varMatch = /\nvar\s+/.exec(beforeQ);
  const preamble = varMatch
    ? beforeQ.slice(varMatch.index + 1)
    : beforeQ.slice(beforeQ.indexOf('var '));
  const literal = arrayLiteralAt(html, qIndex + 'var Q='.length);

  const context = vm.createContext({});
  vm.runInContext(preamble, context, { timeout: 1000 });
  const questions = vm.runInContext(`(${literal})`, context, { timeout: 1000 });
  if (!Array.isArray(questions) || questions.length === 0)
    throw new Error(`${file}: question bank is empty`);
  if (!context.TOPICS || !context.PARTS || !context.LEVELS)
    throw new Error(`${file}: missing TOPICS / PARTS / LEVELS`);
  return {
    questions,
    topics: context.TOPICS,
    levels: context.LEVELS,
    parts: context.PARTS,
    levelOrder: Array.isArray(context.LEVEL_ORDER)
      ? context.LEVEL_ORDER
      : DEFAULT_LEVEL_ORDER,
  };
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\{\{\d+\}\}/g, ' ')
    .replace(/\[\[\d+\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatOptions(question) {
  if (question.type === 'judge') {
    return [
      { key: '✓', textHtml: '正确', correct: question.answer === true },
      { key: '✗', textHtml: '错误', correct: question.answer === false },
    ];
  }
  if (
    ['single', 'multi', 'code'].includes(question.type) &&
    Array.isArray(question.options)
  ) {
    const answers = new Set(
      Array.isArray(question.answer) ? question.answer : [question.answer],
    );
    return Array.from(question.options, (text, index) => ({
      key: letter(index),
      textHtml: text,
      correct: answers.has(index),
    }));
  }
  return [];
}

function formatAnswer(question) {
  switch (question.type) {
    case 'single':
      return `${letter(question.answer)}. ${question.options?.[question.answer] ?? ''}`;
    case 'judge':
      return question.answer ? '正确' : '错误';
    case 'multi':
    case 'code':
      return Array.from(question.answer ?? [], letter).join('、');
    case 'fill':
      return (question.blanks ?? [])
        .map((blank, index) => `第${index + 1}空：${blank[0]}`)
        .join('；');
    case 'order':
      return (question.items ?? [])
        .map((item, index) => `${index + 1}. ${item}`)
        .join(' → ');
    case 'match':
      return (question.left ?? [])
        .map((left, index) => `${left} ↔ ${question.right?.[index] ?? ''}`)
        .join('；');
    default:
      return '';
  }
}

function formatQuestion(exam, question, bank) {
  const part = bank.parts.find((item) => item.id === question.part);
  const partName = part?.name ?? question.part;
  const topicLabel = bank.topics[question.topic] ?? question.topic;
  const levelLabel = bank.levels[question.level] ?? question.level;
  const typeLabel =
    question.type === 'code'
      ? (exam.codeLabel ?? TYPE_LABELS.code)
      : (TYPE_LABELS[question.type] ?? question.type);
  const options = formatOptions(question);
  const answerHtml = formatAnswer(question);
  const sources = Array.from(Array.isArray(question.src) ? question.src : [])
    .filter(
      (source) =>
        Array.isArray(source) &&
        typeof source[0] === 'string' &&
        typeof source[1] === 'string',
    )
    .map(([label, href]) => ({ label, href }));
  const rubric =
    question.type === 'open'
      ? Array.from(question.rubric ?? [], ([textHtml, points]) => ({
          textHtml,
          points: Number(points) || 0,
        }))
      : [];
  const pts =
    question.type === 'open'
      ? rubric.reduce((sum, item) => sum + item.points, 0)
      : Number(question.pts) || 0;
  const stemHtml = String(question.stem ?? '').replace(
    /\{\{(\d+)\}\}/g,
    (_match, index) =>
      `<span class="fav-blank" aria-label="第 ${Number(index) + 1} 空">____</span>`,
  );
  const explainHtml = String(question.explain ?? '')
    .replace(/\[\[(\d+)\]\]/g, (_match, index) => letter(index))
    .replace(/\{\{(\d+)\}\}/g, '____');
  const search = plainText(
    [
      exam.title,
      question.id,
      question.part,
      partName,
      question.type,
      typeLabel,
      question.topic,
      topicLabel,
      question.level,
      levelLabel,
      question.scenario,
      question.stem,
      ...(question.options ?? []),
      ...(question.blanks ?? []).flat(),
      ...(question.items ?? []),
      ...(question.left ?? []),
      ...(question.right ?? []),
      answerHtml,
      question.explain,
      question.note,
      question.reference,
      ...rubric.map((item) => item.textHtml),
      ...sources.map((source) => source.label),
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();

  return {
    exam: exam.id,
    examTitle: exam.title,
    examFile: exam.file,
    examHref: exam.href ?? '',
    id: question.id,
    part: question.part,
    partName,
    type: question.type,
    typeLabel,
    topic: question.topic,
    topicLabel,
    level: question.level,
    levelLabel,
    pts,
    scenario: question.scenario ?? '',
    stemHtml,
    options,
    code: Array.isArray(question.code) ? Array.from(question.code) : [],
    answerHtml,
    explainHtml,
    noteHtml: question.note ?? '',
    rubric,
    referenceHtml: question.type === 'open' ? (question.reference ?? '') : '',
    sources,
    search,
  };
}

export function readExamQuestions(archiveRoot, { bookRoot } = {}) {
  const archive = path.resolve(archiveRoot);
  const book = path.resolve(
    bookRoot ?? path.join(archive, '..', '..', 'exams'),
  );
  return EXAMS.flatMap((exam) => {
    const root = exam.source === 'book' ? book : archive;
    const file = path.join(root, exam.file);
    const html = readFileSync(file, 'utf8');
    const bank = extractBank(html, exam.file);
    return bank.questions.map((question) =>
      formatQuestion(exam, question, bank),
    );
  });
}

export { TYPE_LABELS, letter };
