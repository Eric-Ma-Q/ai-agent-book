"""Plan: five parts, the upgrade path, and the defaults nobody is asked about."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup.model import Machine
from superagent_setup.plan import build_plan
from superagent_setup.probe import probe
from superagent_setup.questions import ask

BASE = dict(
    node='22.19.0',
    pnpm='11.7.0',
    git='2.39.5',
    tmux='3.4',
    python3='3.12.4',
    gh='2.62.0',
    dsh='0.2.1-rc.3',
    gh_login='ops-agent',
)


def plan_for(**overrides):
    answers = overrides.pop('answers', {})
    machine = Machine(**dict(BASE, **overrides))
    records = probe(machine)
    _questions, resolved = ask(machine, dict({'repository': 'acme/toolbox'}, **answers))
    return machine, build_plan(machine, records, resolved)


class TestPlan(unittest.TestCase):
    def test_has_five_parts_in_order(self):
        _machine, plan = plan_for()
        self.assertEqual(
            list(plan),
            ['install', 'accounts', 'settings', 'operator_steps', 'defaults'],
        )
        for key, lines in plan.items():
            self.assertTrue(lines, key)

    def test_new_install_creates_the_profile(self):
        _machine, plan = plan_for()
        joined = ' '.join(plan['install'])
        self.assertIn('--from-default-profile', joined)
        self.assertIn('dsh plugin --profile superagent add', joined)

    def test_existing_profile_upgrades_instead_of_recreating(self):
        _machine, plan = plan_for(profile_has_plugin=True)
        joined = ' '.join(plan['install'])
        self.assertFalse(any(line.startswith('创建 profile：') for line in plan['install']))
        self.assertIn('不要跑 dsh superagent --from-default-profile', joined)
        self.assertIn('cordis.patch.yml', joined)

    def test_missing_tools_show_up_in_install(self):
        _machine, plan = plan_for(tmux=None)
        self.assertTrue(any('tmux' in line for line in plan['install']))

    def test_accounts_cover_the_dedicated_identity(self):
        _machine, plan = plan_for()
        joined = ' '.join(plan['accounts'])
        self.assertIn('专用 GitHub 账号', joined)
        self.assertIn('gh-agent auth login', joined)
        self.assertNotIn('飞书', joined)

    def test_auto_merge_needs_a_second_account(self):
        _machine, plan = plan_for(answers={'auto_merge': 'yes'})
        self.assertTrue(any('可以合并的账号' in line for line in plan['accounts']))

    def test_feishu_adds_app_and_settings(self):
        _machine, plan = plan_for(answers={'sources': 'feishu', 'chats': ['ops-room']})
        self.assertTrue(any('自建应用' in line for line in plan['accounts']))
        self.assertTrue(any('feishu 来源' in line for line in plan['settings']))
        self.assertTrue(any('ops-room' in line for line in plan['settings']))

    def test_settings_follow_the_save_order(self):
        _machine, plan = plan_for()
        keys = [line.split('：')[0] for line in plan['settings']]
        self.assertEqual(keys, ['github 来源', 'policy', 'executor', 'prompts'])

    def test_defaults_name_port_mode_and_state_dir(self):
        _machine, plan = plan_for()
        joined = ' '.join(plan['defaults'])
        for needle in ('superagent', '3082', '127.0.0.1', 'stateDir', 'agent/', 'observe', '每小时'):
            self.assertIn(needle, joined)

    def test_unlogged_operator_step_comes_first(self):
        machine = Machine(**dict(BASE, gh_login=None))
        records = probe(machine)
        _questions, resolved = ask(machine, {})
        plan = build_plan(machine, records, resolved)
        self.assertIn('先登录 GitHub CLI', plan['operator_steps'][0])
