import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const loop = {
  no: '03',
  slug: '03-loop',
  nav: '主循环',
  kicker: '一次任务怎么开始、怎么续跑',
  title: '主循环：可替换的任务，统一的 turn',
  lead:
    'Codex 没有把所有工作塞进一个巨大的循环。它先定义 <code>SessionTask</code>，让普通对话、review、compact、用户 shell 各自实现；再由 <code>RegularTask</code> 在外层循环里反复调用 <code>run_turn</code>，内层处理采样、工具与 follow-up。理解这两层，才能看懂「用户中途插话」为什么不会把一轮打碎。',
  oneLine: '任务抽象、turn 循环、工具循环与 steering 输入如何拼成一条时间线。',
  tldr: [
    '普通对话、review、compact、用户 shell 都是 <code>SessionTask</code>；主循环不关心具体任务类型。',
    '<code>run_turn</code> 负责一轮；外层 loop 在还有 pending input 时继续，内层 loop 发请求并执行工具。',
    'steering 走输入队列，优先于 mailbox；它不是「打断后重开」，而是把新输入接进当前 turn。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>一次任务从哪里开始，什么时候算结束，用户中途插话又落在哪一层？</div>
${judgment(
  'shared',
  '问题与 039 同类：都要有可中断、可续跑的 agent 循环。Codex 的差异在结构：任务可插拔，turn 循环统一。',
  'C04-C05',
)}

${section('01', '先定义任务，再定义循环', `
  <p><code>SessionTask</code> 只有三个动作：声明任务类型、给 tracing 名称、执行并返回结果。普通对话、review、compact、user shell 各写各的 run，session 只负责调度与取消。</p>
  ${ev(
    'codex-rs/core/src/tasks/mod.rs',
    '202-208',
    `    fn run(
        self: Arc<Self>,
        session: Arc<Session>,
        ctx: Arc<TurnContext>,
        input: Vec<TurnInput>,
        cancellation_token: CancellationToken,
    ) -> impl std::future::Future<Output = SessionTaskResult> + Send;`,
    link('codex-rs/core/src/tasks/mod.rs', 202, 208),
    '任务抽象只约束 kind / span / run',
  )}
  <p>这种写法的收益是任务可替换；代价是生命周期分散在多个实现里，读代码时必须先确认「当前是哪一种 task」。</p>
`)}

${section('02', '外层循环：还有输入就继续', `
  <p><code>RegularTask</code> 在外层 loop 里调用 <code>run_turn</code>。如果本轮结束但队列里还有 pending input，它把 <code>next_input</code> 清空后继续，而不是把新输入丢掉或另起一个无关任务。</p>
  ${ev(
    'codex-rs/core/src/tasks/regular.rs',
    '150-160',
    `loop {
    let last_agent_message = run_turn(
        Arc::clone(&sess),
        Arc::clone(&ctx),
        next_input,
        &mut mcp_startup_requirements,
        prewarmed_client_session.take(),
        cancellation_token.child_token(),
    )
    .instrument(run_turn_span.clone())
    .await?;`,
    link('codex-rs/core/src/tasks/regular.rs', 150, 160),
    '外层 loop 只在有 pending input 时续跑',
  )}
`)}

${section('03', '内层循环：采样与工具', `
  <p><code>run_turn</code> 先准备上下文、压缩与 MCP 需求，然后进入采样循环；<code>run_sampling_request</code> 里还有一层工具循环。三层各管一件事：任务、turn、工具。</p>
  ${ev(
    'codex-rs/core/src/session/turn.rs',
    '543-554',
    `loop {
    // Note that pending_input would be something like a message the user
    // submitted through the UI while the model was running. Though the UI
    // may support this, the model might not.
    let pending_input = if can_drain_pending_input {
        sess.input_queue
            .get_pending_input(&sess.active_turn)
            .await
            .0
    } else {
        Vec::new()
    };`,
    link('codex-rs/core/src/session/turn.rs', 543, 554),
    'turn 循环先取 pending input',
  )}
  ${ev(
    'codex-rs/core/src/session/turn.rs',
    '1934-1943',
    `loop {
    // Running code-mode cells can request review while this response is in flight.
    // Keep the latest received ID until response.created replaces it.
    let first_attempt = initial_input.is_some();
    let history = if let Some(input) = initial_input.take() {
        input
    } else {
        sess.clone_history().await
    };
    let input_item_count = history.raw_items().len();`,
    link('codex-rs/core/src/session/turn.rs', 1934, 1943),
    '采样请求内的工具循环',
  )}
  ${note(
    'info',
    '不要写成「一个 loop 跑完所有事」。外层管 follow-up，中层管 turn，内层管采样与工具；三层都可以被取消。',
  )}
`)}

${section('04', 'steering：插话不是重启', `
  <p>输入队列把待处理输入分成 mailbox 与 steer 两类；注释写明 steering 优先。也就是说，用户在模型运行时补一句话，系统会把它作为当前 turn 的下一段输入，而不是先中断再新开一轮。</p>
  ${ev(
    'codex-rs/core/src/session/input_queue.rs',
    '88-93',
    `/// Steering takes precedence when several kinds of input are pending together.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub(crate) enum InputQueueActivity {
    Mailbox,
    Steer,
}`,
    link('codex-rs/core/src/session/input_queue.rs', 88, 93),
    'steering 在排队时优先',
  )}
  ${table(
    ['输入', '落点', '产品含义'],
    [
      ['用户新消息', 'steering', '接着当前任务说，不丢上下文'],
      ['Agent 间消息', 'mailbox', '多 Agent 协作，不抢占用户输入'],
      ['工具输出', 'turn input', '回灌给模型，继续采样'],
    ],
  )}
`)}

${section('05', '取舍：可插拔任务，复杂生命周期', `
  <p>把任务做成 trait，review、compact、shell 可以复用同一套取消与事件流；代价是「一轮」不再是一个函数，读代码要跨任务、turn、sampling 三层。对产品经理来说，这意味着「中断」「续跑」「插话」不是三个 UI 按钮，而是三个生命周期契约。</p>
  <div data-tradeoff>${tradeoff(
    '任务可替换、可取消、可观测；review / compact 不需要复制主循环。',
    '生命周期分散，调试要跨层；不同 task 的终止条件不一致，产品文案也很难统一。',
  )}</div>
`)}
`,
  sources: [
    { label: 'tasks/mod.rs:202-208', url: link('codex-rs/core/src/tasks/mod.rs', 202, 208) },
    { label: 'tasks/regular.rs:150-160', url: link('codex-rs/core/src/tasks/regular.rs', 150, 160) },
    { label: 'session/turn.rs:543-554', url: link('codex-rs/core/src/session/turn.rs', 543, 554) },
    { label: 'session/turn.rs:1934-1943', url: link('codex-rs/core/src/session/turn.rs', 1934, 1943) },
    { label: 'session/input_queue.rs:88-93', url: link('codex-rs/core/src/session/input_queue.rs', 88, 93) },
  ],
};
