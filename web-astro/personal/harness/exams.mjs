// Meta for the question banks. The favorites API, the progress API and the
// favorites page share this list, so a new bank is registered in one place.
// `source` says where the page lives: the archived Harness site or the book
// exam pages generated under personal/exams/.
export const EXAMS = [
  {
    id: 'harness',
    title: 'Harness 结业考试',
    file: 'harness-exam.html',
    href: '/harness/site/harness-exam.html',
    source: 'archive',
    codeLabel: '代码诊断',
  },
  {
    id: 'ai-pm',
    title: 'AI 产品经理系列 · 结业考试',
    file: 'ai-pm-exam.html',
    href: '/harness/site/ai-pm-exam.html',
    source: 'archive',
    codeLabel: '材料诊断',
  },
  {
    id: 'book-a',
    title: '《深入理解 AI Agent》结业考试 · A 卷',
    file: 'ai-agent-book-exam-a.html',
    href: '/book-exam/a/',
    source: 'book',
    codeLabel: '代码与实验诊断',
  },
  {
    id: 'book-b',
    title: '《深入理解 AI Agent》结业考试 · B 卷',
    file: 'ai-agent-book-exam-b.html',
    href: '/book-exam/b/',
    source: 'book',
    codeLabel: '代码与实验诊断',
  },
];

export const EXAM_IDS = new Set(EXAMS.map((exam) => exam.id));
