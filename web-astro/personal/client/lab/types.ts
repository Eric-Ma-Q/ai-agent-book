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
