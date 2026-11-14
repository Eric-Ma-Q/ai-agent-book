// Type declarations for the browser-side SelfLoop simulator. The implementation
// is plain ESM so the same file runs under Node's test runner without a build.
export interface LoopOptions {
  maxRounds: number;
  budgetUsd: number;
  plateauK: number;
  stopOnVerified: boolean;
  stopAfterRound: number;
}

export interface Scenario {
  id: string;
  title: string;
  badge?: string;
  task: string;
  description: string;
  expectedStop: string;
  defaults: LoopOptions;
}

export interface Stage {
  id: string;
  name: string;
  short: string;
  file: string;
  question: string;
  how: string;
  cost: string;
  code: string;
  events: string[];
}

export interface Gate {
  id: string;
  name: string;
  weight: string;
  gate: boolean;
  file: string;
  question: string;
  how: string;
  risk: string;
}

export interface Failure {
  test?: string;
  reason?: string;
  fn?: string;
  args?: string;
  expected?: string;
  got?: string;
  ok?: boolean;
  error?: string | null;
}

export interface GateResult {
  passed: number;
  total: number;
  failures: Failure[];
}

export interface IntegrityResult {
  ok: boolean;
  issues: string[];
  warnings: string[];
  bytes?: number;
}

export interface GateStats {
  visible: GateResult;
  hidden: GateResult;
  canary: GateResult;
  integrity: IntegrityResult;
  durationMs: number;
  sourceBytes: number;
}

export interface ScoreResult {
  score: number;
  verified: boolean;
  visibleRatio: number;
  hiddenRatio: number;
  weighted: number;
  canaryOk: boolean;
  integrityOk: boolean;
}

export interface Candidate {
  id: string;
  round: number;
  parentId: string | null;
  score: number;
  verified: boolean;
  accepted: boolean | null;
  rationale: string;
  source: string;
  sourceBytes: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  durationMs: number;
  visible: GateResult;
  hidden: GateResult;
  canary: GateResult;
  integrity: IntegrityResult;
  sourcePath: string;
  archivedAtEvent: number | null;
  rejectedReason: string;
  isBaseline: boolean;
}

export interface ArchivedFile {
  path: string;
  bytes: number;
  lines: number;
}

export interface EventSnapshot {
  round: number;
  bestScore: number;
  bestCandidateId: string | null;
  bestVerified: boolean;
  plateau: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  verified: boolean;
  status: string;
  stopReason: string | null;
  candidateIds: string[];
  currentCandidateId: string | null;
  archivedFiles: ArchivedFile[];
}

export interface SimEvent {
  id: number;
  index: number;
  round: number;
  stage: string;
  kind: string;
  tone: 'info' | 'ok' | 'warn' | 'deny' | 'model' | 'accent';
  title: string;
  summary: string;
  candidateId: string | null;
  detail: Record<string, any>;
  snapshot: EventSnapshot;
}

export interface PromptState {
  round: number;
  text: string;
  tokensIn: number;
}

export interface ArchiveFile extends ArchivedFile {
  content: string;
}

export interface RunSummary {
  stopReason: string;
  bestScore: number;
  bestVerified: boolean;
  verified: boolean;
  rounds: number;
  candidates: number;
  baselineScore: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  plateau: number;
  rejectedRounds: number[];
  explanation: string;
}

export interface Archive {
  runId: string;
  meta: Record<string, any>;
  candidatesJsonl: string;
  eventsJsonl: string;
  bestSource: string;
  snapshots: Record<string, string>;
  files: ArchiveFile[];
}

export interface Run {
  scenario: {
    id: string;
    title: string;
    task: string;
    description: string;
    expectedStop: string;
  };
  options: LoopOptions;
  events: SimEvent[];
  candidates: Candidate[];
  prompt: PromptState | null;
  archive: Archive;
  summary: RunSummary;
}

export interface DiffLine {
  kind: ' ' | '+' | '-';
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface UnifiedDiff {
  fromFile: string;
  toFile: string;
  hunks: DiffHunk[];
  changed: boolean;
}

export const SOURCE_DEFAULTS: Record<string, number | boolean>;
export const DEFAULT_OPTIONS: LoopOptions;
export const STAGES: Stage[];
export const GATES: Gate[];
export const SCENARIOS: Scenario[];
export const SPEC_MD: string;
export const INITIAL_SOURCE: string;
export const SOURCE_STAGES: string[];
export const CORRECT_SOURCE: string;
export const GATE_STATS: GateStats[];
export function formatSimTime(offsetSeconds?: number): string;
export function estimateTokens(text: string): number;
export function estimateCost(tokensIn: number, tokensOut: number): number;
export function scoreOf(input: {
  visible: GateResult;
  hidden: GateResult;
  canary: GateResult;
  integrity: IntegrityResult;
}): ScoreResult;
export function buildPrompt(input: {
  source: string;
  bestScore?: number;
  visible?: Record<string, any>;
  history?: Array<Record<string, any>>;
}): string;
export function scanIntegrity(source: string): IntegrityResult;
export function unifiedDiff(
  before: string,
  after: string,
  options?: { fromFile?: string; toFile?: string; context?: number },
): UnifiedDiff;
export function simulate(input?: {
  scenarioId?: string;
  options?: Partial<LoopOptions>;
}): Run;
