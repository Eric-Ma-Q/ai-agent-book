"""Questions: fixed order, one recommendation each, skip what does not apply."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup.model import Machine
from superagent_setup.questions import QUESTIONS, ask, defaults


def machine(**overrides):
    base = dict(node='22.19.0', dsh='0.2.1-rc.3', gh_login='ops-agent')
    base.update(overrides)
    return Machine(**base)


def by_key(records):
    return {record.key: record for record in records}


class TestQuestions(unittest.TestCase):
    def test_order_follows_the_document(self):
        self.assertEqual(
            [key for key, _text, _rec, _src in QUESTIONS],
            [
                'q.sources',
                'q.repository',
                'q.agent_account',
                'q.chats',
                'q.allowed',
                'q.allowed_feishu',
                'q.checkout',
                'q.commit_identity',
                'q.auto_merge',
            ],
        )

    def test_github_only_skips_both_feishu_questions(self):
        records, _answers = ask(machine(), {'sources': 'github'})
        self.assertEqual(by_key(records)['q.chats'].status, 'skipped')
        self.assertEqual(by_key(records)['q.allowed_feishu'].status, 'skipped')
        self.assertEqual(by_key(records)['q.sources'].status, 'info')

    def test_feishu_asks_both_feishu_questions(self):
        records, _answers = ask(machine(), {'sources': 'github+feishu', 'chats': ['ops-room']})
        self.assertEqual(by_key(records)['q.chats'].status, 'info')
        self.assertIn('ops-room', by_key(records)['q.chats'].message)

    def test_recommendation_uses_the_probe_login(self):
        records, answers = ask(machine(), {})
        self.assertEqual(answers['allowed'], ['ops-agent'])
        self.assertIn('ops-agent', by_key(records)['q.allowed'].message)
        self.assertEqual(answers['agent_account'], 'ops-agent-agent')

    def test_checkout_defaults_to_the_repository_name(self):
        _records, answers = ask(machine(), {'repository': 'acme/toolbox'})
        self.assertEqual(answers['checkout'], '~/src/toolbox')

    def test_operator_answers_win(self):
        _records, answers = ask(
            machine(),
            {
                'repository': 'acme/toolbox',
                'agent_account': 'acme-bot',
                'commit_identity': 'acme-bot',
                'auto_merge': 'yes',
                'checkout': '/srv/toolbox',
            },
        )
        self.assertEqual(answers['repository'], 'acme/toolbox')
        self.assertEqual(answers['agent_account'], 'acme-bot')
        self.assertEqual(answers['auto_merge'], 'yes')
        self.assertEqual(answers['checkout'], '/srv/toolbox')

    def test_missing_login_falls_back_to_placeholders(self):
        answers = defaults(machine(gh_login=None), {})
        self.assertEqual(answers['allowed'], [])
        self.assertEqual(answers['agent_account'], 'agent-account')
