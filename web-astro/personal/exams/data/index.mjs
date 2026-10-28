// Single source of truth for the book exam. The HTML page, the Markdown export
// and the validation script all read this module.
import { LEVEL_ORDER, LEVELS, PARTS, TOPICS } from './parts.mjs';
import { PAPER_BY_ID, PAPERS, paperOf } from './papers.mjs';
import { QUESTIONS_A } from './questions-a.mjs';
import { QUESTIONS_B } from './questions-b.mjs';
import { QUESTIONS_C } from './questions-c.mjs';
import { QUESTIONS_D } from './questions-d.mjs';
import { QUESTIONS_E } from './questions-e.mjs';
import { QUESTIONS_F } from './questions-f.mjs';
import { QUESTIONS_G } from './questions-g.mjs';

export { LEVEL_ORDER, LEVELS, PARTS, PAPERS, TOPICS, PAPER_BY_ID, paperOf };

export const QUESTIONS = [
  ...QUESTIONS_A,
  ...QUESTIONS_B,
  ...QUESTIONS_C,
  ...QUESTIONS_D,
  ...QUESTIONS_E,
  ...QUESTIONS_F,
  ...QUESTIONS_G,
].map((question) => {
  const paper = PAPER_BY_ID.A[question.id] ?? PAPER_BY_ID.B[question.id];
  if (!paper) throw new Error(`Question ${question.id} is not assigned to A or B`);
  return { ...question, paper };
});

export const paperQuestions = (paper) =>
  QUESTIONS.filter((question) => question.paper === paper);

export const QUESTION_MAP = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

export function maxOf(question) {
  if (question.type === 'open') {
    return (question.rubric ?? []).reduce((sum, [, points]) => sum + points, 0);
  }
  return Number(question.pts) || 0;
}

export const STATS = {
  total: QUESTIONS.length,
  points: QUESTIONS.reduce((sum, question) => sum + maxOf(question), 0),
  byPart: Object.fromEntries(
    PARTS.map((part) => {
      const list = QUESTIONS.filter((question) => question.part === part.id);
      return [part.id, { count: list.length, points: list.reduce((sum, q) => sum + maxOf(q), 0) }];
    }),
  ),
  byType: QUESTIONS.reduce((acc, question) => {
    acc[question.type] = (acc[question.type] ?? 0) + 1;
    return acc;
  }, {}),
  byPaper: Object.fromEntries(
    Object.keys(PAPERS).map((paper) => {
      const list = paperQuestions(paper);
      return [
        paper,
        {
          total: list.length,
          points: list.reduce((sum, question) => sum + maxOf(question), 0),
          byPart: Object.fromEntries(
            PARTS.map((part) => [part.id, list.filter((question) => question.part === part.id).length]),
          ),
        },
      ];
    }),
  ),
};
