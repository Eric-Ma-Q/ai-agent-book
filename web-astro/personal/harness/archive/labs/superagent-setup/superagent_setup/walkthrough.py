"""Five phases in order: probe, questions, plan, execute, verify.

The execute phase stops at the first refusal and marks the rest skipped, which
is what the setup flow does: fix the problem, then continue saving.
"""

from __future__ import annotations

from . import questions, status, validation
from .model import Record, Result
from .plan import build_plan
from .probe import probe
from .scenarios import SCENARIOS


def _plan_records(plan):
    labels = (
        ('install', '要装的'),
        ('accounts', '账号与 CLI'),
        ('settings', '要保存的设置'),
        ('operator_steps', '只能人工做的'),
        ('defaults', '默认值'),
    )
    return [
        Record('plan', 'plan.' + key, 'info', '计划·{}：{} 条'.format(label, len(plan[key])), 'SETUP.md §3')
        for key, label in labels
    ]


def run(scenario_id, answers=None):
    """Run one scenario. ``answers`` overrides the scenario's own answers."""
    if scenario_id not in SCENARIOS:
        raise KeyError('未知道场景：{}'.format(scenario_id))
    scenario = SCENARIOS[scenario_id]
    machine = scenario['machine']

    records = list(probe(machine))
    question_records, resolved = questions.ask(machine, dict(scenario['answers'], **(answers or {})))
    records.extend(question_records)

    plan = build_plan(machine, records, resolved)
    records.extend(_plan_records(plan))

    saved = {}
    stopped = False
    for attempt in scenario['attempts']:
        if stopped:
            records.append(
                Record('execute', attempt.section, 'skipped', '前一段被拒，本段没有提交', 'SETUP.md §4')
            )
            continue
        record = validation.validate(attempt, machine, saved)
        records.append(record)
        if record.status == 'refused':
            stopped = True
        else:
            validation.apply(attempt, record, saved)

    code, reason = status.evaluate(machine, records)
    records.append(
        Record('verify', 'status', 'info', '{} {}：{}'.format(code, status.STATUS_TEXT[code], reason), 'docs/006-deployment.md §5')
    )
    handover = status.handover(resolved)
    if code == 0:
        for line in handover:
            records.append(Record('verify', 'handover', 'info', line, 'SETUP.md §5'))
    return Result(scenario_id, scenario['title'], tuple(records), plan, code, handover)


def to_dict(result):
    """A stable JSON shape: keys sorted, tuples flattened to lists."""
    return {
        'scenario': result.scenario,
        'title': result.title,
        'status': result.status,
        'plan': {key: list(values) for key, values in result.plan.items()},
        'records': [
            {
                'phase': record.phase,
                'key': record.key,
                'status': record.status,
                'message': record.message,
                'source': record.source,
            }
            for record in result.records
        ],
        'handover': list(result.handover),
    }
