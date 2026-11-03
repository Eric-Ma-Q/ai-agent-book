// Requirement 013: pure interview profile and plan helpers. Shared by the
// Astro page, the reader API and the browser. No Node APIs here, so
// `node --test` and the client bundle can both import it.

export const ROLES = {
  'ai-pm': {
    label: '通用 AI 产品经理',
    brief: '面向通用 AI 产品：从用户问题出发定义能力、边界与验证。',
  },
  'agent-pm': {
    label: 'Agent 与平台产品',
    brief: '面向 Agent / 平台产品：关注工具、权限、记忆、失败恢复与评估。',
  },
  'app-pm': {
    label: '行业应用产品',
    brief: '面向行业应用：关注场景 ROI、数据闭环、交付与运营。',
  },
};

export const LEVELS = {
  starter: {
    label: '起步',
    brief: '问题更具体，允许候选人想 60–90 秒，追问不超过一层。',
  },
  basic: {
    label: '基础',
    brief: '标准面试节奏，问题清楚，追问一层。',
  },
  advanced: {
    label: '进阶',
    brief: '连续追问，要求量化、取舍和反例。',
  },
  stress: {
    label: '冲刺',
    brief: '压力面：挑战假设与证据，要求候选人在不确定下做判断。',
  },
};

export const MODES = {
  simulation: {
    label: '模拟面试',
    brief: '不打断、不点评、不提示答案，结束后统一复盘。',
  },
  practice: {
    label: '练习模式',
    brief: '每题回答后先给 2–4 句点评，再问下一题。',
  },
};

export const PHASES = [
  { id: 'warmup', label: '开场' },
  { id: 'deep_dive', label: '项目深挖' },
  { id: 'product_design', label: '产品设计' },
  { id: 'case', label: '案例分析' },
  { id: 'challenge', label: '追问与压力' },
  { id: 'motivation', label: '动机与匹配' },
  { id: 'evaluation', label: '评估与验收' },
  { id: 'closing', label: '反问与收尾' },
];

const PHASE_LABELS = new Map(PHASES.map((phase) => [phase.id, phase.label]));

export const TOPICS = [
  { id: 'position', label: '转岗定位与选岗', href: 'ai-agent-pm-career.html#position', source: 'career' },
  { id: 'interview', label: '面经与 JD 拆解', href: 'ai-agent-pm-career.html#interviews', source: 'career' },
  { id: 'screen', label: '筛简历的逻辑', href: 'ai-pm-resume.html#s1', source: 'resume' },
  { id: 'ability', label: '六维能力画像', href: 'ai-pm-resume.html#s2', source: 'resume' },
  { id: 'translate', label: '翻译存量经历', href: 'ai-pm-resume.html#s3', source: 'resume' },
  { id: 'evidence', label: '作品与评测证据', href: 'ai-agent-pm-career.html#portfolio', source: 'career' },
  { id: 'resume', label: '简历装配与质检', href: 'ai-pm-resume.html#s5', source: 'resume' },
  { id: 'defend', label: '追问与投递', href: 'ai-agent-pm-career.html#defend', source: 'career' },
  { id: 'framework', label: '产品解构框架', href: 'ai-products-pm-analysis.html#framework', source: 'landscape' },
  { id: 'landscape', label: '赛道格局与案例', href: 'ai-products-pm-analysis.html#assistants', source: 'landscape' },
  { id: 'bizmodel', label: '商业模式与定价', href: 'ai-products-pm-analysis.html#vertical', source: 'landscape' },
  { id: 'trends', label: '趋势洞察', href: 'ai-products-pm-analysis.html#trends', source: 'landscape' },
  { id: 'prdscope', label: 'PRD · 范围与权限', href: 'ai-expense-review-prd.html#section-01', source: 'prd' },
  { id: 'prdrules', label: 'PRD · 规则与 AI 边界', href: 'ai-expense-review-prd.html#section-07', source: 'prd' },
  { id: 'prdamount', label: 'PRD · 金额与查重', href: 'ai-expense-review-prd.html#section-08', source: 'prd' },
  { id: 'prdstate', label: 'PRD · 状态与恢复', href: 'ai-expense-review-prd.html#section-10', source: 'prd' },
  { id: 'prdaccept', label: 'PRD · 验收与上线', href: 'ai-expense-review-prd.html#section-17', source: 'prd' },
];

const TOPIC_BY_ID = new Map(TOPICS.map((topic) => [topic.id, topic]));
const TOPIC_IDS = new Set(TOPICS.map((topic) => topic.id));

export const DIMENSIONS = [
  { id: 'structure', label: '结构化表达' },
  { id: 'product', label: '产品判断' },
  { id: 'ai', label: 'AI 理解' },
  { id: 'data', label: '数据与验证' },
  { id: 'communication', label: '沟通与追问' },
];

const DIMENSION_LABELS = new Map(DIMENSIONS.map((item) => [item.id, item.label]));

export const ROUNDS = {
  resume: {
    label: '简历与项目面',
    description: '自我介绍、项目深挖、证据与追问。',
    warmup: {
      phase: 'warmup',
      title: '开场与自我介绍',
      topic: 'position',
      goal: '用 90 秒讲清转岗动机、当前能力和一个代表项目',
    },
    middle: [
      { phase: 'deep_dive', title: '项目深挖', topic: 'evidence', goal: '追问项目里的真实角色、关键决策与可验证证据' },
      { phase: 'deep_dive', title: '证据与边界', topic: 'translate', goal: '把存量经历翻译成 AI 产品能力，区分已实现与未覆盖' },
      { phase: 'challenge', title: '追问与压力', topic: 'defend', goal: '挑战简历里的数字、归因与不可替代性' },
      { phase: 'motivation', title: '动机与匹配', topic: 'interview', goal: '为什么是 AI 产品、为什么是这个方向' },
    ],
    closing: {
      phase: 'closing',
      title: '反问与收尾',
      topic: 'position',
      goal: '让候选人提问，观察关注点与判断力',
    },
    defaultTopics: ['evidence', 'translate', 'defend', 'interview'],
  },
  product: {
    label: '产品设计面',
    description: '需求、范围、失败状态、指标与 AI 边界。',
    warmup: {
      phase: 'warmup',
      title: '开场与产品判断',
      topic: 'framework',
      goal: '从一个真实用户问题出发，判断哪里值得用 AI',
    },
    middle: [
      { phase: 'product_design', title: '需求与范围', topic: 'prdscope', goal: '把场景收窄到可交付范围，讲清不做什么' },
      { phase: 'product_design', title: '状态与失败', topic: 'prdstate', goal: '覆盖中断、重试、幂等、人工接管与恢复' },
      { phase: 'evaluation', title: '指标与验收', topic: 'prdaccept', goal: '给出可验证的指标、验收条件和上线后的监控' },
      { phase: 'challenge', title: 'AI 边界与人工接管', topic: 'prdrules', goal: '讲清模型能力边界、规则约束和失败后的兜底' },
    ],
    closing: {
      phase: 'closing',
      title: '反问与收尾',
      topic: 'framework',
      goal: '让候选人提问，观察产品判断与协作意识',
    },
    defaultTopics: ['prdscope', 'prdstate', 'prdaccept', 'prdrules'],
  },
  case: {
    label: '案例与诊断面',
    description: '真实案例、赛道、商业化、失败与上线。',
    warmup: {
      phase: 'warmup',
      title: '开场与案例诊断',
      topic: 'framework',
      goal: '用一个 AI 产品案例开场，先判断问题再给方案',
    },
    middle: [
      { phase: 'case', title: '赛道与竞品', topic: 'landscape', goal: '讲清赛道格局、竞品差异与机会窗口' },
      { phase: 'case', title: '商业化与定价', topic: 'bizmodel', goal: '讲清谁付费、为什么付费、成本结构如何' },
      { phase: 'case', title: '失败状态与恢复', topic: 'prdstate', goal: '诊断失败场景，给出止血、恢复与人工接管' },
      { phase: 'challenge', title: '上线与验收', topic: 'prdaccept', goal: '给出上线门槛、验收口径与回归监控' },
    ],
    closing: {
      phase: 'closing',
      title: '反问与收尾',
      topic: 'landscape',
      goal: '让候选人提问，观察行业判断与学习能力',
    },
    defaultTopics: ['landscape', 'bizmodel', 'prdstate', 'prdaccept'],
  },
  ai: {
    label: 'AI 理解面',
    description: '能力边界、评估、成本、失败与人工接管。',
    warmup: {
      phase: 'warmup',
      title: '开场与能力边界',
      topic: 'framework',
      goal: '选一个熟悉的 AI 产品，讲清它能做什么、不能做什么',
    },
    middle: [
      { phase: 'challenge', title: '规则与 AI 边界', topic: 'prdrules', goal: '讲清哪些交给模型、哪些必须写规则或转人工' },
      { phase: 'evaluation', title: '评估与验收', topic: 'prdaccept', goal: '设计离线评估、线上指标和回归口径' },
      { phase: 'case', title: '成本与商业模式', topic: 'bizmodel', goal: '把 token、推理延迟和毛利讲清楚' },
      { phase: 'challenge', title: '失败与人工接管', topic: 'prdstate', goal: '覆盖超时、幻觉、重复副作用和人工接管' },
    ],
    closing: {
      phase: 'closing',
      title: '反问与收尾',
      topic: 'trends',
      goal: '让候选人提问，观察技术判断与趋势判断',
    },
    defaultTopics: ['prdrules', 'prdaccept', 'bizmodel', 'prdstate'],
  },
  final: {
    label: '综合终面',
    description: '动机、自我认知、证据、协作与行业判断。',
    warmup: {
      phase: 'warmup',
      title: '开场与动机',
      topic: 'position',
      goal: '用 2 分钟讲清为什么转、为什么现在、为什么是这个方向',
    },
    middle: [
      { phase: 'deep_dive', title: '能力画像与自我认知', topic: 'ability', goal: '让候选人自己指出短板，并说明怎么补' },
      { phase: 'challenge', title: '用证据证明判断', topic: 'evidence', goal: '追问一个判断背后的证据、反例和复盘' },
      { phase: 'challenge', title: '跨团队协作', topic: 'defend', goal: '讲清和算法、工程、业务冲突时怎么推进' },
      { phase: 'motivation', title: '行业判断', topic: 'trends', goal: '让候选人对一个趋势给出有依据的判断' },
    ],
    closing: {
      phase: 'closing',
      title: '反问与收尾',
      topic: 'position',
      goal: '让候选人提问，观察动机与匹配度',
    },
    defaultTopics: ['ability', 'evidence', 'defend', 'trends'],
  },
};

function fail(field, message) {
  throw new Error(`${field}: ${message}`);
}

function pickEnum(value, table, field, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !Object.hasOwn(table, value)) {
    fail(field, `必须是 ${Object.keys(table).join(' / ')} 之一`);
  }
  return value;
}


function topicLabel(id) {
  return TOPIC_BY_ID.get(id)?.label ?? id;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function orderedFocus(focus, profile, round) {
  const weak = profile?.exam?.weakTopics?.map((topic) => topic.id) ?? [];
  const defaults = ROUNDS[round]?.defaultTopics ?? [];
  const rank = new Map();
  [...weak, ...defaults].forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  return [...focus].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}

export function topicById(id) {
  return TOPIC_BY_ID.get(id) ?? null;
}

export function resourceFor(id) {
  const topic = TOPIC_BY_ID.get(id);
  if (!topic) fail('topic', `未知专题 ${id}`);
  return { id: topic.id, label: topic.label, href: topic.href, source: topic.source };
}

export function reviewOptions() {
  return TOPICS.map((topic) => ({ id: topic.id, label: topic.label }));
}

export function phaseLabel(id) {
  return PHASE_LABELS.get(id) ?? id;
}

/** Fill weak topics first, then the round defaults, and keep at most four. */
export function defaultFocusTopics(profile, round = 'resume') {
  const weak = profile?.exam?.weakTopics?.map((topic) => topic.id) ?? [];
  const defaults = ROUNDS[round]?.defaultTopics ?? ROUNDS.resume.defaultTopics;
  return unique([...weak, ...defaults]).slice(0, 4);
}

export function normalizeSettings(input = {}, profile = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('settings', '必须是一个对象');
  }
  const round = pickEnum(input.round, ROUNDS, 'round', 'resume');
  const role = pickEnum(input.role, ROLES, 'role', 'ai-pm');
  const level = pickEnum(input.level, LEVELS, 'level', profile?.levelSuggestion ?? 'basic');
  const mode = pickEnum(input.mode, MODES, 'mode', 'practice');
  const count = input.questionCount ?? 6;
  const questionCount = Number(count);
  if (!Number.isInteger(questionCount) || questionCount < 4 || questionCount > 10) {
    fail('questionCount', '必须是 4–10 的整数');
  }
  let focusTopics = [];
  if (Array.isArray(input.focusTopics)) {
    focusTopics = unique(input.focusTopics);
    if (focusTopics.length > 4) fail('focusTopics', '最多选择 4 个专题');
    for (const id of focusTopics) {
      if (typeof id !== 'string' || !TOPIC_IDS.has(id)) fail('focusTopics', `未知专题 ${id}`);
    }
  }
  if (!focusTopics.length) focusTopics = defaultFocusTopics(profile, round);
  if (input.resumeHighlights !== undefined && input.resumeHighlights !== null && typeof input.resumeHighlights !== 'string') {
    fail('resumeHighlights', '必须是字符串');
  }
  const resumeHighlights = String(input.resumeHighlights ?? '').trim();
  if (resumeHighlights.length > 2000) fail('resumeHighlights', '不能超过 2000 字');
  const modelProfile = typeof input.modelProfile === 'string' ? input.modelProfile.trim() : '';
  if (modelProfile && !/^[a-z0-9][a-z0-9-]{1,39}$/.test(modelProfile)) {
    fail('modelProfile', '必须是 2–40 位小写字母、数字或短横线');
  }
  return {
    role,
    round,
    level,
    mode,
    questionCount,
    focusTopics,
    resumeHighlights,
    modelProfile,
  };
}

export function normalizeResumeSignals(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const selfCheck = Number(input.selfCheck);
  const planDone = Number(input.planDone);
  const planTotal = Number(input.planTotal ?? 30);
  if (typeof input.selfCheck !== 'number' || !Number.isInteger(selfCheck) || selfCheck < 0 || selfCheck > 10) return null;
  if (typeof input.planDone !== 'number' || !Number.isInteger(planDone) || planDone < 0 || planDone > 30) return null;
  if (typeof (input.planTotal ?? 30) !== 'number' || !Number.isInteger(planTotal) || planTotal < 1 || planTotal > 60) return null;
  if (planDone > planTotal) return null;
  return { selfCheck, planDone, planTotal };
}

function attemptPct(attempt) {
  const scores = attempt?.scores && typeof attempt.scores === 'object' ? attempt.scores : {};
  const values = Object.values(scores).filter((score) => score && typeof score === 'object');
  const pendingMax = values
    .filter((score) => score.status === 'pending')
    .reduce((sum, score) => sum + (Number(score.max) || 0), 0);
  const rawMax = Number(attempt?.max);
  const max = Number.isFinite(rawMax) && rawMax > 0
    ? rawMax
    : values.reduce((sum, score) => sum + (Number(score.max) || 0), 0);
  const rawTotal = Number(attempt?.total);
  const total = Number.isFinite(rawTotal)
    ? rawTotal
    : values.reduce((sum, score) => sum + (Number(score.got) || 0), 0);
  const effective = max - pendingMax;
  if (effective <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((total / effective) * 100)));
}

function examStats(examProgress, questionById) {
  const store = examProgress?.store ?? (examProgress?.attempts ? examProgress : null);
  const attempts = Array.isArray(store?.attempts) ? store.attempts : [];
  const ordered = attempts
    .filter((attempt) => attempt && Array.isArray(attempt.qids) && attempt.scores)
    .slice()
    .sort((a, b) => (Number(a.submittedAt) || 0) - (Number(b.submittedAt) || 0))
    .slice(-3);
  const percentages = ordered.map(attemptPct).filter((value) => value !== null);
  const lastPct = percentages.length ? percentages.at(-1) : null;
  const bestPct = percentages.length ? Math.max(...percentages) : null;

  const topics = new Map();
  for (const attempt of ordered) {
    for (const qid of attempt.qids) {
      const question = questionById.get(qid);
      const score = attempt.scores[qid];
      if (!question || !score || score.status === 'pending') continue;
      const id = question.topic;
      if (!id) continue;
      const current = topics.get(id) ?? { id, label: question.topicLabel ?? topicLabel(id), got: 0, max: 0, questions: 0, wrong: 0 };
      current.got += Number(score.got) || 0;
      current.max += Number(score.max) || 0;
      current.questions += 1;
      topics.set(id, current);
    }
  }

  let mistakeCount = 0;
  const mistakes = store?.mistakes && typeof store.mistakes === 'object' ? store.mistakes : {};
  for (const [qid, record] of Object.entries(mistakes)) {
    if (!record || typeof record !== 'object' || Number(record.streak) >= 2) continue;
    const question = questionById.get(qid);
    if (!question?.topic) continue;
    mistakeCount += 1;
    const current = topics.get(question.topic) ?? {
      id: question.topic,
      label: question.topicLabel ?? topicLabel(question.topic),
      got: 0,
      max: 0,
      questions: 0,
      wrong: 0,
    };
    current.wrong += 1;
    topics.set(question.topic, current);
  }

  const all = [...topics.values()].map((topic) => ({
    ...topic,
    pct: topic.max > 0 ? Math.round((topic.got / topic.max) * 100) : null,
  }));
  const weakTopics = all
    .filter((topic) => (topic.pct !== null && topic.pct < 75) || topic.wrong > 0)
    .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0) || b.wrong - a.wrong)
    .slice(0, 5)
    .map((topic) => ({ id: topic.id, label: topic.label, pct: topic.pct ?? 0, wrong: topic.wrong }));
  const strongTopics = all
    .filter((topic) => topic.pct !== null && topic.pct >= 85 && topic.wrong === 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
    .map((topic) => ({ id: topic.id, label: topic.label, pct: topic.pct }));

  if (!ordered.length && !mistakeCount) return null;
  return {
    attempts: ordered.length,
    lastPct,
    bestPct,
    weakTopics,
    strongTopics,
    mistakeCount,
  };
}

function pastStats(pastSessions) {
  const finished = (Array.isArray(pastSessions) ? pastSessions : [])
    .filter((session) => {
      const overall = session?.report?.overall;
      return session?.status === 'finished' && typeof overall === 'number' && Number.isFinite(overall);
    })
    .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')))
    .slice(0, 5);
  if (!finished.length) return { count: 0, lastOverall: null, weakDimensions: [], lastTopics: [] };
  const last = finished[0];
  const dimensionScores = new Map();
  for (const session of finished) {
    for (const dimension of session.report?.dimensions ?? []) {
      const id = dimension?.id;
      const score = dimension?.score;
      if (!DIMENSION_LABELS.has(id) || typeof score !== 'number' || !Number.isFinite(score)) continue;
      const current = dimensionScores.get(id) ?? { id, label: DIMENSION_LABELS.get(id), total: 0, n: 0 };
      current.total += score;
      current.n += 1;
      dimensionScores.set(id, current);
    }
  }
  const weakDimensions = [...dimensionScores.values()]
    .map((item) => ({ id: item.id, label: item.label, score: Math.round((item.total / item.n) * 10) / 10 }))
    .filter((item) => item.score < 3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);
  const lastTopics = unique(
    (last.plan ?? [])
      .filter((slot) => slot && (slot.status === 'done' || slot.status === 'active'))
      .map((slot) => slot.topic),
  ).slice(0, 4);
  return {
    count: finished.length,
    lastOverall: Number(last.report.overall),
    weakDimensions,
    lastTopics,
  };
}

function levelFromScore(score) {
  if (score === null || score === undefined) return 'basic';
  if (score < 60) return 'starter';
  if (score < 75) return 'basic';
  if (score < 85) return 'advanced';
  return 'stress';
}

function summaryText(exam, resume, past) {
  const parts = [];
  if (exam?.attempts) {
    parts.push(`最近一次 AI PM 考试 ${exam.lastPct ?? '—'}%（最好 ${exam.bestPct ?? '—'}%，共 ${exam.attempts} 次）。`);
    if (exam.weakTopics.length) parts.push(`薄弱专题：${exam.weakTopics.map((topic) => topic.label).join('、')}。`);
    if (exam.strongTopics.length) parts.push(`较稳：${exam.strongTopics.map((topic) => topic.label).join('、')}。`);
    if (exam.mistakeCount) parts.push(`错题本里还有 ${exam.mistakeCount} 道未掌握。`);
  } else {
    parts.push('还没有 AI PM 考试记录，本次按基础画像出题。');
  }
  if (resume) parts.push(`简历自检 ${resume.selfCheck}/10；30 天计划 ${resume.planDone}/${resume.planTotal}。`);
  if (past.count) {
    const weak = past.weakDimensions.length
      ? `；薄弱维度：${past.weakDimensions.map((item) => item.label).join('、')}`
      : '';
    parts.push(`过往模拟面试 ${past.count} 次，最近 ${past.lastOverall} 分${weak}。`);
  }
  return parts.join('').slice(0, 800);
}

function briefText(exam, resume, past) {
  const parts = ['候选人正在从产品经理转向 AI 产品经理。'];
  if (exam?.weakTopics?.length) parts.push(`优先验证：${exam.weakTopics.map((topic) => topic.label).join('、')}。`);
  if (exam?.strongTopics?.length) parts.push(`可先确认的优势：${exam.strongTopics.map((topic) => topic.label).join('、')}。`);
  if (past.weakDimensions.length) {
    parts.push(`过往模拟面试的短板：${past.weakDimensions.map((item) => item.label).join('、')}。`);
  }
  if (past.lastTopics.length) {
    parts.push(`避免重复上一场做过的专题：${past.lastTopics.map(topicLabel).join('、')}。`);
  }
  if (resume) {
    const signal = resume.selfCheck <= 4
      ? '简历自检显示证据偏弱'
      : resume.selfCheck >= 8
        ? '简历自检较完整'
        : '简历自检中等';
    parts.push(`${signal}；30 天计划完成度 ${Math.round((resume.planDone / resume.planTotal) * 100)}%。`);
  }
  parts.push('不要提及考试分数、题库或后台画像。');
  return parts.join('').slice(0, 1200);
}

/**
 * @param {{ examProgress?: any, questions?: any[], pastSessions?: any[], resumeSignals?: any }} [input]
 */
export function buildCandidateProfile({ examProgress, questions = [], pastSessions = [], resumeSignals = null } = {}) {
  const questionById = new Map(
    (Array.isArray(questions) ? questions : [])
      .filter((question) => question && question.id && (!question.exam || question.exam === 'ai-pm'))
      .map((question) => [question.id, question]),
  );
  const exam = examStats(examProgress, questionById);
  const resume = normalizeResumeSignals(resumeSignals);
  const past = pastStats(pastSessions);
  const levelSuggestion = levelFromScore(past.lastOverall ?? exam?.lastPct ?? null);
  const profile = {
    source: exam?.attempts ? 'exam' : 'baseline',
    exam,
    resume,
    past,
    levelSuggestion,
    summary: summaryText(exam, resume, past),
    brief: briefText(exam, resume, past),
  };
  return { ...profile, focusSuggestion: defaultFocusTopics(profile, 'resume') };
}

export function buildInterviewPlan(settings, profile) {
  const normalized = normalizeSettings(settings, profile);
  const template = ROUNDS[normalized.round];
  const focus = orderedFocus(
    normalized.focusTopics.length
      ? normalized.focusTopics
      : defaultFocusTopics(profile, normalized.round),
    profile,
    normalized.round,
  );
  const slots = [];
  const add = (base, topic, suffix = '') => {
    const label = topicLabel(topic);
    slots.push({
      id: `s${slots.length + 1}`,
      phase: base.phase,
      title: `${base.title}${suffix}`,
      topic,
      topicLabel: label,
      goal: `${base.goal}（重点观察：${label}）`,
      status: 'pending',
    });
  };
  add(template.warmup, template.warmup.topic);
  const middleCount = normalized.questionCount - 2;
  for (let index = 0; index < middleCount; index += 1) {
    const base = template.middle[index % template.middle.length];
    const topic = focus[index % focus.length] ?? base.topic;
    add(base, topic, index >= template.middle.length ? '（进阶）' : '');
  }
  add(template.closing, template.closing.topic);
  return slots;
}

export function reportConfidence(answered, planned) {
  const total = Number(planned) || 0;
  const done = Number(answered) || 0;
  if (total <= 0) return 'low';
  if (done < 3) return 'low';
  if (done >= total - 1) return 'high';
  if (done >= Math.ceil(total / 2)) return 'medium';
  return 'low';
}

export { DIMENSION_LABELS, TOPIC_IDS, topicLabel };
