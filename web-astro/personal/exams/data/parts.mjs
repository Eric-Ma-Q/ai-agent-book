// Metadata for the book exam. The generated page and the Markdown export share
// this file, so a new chapter only needs a topic entry here.
import { AUTHOR_BOOK_BASE } from '../reader-links.mjs';

export const chapterUrl = (number) => `${AUTHOR_BOOK_BASE}/book/chapter${number}/`;

export const TOPICS = {
  ch1: '第 1 章 · 入门与 Harness',
  ch2: '第 2 章 · 上下文工程',
  ch3: '第 3 章 · 记忆与知识库',
  ch4: '第 4 章 · 工具',
  ch5: '第 5 章 · Coding Agent',
  ch6: '第 6 章 · 交互扩展',
  ch7: '第 7 章 · 评估',
  ch8: '第 8 章 · 模型后训练',
  ch9: '第 9 章 · 持续进化',
  ch10: '第 10 章 · 多 Agent 协作',
  cross: '全书主线',
};

export const LEVELS = {
  remember: '记忆',
  understand: '理解',
  apply: '应用',
  analyze: '分析',
  evaluate: '评价',
  create: '创造',
};

export const LEVEL_ORDER = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
];

export const PARTS = [
  {
    id: 'A',
    name: '概念快答',
    desc: '填空与判断。判断题不要只猜对错，解析会给出原文依据和常见误区。',
    types: '填空 / 判断',
  },
  {
    id: 'B',
    name: '单项选择',
    desc: '每题只有一个最佳答案；干扰项大多来自书里点名的常见误解。',
    types: '单选',
  },
  {
    id: 'C',
    name: '多项选择',
    desc: '至少两个正确答案。错选不得分，少选得一半。',
    types: '多选',
  },
  {
    id: 'D',
    name: '排序与连线',
    desc: '考查流程、层次与对应关系；排序按两两相对顺序的正确比例计分。',
    types: '排序 / 连线',
  },
  {
    id: 'E',
    name: '代码与实验诊断',
    desc: '读一段伪代码、配置或实验结论，找出违背书中原则的地方。',
    types: '代码诊断',
  },
  {
    id: 'F',
    name: '案例分析',
    desc: '真实工程场景里的故障与取舍：先定位首错，再给出可验证的修法。',
    types: '情境单选 / 多选',
  },
  {
    id: 'G',
    name: '开放论述',
    desc: '没有唯一答案，按评分细则逐条自评；解析给出答题骨架与书中依据。',
    types: '设计 / 论述',
  },
];
