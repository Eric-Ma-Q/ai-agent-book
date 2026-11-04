/* SelfLoop 前端：零构建，原生 JS。
   数据来源：GET /api/state 拉快照，GET /api/events 收 SSE 增量。 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const S = {
  snap: null,
  selected: null,     // 选中的候选 id
  mode: "best",       // best | diff
  sourceCache: {},
  events: [],
  evSeq: 0,
  sse: null,
  pending: null,
};

const STATUS_TEXT = { idle: "空闲", running: "运行中", paused: "已暂停", finished: "已结束", error: "出错" };
const STOP_TEXT = {
  verified: "达成 verified：可见、隐藏、canary 全绿",
  plateau: "平台期停机：连续 K 轮没有严格提升",
  budget: "预算耗尽停机",
  max_rounds: "达到最大轮数",
  stopped: "手动停止",
  error: "异常终止",
};

/* ---------------- 工具 ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour12: false });

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json();
}

/* ---------------- 启动 ---------------- */
async function boot() {
  const [cfg, tasks] = await Promise.all([api("/api/config"), api("/api/tasks")]);
  $("#cfg-task").innerHTML = tasks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("");
  $("#provider-badge").textContent = cfg.has_key ? "api key 已配置" : "mock（无 key）";
  $("#provider-badge").classList.toggle("live", !!cfg.has_key);
  $("#cfg-model").placeholder = cfg.model;
  $("#config-note").textContent = cfg.has_key
    ? `真实模型将调用 ${cfg.base_url}`
    : `未检测到 SELFLOOP_API_KEY，真实模型不可用；现在跑的是离线模拟提议者。`;

  $("#cfg-provider").addEventListener("change", () => {
    const real = $("#cfg-provider").value === "openai";
    $("#field-model").hidden = !real;
    $("#config-note").textContent = real
      ? `需要环境变量 SELFLOOP_API_KEY；端点 ${cfg.base_url}`
      : "模拟模式：确定性地产出逐级改进的候选，用来演示整条链路。";
  });

  $("#btn-start").onclick = startRun;
  $("#btn-pause").onclick = async () => { await api("/api/pause", { method: "POST" }); refresh(); };
  $("#btn-resume").onclick = async () => { await api("/api/resume", { method: "POST" }); refresh(); };
  $("#btn-stop").onclick = async () => { await api("/api/stop", { method: "POST" }); refresh(); };

  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("active", x === t));
    $$(".tabpane").forEach((p) => p.classList.toggle("active", p.id === `pane-${t.dataset.tab}`));
  }));

  $("#btn-mode-best").onclick = () => setMode("best");
  $("#btn-mode-diff").onclick = () => setMode("diff");

  await refresh();
  const params = new URLSearchParams(location.search);
  if (params.get("static") === "1") {
    // 静态模式：不建 SSE（截图 / 调试用），退化为轮询
    setInterval(refresh, 2500);
  } else {
    connectSSE();
  }
  // 分享 / 截图用：?select=last 自动选中最后一轮并展示 diff
  if (params.get("select") === "last") {
    const cands = S.snap?.candidates || [];
    if (cands.length) selectCandidate(cands[cands.length - 1].id);
  }
}

async function startRun() {
  const body = {
    task_id: $("#cfg-task").value,
    provider: $("#cfg-provider").value,
    model: $("#cfg-model").value || null,
    max_rounds: Number($("#cfg-rounds").value) || 10,
    budget_usd: Number($("#cfg-budget").value) || 0,
    plateau_k: Number($("#cfg-plateau").value) || 3,
    temperature: Number($("#cfg-temp").value) || 0.2,
    stop_on_verified: !$("#cfg-continue").checked,
  };
  try {
    $("#config-note").textContent = "启动中…";
    await api("/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    $("#config-note").textContent = "已启动";
    await refresh();
  } catch (e) {
    $("#config-note").textContent = `启动失败：${e.message}`;
  }
}

/* ---------------- 数据 ---------------- */
async function refresh() {
  try {
    S.snap = await api("/api/state");
    render();
  } catch (e) { /* 忽略瞬时错误 */ }
}

function connectSSE() {
  if (S.sse) S.sse.close();
  const es = new EventSource("/api/events");
  S.sse = es;
  es.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    if (ev.seq <= S.evSeq) return;
    S.evSeq = ev.seq;
    S.events.push(ev);
    if (S.events.length > 400) S.events.shift();
    renderEvents();
    if (["run_started", "round_started", "candidate", "finished", "paused", "resumed", "error"].includes(ev.type)) {
      clearTimeout(S.pending);
      S.pending = setTimeout(refresh, 120);
    }
  };
  es.onerror = () => { /* EventSource 会自动重连 */ };
}

/* ---------------- 渲染 ---------------- */
function render() {
  const s = S.snap;
  if (!s) return;
  renderStatus(s);
  renderStats(s);
  renderTask(s);
  renderChart(s.candidates || []);
  renderTable(s.candidates || []);
  renderGates(s);
  renderSource(s);
  $("#run-id").textContent = s.run_id ? `run ${s.run_id}` : "";
  if (S.events.length === 0 && s.events) { S.events = s.events.slice(); renderEvents(); }
}

function renderStatus(s) {
  const pill = $("#status-pill");
  pill.textContent = STATUS_TEXT[s.status] || s.status;
  pill.className = `pill ${s.status}`;

  const running = s.status === "running";
  const paused = s.status === "paused";
  $("#btn-start").disabled = running || paused;
  $("#btn-pause").disabled = !running;
  $("#btn-resume").disabled = !paused;
  $("#btn-stop").disabled = !(running || paused);
  $("#config-card").classList.toggle("locked", running || paused);

  const stop = $("#stop-reason");
  if (s.status === "finished") stop.textContent = STOP_TEXT[s.stop_reason] || s.stop_reason || "";
  else if (s.status === "error") stop.textContent = `错误：${s.error || ""}`;
  else if (s.status === "paused") stop.textContent = "已暂停，点「继续」接着跑。";
  else stop.textContent = "";
}

function renderStats(s) {
  $("#stat-score").textContent = s.best_score ? s.best_score.toFixed(3) : "—";
  $("#stat-round").textContent = s.round;
  $("#stat-plateau").textContent = s.plateau;
  $("#stat-cost").textContent = `$${(s.cost_usd || 0).toFixed(4)}`;
  $("#stat-tokens").textContent = ((s.tokens_in || 0) + (s.tokens_out || 0)).toLocaleString();
}

function renderTask(s) {
  $("#task-title").textContent = s.task?.title || "—";
  $("#task-summary").textContent = s.task?.summary || "";
  $("#task-spec").textContent = s.task?.spec || "";
}

/* ---------------- 曲线 ---------------- */
function renderChart(cands) {
  const el = $("#chart");
  if (!cands.length) {
    el.innerHTML = `<div class="empty" style="padding-top:88px">等待第一轮数据…</div>`;
    $("#chart-gap").textContent = "";
    return;
  }
  const W = Math.max(360, el.clientWidth || 640), H = 232;
  const padL = 36, padR = 14, padT = 14, padB = 24;
  const maxR = Math.max(1, ...cands.map((c) => c.round));
  const x = (r) => padL + (r / maxR) * (W - padL - padR);
  const y = (v) => padT + (1 - v) * (H - padT - padB);

  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => `
    <line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#1a2530" stroke-width="1"/>
    <text x="${padL - 8}" y="${y(v) + 3.5}" fill="#55677a" font-size="9.5" text-anchor="end" font-family="ui-monospace">${v.toFixed(2)}</text>
  `).join("");

  const pts = cands.map((c) => [x(c.round), y(c.score), c]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${y(0)} L${pts[0][0].toFixed(1)},${y(0)} Z`;

  const step = Math.max(1, Math.ceil(maxR / 10));
  const xticks = [];
  for (let r = 0; r <= maxR; r += step) {
    xticks.push(`<text x="${x(r)}" y="${H - 6}" fill="#55677a" font-size="9.5" text-anchor="middle" font-family="ui-monospace">${r}</text>`);
  }

  const dots = pts.map(([cx, cy, c]) => {
    if (c.verified) return `<circle cx="${cx}" cy="${cy}" r="5.5" fill="#b78cff"/><circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#b78cff" stroke-opacity=".35"/>`;
    if (c.accepted) return `<circle cx="${cx}" cy="${cy}" r="4" fill="#3ddc84"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="3.6" fill="#0a0e13" stroke="#7d8fa1" stroke-width="1.4"/>`;
  }).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3ddc84" stop-opacity=".22"/>
        <stop offset="100%" stop-color="#3ddc84" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <line x1="${padL}" x2="${W - padR}" y1="${y(1)}" y2="${y(1)}" stroke="#b78cff" stroke-dasharray="4 4" stroke-opacity=".35"/>
    <text x="${W - padR}" y="${y(1) - 6}" fill="#b78cff" font-size="9" text-anchor="end" opacity=".8">verified 门槛</text>
    <path d="${area}" fill="url(#g)"/>
    <path d="${line}" fill="none" stroke="#3ddc84" stroke-width="1.8" stroke-linejoin="round"/>
    ${dots}
    ${xticks.join("")}
  </svg>`;

  const vis = cands.find((c) => c.gates?.verified);
  $("#chart-gap").textContent = vis
    ? `第 ${vis.round} 轮达到 verified`
    : `距 verified 还差 ${(1 - (cands[cands.length - 1]?.score || 0)).toFixed(3)}`;
}

/* ---------------- 表格 ---------------- */
function renderTable(cands) {
  const tbody = $("#rounds tbody");
  $("#empty-state").hidden = cands.length > 0;
  tbody.innerHTML = cands.map((c) => {
    const g = c.gates || {};
    const state = g.verified ? "verified" : c.accepted ? "accepted" : "rejected";
    const stateText = g.verified ? "verified" : c.accepted ? "接受" : "拒绝";
    return `<tr data-id="${esc(c.id)}" class="${S.selected === c.id ? "sel" : ""}">
      <td class="num">${c.round}</td>
      <td class="num" style="color:${c.accepted ? "#3ddc84" : "#7d8fa1"}">${Number(c.score).toFixed(3)}</td>
      <td class="num">${g.visible_passed ?? 0}/${g.visible_total ?? 0}</td>
      <td class="num">${g.hidden_passed ?? 0}/${g.hidden_total ?? 0}</td>
      <td class="num">${g.canary_ok ? "✓" : "✗"}</td>
      <td><span class="chip-state ${state}">${stateText}</span></td>
      <td class="num" style="color:#55677a">${c.duration_ms}ms</td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll("tr").forEach((tr) => tr.addEventListener("click", () => selectCandidate(tr.dataset.id)));
}

async function selectCandidate(id) {
  S.selected = id;
  $$("#rounds tbody tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.id === id));
  const s = S.snap;
  if (!s?.run_id) return;
  try {
    const c = await api(`/api/candidate/${s.run_id}/${id}`);
    S.current = c;
    setMode("diff", c.diff);
    renderGates(s, c.candidate);
    $$(".tab").find((t) => t.dataset.tab === "source")?.click();
  } catch (e) { /* ignore */ }
}

/* ---------------- 闸门 ---------------- */
function renderGates(s, cand) {
  const g = cand?.gates || s.gates || {};
  const set = (name, label, val, cls) => {
    $(`#g-${name}`).textContent = label;
    const bar = $(`.gate[data-gate="${name}"] .bar`);
    bar.className = `bar ${cls || ""}`;
    bar.querySelector("i").style.width = `${val}%`;
  };
  const hasData = !!g.visible_total;
  if (!hasData) {
    set("visible", "—", 0);
    set("hidden", "—", 0);
    set("canary", "—", 0);
    set("integrity", "—", 0);
  } else {
    set("visible", `${g.visible_passed ?? 0}/${g.visible_total ?? 0}`, pct(g.visible_passed, g.visible_total));
    set("hidden", `${g.hidden_passed ?? 0}/${g.hidden_total ?? 0}`, pct(g.hidden_passed, g.hidden_total));
    const canaryOk = !!g.canary_ok;
    set("canary", canaryOk ? "全绿" : "有失败", canaryOk ? 100 : 40, canaryOk ? "" : "bad");
    const integOk = g.integrity_ok !== false;
    set("integrity", integOk ? "通过" : "不通过", integOk ? 100 : 0, integOk ? "" : "bad");
  }

  const issues = [...(g.integrity_issues || []).map((t) => ({ t, cls: "bad" })), ...(g.warnings || []).map((t) => ({ t, cls: "" }))];
  $("#gate-issues").innerHTML = issues.map((i) => `<li class="${i.cls}">${esc(i.t)}</li>`).join("");

  const fails = g.visible_failures || [];
  $("#vis-fails").innerHTML = !hasData
    ? `<li>尚无数据</li>`
    : fails.length
      ? fails.map((f) => `<li class="">${esc(f.test)}：${esc(f.reason)}</li>`).join("")
      : `<li class="ok">可见测试全绿</li>`;

  const note = $("#gate-note");
  if (!g.visible_total) note.textContent = "跑起来之后，这里显示最近一轮的机器证据。";
  else note.textContent = g.verified ? "四条闸门全绿：这一轮是可信的改进。" : "分数不等于 verified：可见测试全绿也可能隐藏用例仍有失败。";
}

/* ---------------- 事件 ---------------- */
const EV_TEXT = {
  run_started: (e) => `运行开始 · ${e.config?.task_id} / ${e.config?.provider}`,
  round_started: (e) => `第 ${e.round} 轮开始`,
  phase: (e) => `阶段：${e.message || e.phase}`,
  candidate: (e) => `第 ${e.round} 轮 → score ${Number(e.candidate?.score || 0).toFixed(3)} ${e.accepted ? "（接受）" : "（拒绝）"}`,
  round_failed: (e) => `第 ${e.round} 轮失败：${e.error}`,
  finished: (e) => `结束：${STOP_TEXT[e.reason] || e.reason}`,
  paused: () => "已暂停",
  resumed: () => "已继续",
  error: (e) => `错误：${e.error}`,
};

function renderEvents() {
  const ul = $("#events");
  const list = S.events.slice(-80).reverse();
  ul.innerHTML = list.map((e) => {
    const f = EV_TEXT[e.type];
    const text = f ? f(e) : e.type;
    const cls = e.type === "candidate" && e.accepted ? "accent" : e.type === "error" || e.type === "round_failed" ? "warn" : "";
    return `<li><time>${fmtTime(e.ts)}</time><span class="ev ${cls}">${esc(text)}</span></li>`;
  }).join("") || `<li><span class="ev">暂无事件</span></li>`;
}

/* ---------------- 源码 ---------------- */
function setMode(mode, diff) {
  S.mode = mode;
  $("#btn-mode-best").classList.toggle("active", mode === "best");
  $("#btn-mode-diff").classList.toggle("active", mode === "diff");
  renderSource(S.snap, diff);
}

async function renderSource(s, diffOverride) {
  const box = $("#source-box");
  if (!s?.run_id) { box.textContent = "—"; return; }
  if (S.mode === "diff") {
    const diff = diffOverride ?? S.current?.diff;
    if (!diff) { box.textContent = "选一个候选，或在上面切到「与基线对比」。"; return; }
    $("#src-label").textContent = S.current?.id ? `候选 ${S.current.id}` : "";
    box.innerHTML = diff.split("\n").map((line) => {
      const cls = line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@") ? "hunk"
        : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
      return `<span class="${cls}">${esc(line) || " "}</span>`;
    }).join("");
    return;
  }
  const key = `best:${s.run_id}`;
  try {
    if (!S.sourceCache[key]) S.sourceCache[key] = (await api(`/api/run/${s.run_id}`)).best_source;
    $("#src-label").textContent = "best.py";
    box.textContent = S.sourceCache[key] || "—";
  } catch { box.textContent = "—"; }
}

boot();
