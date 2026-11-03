"""Saves and refusals: six rules, each with a fix the reader can act on."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup.model import Attempt, Machine
from superagent_setup.validation import validate

MACHINE = Machine(node='22.19.0', dsh='0.2.1-rc.3', gh='2.62.0', gh_login='ops-agent')
STATE = {'stateDir': '/home/ops/.dsh/state/superagent'}


def check(section, payload, host='127.0.0.1:3082', header=True, machine=MACHINE):
    return validate(Attempt(section, payload, host=host, has_header=header), machine)


class TestRequestShape(unittest.TestCase):
    def test_non_loopback_host_is_refused(self):
        record = check('policy', {'allowed': ['ops-agent']}, host='0.0.0.0:3082')
        self.assertEqual(record.status, 'refused')
        self.assertIn('127.0.0.1', record.message)

    def test_missing_header_is_refused(self):
        record = check('policy', {'allowed': ['ops-agent']}, header=False)
        self.assertEqual(record.status, 'refused')
        self.assertIn('x-orchestrator-request', record.message)

    def test_localhost_is_accepted(self):
        record = check('policy', {'allowed': ['ops-agent']}, host='localhost:3082')
        self.assertEqual(record.status, 'pass')


class TestMachineSettings(unittest.TestCase):
    def test_unknown_key_is_refused(self):
        record = check('machine', {'stateDir': '/srv/state', 'shiny': True})
        self.assertEqual(record.status, 'refused')
        self.assertIn('未知键', record.message)

    def test_relative_state_dir_is_refused(self):
        record = check('machine', {'stateDir': 'state/superagent'})
        self.assertEqual(record.status, 'refused')
        self.assertIn('绝对路径', record.message)

    def test_state_dir_cannot_change_after_install(self):
        record = validate(
            Attempt('machine', {'stateDir': '/srv/other'}),
            MACHINE,
            saved={'stateDir': '/home/ops/.dsh/state/superagent'},
        )
        self.assertEqual(record.status, 'refused')
        self.assertIn('装完不能改', record.message)

    def test_valid_machine_config_passes(self):
        self.assertEqual(check('machine', {'stateDir': '/srv/state'}).status, 'pass')


class TestGithub(unittest.TestCase):
    def test_repository_must_be_owner_name(self):
        for value in ('', 'demo-repo', 'a/b/c'):
            record = check('github', {'repository': value, 'cli': '/usr/local/bin/gh-agent'})
            self.assertEqual(record.status, 'refused', value)

    def test_enterprise_host_is_refused(self):
        record = check(
            'github',
            {'repository': 'acme/toolbox', 'cli': '/usr/local/bin/gh-agent', 'enterpriseHost': 'ghe.acme.com'},
        )
        self.assertEqual(record.status, 'refused')
        self.assertIn('GitHub Enterprise', record.message)

    def test_cli_must_be_absolute(self):
        record = check('github', {'repository': 'acme/toolbox', 'cli': 'gh-agent'})
        self.assertEqual(record.status, 'refused')
        self.assertIn('绝对路径', record.message)

    def test_valid_source_passes(self):
        record = check('github', {'repository': 'acme/toolbox', 'cli': '/usr/local/bin/gh-agent'})
        self.assertEqual(record.status, 'pass')


class TestFeishu(unittest.TestCase):
    def test_missing_lark_cli_degrades_instead_of_failing(self):
        record = check('feishu', {'chats': ['oc_1']})
        self.assertEqual(record.status, 'degraded')
        self.assertIn('GitHub 链路不受影响', record.message)

    def test_with_lark_cli_chats_are_required(self):
        machine = Machine(node='22.19.0', gh='2.62.0', dsh='0.2.1-rc.3', lark_cli='1.0.90')
        record = check('feishu', {'chats': []}, machine=machine)
        self.assertEqual(record.status, 'refused')
        record = check('feishu', {'chats': ['oc_1']}, machine=machine)
        self.assertEqual(record.status, 'pass')


class TestPolicy(unittest.TestCase):
    def test_empty_allowed_list_is_refused(self):
        record = check('policy', {'allowed': []})
        self.assertEqual(record.status, 'refused')
        self.assertIn('至少要有一个允许账号', record.message)

    def test_unknown_accept_mode_is_refused(self):
        record = check('policy', {'allowed': ['ops-agent'], 'accept': 'yolo'})
        self.assertEqual(record.status, 'refused')

    def test_observe_mode_passes(self):
        record = check('policy', {'allowed': ['ops-agent'], 'accept': 'observe'})
        self.assertEqual(record.status, 'pass')


class TestExecutor(unittest.TestCase):
    def test_prepare_command_is_required(self):
        record = check('executor', {'prepare': '', 'maxWorkers': 1})
        self.assertEqual(record.status, 'refused')

    def test_zero_workers_is_refused(self):
        record = check('executor', {'prepare': 'git worktree add ../w', 'maxWorkers': 0})
        self.assertEqual(record.status, 'refused')

    def test_missing_blocked_commands_passes_with_a_warning(self):
        record = check('executor', {'prepare': 'git worktree add ../w', 'maxWorkers': 1})
        self.assertEqual(record.status, 'pass')
        self.assertIn('blockedCommands', record.message)


class TestPrompts(unittest.TestCase):
    def test_commit_author_is_required(self):
        record = check('prompts', {'commit_author': ''})
        self.assertEqual(record.status, 'refused')

    def test_auto_merge_needs_a_merger_cli(self):
        record = check('prompts', {'commit_author': 'ops-agent-bot', 'auto_merge': 'yes'})
        self.assertEqual(record.status, 'refused')
        self.assertIn('不能自己合并', record.message)

    def test_auto_merge_with_merger_passes(self):
        record = check(
            'prompts',
            {'commit_author': 'ops-agent-bot', 'auto_merge': 'yes', 'merger_cli': '/usr/local/bin/gh-merge'},
        )
        self.assertEqual(record.status, 'pass')


class TestFixes(unittest.TestCase):
    def test_every_refusal_names_a_fix(self):
        cases = [
            ('machine', {'stateDir': 'state/x'}),
            ('machine', {'stateDir': '/srv/x', 'shiny': 1}),
            ('github', {'repository': 'broken', 'cli': '/bin/gh'}),
            ('policy', {'allowed': []}),
            ('executor', {'prepare': '', 'maxWorkers': 1}),
            ('prompts', {'commit_author': ''}),
        ]
        for section, payload in cases:
            record = check(section, payload)
            self.assertEqual(record.status, 'refused', section)
            self.assertIn('修法', record.message, section)

    def test_unknown_section_is_refused(self):
        record = check('billing', {})
        self.assertEqual(record.status, 'refused')
