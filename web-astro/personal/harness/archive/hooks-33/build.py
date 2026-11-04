#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a single-file HTML case study that wires all 33 Claude Code hook events.

Correctness is enforced by assertions against the documented capability lists,
so a misuse fails the build instead of shipping.
"""
import json
import sys

OUT = "../claude-code-hooks-33.html"  # 发布到项目根目录，和 index.html 里的其它页面同级

# ---------------------------------------------------------------------------
# 1. Documented constraint sets (from code.claude.com/docs/en/hooks)
# ---------------------------------------------------------------------------
ALL_EVENTS = [
    "Setup", "SessionStart",
    "UserPromptSubmit", "UserPromptExpansion", "MessageDisplay",
    "PreToolUse", "PermissionRequest", "PermissionDenied",
    "PostToolUse", "PostToolUseFailure", "PostToolBatch",
    "SubagentStart", "SubagentStop", "TaskCreated", "TaskCompleted", "TeammateIdle",
    "WorktreeCreate", "WorktreeRemove", "Elicitation", "ElicitationResult",
    "Stop", "StopFailure", "PreCompact", "PostCompact",
    "PreModelSwitch", "PostModelSwitch",
    "Notification", "ConfigChange", "InstructionsLoaded",
    "CwdChanged", "DirectoryAdded", "FileChanged", "SessionEnd",
]

NO_MATCHER = {
    "CwdChanged", "UserPromptSubmit", "PostToolBatch", "Stop", "TeammateIdle",
    "TaskCreated", "TaskCompleted", "WorktreeCreate", "WorktreeRemove", "MessageDisplay",
}

NO_DECISION = {  # documented as "no decision control" / side effects only
    "Setup", "Notification", "SessionEnd", "PostCompact", "InstructionsLoaded",
    "StopFailure", "CwdChanged", "DirectoryAdded", "FileChanged",
}

T5 = {  # command, http, mcp_tool, prompt, agent
    "PermissionDenied", "PostToolBatch", "PostToolUse", "PostToolUseFailure",
    "PreToolUse", "Stop", "SubagentStop", "TaskCompleted", "TaskCreated",
    "TeammateIdle", "UserPromptExpansion", "UserPromptSubmit",
}
T4_NO_AGENT = {"PermissionRequest"}
T3 = {  # command, http, mcp_tool
    "ConfigChange", "CwdChanged", "DirectoryAdded", "Elicitation", "ElicitationResult",
    "FileChanged", "InstructionsLoaded", "MessageDisplay", "Notification", "PostCompact",
    "PostModelSwitch", "PreCompact", "PreModelSwitch", "SessionEnd", "StopFailure",
    "SubagentStart", "WorktreeCreate", "WorktreeRemove",
}
T2 = {"SessionStart", "Setup"}  # command, mcp_tool only

TOOL_EVENTS = {"PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionDenied"}

CAP_OF = {"control": "可控制", "inject": "仅注入", "observe": "仅观测"}

# ---------------------------------------------------------------------------
# 2. The case: one coherent night-shift migration
# ---------------------------------------------------------------------------
H = []


def hook(event, phase, cap, matcher, htype, role, snippet, detail, entry):
    H.append(dict(event=event, phase=phase, cap=cap, matcher=matcher, htype=htype,
                  role=role, snippet=snippet, detail=detail, entry=entry))


# --- Phase 1: 冷启动 ---------------------------------------------------------
hook("Setup", 1, "observe", "init", "command",
     "02:00，CI 用 claude -p --init 拉起任务。这个 hook 装 jscodeshift / ts-morph、预热 pnpm store，并往 CLAUDE_ENV_FILE 写 MIGRATION_RUN_ID。它不能阻断启动，任何退出码都会继续，所以脚本必须自己幂等。",
     '''{"matcher": "init", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/setup.mjs",
  "timeout": 300
}]}''',
     "无决策权 · 退出码被忽略 · 只能 command（mcp_tool 在 Setup 恒被跳过）",
     {"matcher": "init", "hooks": [{"type": "command", "command": "node .claude/hooks/setup.mjs", "timeout": 300, "statusMessage": "安装迁移工具链"}]})

hook("SessionStart", 1, "inject", "startup|resume", "command",
     "resume 上一次中断的迁移：把「还剩 5 个包 / 上次失败在 packages/api」注入上下文，并用 watchPaths 注册 .envrc，让后续 FileChanged 有东西可看。只能加信息，不能改启动流程。",
     '''{"matcher": "startup|resume", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/resume.mjs"
}]}''',
     "仅 additionalContext · 不支持 http/prompt/agent；启动时 MCP 未就绪，故不用 mcp_tool",
     {"matcher": "startup|resume", "hooks": [{"type": "command", "command": "node .claude/hooks/resume.mjs", "timeout": 15, "statusMessage": "恢复迁移进度"}]})

# --- Phase 2: 入场 -----------------------------------------------------------
hook("UserPromptSubmit", 2, "control", None, "command",
     "CI 送进来的 prompt 必须带 SPEC- 编号和分支名，否则 exit 2 打回，避免半夜跑错分支。通过后顺手注入当天的 git status 摘要。注意它只能追加上下文，不能替换用户原文。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/require-spec.mjs"
}]}''',
     'decision:"block" + hookSpecificOutput.additionalContext · 无 matcher',
     {"hooks": [{"type": "command", "command": "node .claude/hooks/require-spec.mjs", "timeout": 10}]})

hook("UserPromptExpansion", 2, "control", "migrate|release", "command",
     "有人手打 /migrate 时展开成完整任务书并追加团队 checklist；手打 /release 则要求存在 approval 文件，否则拦下。这条专门补 PreToolUse 管不到的「直接敲斜杠命令」路径。",
     '''{"matcher": "migrate|release", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/expand-guard.mjs"
}]}''',
     "按 command_name 匹配 · 可 block 展开 + 注入上下文",
     {"matcher": "migrate|release", "hooks": [{"type": "command", "command": "node .claude/hooks/expand-guard.mjs", "timeout": 10}]})

hook("MessageDisplay", 2, "control", None, "command",
     "迁移日志里混进内部域名和临时 token，流式渲染时逐批打码成 [REDACTED]。只改屏幕显示，transcript 和模型看到的仍是原文——所以它不能当脱敏的唯一防线。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/redact-display.mjs",
  "timeout": 2
}]}''',
     "仅 displayContent · 无 matcher · 默认超时 10s，这里压到 2s 免得卡住渲染",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/redact-display.mjs", "timeout": 2}]})

# --- Phase 3: 工具循环 -------------------------------------------------------
hook("PreToolUse", 3, "control", "Bash|Edit|Write", "command",
     "两个 handler：guard.mjs 拦 rm -rf、git push、改 package-lock.json；normalize-path.mjs 用 updatedInput 把相对路径补成绝对路径再放行。这是整晚最关键的硬闸门（PermissionRequest 也能拒，但管的是权限层）。",
     '''{"matcher": "Bash|Edit|Write", "hooks": [
  {"type": "command",
   "command": "node .claude/hooks/guard.mjs"},
  {"type": "command",
   "command": "node .claude/hooks/normalize-path.mjs",
   "if": "Edit(**/*.ts)"}
]}''',
     "hookSpecificOutput.permissionDecision allow|deny|ask|defer + updatedInput · if 只在工具事件生效",
     {"matcher": "Bash|Edit|Write", "hooks": [
         {"type": "command", "command": "node .claude/hooks/guard.mjs", "timeout": 5},
         {"type": "command", "command": "node .claude/hooks/normalize-path.mjs", "if": "Edit(**/*.ts)", "timeout": 5}]})

hook("PermissionRequest", 3, "control", "Bash", "command",
     "夜里没人点确认。这个 hook 代替人决策：只读白名单（git status、ls、cat 日志）直接 allow，git push / npm publish 一律 deny 并写明原因。",
     '''{"matcher": "Bash", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/ci-permissions.mjs"
}]}''',
     "hookSpecificOutput.decision.behavior allow|deny（可带 updatedInput）· 不支持 agent 类型",
     {"matcher": "Bash", "hooks": [{"type": "command", "command": "node .claude/hooks/ci-permissions.mjs", "timeout": 5}]})

hook("PermissionDenied", 3, "inject", "Read|Glob|Grep", "command",
     "auto 模式偶尔把只读命令也拒了。这个 hook 回 retry: true，告诉模型「这个你可以重试」，省掉一轮人工干预。它不能撤销拒绝，只是给个提示。",
     '''{"matcher": "Read|Glob|Grep", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/retry-readonly.mjs"
}]}''',
     "仅 hookSpecificOutput.retry · 只在 auto 模式触发 · classifier 无 verdict 时 retry 被忽略",
     {"matcher": "Read|Glob|Grep", "hooks": [{"type": "command", "command": "node .claude/hooks/retry-readonly.mjs", "timeout": 5}]})

hook("PostToolUse", 3, "control", "Edit|Write", "command",
     "每次改完 .ts 文件立刻跑 tsc --noEmit 单文件检查，报错就 block——工具已经跑完拦不住，这个 block 只是把编译错误作为 reason 附在结果旁给 Claude 看。同时用 updatedToolOutput 裁掉输出里的绝对路径。",
     '''{"matcher": "Edit|Write", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/tsc-check.mjs"
}]}''',
     'decision:"block" 只附 reason，不阻止已执行的工具 · hookSpecificOutput.updatedToolOutput · 失败走 PostToolUseFailure',
     {"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "node .claude/hooks/tsc-check.mjs", "timeout": 60, "statusMessage": "类型检查"}]})

hook("PostToolUseFailure", 3, "control", "Bash|Edit", "command",
     "工具抛错（OOM、超时、MCP error）时记录到 failures.jsonl，并给出纠正提示。注意权限拒绝和参数校验失败不会走到这里，别指望它兜底。",
     '''{"matcher": "Bash|Edit", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/on-failure.mjs"
}]}''',
     'decision:"block" 只附反馈（工具已失败） · hookSpecificOutput.additionalContext · 不覆盖权限拒绝与校验失败',
     {"matcher": "Bash|Edit", "hooks": [{"type": "command", "command": "node .claude/hooks/on-failure.mjs", "timeout": 10}]})

hook("PostToolBatch", 3, "control", None, "command",
     "并行改了 12 个文件后只触发一次：统一跑 eslint --fix，把「这批改了哪些文件、还剩几个错」汇总注入。用 PostToolUse 会触发 12 次，既慢又互相打架。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/batch-eslint.mjs",
  "timeout": 120
}]}''',
     "无 matcher · 输入带 tool_calls 数组 · 可 decision:block 中断下一步",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/batch-eslint.mjs", "timeout": 120}]})

# --- Phase 4: 并发面 ---------------------------------------------------------
hook("SubagentStart", 4, "inject", "migrator", "command",
     "每个包派一个 migrator 子代理，注入该包的规范、依赖边界、以及「不许改 __snapshots__」。不能阻止子代理被创建，只能影响它一开始看到什么。",
     '''{"matcher": "migrator", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/subagent-brief.mjs"
}]}''',
     "不能 block · 仅 additionalContext · 按 agent type 匹配",
     {"matcher": "migrator", "hooks": [{"type": "command", "command": "node .claude/hooks/subagent-brief.mjs", "timeout": 10}]})

hook("SubagentStop", 4, "control", "migrator", "agent",
     "子代理说「迁移完成」时，起一个核查 agent 去读 diff 和测试报告：没跑单测就打回让它继续，迁移不完整也打回。决策格式与 Stop 相同。",
     '''{"matcher": "migrator", "hooks": [{
  "type": "agent",
  "prompt": "核对本次迁移：是否覆盖全部导出、单测是否通过、有无遗留 .js。$ARGUMENTS",
  "timeout": 120
}]}''',
     "可 block 让子代理继续 · 支持 agent 类型 · 输入含 last_assistant_message",
     {"matcher": "migrator", "hooks": [{"type": "agent", "prompt": "核对本次迁移：是否覆盖全部导出、单测是否通过、有无遗留 .js。$ARGUMENTS", "timeout": 120}]})

hook("TaskCreated", 4, "control", None, "command",
     "任务标题必须形如 migrate/<pkg>，否则直接取消建任务并返回原因，避免半夜冒出一堆叫「fix stuff」的条目。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/task-naming.mjs"
}]}''',
     "exit 2 或 decision:block 取消任务 · 无 matcher · continue:false 被忽略",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/task-naming.mjs", "timeout": 5}]})

hook("TaskCompleted", 4, "control", None, "prompt",
     "标记完成前用一次模型判断：单测过了吗？CHANGELOG 加了吗？没满足就 block，任务回到进行中。用 prompt 而不是脚本，是因为「是否完成」需要读上下文判断。",
     '''{"hooks": [{
  "type": "prompt",
  "prompt": "只有单测通过且 CHANGELOG 有对应条目时才允许完成。$ARGUMENTS"
}]}''',
     "可 block 完成 · 支持 prompt 类型 · TaskUpdate 触发时 continue:false 会被忽略",
     {"hooks": [{"type": "prompt", "prompt": "只有单测通过且 CHANGELOG 有对应条目时才允许完成。$ARGUMENTS", "timeout": 25}]})

hook("TeammateIdle", 4, "control", None, "command",
     "reviewer 队友想收工？先看 review.md 在不在、结论填没填。没有就 exit 2 把人留住，防止「团队里没人真正看代码」。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/reviewer-gate.mjs"
}]}''',
     "exit 2 阻止 idle · 无 matcher · continue:false 可让队友彻底停下",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/reviewer-gate.mjs", "timeout": 10}]})

hook("WorktreeCreate", 4, "control", None, "command",
     "每个包一个隔离 worktree：从模板 clone、pnpm install --offline、拷一份 .env.local，最后把路径打到 stdout。打印什么路径就用什么，等于接管了默认 git 行为。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/wt-create.mjs",
  "timeout": 180
}]}''',
     "stdout 输出路径（或 hookSpecificOutput.worktreePath）· 非零退出即创建失败",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/wt-create.mjs", "timeout": 180}]})

hook("WorktreeRemove", 4, "control", None, "command",
     "收尾删 worktree 前检查有没有未提交改动：有就 exit 1 拒绝删除，把现场留给早上的同事。JSON 输出在这里会被丢弃，只有退出码算数。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/wt-keep.mjs"
}]}''',
     "非零退出否决删除 · 无 matcher · JSON 输出被丢弃",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/wt-keep.mjs", "timeout": 20}]})

hook("Elicitation", 4, "control", "design-review", "command",
     "MCP 的 design-review server 弹出「确认删除旧 .js」表单。夜里没人填，这个 hook 按 dry-run 结果自动 accept——出现风险项则 decline，整个弹窗被跳过。",
     '''{"matcher": "design-review", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/form-answer.mjs",
  "timeout": 5
}]}''',
     "action accept|decline|cancel + content · 按 MCP server 名匹配 · 仅 exit 0 时生效",
     {"matcher": "design-review", "hooks": [{"type": "command", "command": "node .claude/hooks/form-answer.mjs", "timeout": 5}]})

hook("ElicitationResult", 4, "control", "design-review", "command",
     "白天有人手动跑时才会走到：校验他填的表单，发现 drop table / 删备份目录之类的选项就 block——把这次回答改成 decline 回给 server，而不是让它生效。注意——hook 自动回答的那条路径不会触发本事件。",
     '''{"matcher": "design-review", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/form-check.mjs"
}]}''',
     "可观察/改写/block 回答 · 按 MCP server 名匹配 · 自动回答路径不经过这里",
     {"matcher": "design-review", "hooks": [{"type": "command", "command": "node .claude/hooks/form-check.mjs", "timeout": 5}]})

# --- Phase 5: 收口 -----------------------------------------------------------
hook("Stop", 5, "control", None, "command",
     "主代理想下班：检查 12 个包的迁移状态和测试结果，还有红的就 block 继续干，并用 additionalContext 给一条「非错误」的提示（比如「剩最后一个包，优先修类型」）。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/stop-gate.mjs",
  "timeout": 60
}]}''',
     'decision:"block" + hookSpecificOutput.additionalContext · 无 matcher · 用户中断不触发',
     {"hooks": [{"type": "command", "command": "node .claude/hooks/stop-gate.mjs", "timeout": 60}]})

hook("StopFailure", 5, "observe", "rate_limit|overloaded", "command",
     "凌晨 opus 限流，这一轮直接结束。hook 只做两件事：打告警、写下「下轮降级」标记。它没有决策权，改不了错误，也救不回这一轮。",
     '''{"matcher": "rate_limit|overloaded", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/on-api-error.mjs"
}]}''',
     "无决策权 · 除 terminalSequence 外 JSON 全被丢弃 · 按 error 类型匹配",
     {"matcher": "rate_limit|overloaded", "hooks": [{"type": "command", "command": "node .claude/hooks/on-api-error.mjs", "timeout": 10}]})

hook("PreCompact", 5, "control", "auto", "command",
     "上下文快满了。先把已完成清单、未决问题、worktree 映射写成 checkpoint 落到磁盘，然后 exit 0——故意不 block，夜里压缩失败会把整晚任务卡死。",
     '''{"matcher": "auto", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/checkpoint.mjs"
}]}''',
     '本可 decision:"block" 阻止压缩，此处刻意不用 · 按 manual|auto 匹配',
     {"matcher": "auto", "hooks": [{"type": "command", "command": "node .claude/hooks/checkpoint.mjs", "timeout": 30}]})

hook("PostCompact", 5, "observe", "auto", "command",
     "压缩完成后把摘要写进 metrics.jsonl 和值班 dashboard，方便早上复盘「模型记住了什么」。无决策权，改不了压缩结果。",
     '''{"matcher": "auto", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/compact-metrics.mjs"
}]}''',
     "无决策权 · systemMessage 与 continue 被丢弃 · 只能做事后处理",
     {"matcher": "auto", "hooks": [{"type": "command", "command": "node .claude/hooks/compact-metrics.mjs", "timeout": 20}]})

hook("PreModelSwitch", 5, "control", "claude-sonnet.*", "command",
     "预算紧张，客户端请求切到 sonnet。策略：剩余包数 ≤3 时 allow，否则 deny 保住 opus 的迁移质量。这是少数能直接否决模型切换的地方。",
     '''{"matcher": "claude-sonnet.*", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/model-budget.mjs"
}]}''',
     "permissionDecision allow|deny|ask 或 decision:block · 按目标模型名匹配",
     {"matcher": "claude-sonnet.*", "hooks": [{"type": "command", "command": "node .claude/hooks/model-budget.mjs", "timeout": 10}]})

hook("PostModelSwitch", 5, "inject", "claude-sonnet.*", "command",
     "真切到 sonnet 之后注入「省钱模式」提示：先跑 codemod，再逐段人工复核。已经换完了，拦不住，只能补充指令。",
     '''{"matcher": "claude-sonnet.*", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/model-notes.mjs"
}]}''',
     "仅 additionalContext（stdout 纯文本也会作为上下文）· 无法回滚",
     {"matcher": "claude-sonnet.*", "hooks": [{"type": "command", "command": "node .claude/hooks/model-notes.mjs", "timeout": 10}]})

# --- Phase 6: 环境与退场 -----------------------------------------------------
hook("Notification", 6, "observe", "permission_prompt|idle_prompt", "http",
     "权限弹窗晾了 6 秒没人管，或以 idle 60 秒：POST 到飞书机器人提醒值班同学。它不能改通知内容、也不能让通知别弹，就是纯转发。",
     '''{"matcher": "permission_prompt|idle_prompt", "hooks": [{
  "type": "http",
  "url": "https://ops.internal/hooks/notify",
  "timeout": 5
}]}''',
     "无决策权 · systemMessage/continue 被丢弃 · terminalSequence 仍有效",
     {"matcher": "permission_prompt|idle_prompt", "hooks": [{"type": "http", "url": "https://ops.internal/hooks/notify", "timeout": 5}]})

hook("ConfigChange", 6, "control", "project_settings|local_settings|skills", "http",
     "有人（或模型自己）想改 .claude/settings.json 关掉 hooks。这个 hook 把变更 POST 给策略服务，未审批就 block。这是防止「AI 把监控关掉」的关键一环。",
     '''{"matcher": "project_settings|local_settings|skills", "hooks": [{
  "type": "http",
  "url": "https://policy.internal/hooks/config-change",
  "timeout": 10
}]}''',
     '可 decision:"block" · 按配置来源匹配 · 不支持 prompt/agent',
     {"matcher": "project_settings|local_settings|skills", "hooks": [{"type": "http", "url": "https://policy.internal/hooks/config-change", "timeout": 10}]})

hook("InstructionsLoaded", 6, "observe", "session_start|nested_traversal", "mcp_tool",
     "审计用：哪条 CLAUDE.md、哪条 rules 进了上下文，调内部 audit server 的 log_instruction 记一笔。异步执行，不阻塞加载，也改不了加载结果。",
     '''{"matcher": "session_start|nested_traversal",
 "hooks": [{"type": "mcp_tool", "server": "audit",
  "tool": "log_instruction",
  "input": {"reason": "${load_reason}"}}]}''',
     "无决策权 · 异步 · 支持 mcp_tool（此事件允许 command/http/mcp_tool）",
     {"matcher": "session_start|nested_traversal", "hooks": [{"type": "mcp_tool", "server": "audit", "tool": "log_instruction", "input": {"path": "${file_path}", "reason": "${load_reason}"}}]})

hook("CwdChanged", 6, "observe", None, "command",
     "cd packages/api 时把包级变量（PKG_NAME、DATABASE_URL）写进 CLAUDE_ENV_FILE，后续 Bash 自动带上。它拦不住目录切换，但能改变切换之后的环境。",
     '''{"hooks": [{
  "type": "command",
  "command": "node .claude/hooks/reload-pkg-env.mjs"
}]}''',
     "无 matcher · 无决策权 · 写入 CLAUDE_ENV_FILE 的变量持续到下次 CwdChanged",
     {"hooks": [{"type": "command", "command": "node .claude/hooks/reload-pkg-env.mjs", "timeout": 5}]})

hook("DirectoryAdded", 6, "observe", "slash_command", "command",
     "迁移中发现一个没登记的包 packages/legacy-billing，/add-dir 之后这个 hook 自动跑 pnpm install 并生成包级 CLAUDE.md。目录已经加进去了，拦不了。",
     '''{"matcher": "slash_command", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/new-repo.mjs",
  "timeout": 180
}]}''',
     "无决策权（已在 hook 前完成）· 按 slash_command|register_repo_root 匹配",
     {"matcher": "slash_command", "hooks": [{"type": "command", "command": "node .claude/hooks/new-repo.mjs", "timeout": 180}]})

hook("FileChanged", 6, "observe", ".envrc|package.json", "command",
     "文件系统监听，不管是谁改的（Claude、Bash、还是外部进程）。.envrc 变了就重载 direnv，package.json 变了就重装依赖。matcher 同时是监视名单。",
     '''{"matcher": ".envrc|package.json", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/watch-reload.mjs"
}]}''',
     "matcher 按 | 切成字面文件名做监视列表 · 无决策权 · 拦不住改动本身",
     {"matcher": ".envrc|package.json", "hooks": [{"type": "command", "command": "node .claude/hooks/watch-reload.mjs", "timeout": 120}]})

hook("SessionEnd", 6, "observe", "logout|prompt_input_exit|other", "command",
     "05:00 收工：归档 transcript、上传指标、清理临时目录、给值班群发一条总结。只有 1.5 秒预算，所以真正的上传是丢后台的。",
     '''{"matcher": "logout|prompt_input_exit|other", "hooks": [{
  "type": "command",
  "command": "node .claude/hooks/archive-session.mjs"
}]}''',
     "无决策权 · 默认 1.5s 共享预算（可放宽至 60s）· 按结束原因匹配",
     {"matcher": "logout|prompt_input_exit|other", "hooks": [{"type": "command", "command": "node .claude/hooks/archive-session.mjs", "timeout": 1}]})

# ---------------------------------------------------------------------------
# 3. Build-time assertions: refuse to render a wrong case
# ---------------------------------------------------------------------------
def check():
    errs = []
    names = [h["event"] for h in H]
    if len(H) != 33:
        errs.append(f"事件数 {len(H)} != 33")
    if len(set(names)) != len(names):
        errs.append("存在重复事件")
    if set(names) != set(ALL_EVENTS):
        errs.append(f"事件集合不一致: 缺 {set(ALL_EVENTS)-set(names)} 多 {set(names)-set(ALL_EVENTS)}")

    for h in H:
        e = h["event"]
        # matcher
        if e in NO_MATCHER and h["matcher"] is not None:
            errs.append(f"{e}: 不支持 matcher，却配置了 {h['matcher']!r}")
        if e not in NO_MATCHER and not h["matcher"]:
            errs.append(f"{e}: 缺少 matcher")
        # handler type whitelist
        allowed = (T5 if e in T5 else T4_NO_AGENT if e in T4_NO_AGENT
                   else T3 if e in T3 else T2)
        ok = {"command", "http", "mcp_tool", "prompt", "agent"} if e in T5 else \
             {"command", "http", "mcp_tool", "prompt"} if e in T4_NO_AGENT else \
             {"command", "http", "mcp_tool"} if e in T3 else {"command", "mcp_tool"}
        if h["htype"] not in ok:
            errs.append(f"{e}: {h['htype']} 不在该事件允许的类型 {sorted(ok)} 内")
        # decision capability
        if h["cap"] == "control" and e in NO_DECISION:
            errs.append(f"{e}: 文档明确无决策权，却标为可控制")
        if h["cap"] != "control" and e not in NO_DECISION and e not in {"SessionStart", "SubagentStart", "PostModelSwitch", "PermissionDenied"}:
            errs.append(f"{e}: 可决策事件被标为 {h['cap']}")
        # if only on tool events
        entries = h["entry"]["hooks"]
        if any("if" in x for x in entries) and e not in TOOL_EVENTS:
            errs.append(f"{e}: 非工具事件不能使用 if 字段")
        # sessionstart/setup must not rely on mcp_tool at launch
        if e in T2 and h["htype"] == "mcp_tool":
            errs.append(f"{e}: 启动时 MCP 未就绪，mcp_tool 会被跳过")
        # role text sanity
        if len(h["role"]) < 20:
            errs.append(f"{e}: 场景描述过短")
        # drawer readability: keep every code line within the 524px drawer
        longest = max(len(line) for line in h["snippet"].split("\n"))
        if longest > 70:
            errs.append(f"{e}: 配置片段最长行 {longest} 字符，抽屉里会折行")

    # type partition must cover all events exactly once
    if len(T5) + len(T4_NO_AGENT) + len(T3) + len(T2) != 33:
        errs.append("handler 类型分区不构成 33 的划分")
    if (T5 | T4_NO_AGENT | T3 | T2) != set(ALL_EVENTS):
        errs.append("handler 类型分区与事件全集不一致")
    if T5 & T4_NO_AGENT or T5 & T3 or T4_NO_AGENT & T3 or T5 & T2:
        errs.append("handler 类型分区存在重叠")

    return errs



errs = check()
if errs:
    print("BUILD FAILED — 约束校验未通过：")
    for e in errs:
        print("  ✗", e)
    sys.exit(1)

print(f"✓ 33 个事件齐全，无重复")
print(f"✓ {len(NO_MATCHER)} 个不支持 matcher 的事件均未写 matcher")
print(f"✓ handler 类型全部落在各事件白名单内（5类:{len(T5)} / 4类:{len(T4_NO_AGENT)} / 3类:{len(T3)} / 2类:{len(T2)}）")
print(f"✓ 决策能力标注与文档一致（可干预 {sum(1 for h in H if h['cap']=='control')} / 仅注入 {sum(1 for h in H if h['cap']=='inject')} / 仅观测 {sum(1 for h in H if h['cap']=='observe')}）")
print("✓ if 字段只出现在工具事件上")

# ---------------------------------------------------------------------------
# 4. Render
# ---------------------------------------------------------------------------
PHASES = {
    1: ("01", "冷启动", "02:00", "CI 拉起任务，把工具链和上次进度准备好。两个事件都发生在「Claude 还没开始思考」之前。"),
    2: ("02", "入场", "02:01", "一次性输入面：prompt 校验、斜杠命令展开、流式输出脱敏。"),
    3: ("03", "工具循环", "02:02", "整晚最热的一段，每个工具调用都会经过。硬闸门、权限代理、失败反馈、批量检查都在这里。"),
    4: ("04", "并发面", "02:05", "子代理、agent team、任务、worktree、MCP 表单——33 个里最容易被忽略的一层。"),
    5: ("05", "收口", "04:30", "决定「能不能停」和「用哪个模型收尾」，以及上下文压缩前后的两个切入点。"),
    6: ("06", "退场", "05:00", "环境变化、配置审计、通知与归档。大多数只观测，但 CwdChanged 能改变后续环境。"),
}

CAP_CLASS = {"control": "cap-control", "inject": "cap-inject", "observe": "cap-observe"}
CAP_LABEL = {"control": "可干预", "inject": "仅注入", "observe": "仅观测"}

NAME_CN = {
    "Setup": "初始化设置",
    "SessionStart": "会话开始",
    "UserPromptSubmit": "提交提示词",
    "UserPromptExpansion": "命令展开",
    "MessageDisplay": "消息显示",
    "PreToolUse": "工具调用前",
    "PermissionRequest": "权限请求",
    "PermissionDenied": "权限被拒",
    "PostToolUse": "工具调用后",
    "PostToolUseFailure": "工具失败后",
    "PostToolBatch": "批次完成后",
    "SubagentStart": "子代理启动",
    "SubagentStop": "子代理结束",
    "TaskCreated": "任务创建",
    "TaskCompleted": "任务完成",
    "TeammateIdle": "队友空闲",
    "WorktreeCreate": "工作树创建",
    "WorktreeRemove": "工作树移除",
    "Elicitation": "MCP 表单请求",
    "ElicitationResult": "表单应答",
    "Stop": "回合结束",
    "StopFailure": "回合异常结束",
    "PreCompact": "压缩前",
    "PostCompact": "压缩后",
    "PreModelSwitch": "模型切换前",
    "PostModelSwitch": "模型切换后",
    "Notification": "系统通知",
    "ConfigChange": "配置变更",
    "InstructionsLoaded": "指令载入",
    "CwdChanged": "目录切换",
    "DirectoryAdded": "目录加入",
    "FileChanged": "文件变化",
    "SessionEnd": "会话结束",
}

WHEN = {
    "Setup": "只在 --init-only，或 -p 模式下的 --init / --maintenance 启动时",
    "SessionStart": "新建会话、resume、/clear 或压缩之后",
    "UserPromptSubmit": "prompt 提交后、Claude 开始处理之前（定时任务也会触发）",
    "UserPromptExpansion": "手打斜杠命令展开成 prompt 时",
    "MessageDisplay": "助手消息流式渲染、每批新行就绪时",
    "PreToolUse": "工具参数已生成、工具真正执行之前",
    "PermissionRequest": "Claude Code 即将弹出权限确认时",
    "PermissionDenied": "auto 模式拒绝了一次工具调用之后",
    "PostToolUse": "工具成功返回之后",
    "PostToolUseFailure": "工具抛错或 MCP 返回 error 之后",
    "PostToolBatch": "一批并行工具全部结束、下次请求模型之前",
    "SubagentStart": "派生子代理、恢复子代理、队友接新消息时",
    "SubagentStop": "子代理结束响应时",
    "TaskCreated": "通过 TaskCreate 建任务时",
    "TaskCompleted": "任务被标记完成，或队友带着进行中任务结束回合时",
    "TeammateIdle": "agent team 队友即将进入空闲时",
    "WorktreeCreate": "--worktree、isolation、后台会话等创建 worktree 时",
    "WorktreeRemove": "清理 WorktreeCreate 创建的 worktree 时",
    "Elicitation": "MCP server 在工具调用中请求用户输入时",
    "ElicitationResult": "用户填完表单、答案回传 server 之前",
    "Stop": "主代理完成一次响应时（用户中断不算）",
    "StopFailure": "本轮因 API 错误结束时",
    "PreCompact": "压缩上下文之前（manual / auto）",
    "PostCompact": "压缩完成之后",
    "PreModelSwitch": "应用 /model、set_model 等切换请求之前",
    "PostModelSwitch": "会话模型真正变更之后",
    "Notification": "Claude Code 发出通知时（权限等待 6s、空闲 60s 等）",
    "ConfigChange": "会话中设置文件、策略文件或技能文件变化时",
    "InstructionsLoaded": "CLAUDE.md 或 .claude/rules 载入上下文时",
    "CwdChanged": "主对话里的 shell 命令改变工作目录时",
    "DirectoryAdded": "/add-dir 或 SDK register_repo_root 之后",
    "FileChanged": "被监视的文件在磁盘上发生变化时",
    "SessionEnd": "会话终止时",
}



def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def flow_svg():
    cols = {i: [h for h in H if h["phase"] == i] for i in range(1, 7)}
    W, PAD, CW, GAP = 1316, 20, 196, 20
    chip_h, chip_gap, top = 38, 9, 96
    maxn = max(len(v) for v in cols.values())
    content_bottom = top + maxn * (chip_h + chip_gap) - chip_gap
    col_h = content_bottom + 20
    Hh = col_h + 64
    s = [f'<svg viewBox="0 0 {W} {Hh}" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="33 个 hook 事件的执行流程，每个事件可点击查看详情">']
    s.append('<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
             '<path d="M0,0 L10,5 L0,10 z" fill="#3b4d66"/></marker>'
             '<marker id="ar2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">'
             '<path d="M0,0 L10,5 L0,10 z" fill="#3f6f8f"/></marker></defs>')
    for i in range(1, 7):
        no, title, t, _ = PHASES[i]
        x = PAD + (i - 1) * (CW + GAP)
        cx = x + CW / 2
        s.append(f'<rect x="{x}" y="10" width="{CW}" height="{col_h-10}" rx="14" fill="#0c141d" stroke="#1a2836"/>')
        s.append(f'<text x="{cx}" y="38" text-anchor="middle" fill="#e8f2fb" font-size="14" font-weight="700">{i}. {title}</text>')
        s.append(f'<text x="{cx}" y="58" text-anchor="middle" fill="#6b8299" font-size="11" font-family="ui-monospace,Menlo,monospace">{t}</text>')
        s.append(f'<text x="{cx}" y="76" text-anchor="middle" fill="#3f566d" font-size="10">{len(cols[i])} events</text>')
        # arrow to next column
        if i < 6:
            ax = x + CW + 3
            s.append(f'<path d="M{ax},{top-14} h{GAP-8}" stroke="#3b4d66" stroke-width="1.4" marker-end="url(#ar)"/>')

        for j, h in enumerate(cols[i]):
            y = top + j * (chip_h + chip_gap)
            col = {"control": "#f07178", "inject": "#35c4dd", "observe": "#7e91a8"}[h["cap"]]
            cn = NAME_CN[h["event"]]
            s.append(f'<g class="chip" data-event="{h["event"]}" tabindex="0" role="button" '
                     f'aria-label="{h["event"]}（{cn}），点击查看详情">')
            s.append(f'<title>{cn} · 点击查看</title>')
            s.append(f'<rect class="chip-bg" x="{x+8}" y="{y}" width="{CW-16}" height="{chip_h}" rx="8" fill="#101b26" stroke="#1e3143"/>')
            s.append(f'<rect x="{x+8}" y="{y+7}" width="3" height="{chip_h-14}" rx="1.5" fill="{col}" opacity="0.95"/>')
            s.append(f'<text x="{x+18}" y="{y+24}" fill="#d7e7f4" font-size="12" '
                     f'font-family="ui-monospace,SFMono-Regular,Menlo,monospace">{h["event"]}</text>')
            s.append(f'<circle cx="{x+CW-18}" cy="{y+chip_h/2}" r="3" fill="{col}" opacity="0.9"/>')
            s.append('</g>')

    # loop-back arrow: from phase 5 bottom back to phase 2
    y1 = col_h + 16
    x5 = PAD + 4 * (CW + GAP) + CW / 2
    x2 = PAD + 1 * (CW + GAP) + CW / 2
    s.append(f'<path d="M{x5},{col_h-2} V{y1} H{x2} V{col_h+8}" fill="none" stroke="#3f6f8f" '
             f'stroke-width="1.4" stroke-dasharray="5 5" marker-end="url(#ar2)"/>')
    s.append(f'<text x="{(x5+x2)/2}" y="{y1+26}" text-anchor="middle" fill="#5f8aa8" font-size="11">'
             f'每个 turn 回到输入侧，直到 Stop 放行</text>')
    s.append('</svg>')
    return "\n".join(s)


NOTES = {
    1: [("为什么这里只有两个事件",
         "在「Claude 读到第一句话」之前能干预的只有 Setup 和 SessionStart。"
         "InstructionsLoaded 其实也在会话启动时触发，但它只做异步审计、还会随懒加载反复出现，所以归到了退场阶段。")],
    6: [("退场阶段几乎全是观测点",
         "7 个里 6 个没有决策权。不是设计偷懒：文件已经改完、目录已经加好，"
         "此时能做的本来就只有记录、告警和补救。"),
        ("但 CwdChanged 是个例外",
         "它拦不住 cd，却能通过 CLAUDE_ENV_FILE 改写之后所有 Bash 命令的环境变量——"
         "观测类事件里唯一具备「延迟生效」能力的一个。")],
}


def note_html(title, text):
    return (
        '\n      <aside class="note">'
        '\n        <span class="note-tag">NOTE</span>'
        '\n        <b>' + title + '</b>'
        '\n        <p>' + text + '</p>'
        '\n      </aside>'
    )



def cards_for(phase):
    out = []
    for h in [x for x in H if x["phase"] == phase]:
        out.append(f'''
      <article class="card {CAP_CLASS[h["cap"]]}" data-cap="{h["cap"]}" data-event="{h["event"]}">
        <div class="card-top">
          <code class="ev">{h["event"]}</code>
          <span class="badge {CAP_CLASS[h["cap"]]}">{CAP_LABEL[h["cap"]]}</span>
        </div>
        <div class="meta">
          <span class="kv"><i>matcher</i><b>{h["matcher"] if h["matcher"] else "—（不支持）"}</b></span>
          <span class="kv"><i>type</i><b>{h["htype"]}</b></span>
        </div>
        <p class="role">{h["role"]}</p>
        <pre class="code">{esc(h["snippet"])}</pre>
        <p class="detail">{h["detail"]}</p>
      </article>''')
    for title, text in NOTES.get(phase, []):
        out.append(note_html(title, text))
    return "\n".join(out)


def phases_html():
    out = []
    for i in range(1, 7):
        no, title, t, desc = PHASES[i]
        out.append(f'''
  <section class="phase" id="phase{i}">
    <header class="phase-head">
      <span class="phase-no">{no}</span>
      <div>
        <h3>{title} <em>{t}</em></h3>
        <p>{desc}</p>
      </div>
    </header>
    <div class="grid">
{cards_for(i)}
    </div>
  </section>''')
    return "\n".join(out)


def settings_json():
    obj = {"hooks": {}}
    for h in H:
        obj["hooks"].setdefault(h["event"], []).append(h["entry"])
    return json.dumps(obj, ensure_ascii=False, indent=2)


control_rows = [h for h in H if h["cap"] == "control"]
inject_rows = [h for h in H if h["cap"] == "inject"]
observe_rows = [h for h in H if h["cap"] == "observe"]
no_matcher_rows = [h for h in H if not h["matcher"]]

CONTROL_FIELD = {
    "UserPromptSubmit": 'decision:"block" + additionalContext',
    "UserPromptExpansion": 'decision:"block" + additionalContext',
    "MessageDisplay": "hookSpecificOutput.displayContent",
    "PreToolUse": "hookSpecificOutput.permissionDecision allow|deny|ask|defer + updatedInput",
    "PermissionRequest": "hookSpecificOutput.decision.behavior allow|deny（可带 updatedInput）",
    "PostToolUse": 'decision:"block"（仅反馈）+ hookSpecificOutput.updatedToolOutput',
    "PostToolUseFailure": 'decision:"block"（仅反馈）+ additionalContext',
    "PostToolBatch": 'decision:"block" + hookSpecificOutput.additionalContext',
    "SubagentStop": 'decision:"block" + hookSpecificOutput.additionalContext',
    "TaskCreated": "exit 2 / decision:block（取消任务）",
    "TaskCompleted": "exit 2 / continue:false",
    "TeammateIdle": "exit 2 / continue:false",
    "Stop": 'decision:"block" + hookSpecificOutput.additionalContext',
    "ConfigChange": 'decision:"block"',
    "WorktreeCreate": "stdout 路径 / worktreePath",
    "WorktreeRemove": "非零退出否决删除",
    "PreCompact": 'decision:"block"',
    "PreModelSwitch": "hookSpecificOutput.permissionDecision allow|deny|ask / decision:block",
    "Elicitation": "hookSpecificOutput.action accept|decline|cancel + content",
    "ElicitationResult": "action/content 改写 + decision:block",
}
BOUNDARY = {
    "UserPromptSubmit": "只能追加，不能替换用户原文",
    "UserPromptExpansion": "只覆盖手打斜杠命令，工具调用走 PreToolUse",
    "MessageDisplay": "只改屏幕；transcript 与模型看到的仍是原文",
    "PreToolUse": "@ 引用的文件不产生工具调用，不会触发",
    "PermissionRequest": "无交互环境下没有决策就默认拒绝；exit 2 不会被当作拒绝",
    "PostToolUse": "工具已经执行，block 只是附原因给 Claude 看；失败走 PostToolUseFailure",
    "PostToolUseFailure": "权限拒绝、schema 校验失败不触发；工具已失败，block 只附反馈",
    "PostToolBatch": "每批只触发一次，没有 matcher",
    "SubagentStop": "Claude Code 内部子代理结束时也会触发",
    "TaskCreated": "continue:false 在此事件被忽略",
    "TaskCompleted": "TaskUpdate 触发时 continue:false 被忽略",
    "TeammateIdle": "无 matcher，每次 idle 都触发",
    "Stop": "用户主动中断不触发",
    "ConfigChange": "policy_settings 来源的变更拦不住；托管设置同步也不经过此事件",
    "WorktreeCreate": "非零退出即判定创建失败",
    "WorktreeRemove": "只认退出码，JSON 输出被丢弃",
    "PreCompact": "压缩前唯一的拦截点",
    "PreModelSwitch": "需 v2.1.251+；超时未响应会阻止切换",
    "Elicitation": "只有 exit 0 时 hookSpecificOutput 才生效",
    "ElicitationResult": "Elicitation 自动回答的路径不触发",
}

NO_MATCHER_HOW = {
    "UserPromptSubmit": "没有过滤维度，每个 turn 都跑；条件写进脚本",
    "MessageDisplay": "没有过滤维度；用 index / final 跟踪同一条消息",
    "PostToolBatch": "没有过滤维度；在脚本里读 tool_calls 自行筛选",
    "TaskCreated": "没有过滤维度；在脚本里检查 task_subject",
    "TaskCompleted": "没有过滤维度；在脚本里检查 task_id 与测试结果",
    "TeammateIdle": "没有过滤维度；在脚本里检查 teammate_name",
    "WorktreeCreate": "没有过滤维度，每次创建都触发",
    "WorktreeRemove": "没有过滤维度，每次删除都触发",
    "Stop": "没有过滤维度，每轮结束都触发",
    "CwdChanged": "没有过滤维度，每次 cd 都触发",
}

CAP_NOTE = {
    "SessionStart": "只能补充上下文，不能阻断启动",
    "UserPromptSubmit": "可拦下这条 prompt，但不能替换原文",
    "UserPromptExpansion": "可拦下展开，也可追加 checklist",
    "MessageDisplay": "只能改写屏幕显示，不影响 transcript",
    "PreToolUse": "可放行 / 拒绝 / 追问，也能改参数",
    "PermissionRequest": "可代替用户放行或拒绝",
    "PermissionDenied": "只能提示模型可重试，撤销不了拒绝",
    "PostToolUse": "拦不住已执行的工具，只改 Claude 看到的",
    "PostToolUseFailure": "撤销不了失败，只能补充反馈",
    "PostToolBatch": "可中断下一步，也能注入批次上下文",
    "SubagentStart": "只能补充上下文，不能阻止创建",
    "SubagentStop": "可让子代理继续干活",
    "TaskCreated": "可直接取消这次建任务",
    "TaskCompleted": "可驳回完成，任务回到进行中",
    "TeammateIdle": "可把队友留在工作状态",
    "WorktreeCreate": "可决定 worktree 路径，失败即中止",
    "WorktreeRemove": "可拒绝删除，保留现场",
    "Elicitation": "可代替用户填表，跳过弹窗",
    "ElicitationResult": "可改写或驳回用户的答案",
    "Stop": "可让 Claude 继续，不许收工",
    "PreCompact": "可阻止压缩",
    "PreModelSwitch": "可否决这次模型切换",
    "PostModelSwitch": "只能追加指令，无法回滚",
}

for h in control_rows:
    assert h["event"] in CONTROL_FIELD, h["event"]

control_table = "\n".join(
    f'<tr><td><code>{h["event"]}</code></td><td class="mono-sm">{esc(CONTROL_FIELD[h["event"]])}</td>'
    f'<td>{BOUNDARY[h["event"]]}</td></tr>' for h in control_rows)

no_matcher_table = "\n".join(
    f'<tr><td><code>{h["event"]}</code></td><td class="ok">未配置 matcher ✓</td>'
    f'<td>{NO_MATCHER_HOW[h["event"]]}</td></tr>' for h in no_matcher_rows)

def join_codes(events):
    return "、".join(f"<code>{e}</code>" for e in sorted(events))


type_table = f'''
<tr><td><b>全部 5 种</b><br><span class="dim">command / http / mcp_tool / prompt / agent</span></td>
    <td class="num">{len(T5)}</td>
    <td>{join_codes(T5)}</td></tr>
<tr><td><b>4 种</b><br><span class="dim">没有 agent</span></td>
    <td class="num">{len(T4_NO_AGENT)}</td>
    <td><code>PermissionRequest</code>（配 agent 会被跳过，权限流程照常走）</td></tr>
<tr><td><b>3 种</b><br><span class="dim">command / http / mcp_tool</span></td>
    <td class="num">{len(T3)}</td>
    <td>{join_codes(T3)}</td></tr>
<tr><td><b>2 种</b><br><span class="dim">command / mcp_tool</span></td>
    <td class="num">{len(T2)}</td>
    <td>{join_codes(T2)}（Setup 的 mcp_tool 恒被跳过；SessionStart 在启动时 MCP 未就绪也会跳过。本案例一律用 command）</td></tr>
'''

HOOK_DATA = {
    h["event"]: {
        "name": NAME_CN[h["event"]],
        "when": WHEN[h["event"]],
        "cap": h["cap"],
        "capLabel": CAP_LABEL[h["cap"]],
        "capNote": CAP_NOTE.get(h["event"], "只能产生副作用，改不了走向"),
        "matcher": h["matcher"] or "",
        "type": h["htype"],
        "role": h["role"],
        "detail": h["detail"],
        "snippet": h["snippet"],
        "phase": PHASES[h["phase"]][1],
        "phaseNo": PHASES[h["phase"]][0],
    }
    for h in H
}
assert set(NAME_CN) == set(ALL_EVENTS), "中文名缺失"
assert set(WHEN) == set(ALL_EVENTS), "触发时机缺失"

CSS = open("style.css", encoding="utf-8").read()
HTML = open("template.html", encoding="utf-8").read()
settings_text = settings_json()

html = (HTML
        .replace("{{CSS}}", CSS)
        .replace("{{FLOW}}", flow_svg())
        .replace("{{PHASES}}", phases_html())
        .replace("{{SETTINGS}}", esc(settings_text))
        .replace("{{SETTINGS_SIZE}}", f"{len(settings_text.splitlines())} 行")
        .replace("{{CONTROL_TABLE}}", control_table)
        .replace("{{NO_MATCHER_TABLE}}", no_matcher_table)
        .replace("{{TYPE_TABLE}}", type_table)
        .replace("{{N_CONTROL}}", str(len(control_rows)))
        .replace("{{N_INJECT}}", str(len(inject_rows)))
        .replace("{{N_OBSERVE}}", str(len(observe_rows)))
        .replace("{{N_NO_MATCHER}}", str(len(no_matcher_rows)))
        .replace("{{HOOK_DATA}}", json.dumps(HOOK_DATA, ensure_ascii=False).replace("</", "<\\/")))

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print(f"✓ wrote {OUT} ({len(html)/1024:.1f} KB)")
