// Codex teardown shares the Claude Code teardown CSS and adds a small layer
// for judgment cards, verdict chips and the scope table.
import { CSS as BASE } from '../teardown/theme.mjs';

const CODEX = `
.judgment{margin:18px 0;padding:14px 16px;border-left:4px solid var(--line);background:var(--panel);border-radius:0 8px 8px 0}
.judgment b{display:inline-block;margin-right:8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.judgment p{margin:6px 0 0}
.judgment.shared{border-left-color:#5b8def}
.judgment.implementation{border-left-color:#c58b2a}
.judgment.new-surface{border-left-color:#2f9e72}
.judgment.unverifiable{border-left-color:#b34b4b}
.problem{margin:18px 0;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}
.problem b{color:var(--muted);font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-right:8px}
.verdict{display:inline-block;padding:2px 7px;border:1px solid var(--line);border-radius:999px;font-size:12px;white-space:nowrap}
.verdict.shared{color:#5b8def;border-color:#5b8def55}
.verdict.implementation{color:#c58b2a;border-color:#c58b2a55}
.verdict.new-surface{color:#2f9e72;border-color:#2f9e7255}
.verdict.unverifiable{color:#b34b4b;border-color:#b34b4b55}
.ev header a{color:var(--muted);text-decoration:underline;text-underline-offset:2px}
.scope td:first-child{font-weight:600}
.source-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0}
.source-stats .stat{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px}
.source-stats .stat b{display:block;font-size:22px;line-height:1.1}
.source-stats .stat span{display:block;margin-top:4px;color:var(--muted);font-size:13px}
.source-stats .stat em{display:block;margin-top:6px;color:var(--muted);font-size:12px;font-style:normal}
@media (max-width:700px){.source-stats{grid-template-columns:1fr 1fr}}
@media print{.judgment,.problem{break-inside:avoid}}
`;

export const CSS = `${BASE}\n${CODEX}`;
