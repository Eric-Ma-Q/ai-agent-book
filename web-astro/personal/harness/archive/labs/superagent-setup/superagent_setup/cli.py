"""Command line entry: list scenarios, run one, optionally emit JSON."""

from __future__ import annotations

import argparse
import json
import sys

from . import status as status_mod
from .scenarios import SCENARIOS, SCENARIO_ORDER
from .walkthrough import run, to_dict

PHASE_TITLES = (
    ('probe', '探针'),
    ('question', '一问一答'),
    ('plan', '计划'),
    ('execute', '执行'),
    ('verify', '校验'),
)
PLAN_TITLES = (
    ('install', '要装的'),
    ('accounts', '账号与 CLI'),
    ('settings', '要保存的设置'),
    ('operator_steps', '只能人工做的'),
    ('defaults', '默认值'),
)


def _parser():
    parser = argparse.ArgumentParser(
        prog='python3 -m superagent_setup',
        description='离线走一遍 dsh-superagent 的部署流程；不联网、不调模型、不写盘。',
    )
    parser.add_argument('--list', action='store_true', help='列出内置场景')
    parser.add_argument('--scenario', help='要运行的场景 id')
    parser.add_argument('--json', action='store_true', help='输出结构化记录')
    parser.add_argument('--answers', help='用 JSON 文件覆盖场景默认答案')
    return parser


def _list():
    for key in SCENARIO_ORDER:
        scenario = SCENARIOS[key]
        code = _expected_status(key)
        print('{:16} {}  [状态 {}]'.format(key, scenario['title'], code))
        print('{:16} {}'.format('', scenario['summary']))


def _expected_status(key):
    """Status is a property of the scenario, so reading it here is cheap."""
    return run(key).status


def _render(result):
    print('场景 {} · {}'.format(result.scenario, result.title))
    for phase, title in PHASE_TITLES:
        lines = [record for record in result.records if record.phase == phase]
        if not lines:
            continue
        print('')
        print('== {} =='.format(title))
        for record in lines:
            print('[{:8}] {:22} {}（{}）'.format(record.status, record.key, record.message, record.source))
    if result.status == 0:
        print('')
        print('== 交接 ==')
        for line in result.handover:
            print('- {}'.format(line))
    print('')
    print('status={} {}'.format(result.status, status_mod.STATUS_TEXT[result.status]))
    print('exit=0（走查跑完即成功；模拟状态码见上）')


def main(argv=None):
    args = _parser().parse_args(argv)
    if args.list:
        _list()
        return 0
    if not args.scenario:
        _parser().print_usage()
        return 2
    if args.scenario not in SCENARIOS:
        print('未知场景：{}（用 --list 查看）'.format(args.scenario), file=sys.stderr)
        return 2
    answers = None
    if args.answers:
        try:
            with open(args.answers, encoding='utf-8') as handle:
                answers = json.load(handle)
        except (OSError, ValueError) as error:
            print('答案文件读取失败：{}'.format(error), file=sys.stderr)
            return 2
        if not isinstance(answers, dict):
            print('答案文件必须是 JSON 对象', file=sys.stderr)
            return 2
    result = run(args.scenario, answers)
    if args.json:
        print(json.dumps(to_dict(result), ensure_ascii=False, indent=2, sort_keys=True))
    else:
        _render(result)
    return 0
