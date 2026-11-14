// Type declarations for the browser-side simulator. The implementation is
// plain ESM so the same file runs under Node's test runner without a build.
export const DEFAULT_OPTIONS: {
  permissions: 'strict' | 'open';
  contextLimit: number;
  spillChars: number;
  subagent: boolean;
  memoryGate: boolean;
  maxSteps: number;
};
export const SOURCE_DEFAULTS: Record<string, number>;
export const STAGES: Array<{
  id: string;
  name: string;
  short: string;
  file: string;
  question: string;
  how: string;
  cost: string;
  code: string;
  events: string[];
}>;
export const SCENARIOS: Array<{
  id: string;
  title: string;
  badge?: string;
  task: string;
  description: string;
  defaults: Partial<typeof DEFAULT_OPTIONS>;
}>;
export const TOOL_SCHEMAS: Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}>;
export const EVAL_CASES: Array<Record<string, unknown>>;
export function estimateTokens(messages: unknown[]): number;
export function simulate(input?: {
  scenarioId?: string;
  options?: Partial<typeof DEFAULT_OPTIONS>;
  decisions?: Record<string, 'approve' | 'deny'>;
}): any;
export function runEvals(input?: { model?: 'scripted' | 'noop' }): Array<{
  id: string;
  task: string;
  instruction: string;
  passed: boolean;
  steps: number;
  toolCalls: number;
  tokens: number;
  note: string;
  expected: unknown;
  check: string;
}>;
export function processOutput(raw: unknown, options?: Record<string, unknown>): any;
export function checkPermission(
  tool: string,
  args: Record<string, unknown>,
  options: Record<string, unknown>,
): { verdict: string; reason: string; source: string; pattern?: string };
export function redact(text: string): { text: string; hits: number };
export function formatSimTime(offsetSeconds?: number): string;
