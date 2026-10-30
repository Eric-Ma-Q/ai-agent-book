// Requirement 013: durable interview sessions under
// personal/harness/interview/sessions. The reader owns the transcript; the
// lab is stateless. Every write is validated, atomic and bounded.
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { readJson, removeFile, writeJson } from '../fs-utils.mjs';
import {
  PersonalError,
  assertInterviewId,
  interviewSessionFile,
  interviewSessionsDir,
} from '../paths.mjs';
import {
  DIMENSIONS,
  PHASES,
  TOPICS,
  normalizeSettings,
} from './interview-profile.mjs';

export const INTERVIEW_FORMAT = 'harness-interview';
export const INTERVIEW_VERSION = 1;
export const MAX_SESSIONS = 50;
export const MAX_TURNS = 40;
export const MAX_TEXT = 4000;
export const MAX_SESSION_BYTES = 1024 * 1024;

const PHASE_IDS = new Set(PHASES.map((phase) => phase.id));
const TOPIC_IDS = new Set(TOPICS.map((topic) => topic.id));
const DIMENSION_IDS = new Set(DIMENSIONS.map((dimension) => dimension.id));
const STATUSES = new Set(['active', 'finished']);
const PLAN_STATUSES = new Set(['pending', 'active', 'done', 'skipped']);
const ROLES = new Set(['interviewer', 'candidate', 'system']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const TURN_ID = /^t\d{1,4}$/;
const SLOT_ID = /^s\d{1,2}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max = 2000) => typeof value === 'string' && value.length <= max;
const isIso = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function bad(message) {
  return new PersonalError(400, message);
}

function malformed(file, message) {
  return new PersonalError(500, `Malformed interview session: ${file} (${message}); fix or remove it.`);
}

function assertBytes(session, file = 'session') {
  const bytes = Buffer.byteLength(JSON.stringify(session), 'utf8');
  if (bytes > MAX_SESSION_BYTES) {
    throw new PersonalError(413, `Interview session ${file} is ${bytes} bytes; the limit is ${MAX_SESSION_BYTES}. Export and trim it.`);
  }
  return session;
}

function validateSettings(settings, profile) {
  try {
    return normalizeSettings(settings, profile);
  } catch (error) {
    throw bad(error instanceof Error ? error.message : String(error));
  }
}

function validateProfile(profile) {
  if (!isObject(profile)) throw bad('profile must be an object');
  if (!isText(profile.summary, 800)) throw bad('profile.summary must be at most 800 characters');
  if (!isText(profile.brief, 1200)) throw bad('profile.brief must be at most 1200 characters');
  if (profile.source !== undefined && !isText(profile.source, 40)) throw bad('profile.source');
  for (const field of ['exam', 'resume', 'past']) {
    if (profile[field] !== undefined && profile[field] !== null && !isObject(profile[field])) {
      throw bad(`profile.${field} must be an object or null`);
    }
  }
  if (profile.levelSuggestion !== undefined && !isText(profile.levelSuggestion, 20)) {
    throw bad('profile.levelSuggestion');
  }
  if (profile.focusSuggestion !== undefined) {
    if (!Array.isArray(profile.focusSuggestion) || profile.focusSuggestion.length > 4) {
      throw bad('profile.focusSuggestion must be an array of at most 4 topics');
    }
    for (const id of profile.focusSuggestion) {
      if (!TOPIC_IDS.has(id)) throw bad(`profile.focusSuggestion has unknown topic ${id}`);
    }
  }
  return profile;
}

function validatePlan(plan) {
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 12) {
    throw bad('plan must have 1–12 slots');
  }
  const ids = new Set();
  return plan.map((slot, index) => {
    if (!isObject(slot)) throw bad(`plan[${index}] must be an object`);
    if (!isText(slot.id, 10) || !SLOT_ID.test(slot.id)) throw bad(`plan[${index}].id`);
    if (ids.has(slot.id)) throw bad(`plan[${index}].id is duplicated`);
    ids.add(slot.id);
    if (slot.id !== `s${index + 1}`) throw bad(`plan[${index}].id must be s${index + 1}`);
    if (!PHASE_IDS.has(slot.phase)) throw bad(`plan[${index}].phase`);
    if (!isText(slot.title, 200) || !slot.title.trim()) throw bad(`plan[${index}].title`);
    if (!TOPIC_IDS.has(slot.topic)) throw bad(`plan[${index}].topic`);
    if (slot.topicLabel !== undefined && !isText(slot.topicLabel, 80)) throw bad(`plan[${index}].topicLabel`);
    if (!isText(slot.goal, 500) || !slot.goal.trim()) throw bad(`plan[${index}].goal`);
    if (!PLAN_STATUSES.has(slot.status)) throw bad(`plan[${index}].status`);
    return {
      id: slot.id,
      phase: slot.phase,
      title: slot.title,
      topic: slot.topic,
      topicLabel: slot.topicLabel ?? '',
      goal: slot.goal,
      status: slot.status,
    };
  });
}

function validateUsage(usage) {
  if (usage === undefined || usage === null) return undefined;
  if (!isObject(usage)) throw bad('turn.usage must be an object');
  const out = {};
  for (const key of ['prompt_tokens', 'completion_tokens', 'cached_tokens', 'reasoning_tokens']) {
    if (usage[key] === undefined || usage[key] === null) continue;
    if (!Number.isFinite(Number(usage[key])) || Number(usage[key]) < 0) throw bad(`turn.usage.${key}`);
    out[key] = Number(usage[key]);
  }
  return out;
}

function validateTurn(turn, index, planIds) {
  if (!isObject(turn)) throw bad(`turns[${index}] must be an object`);
  if (!isText(turn.id, 20) || !TURN_ID.test(turn.id)) throw bad(`turns[${index}].id`);
  if (!ROLES.has(turn.role)) throw bad(`turns[${index}].role`);
  if (!isText(turn.text, MAX_TEXT)) throw bad(`turns[${index}].text must be at most ${MAX_TEXT} characters`);
  if (!isIso(turn.at)) throw bad(`turns[${index}].at must be an ISO date`);
  if (turn.role !== 'system' && !turn.text.trim() && !turn.skipped) {
    throw bad(`turns[${index}].text must not be empty`);
  }
  if (turn.slot !== undefined && (!isText(turn.slot, 10) || !planIds.has(turn.slot))) {
    throw bad(`turns[${index}].slot is not in the plan`);
  }
  if (turn.focus !== undefined && !isText(turn.focus, 120)) throw bad(`turns[${index}].focus`);
  if (turn.feedback !== undefined && !isText(turn.feedback, MAX_TEXT)) throw bad(`turns[${index}].feedback`);
  for (const field of ['followup', 'closing', 'skipped']) {
    if (turn[field] !== undefined && typeof turn[field] !== 'boolean') throw bad(`turns[${index}].${field}`);
  }
  if (turn.model !== undefined && !isText(turn.model, 200)) throw bad(`turns[${index}].model`);
  if (turn.modelProfile !== undefined && !isText(turn.modelProfile, 40)) throw bad(`turns[${index}].modelProfile`);
  if (turn.latency_ms !== undefined && (!Number.isFinite(Number(turn.latency_ms)) || Number(turn.latency_ms) < 0)) {
    throw bad(`turns[${index}].latency_ms`);
  }
  if (turn.cost !== undefined && turn.cost !== null && (!Number.isFinite(Number(turn.cost)) || Number(turn.cost) < 0)) {
    throw bad(`turns[${index}].cost`);
  }
  const usage = validateUsage(turn.usage);
  return {
    id: turn.id,
    role: turn.role,
    text: turn.text,
    at: turn.at,
    ...(turn.slot !== undefined ? { slot: turn.slot } : {}),
    ...(turn.focus !== undefined ? { focus: turn.focus } : {}),
    ...(turn.feedback !== undefined ? { feedback: turn.feedback } : {}),
    ...(turn.followup !== undefined ? { followup: Boolean(turn.followup) } : {}),
    ...(turn.closing !== undefined ? { closing: Boolean(turn.closing) } : {}),
    ...(turn.skipped !== undefined ? { skipped: Boolean(turn.skipped) } : {}),
    ...(turn.model !== undefined ? { model: turn.model } : {}),
    ...(turn.modelProfile !== undefined ? { modelProfile: turn.modelProfile } : {}),
    ...(turn.latency_ms !== undefined ? { latency_ms: Number(turn.latency_ms) } : {}),
    ...(turn.cost !== undefined ? { cost: turn.cost === null ? null : Number(turn.cost) } : {}),
    ...(usage ? { usage } : {}),
  };
}

function stringList(value, field, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw bad(`${field} must be an array of at most ${maxItems} items`);
  }
  return value.map((item, index) => {
    if (!isText(item, maxLength) || !item.trim()) throw bad(`${field}[${index}]`);
    return item;
  });
}

function validateReport(report) {
  if (report === null) return null;
  if (!isObject(report)) throw bad('report must be an object or null');
  if (report.parse === 'text') {
    if (!isText(report.text, 20000)) throw bad('report.text must be at most 20000 characters');
    return {
      parse: 'text',
      text: report.text,
      overall: null,
      confidence: 'low',
      answered: Number(report.answered) || 0,
      planned: Number(report.planned) || 0,
      grade: report.grade ?? '',
      truncated: report.truncated === true,
    };
  }
  if (report.parse !== undefined && report.parse !== 'structured') throw bad('report.parse');
  const overall = report.overall === null || report.overall === undefined ? null : Number(report.overall);
  if (overall !== null && (!Number.isFinite(overall) || overall < 0 || overall > 100)) {
    throw bad('report.overall must be 0–100 or null');
  }
  if (report.grade !== undefined && !isText(report.grade, 40)) throw bad('report.grade');
  const confidence = report.confidence ?? 'low';
  if (!CONFIDENCE.has(confidence)) throw bad('report.confidence');
  const answered = report.answered === undefined ? 0 : Number(report.answered);
  const planned = report.planned === undefined ? 0 : Number(report.planned);
  if (!Number.isInteger(answered) || answered < 0 || answered > MAX_TURNS) throw bad('report.answered');
  if (!Number.isInteger(planned) || planned < 0 || planned > 12) throw bad('report.planned');
  const dimensions = new Map();
  if (report.dimensions !== undefined && !Array.isArray(report.dimensions)) throw bad('report.dimensions');
  for (const item of report.dimensions ?? []) {
    if (!isObject(item) || !DIMENSION_IDS.has(item.id)) throw bad('report.dimensions.id');
    const score = item.score === null || item.score === undefined ? null : Number(item.score);
    if (score !== null && (!Number.isFinite(score) || score < 1 || score > 5)) throw bad('report.dimensions.score');
    if (item.comment !== undefined && !isText(item.comment, 500)) throw bad('report.dimensions.comment');
    dimensions.set(item.id, {
      id: item.id,
      label: DIMENSIONS.find((dimension) => dimension.id === item.id).label,
      score,
      comment: item.comment ?? '',
    });
  }
  const normalizedDimensions = DIMENSIONS.map(
    (dimension) => dimensions.get(dimension.id) ?? {
      id: dimension.id,
      label: dimension.label,
      score: null,
      comment: '本轮没有足够证据。',
    },
  );
  const evidence = [];
  if (report.evidence !== undefined && !Array.isArray(report.evidence)) throw bad('report.evidence');
  for (const item of report.evidence ?? []) {
    if (!isObject(item) || !isText(item.quote, 200) || !isText(item.issue, 300)) throw bad('report.evidence');
    evidence.push({ quote: item.quote, issue: item.issue });
  }
  if (evidence.length > 6) throw bad('report.evidence has at most 6 items');
  const review = [];
  if (report.review !== undefined && !Array.isArray(report.review)) throw bad('report.review');
  for (const item of report.review ?? []) {
    if (!isObject(item) || !TOPIC_IDS.has(item.id)) throw bad('report.review.id');
    if (!isText(item.href, 300) || !item.href.startsWith('/')) throw bad('report.review.href');
    if (!isText(item.reason, 300)) throw bad('report.review.reason');
    review.push({
      id: item.id,
      label: item.label ?? TOPICS.find((topic) => topic.id === item.id).label,
      href: item.href,
      reason: item.reason ?? '',
    });
  }
  if (review.length > 4) throw bad('report.review has at most 4 items');
  return {
    parse: 'structured',
    overall,
    grade: report.grade ?? '',
    confidence,
    truncated: report.truncated === true,
    answered,
    planned,
    dimensions: normalizedDimensions,
    strengths: stringList(report.strengths ?? [], 'report.strengths', 4, 300),
    gaps: stringList(report.gaps ?? [], 'report.gaps', 4, 300),
    evidence,
    review,
    next: stringList(report.next ?? [], 'report.next', 4, 300),
  };
}

export function validateInterviewSession(session, file = 'session') {
  if (!isObject(session)) throw malformed(file, 'root must be an object');
  if (session.format !== INTERVIEW_FORMAT || session.version !== INTERVIEW_VERSION) {
    throw malformed(file, 'unknown format or version');
  }
  try {
    assertInterviewId(session.id);
  } catch {
    throw malformed(file, 'invalid id');
  }
  if (!isIso(session.createdAt)) throw malformed(file, 'createdAt');
  if (!isIso(session.updatedAt)) throw malformed(file, 'updatedAt');
  if (!STATUSES.has(session.status)) throw malformed(file, 'status');
  const profile = validateProfile(session.profile);
  const settings = validateSettings(session.settings, profile);
  const plan = validatePlan(session.plan);
  const planIds = new Set(plan.map((slot) => slot.id));
  if (!Array.isArray(session.turns) || session.turns.length > MAX_TURNS) {
    throw malformed(file, `turns must be an array of at most ${MAX_TURNS}`);
  }
  const turns = session.turns.map((turn, index) => validateTurn(turn, index, planIds));
  const report = session.report === undefined ? null : validateReport(session.report);
  return assertBytes(
    {
      format: INTERVIEW_FORMAT,
      version: INTERVIEW_VERSION,
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      status: session.status,
      settings,
      profile,
      plan,
      turns,
      report,
    },
    file,
  );
}

function nowIso(now) {
  const date = typeof now === 'function' ? now() : now instanceof Date ? now : new Date();
  return date.toISOString();
}

function newId() {
  return `iv-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

function ensureCap(root) {
  const { sessions } = listInterviewSessions(root);
  if (sessions.length >= MAX_SESSIONS) {
    throw bad(`最多保留 ${MAX_SESSIONS} 场面试；请先删除旧记录。`);
  }
}

export function createInterviewSession(root, input = {}, options = {}) {
  if (!isObject(input)) throw bad('request body must be an object');
  const profile = validateProfile(input.profile);
  const settings = validateSettings(input.settings, profile);
  const plan = validatePlan(input.plan);
  const id = options.id ?? newId();
  assertInterviewId(id);
  ensureCap(root);
  const createdAt = nowIso(options.now);
  const session = validateInterviewSession({
    format: INTERVIEW_FORMAT,
    version: INTERVIEW_VERSION,
    id,
    createdAt,
    updatedAt: createdAt,
    status: 'active',
    settings,
    profile,
    plan,
    turns: [],
    report: null,
  });
  writeJson(interviewSessionFile(root, id), session);
  return session;
}

export function readInterviewSession(root, id) {
  const file = interviewSessionFile(root, id);
  let data;
  try {
    data = readJson(file, undefined);
  } catch (error) {
    throw malformed(file, error instanceof Error ? error.message : String(error));
  }
  if (data === undefined) throw new PersonalError(404, `面试记录 ${id} 不存在`);
  try {
    return validateInterviewSession(data, file);
  } catch (error) {
    if (error instanceof PersonalError && error.status === 413) throw error;
    throw malformed(file, error instanceof Error ? error.message : String(error));
  }
}


export function readAllInterviewSessions(root) {
  const dir = interviewSessionsDir(root);
  if (!existsSync(dir)) return { sessions: [], warnings: [] };
  const warnings = [];
  const sessions = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = `${dir}/${entry.name}`;
    try {
      sessions.push(validateInterviewSession(readJson(file, undefined), file));
    } catch (error) {
      warnings.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { sessions, warnings };
}

export function listInterviewSessions(root) {
  const dir = interviewSessionsDir(root);
  if (!existsSync(dir)) return { sessions: [], warnings: [] };
  const warnings = [];
  const sessions = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = `${dir}/${entry.name}`;
    try {
      const session = validateInterviewSession(readJson(file, undefined), file);
      sessions.push(summarizeSession(session));
    } catch (error) {
      warnings.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { sessions, warnings };
}

function applyPlanStatuses(plan, updates) {
  if (updates === undefined) return plan;
  if (!Array.isArray(updates)) throw bad('plan must be an array');
  const known = new Map(plan.map((slot) => [slot.id, slot]));
  const seen = new Set();
  for (const [index, update] of updates.entries()) {
    if (!isObject(update) || !known.has(update.id)) throw bad(`plan[${index}].id is not in the plan`);
    if (seen.has(update.id)) throw bad(`plan[${index}].id is duplicated`);
    if (!PLAN_STATUSES.has(update.status)) throw bad(`plan[${index}].status`);
    seen.add(update.id);
  }
  return plan.map((slot) => (seen.has(slot.id) ? { ...slot, status: updates.find((item) => item.id === slot.id).status } : slot));
}

export function saveInterviewSession(root, id, patch = {}, options = {}) {
  if (!isObject(patch)) throw bad('request body must be an object');
  const current = readInterviewSession(root, id);
  const plan = applyPlanStatuses(current.plan, patch.plan);
  const planIds = new Set(plan.map((slot) => slot.id));
  let turns = current.turns;
  if (patch.turns !== undefined) {
    if (!Array.isArray(patch.turns) || patch.turns.length > MAX_TURNS) {
      throw bad(`turns must be an array of at most ${MAX_TURNS}`);
    }
    turns = patch.turns.map((turn, index) => validateTurn(turn, index, planIds));
  }
  let status = current.status;
  if (patch.status !== undefined) {
    if (!STATUSES.has(patch.status)) throw bad('status');
    status = patch.status;
  }
  let report = current.report;
  if (patch.report !== undefined) report = validateReport(patch.report);
  const session = validateInterviewSession({
    ...current,
    updatedAt: nowIso(options.now),
    status,
    plan,
    turns,
    report,
  });
  writeJson(interviewSessionFile(root, id), session);
  return summarizeSession(session);
}

export function deleteInterviewSession(root, id) {
  const file = interviewSessionFile(root, id);
  if (!existsSync(file)) throw new PersonalError(404, `面试记录 ${id} 不存在`);
  removeFile(file);
  return { deleted: id };
}

export function summarizeSession(session) {
  const answered = session.turns.filter((turn) => turn.role === 'candidate').length;
  const lastInterviewer = [...session.turns].reverse().find((turn) => turn.role === 'interviewer' && turn.model);
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    role: session.settings.role,
    round: session.settings.round,
    mode: session.settings.mode,
    level: session.settings.level,
    planned: session.plan.length,
    answered,
    overall: session.report?.overall ?? null,
    model: lastInterviewer?.model ?? session.settings.modelProfile ?? '',
  };
}

export { assertBytes, validateReport, validateTurn };
