"""Eight scripted runs. Each one is a small, reproducible story.

The model side is scripted by `assessments`: either an outcome for a batch
signature, or one keyed by policy version when the same batch is judged twice.
"""

from __future__ import annotations

from .model import Event, Policy, Scenario, SourceConfig, Trigger

ADMISSION = (
    ('listed_unaddressed', 'inferred'),
    ('unlisted_addressed', 'ignore'),
    ('unlisted_unaddressed', 'ignore'),
)


def _source(allowed=('alice',), bots=('dependabot[bot]',), listening=True, admission=ADMISSION):
    return SourceConfig(
        id='github',
        kind='github',
        allowed=tuple(allowed),
        bots=tuple(bots),
        admission=tuple(admission),
        listening=listening,
    )


def _policy(version=1, mode='observe', rules=('fix-bug',), source=None):
    return Policy(
        version=version,
        accept_mode=mode,
        rules=tuple(rules),
        sources=(source or _source(),),
    )


def _trigger(trigger_id, thread, actor, text, addressed=False, bot=False, ci=False):
    return Event(
        'trigger',
        {
            'trigger': Trigger(
                id=trigger_id,
                source='github',
                thread=thread,
                actor=actor,
                text=text,
                addressed=addressed,
                is_bot=bot,
                is_ci=ci,
            )
        },
    )


def _report(ticket, kind, text='', pr=None):
    return Event('report', {'ticket': ticket, 'kind': kind, 'text': text, 'pr': pr})


def _pr(ticket, pr_id, state):
    return Event('pr', {'ticket': ticket, 'pr': pr_id, 'state': state})


def _tick():
    return Event('tick', {})


SCENARIOS = (
    Scenario(
        id='explicit-request',
        title='名单内点名：从 Issue 评论到合并',
        summary='一个人点名 Agent 请求修改，工单建立、执行、审阅、合并结束。',
        policy=_policy(),
        events=(
            _trigger('t1', 'issue-12', 'alice', 'The login redirect loops on Safari.', addressed=True),
            _report('t-001', 'progress', 'reproduced on main'),
            _report('t-001', 'ready', 'opened pull request #31', pr=31),
            _trigger('t2', 'issue-12', 'alice', 'Please also cover the logout case.'),
            _report('t-001', 'ready', 'updated pull request #31', pr=31),
            _pr('t-001', 31, 'merged'),
        ),
        expected='1 ticket, ended; 1 ack; no Eval after the follow-up',
    ),
    Scenario(
        id='noise-filter',
        title='噪声：什么在进入领域之前就被丢掉了',
        summary='自身消息、未登记的机器人、名单外的人与 CI，各自停在不同层。',
        policy=_policy(mode='off', rules=('fix-ci',)),
        events=(
            _trigger('n1', 'issue-9', 'dsh-superagent[bot]', 'my own comment', addressed=True, bot=True),
            _trigger('n2', 'issue-9', 'dependabot[bot]', 'bump lodash', addressed=True, bot=True),
            _trigger('n3', 'issue-9', 'mallory', 'hello there'),
            _trigger('n4', 'issue-9', 'mallory', 'please fix this', addressed=True),
            _trigger('n5', 'issue-9', '', 'CI failed on main', ci=True),
            _trigger('n6', 'issue-9', 'alice', 'just chatting'),
        ),
        expected='0 tickets; every Trigger filtered or not admitted',
    ),
    Scenario(
        id='observe-then-auto',
        title='observe 到 auto：同一条规则，两种结果',
        summary='推断候选在 observe 下只记录 would accept，切到 auto 后才真正接单。',
        policy=_policy(mode='observe', rules=('fix-ci',)),
        events=(
            _trigger('t1', 'issue-7', 'dependabot[bot]', 'CI failed on main', addressed=True, bot=True),
            Event('policy', {'policy': _policy(version=2, mode='auto', rules=('fix-ci',)), 'affected': ()}),
            _trigger('t2', 'issue-7', 'dependabot[bot]', 'CI still failing', addressed=True, bot=True),
            _report('t-001', 'ready', 'opened pull request #44', pr=44),
            _pr('t-001', 44, 'merged'),
        ),
        assessments={
            't1': {'positive': True, 'rules': ('fix-ci',)},
            't2': {'positive': True, 'rules': ('fix-ci',)},
        },
        expected='1 ticket, ended; decisions: ignore would-accept then accept',
    ),
    Scenario(
        id='duplicate-accept',
        title='重复：同一个 Trigger 只能变成一个工单',
        summary='Source 重复投递同一个事件时，第二次只记 duplicate，不再扇出或接单。',
        policy=_policy(),
        events=(
            _trigger('t1', 'issue-3', 'alice', 'Fix the typo in the footer.', addressed=True),
            _trigger('t1', 'issue-3', 'alice', 'Fix the typo in the footer.', addressed=True),
            _report('t-001', 'ready', 'opened pull request #5', pr=5),
            _pr('t-001', 5, 'merged'),
        ),
        expected='1 ticket, 1 Assignment, 1 ack; second delivery is duplicate',
    ),
    Scenario(
        id='resume-followup',
        title='恢复：结束后再说话，不重新评估',
        summary='合并后的 Thread 上，人的消息沿用同一 Mandate 恢复；范围外的请求才 handback 重评。',
        policy=_policy(),
        events=(
            _trigger('t1', 'issue-8', 'alice', 'The export crashes on large files.', addressed=True),
            _report('t-001', 'ready', 'opened pull request #12', pr=12),
            _pr('t-001', 12, 'merged'),
            _trigger('t2', 'issue-8', 'alice', 'Please also update the docs.'),
            _report('t-001', 'ready', 'opened pull request #13', pr=13),
            _trigger('t3', 'issue-8', 'mallory', 'Please also refactor the billing service.'),
            Event('handback', {'ticket': 't-001', 'trigger': 't3', 'reason': 'outside the Ticket scope'}),
            _pr('t-001', 13, 'merged'),
        ),
        assessments={'t3': {'positive': False, 'reason': 'no enabled rule matched'}},
        expected='1 ticket, resumed once and ended; 1 ignore after handback',
    ),
    Scenario(
        id='policy-change',
        title='策略变更：在办工单收通知，恢复时重校验',
        summary='规则被禁用后，进行中的 Eval 重排，在办工单不停；结束后恢复才被撤销。',
        policy=_policy(mode='auto', rules=('fix-ci', 'fix-bug')),
        events=(
            _trigger('t1', 'issue-2', 'dependabot[bot]', 'CI failed on main', addressed=True, bot=True),
            _report('t-001', 'progress', 'triaging the failure'),
            _trigger('t2', 'issue-3', 'dependabot[bot]', 'CI failed on another branch', addressed=True, bot=True),
            Event(
                'policy',
                {
                    'policy': _policy(version=2, mode='auto', rules=('fix-bug',)),
                    'affected': ('t-001',),
                },
            ),
            _report('t-001', 'ready', 'opened pull request #20', pr=20),
            _pr('t-001', 20, 'merged'),
            _trigger('t3', 'issue-2', 'mallory', 'Still red?'),
        ),
        assessments={
            '1:t2': {'timeout': True},
            't1': {'positive': True, 'rules': ('fix-ci',)},
            't3': {'positive': False, 'reason': 'no enabled rule matched'},
        },
        expected='1 ticket, ended; policy input delivered; resume revoked; Eval requeued',
    ),
    Scenario(
        id='blocked-recovery',
        title='阻塞与重试：人的一句话怎么把工单拉回 working',
        summary='blocked 后停止自动投递，人的消息唤醒；失败后重试新开 Assignment。',
        policy=_policy(),
        events=(
            _trigger('t1', 'issue-5', 'alice', 'Payments fail for EU cards.', addressed=True),
            _report('t-001', 'progress', 'found the failing branch'),
            _report('t-001', 'blocked', 'need database credentials'),
            _trigger('t2', 'issue-5', 'alice', 'Credentials added, please continue.'),
            _report('t-001', 'failed', 'model provider returned 500'),
            Event('retry', {'ticket': 't-001'}),
            _report('t-001', 'ready', 'opened pull request #9', pr=9),
            _pr('t-001', 9, 'merged'),
        ),
        expected='1 ticket, ended; 3 Assignments; stages blocked -> working -> failed -> working',
    ),
    Scenario(
        id='eval-timeout',
        title='Eval 超时：第三次才记 unavailable',
        summary='两次超时把 Trigger 重新排队，第三次记 unavailable 并留下问题；后来的事件重新开始。',
        policy=_policy(mode='auto', rules=('fix-ci',)),
        events=(
            _trigger('t1', 'issue-1', 'dependabot[bot]', 'CI failed on main', addressed=True, bot=True),
            _tick(),
            _tick(),
            _tick(),
            _tick(),
            _tick(),
            _tick(),
            _trigger('t2', 'issue-1', 'dependabot[bot]', 'CI still failing', addressed=True, bot=True),
            _report('t-001', 'ready', 'opened pull request #7', pr=7),
            _pr('t-001', 7, 'merged'),
        ),
        assessments={
            '1:t1': {'timeout': True},
            't2': {'positive': True, 'rules': ('fix-ci',)},
        },
        expected='1 problem (unavailable); later Trigger accepts; 1 ticket, ended',
    ),
)

BY_ID = {scenario.id: scenario for scenario in SCENARIOS}
