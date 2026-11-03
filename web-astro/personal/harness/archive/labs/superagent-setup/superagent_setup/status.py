"""The exit codes ``scripts/dsh-superagent status`` uses, and the handover.

docs/006-deployment.md section 5: 0 healthy, 1 not running, 2 partial error
that a restart cannot fix, 3 awaiting setup that a restart cannot fix.
"""

from __future__ import annotations

STATUS_TEXT = {
    0: '正常',
    1: '未运行',
    2: '部分错误（重启不会修好）',
    3: '待配置（重启不会修好）',
}


def evaluate(machine, records):
    """Return ``(code, reason)`` from the probe and execute records."""
    refused = [record for record in records if record.status == 'refused']
    if refused:
        return 3, '有配置保存被拒：{}'.format(refused[0].key)
    blocked = [record for record in records if record.status == 'blocked']
    if blocked:
        return 3, '有前置无法自动完成：{}'.format(blocked[0].key)
    degraded = [record for record in records if record.status == 'degraded']
    if degraded:
        return 2, '来源降级：{}'.format(degraded[0].key)
    missing = [record for record in records if record.status == 'missing']
    if missing:
        return 1, '前置缺失导致进程没起来：{}'.format(missing[0].key)
    return 0, '全部前置满足，面板与执行器都在'


def handover(answers):
    """The three things SETUP.md section 5 says to tell the operator."""
    repository = answers['repository']
    agent = answers['agent_account']
    return (
        '面板：http://127.0.0.1:3082/ ，侧栏的 Superagent 是需要人看的地方',
        '试跑：在 {} 的 issue 里由允许名单上的人评论 @{} <请求>，一分钟左右会出现工单'.format(
            repository, agent
        ),
        '三条规矩：先窄后宽、按噪音调策略、Agent 说的话由操作者负责',
    )
