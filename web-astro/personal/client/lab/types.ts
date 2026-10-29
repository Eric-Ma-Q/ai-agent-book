// Shapes returned by the agent-lab service (see agent-lab/agent_lab/trace/schema.py
// and docs/dev/requirements/001-agent-lab/design.md §3.5, §4.2).
export type Message = {
  role: string;
  content?: string | null;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
  tool_call_id?: string;
  reasoning_content?: string | null;
};

export type Usage = {
  prompt_tokens?: number | null;
  cached_tokens?: number | null;
  completion_tokens?: number | null;
  reasoning_tokens?: number | null;
};

type Base = { seq?: number | null; ts?: string | null };

export type RunStart = Base & {
  type: 'run_start';
  run_id: string;
  question: string;
  config: Record<string, unknown>;
  config_hash: string;
  git_sha?: string | null;
  session_id?: string | null;
  meta?: Record<string, unknown>;
};
export type LlmRequest = Base & {
  type: 'llm_request';
  turn: number;
  purpose: string;
  agent?: string;
  messages: Message[];
  tools?: unknown[] | null;
  segments: Record<string, number>;
};
export type LlmResponse = Base & {
  type: 'llm_response';
  turn: number;
  purpose: string;
  agent?: string;
  message?: Message | null;
  usage: Usage;
  latency_ms?: number | null;
  cost?: number | null;
  reference_cost?: number | null;
  retries: { attempt?: number; reason?: string; wait_s?: number }[];
  model?: string | null;
  finish_reason?: string | null;
  error?: string | null;
};
export type ToolCall = Base & {
  type: 'tool_call';
  turn: number;
  agent?: string;
  call_id: string;
  name: string;
  args: string;
  result: string;
  truncated: boolean;
  duration_ms: number;
  error?: string | null;
};
export type GateEvent = Base & {
  type: 'gate';
  action_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  detail?: string | null;
};
export type InfoEvent = Base & { type: 'info'; turn: number; agent?: string; kind: string; detail: Record<string, unknown> };
export type Citation = {
  chapter: number;
  section_id?: string | null;
  quote: string;
  status: string;
  found_section_id?: string | null;
  link?: string;
};
export type RunEnd = Base & {
  type: 'run_end';
  status: string;
  answer?: string | null;
  citations: Citation[];
  citation_check: Record<string, number>;
  totals: Record<string, unknown>;
  error?: string | null;
};

export type LabEvent = RunStart | LlmRequest | LlmResponse | ToolCall | GateEvent | InfoEvent | RunEnd;

export type RunSummary = {
  run_id: string;
  question?: string | null;
  config_hash?: string | null;
  model?: string | null;
  session_id?: string | null;
  meta?: Record<string, unknown>;
  started_at?: string | null;
  status: string;
  totals: Record<string, unknown>;
};

export type KnobField = { name: string; label: string; help?: string };
export type KnobGroup = { chapter: number; title: string; summary: string; fields: KnobField[] };
export type SchemaProp = {
  type?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  items?: { type?: string };
};
export type KnobCatalog = {
  defaults: Record<string, unknown>;
  schema: Record<string, SchemaProp>;
  basic: KnobField[];
  groups: KnobGroup[];
  tools: string[];
};

export type Action = {
  action_id: string;
  kind: string;
  run_id?: string | null;
  payload: Record<string, unknown>;
  status: string;
  created_at?: string | null;
  expires_at?: string | null;
  detail?: string | null;
};

// ---------------------------------------------------------------------------
// 需求 033：提示注入攻防实验（/__lab/security/*）
// ---------------------------------------------------------------------------
export type SecurityAttack = { id: string; name: string; summary: string; channel: string; target: string };
export type SecurityDefense = { id: string; name: string; summary: string; layers: string[] };
export type SecurityCatalog = {
  protocol: string;
  attacks: SecurityAttack[];
  defenses: SecurityDefense[];
  limits: {
    max_trials_per_cell: number;
    max_total_trials: number;
    max_steps_per_turn: number;
    max_trial_tokens: number;
    max_tool_result_chars: number;
  };
  defaults: { attacks: string[]; defenses: string[]; trials: number; temperature: number };
  demo: { secret_label: string; attacker_email: string; leak_path: string; webpage_url: string; notes_url: string };
};

export type SecurityTrial = {
  attack: string;
  defense: string;
  trial: number;
  status: string;
  success: boolean;
  verdict: string;
  reason: string;
  evidence: Record<string, unknown>;
  run_ids: string[];
  llm_calls: number;
  tokens: number;
  cost?: number | null;
  latency_ms: number;
  answer_excerpt?: string;
  error?: string | null;
};
export type SecurityCell = {
  attack: string;
  defense: string;
  trials: number;
  done: number;
  successes: number;
  errors: number;
  skipped?: number;
  success_rate?: number | null;
  avg_cost?: number | null;
  avg_latency_ms?: number | null;
  results: SecurityTrial[];
};
export type SecurityReport = {
  version: number;
  protocol: string;
  campaign_id: string;
  status: string;
  label?: string;
  git_sha?: string | null;
  created_at: string;
  finished_at?: string | null;
  model: { profile?: string; model: string; temperature: number; name?: string | null };
  selection: { attacks: string[]; defenses: string[]; trials: number };
  progress: { done: number; total: number };
  totals: { runs?: number; llm_calls?: number; tokens?: number; cost?: number | null };
  cells: SecurityCell[];
};
export type SecuritySummary = {
  campaign_id: string;
  status: string;
  label?: string;
  created_at: string;
  finished_at?: string | null;
  model: { model: string; profile?: string; temperature?: number; name?: string | null };
  trials: number;
  attacks?: number;
  defenses?: number;
  progress: { done: number; total: number };
  overall_success_rate?: number | null;
};
