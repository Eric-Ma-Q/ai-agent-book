"""Configuration saves, and the reasons the host refuses them.

The rules follow docs/006-deployment.md sections 10 and 11. Every refusal names
the fix, because the prototype's own setup flow expects the setup agent to read
the response body, repair, and continue without asking the operator.
"""

from __future__ import annotations

from .model import Record

MACHINE_KEYS = ('stateDir', 'promptMaxChars', 'admissionContextMaxPages', 'admissionContextTimeoutMs')
ACCEPT_MODES = ('off', 'observe', 'auto')
LOOPBACK = ('127.0.0.1', 'localhost')


def _record(section, status, message):
    return Record('execute', section, status, message, 'docs/006-deployment.md §10')


def _host_of(host):
    return (host or '').rsplit(':', 1)[0]


def _request_shape(attempt):
    """The Management API only answers loopback callers that send its header."""
    if _host_of(attempt.host) not in LOOPBACK:
        return _record(
            attempt.section,
            'refused',
            '请求被拒：面板只服务 127.0.0.1 / localhost。修法：远程使用要自己加反向代理并补鉴权，'
            '不要把端口直接暴露出去',
        )
    if not attempt.has_header:
        return _record(
            attempt.section,
            'refused',
            '请求被拒：缺少 x-orchestrator-request: 1 头。修法：按 docs/006-deployment.md 的示例请求补上该头',
        )
    return None


def _check_machine(attempt, saved):
    unknown = [key for key in attempt.payload if key not in MACHINE_KEYS]
    if unknown:
        return _record(
            'machine',
            'refused',
            '保存被拒：出现未知键 {}；未知键会让启动直接失败。修法：删掉这些键，只保留 {}'.format(
                '、'.join(sorted(unknown)), '、'.join(MACHINE_KEYS)
            ),
        )
    state_dir = attempt.payload.get('stateDir')
    if not state_dir or not state_dir.startswith('/'):
        return _record(
            'machine',
            'refused',
            '保存被拒：stateDir 必须是绝对路径（当前 {}）。修法：换成如 /home/<user>/.dsh/state/superagent'.format(
                state_dir or '（空）'
            ),
        )
    if saved.get('stateDir') and saved['stateDir'] != state_dir:
        return _record(
            'machine',
            'refused',
            '保存被拒：stateDir 装完不能改（原 {}，新 {}）。修法：迁移数据后重装，不要就地改配置'.format(
                saved['stateDir'], state_dir
            ),
        )
    return _record('machine', 'pass', '机器配置已保存：stateDir={}，其余键可热加载'.format(state_dir))


def _check_github(attempt):
    payload = attempt.payload
    repository = payload.get('repository') or ''
    parts = repository.split('/')
    if len(parts) != 2 or not all(parts):
        return _record(
            'github',
            'refused',
            '保存被拒：repository 要写成 owner/name（当前 {}）。修法：改成 github.com 上的完整 owner/name'.format(
                repository or '（空）'
            ),
        )
    if payload.get('enterpriseHost'):
        return _record(
            'github',
            'refused',
            '保存被拒：只支持 github.com，GitHub Enterprise Server 不支持。修法：换到 github.com 仓库，或不要用它',
        )
    cli = payload.get('cli') or ''
    if not cli.startswith('/'):
        return _record(
            'github',
            'refused',
            '保存被拒：cli 必须是 gh-agent 包装器的绝对路径（当前 {}）。修法：写 <stateDir>/worker-bin/gh-agent'.format(
                cli or '（空）'
            ),
        )
    return _record('github', 'pass', 'github 来源已保存：{}，CLI 用隔离配置目录的包装器'.format(repository))


def _check_feishu(attempt, machine):
    if not machine.lark_cli:
        return _record(
            'feishu',
            'degraded',
            '飞书来源关闭：没有 lark-cli。GitHub 链路不受影响。修法：装 lark-cli 并发布带机器人能力的自建应用后重存',
        )
    if not attempt.payload.get('chats'):
        return _record(
            'feishu',
            'refused',
            '保存被拒：没有群 id。修法：先用机器人 CLI 按群名查出 chat id 再保存',
        )
    return _record('feishu', 'pass', '飞书来源已保存：{} 个群，只读 @ 提及'.format(len(attempt.payload['chats'])))


def _check_policy(attempt):
    payload = attempt.payload
    allowed = payload.get('allowed') or []
    if not allowed:
        return _record(
            'policy',
            'refused',
            '保存被拒：每个来源至少要有一个允许账号，否则任何 Trigger 都成不了工单。'
            '修法：先只填操作者本人的 GitHub 登录名，看几天再扩',
        )
    mode = payload.get('accept', 'observe')
    if mode not in ACCEPT_MODES:
        return _record(
            'policy',
            'refused',
            '保存被拒：accept 只能是 {}（当前 {}）。修法：先用 observe'.format('、'.join(ACCEPT_MODES), mode),
        )
    return _record('policy', 'pass', '策略已保存：允许 {}；模式 {}'.format('、'.join(allowed), mode))


def _check_executor(attempt):
    payload = attempt.payload
    if not payload.get('prepare'):
        return _record(
            'executor',
            'refused',
            '保存被拒：executor.prepare 为空，工单没有检出目录。修法：写每工单一个 git worktree 的准备命令',
        )
    if int(payload.get('maxWorkers', 1)) < 1:
        return _record(
            'executor',
            'refused',
            '保存被拒：maxWorkers 至少为 1。修法：先设 1，再按需要加',
        )
    blocked = payload.get('blockedCommands') or []
    if 'gh' not in blocked or 'lark-cli' not in blocked:
        return _record(
            'executor',
            'pass',
            '执行设置已保存，但 blockedCommands 没有同时列出个人 gh 与 lark-cli：'
            'Agent 可能借操作者身份行动，建议补上',
        )
    return _record('executor', 'pass', '执行设置已保存：每工单一个目录，个人 CLI 已封禁')


def _check_prompts(attempt):
    payload = attempt.payload
    if not payload.get('commit_author'):
        return _record(
            'prompts',
            'refused',
            '保存被拒：没有提交署名。修法：写 Agent 账号，让它的工作可见地属于它自己',
        )
    if payload.get('auto_merge') == 'yes' and not payload.get('merger_cli'):
        return _record(
            'prompts',
            'refused',
            '保存被拒：自动合并需要另一个可合并账号的 CLI，Agent 账号不能自己合并。'
            '修法：要么关闭自动合并，要么请操作者登录一个能合并的包装器并在这里写明',
        )
    return _record(
        'prompts',
        'pass',
        '提示词已保存：署名 {}；自动合并 {}'.format(
            payload['commit_author'], '开启' if payload.get('auto_merge') == 'yes' else '关闭'
        ),
    )


def validate(attempt, machine, saved=None):
    """Validate one save. ``saved`` is what has been applied so far."""
    saved = saved or {}
    shape = _request_shape(attempt)
    if shape is not None:
        return shape
    section = attempt.section
    if section == 'machine':
        return _check_machine(attempt, saved)
    if section == 'github':
        return _check_github(attempt)
    if section == 'feishu':
        return _check_feishu(attempt, machine)
    if section == 'policy':
        return _check_policy(attempt)
    if section == 'executor':
        return _check_executor(attempt)
    if section == 'prompts':
        return _check_prompts(attempt)
    return _record(section, 'refused', '保存被拒：未知配置段 {}。修法：只提交已知段'.format(section))


def apply(attempt, record, saved):
    """Remember a successful save so later checks can compare against it."""
    if record.status in ('pass', 'degraded'):
        for key, value in attempt.payload.items():
            saved[key] = value
    return saved
