// Requirement 013: reader session API and the stateless lab interview calls.
import { personalApi } from '../api';
import { labApi } from '../lab/api';
import type { ModelCatalog } from '../settings/model-profiles';

export type InterviewRole = 'ai-pm' | 'agent-pm' | 'app-pm';
export type InterviewRound = 'resume' | 'product' | 'case' | 'ai' | 'final';
export type InterviewLevel = 'starter' | 'basic' | 'advanced' | 'stress';
export type InterviewMode = 'simulation' | 'practice';
export type SlotStatus = 'pending' | 'active' | 'done' | 'skipped';

export type InterviewSettings = {
  role: InterviewRole;
  round: InterviewRound;
  level: InterviewLevel;
  mode: InterviewMode;
  questionCount: number;
  focusTopics: string[];
  resumeHighlights: string;
  modelProfile: string;
};

export type InterviewSlot = {
  id: string;
  phase: string;
  title: string;
  topic: string;
  topicLabel: string;
  goal: string;
  status: SlotStatus;
};

export type InterviewUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cached_tokens?: number | null;
  reasoning_tokens?: number | null;
};

export type InterviewTurn = {
  id: string;
  role: 'interviewer' | 'candidate' | 'system';
  text: string;
  at: string;
  slot?: string;
  focus?: string;
  feedback?: string;
  followup?: boolean;
  closing?: boolean;
  skipped?: boolean;
  model?: string;
  modelProfile?: string;
  usage?: InterviewUsage;
  latency_ms?: number;
  cost?: number | null;
};

export type ExamTopic = { id: string; label: string; pct: number; wrong?: number };
export type ExamProfile = {
  attempts: number;
  lastPct: number | null;
  bestPct: number | null;
  weakTopics: ExamTopic[];
  strongTopics: ExamTopic[];
  mistakeCount: number;
};
export type ResumeProfile = { selfCheck: number; planDone: number; planTotal: number };
export type PastProfile = {
  count: number;
  lastOverall: number | null;
  weakDimensions: { id: string; label: string; score: number }[];
  lastTopics: string[];
};
export type CandidateProfile = {
  source: 'exam' | 'baseline';
  exam: ExamProfile | null;
  resume: ResumeProfile | null;
  past: PastProfile;
  levelSuggestion: InterviewLevel;
  summary: string;
  brief: string;
  focusSuggestion?: string[];
};

export type InterviewDimension = {
  id: string;
  label: string;
  score: number | null;
  comment: string;
};
export type InterviewReview = {
  id: string;
  label?: string;
  href: string;
  reason: string;
};
export type InterviewReport = {
  parse: 'structured' | 'text';
  text?: string;
  overall: number | null;
  grade?: string;
  confidence?: 'low' | 'medium' | 'high';
  answered?: number;
  planned?: number;
  truncated?: boolean;
  dimensions?: InterviewDimension[];
  strengths?: string[];
  gaps?: string[];
  evidence?: { quote: string; issue: string }[];
  review?: InterviewReview[];
  next?: string[];
};

export type InterviewSession = {
  format: 'harness-interview';
  version: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'finished';
  settings: InterviewSettings;
  profile: CandidateProfile;
  plan: InterviewSlot[];
  turns: InterviewTurn[];
  report: InterviewReport | null;
};

export type InterviewSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'finished';
  role: InterviewRole;
  round: InterviewRound;
  mode: InterviewMode;
  level: InterviewLevel;
  planned: number;
  answered: number;
  overall: number | null;
  model: string;
};

export type InterviewBootstrap = {
  profile: CandidateProfile;
  sessions: InterviewSummary[];
  session: InterviewSession | null;
  resources: { id: string; label: string; href: string }[];
  topics: { id: string; label: string }[];
  defaults: {
    role: InterviewRole;
    round: InterviewRound;
    level: InterviewLevel;
    mode: InterviewMode;
    questionCount: number;
    focusTopics: string[];
    modelProfile: string;
  };
  warnings: string[];
  loadError: string;
  examHref: string;
  favoritesHref: string;
  settingsHref: string;
};

export type ResumeSignals = { selfCheck: number; planDone: number; planTotal: number };

export type InterviewTurnBody = {
  settings: Pick<InterviewSettings, 'role' | 'round' | 'level' | 'mode' | 'questionCount'>;
  profile: { brief: string; weakTopics: string[] };
  plan: InterviewSlot[];
  answeredSlot: InterviewSlot | null;
  nextSlot: InterviewSlot | null;
  transcript: { role: InterviewTurn['role']; text: string; feedback?: string; skipped?: boolean }[];
  followupAllowed: boolean;
  skipped: boolean;
  modelProfile: string;
};

export type InterviewReportBody = InterviewTurnBody & {
  reviewOptions: { id: string; label: string }[];
  /** Reader session id; the lab uses it to dedupe duplicate report requests. */
  sessionId: string;
};

export type TurnResult = {
  text: string;
  focus: string;
  followup: boolean;
  closing: boolean;
  feedback: string;
  model: string;
  modelProfile: string;
  usage: InterviewUsage;
  latency_ms: number;
  cost: number | null;
};

export type ReportResult = {
  report: InterviewReport;
  parsed: boolean;
  /** True when an identical request was already running or just finished. */
  deduped?: boolean;
  model: string;
  modelProfile: string;
  usage: InterviewUsage;
  latency_ms: number;
  cost: number | null;
};

export type SessionPatch = {
  turns: InterviewTurn[];
  plan: { id: string; status: SlotStatus }[];
  status: 'active' | 'finished';
  report?: InterviewReport | null;
};

export function fetchModels(): Promise<ModelCatalog> {
  return labApi<ModelCatalog>('/models');
}

export function createSession(settings: InterviewSettings, resumeSignals: ResumeSignals | null) {
  return personalApi<InterviewSession>('/interview/sessions', { settings, resumeSignals });
}

export function listSessions() {
  return personalApi<{ sessions: InterviewSummary[]; warnings: string[] }>('/interview/sessions');
}

export function getSession(id: string) {
  return personalApi<InterviewSession>(`/interview/session?id=${encodeURIComponent(id)}`);
}

export function saveSession(id: string, patch: SessionPatch) {
  return personalApi<InterviewSummary>('/interview/session/save', { id, ...patch });
}

export function deleteSession(id: string) {
  return personalApi<{ deleted: string }>('/interview/session/delete', { id });
}

export function interviewTurn(body: InterviewTurnBody, signal?: AbortSignal) {
  return labApi<TurnResult>('/interview/turn', body, undefined, signal);
}

export function interviewReport(body: InterviewReportBody) {
  return labApi<ReportResult>('/interview/report', body);
}
