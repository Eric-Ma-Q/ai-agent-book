"""Command line: list, replay one scenario, or summarise all of them."""

from __future__ import annotations

import argparse
import json
import sys

from . import replay, to_dict
from .scenarios import SCENARIOS
from .stage import ticket_stage


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='superagent_flow',
        description='Replay one message through the dsh-superagent flow, offline.',
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--list', action='store_true', help='list the eight scenarios')
    group.add_argument('--scenario', metavar='ID', help='replay one scenario')
    group.add_argument('--all', action='store_true', help='one summary line per scenario')
    parser.add_argument('--json', action='store_true', help='print structured JSON')
    return parser


def render_list() -> str:
    lines = []
    for scenario in SCENARIOS:
        lines.append('{:<20} {:<38} {}'.format(scenario.id, scenario.expected, scenario.title))
    return '\n'.join(lines)


def render_result(result) -> str:
    lines = [
        'scenario: {} — {}'.format(result.scenario, result.title),
        'policy: v{} {} rules={} (final)'.format(
            result.policy.version,
            result.policy.accept_mode,
            ','.join(result.policy.rules) or '-',
        ),
        '',
    ]
    for record in result.records:
        lines.append(
            ' {:03d} {:<10} {:<18} {:<14} {}  [{}]'.format(
                record.tick,
                record.phase,
                record.key,
                record.outcome,
                record.detail,
                record.source,
            )
        )
    lines.append('')
    for ticket in result.tickets:
        lines.append(
            'ticket {}: {} / {} / assignments={} / mandate={}'.format(
                ticket.id,
                ticket.state,
                ticket_stage(ticket),
                len(ticket.assignments),
                'v{} {}'.format(ticket.mandate.policy_version, ticket.mandate.strength)
                if ticket.mandate
                else 'revoked',
            )
        )
    if result.problems:
        for problem in result.problems:
            lines.append('problem: {} — {}'.format(problem['thread'], problem['reason']))
    lines.append('final: {}'.format(result.final))
    return '\n'.join(lines)


def render_all(results) -> str:
    lines = []
    for result in results:
        lines.append('{:<20} {:<52} {}'.format(result.scenario, result.final, result.title))
    return '\n'.join(lines)


def main(argv=None) -> int:
    args = _parser().parse_args(argv)

    if args.list:
        print(render_list())
        return 0

    if args.all:
        results = [replay(scenario.id) for scenario in SCENARIOS]
        if args.json:
            print(json.dumps([to_dict(result) for result in results], ensure_ascii=False, indent=2))
        else:
            print(render_all(results))
        return 0

    try:
        result = replay(args.scenario)
    except KeyError:
        print('unknown scenario: {}'.format(args.scenario), file=sys.stderr)
        print('available: {}'.format(', '.join(item.id for item in SCENARIOS)), file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(to_dict(result), ensure_ascii=False, indent=2))
    else:
        print(render_result(result))
    return 0
