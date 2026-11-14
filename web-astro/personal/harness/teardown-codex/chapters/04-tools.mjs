import { section, ev, table, note, tradeoff, judgment } from '../ui.mjs';
import { link } from '../data.mjs';

export const tools = {
  no: '04',
  slug: '04-tools',
  nav: '工具系统',
  kicker: '把工具暴露做成矩阵',
  title: '工具系统：直接调用、延迟发现，还是让模型写代码',
  lead:
    '工具不是「注册得越多越好」。Codex 先把每个工具放进 direct / deferred / code mode / hidden 四个象限，再让模型按模式选择；同时把 shell 做成可复用的 PTY 会话，把编辑做成 apply_patch。产品判断是：工具面要可发现、可预算、可授权，而不是一张越拉越长的函数表。',
  oneLine: '工具暴露矩阵、code mode、unified exec 与 apply_patch 的分工。',
  tldr: [
    '同一个工具可以只给直接调用、只给 code mode、延迟发现或完全隐藏，由三个暴露轴组合。',
    'code mode 让模型写 JavaScript 调用嵌套工具；宿主不可用时回退 direct，不是静默失败。',
    'unified exec 把 shell 做成可复用 PTY：64 个进程、1 MiB 输出、10k token 默认预算。',
  ],
  body: () => `
<div class="problem" data-user-problem><b>用户问题</b>工具应该直接摊给模型，还是让模型写一段代码来调用？</div>
${judgment(
  'implementation',
  'Codex 把「工具暴露」当成一个可计算的矩阵，而不是固定函数表；code mode 是矩阵里的一列，不是替代所有工具。',
  'C07-C08',
)}

${section('01', '四个象限：工具不是只有「有 / 无」', `
  <p>工具注册之后还要决定暴露方式。代码用 direct、deferred、code-mode 三个布尔轴组合出六种状态，其中三种是常见产品形态：直接给模型、延迟发现、只在 code mode 里可见。</p>
  ${ev(
    'codex-rs/core/src/tools/spec_plan.rs',
    '307-318',
    "        tool.exposure = match (\n            exposures.contains(ToolExposures::DIRECT),\n            exposures.contains(ToolExposures::DEFERRED),\n            exposures.contains(ToolExposures::CODE_MODE),\n        ) {\n            (false, false, false) => ToolExposure::Hidden,\n            (false, false, true) => ToolExposure::CodeModeOnly,\n            (true, false, false) => ToolExposure::DirectModelOnly,\n            (true, false, true) => ToolExposure::Direct,\n            (false, true, false) => ToolExposure::DeferredModelOnly,\n            (false, true, true) => ToolExposure::Deferred,\n            (true, true, _) => unreachable!(\"direct and deferred exposure are mutually exclusive\"),",
    link('codex-rs/core/src/tools/spec_plan.rs', 307, 318),
    '三个布尔轴组合出暴露状态',
  )}
  ${table(
    ['暴露', '模型看到什么', '适合什么'],
    [
      ['Direct', '工具声明直接进请求', '高频、参数简单、需要模型立刻用'],
      ['Deferred', '先只给工具搜索，按需加载', '工具很多、上下文预算紧'],
      ['Code mode only', '只出现在代码执行的嵌套工具里', '组合调用多、单次调用少'],
      ['Hidden', '模型看不到', '被策略禁用或当前环境不适用'],
    ],
  )}
`)}

${section('02', 'code mode：把调用写成一段 JavaScript', `
  <p>code mode 的工具声明不是 JSON schema，而是 freeform + Lark grammar；模型输出一段 JavaScript，运行时再把它拆成嵌套工具调用。这样可以把「先查、再改、再跑」写成一个 cell，而不是多轮函数调用。</p>
  ${ev(
    'codex-rs/core/src/tools/code_mode/execute_spec.rs',
    '16-25',
    `ToolSpec::Freeform(FreeformTool {
    name: codex_code_mode::PUBLIC_TOOL_NAME.to_string(),
    description,
    defer_loading: None,
    format: FreeformToolFormat {
        r#type: "grammar".to_string(),
        syntax: "lark".to_string(),
        definition: CODE_MODE_FREEFORM_GRAMMAR.to_string(),
    },
})`,
    link('codex-rs/core/src/tools/code_mode/execute_spec.rs', 16, 25),
    'code mode 是 freeform 工具，不是普通函数',
  )}
  ${ev(
    'codex-rs/core/src/tools/mod.rs',
    '78-88',
    `pub(crate) fn effective_tool_mode(turn_context: &TurnContext, model_info: &ModelInfo) -> ToolMode {
    let requested_tool_mode = requested_tool_mode(turn_context, model_info);
    if !turn_context.code_mode_available
        && requested_tool_mode == ToolMode::CodeMode
        && !turn_context.config.code_mode.disable_in_process_fallback
    {
        ToolMode::Direct
    } else {
        requested_tool_mode
    }
}`,
    link('codex-rs/core/src/tools/mod.rs', 78, 88),
    'code mode 不可用时回退 direct',
  )}
  ${note(
    'info',
    '不要把 code mode 写成「默认开启」。<code>features.code_mode</code> 默认关闭；宿主能力在，工具模式仍要由模型元数据或配置选择。',
  )}
`)}

${section('03', 'unified exec：shell 是一个可复用会话', `
  <p>Codex 的 shell 工具不是「每次起一个进程、收完输出就结束」。它支持 PTY、yield 时间、超时、最大输出和后续 <code>write_stdin</code>；进程可以复用，且有明确上限。</p>
  ${ev(
    'codex-rs/core/src/tools/handlers/unified_exec.rs',
    '67-80',
    `pub(crate) struct ExecCommandArgs {
    pub(crate) cmd: String,
    #[serde(default)]
    shell: Option<String>,
    #[serde(default)]
    login: Option<bool>,
    #[serde(default = "default_tty")]
    tty: bool,
    #[serde(default = "default_exec_yield_time_ms")]
    yield_time_ms: u64,
    #[serde(default)]
    timeout_ms: Option<u64>,
    #[serde(default)]
    max_output_tokens: Option<usize>,`,
    link('codex-rs/core/src/tools/handlers/unified_exec.rs', 67, 80),
    'exec 参数包含 tty / yield / timeout / 输出预算',
  )}
  ${ev(
    'codex-rs/core/src/unified_exec/mod.rs',
    '74-77',
    `pub(crate) const DEFAULT_MAX_OUTPUT_TOKENS: usize = 10_000;
pub(crate) const UNIFIED_EXEC_OUTPUT_MAX_BYTES: usize = 1024 * 1024; // 1 MiB
pub(crate) const UNIFIED_EXEC_OUTPUT_MAX_TOKENS: usize = UNIFIED_EXEC_OUTPUT_MAX_BYTES / 4;
pub(crate) const MAX_UNIFIED_EXEC_PROCESSES: usize = 64;`,
    link('codex-rs/core/src/unified_exec/mod.rs', 74, 77),
    '输出与进程都有硬上限',
  )}
`)}

${section('04', '编辑与发现：apply_patch、tool search', `
  <p>文件编辑走结构化 patch，而不是让模型自由写文件；工具很多时走 tool search，先发现再加载。两者都在解决同一个问题：把「模型能做什么」限制在可审计的动作里。</p>
  ${table(
    ['能力', '机制', '产品含义'],
    [
      ['文件编辑', '<code>apply_patch</code> 工具 + 变更追踪', '可审查、可回滚，不鼓励直接覆盖'],
      ['工具发现', 'tool search + deferred exposure', '工具面可以很大，但不必全进上下文'],
      ['进程复用', 'unified exec + <code>write_stdin</code>', '长命令、交互式命令不必反复起进程'],
      ['输出预算', '单工具 10k token / 1 MiB 上限', '防止一次命令吃光上下文'],
    ],
  )}
  ${note(
    'warn',
    '这些机制在 039 里也有同类问题（工具池、结果预算、工具搜索）。不要把「Codex 有 code mode」写成「只有 Codex 有」，只能写「本副本把暴露矩阵与 code mode 做得更显式」。',
  )}
`)}

${section('05', '取舍：灵活的工具面，更复杂的发现与授权', `
  <p>暴露矩阵让同一个工具可以按模型、场景、预算切换形态；code mode 让模型写组合逻辑；unified exec 让长命令可交互。代价是工具发现、权限判断、输出截断和回退路径都变多，调试时要同时看「工具是否存在」「是否可见」「是否被策略允许」。</p>
  <div data-tradeoff>${tradeoff(
    '工具面可裁剪、可延迟加载；长命令与组合调用不必拆成很多轮。',
    '模型可能不知道工具存在；code mode 有宿主依赖；PTY 会话带来进程与输出管理成本。',
  )}</div>
`)}
`,
  sources: [
    { label: 'tools/spec_plan.rs:307-318', url: link('codex-rs/core/src/tools/spec_plan.rs', 307, 318) },
    { label: 'tools/code_mode/execute_spec.rs:16-25', url: link('codex-rs/core/src/tools/code_mode/execute_spec.rs', 16, 25) },
    { label: 'tools/mod.rs:78-88', url: link('codex-rs/core/src/tools/mod.rs', 78, 88) },
    { label: 'handlers/unified_exec.rs:67-80', url: link('codex-rs/core/src/tools/handlers/unified_exec.rs', 67, 80) },
    { label: 'unified_exec/mod.rs:74-77', url: link('codex-rs/core/src/unified_exec/mod.rs', 74, 77) },
  ],
};
