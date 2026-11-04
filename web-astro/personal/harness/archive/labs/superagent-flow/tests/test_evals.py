"""Eval: rule matching, accept mode and the deadline."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.evals import assess, deadline, decide
from superagent_flow.model import Policy


def policy(**overrides):
    base = dict(version=1, accept_mode='auto', rules=('fix-ci', 'fix-bug'), sources=())
    base.update(overrides)
    return Policy(**base)


class AssessTests(unittest.TestCase):
    def test_a_positive_assessment_needs_an_enabled_match(self):
        result = assess({'positive': True, 'rules': ('fix-ci',)}, policy())
        self.assertTrue(result.positive)
        self.assertEqual(result.rules, ('fix-ci',))

    def test_a_disabled_rule_does_not_count(self):
        result = assess({'positive': True, 'rules': ('release',)}, policy())
        self.assertFalse(result.positive)
        self.assertEqual(result.reason, 'no enabled rule matched')

    def test_a_positive_without_rules_is_not_enough(self):
        result = assess({'positive': True}, policy())
        self.assertFalse(result.positive)

    def test_a_negative_assessment_keeps_its_reason(self):
        result = assess({'positive': False, 'reason': 'plain chat'}, policy())
        self.assertFalse(result.positive)
        self.assertEqual(result.reason, 'plain chat')

    def test_a_failed_assessment_is_negative(self):
        result = assess({'fail': True}, policy())
        self.assertFalse(result.positive)
        self.assertEqual(result.reason, 'assessment failed')

    def test_only_enabled_matches_are_recorded(self):
        result = assess({'positive': True, 'rules': ('fix-ci', 'release')}, policy())
        self.assertEqual(result.rules, ('fix-ci',))


class DecideTests(unittest.TestCase):
    def test_auto_accepts_a_positive_inferred_candidate(self):
        kind, rules, _ = decide({'positive': True, 'rules': ('fix-ci',)}, policy())
        self.assertEqual(kind, 'accept')
        self.assertEqual(rules, ('fix-ci',))

    def test_observe_records_would_accept(self):
        kind, rules, reason = decide({'positive': True, 'rules': ('fix-ci',)}, policy(accept_mode='observe'))
        self.assertEqual(kind, 'ignore')
        self.assertEqual(rules, ('fix-ci',))
        self.assertIn('would accept', reason)

    def test_off_still_records_would_accept_if_eval_runs(self):
        kind, _, reason = decide({'positive': True, 'rules': ('fix-ci',)}, policy(accept_mode='off'))
        self.assertEqual(kind, 'ignore')
        self.assertIn('would accept', reason)

    def test_a_negative_assessment_is_ignored(self):
        kind, rules, _ = decide({'positive': False}, policy())
        self.assertEqual(kind, 'ignore')
        self.assertEqual(rules, ())

    def test_a_person_asking_to_stop_becomes_a_stop(self):
        kind, rules, reason = decide({'decision': 'stop'}, policy())
        self.assertEqual(kind, 'stop')
        self.assertEqual(rules, ())
        self.assertIn('stop', reason)

    def test_the_deadline_is_two_ticks(self):
        self.assertEqual(deadline(3), 5)


if __name__ == '__main__':
    unittest.main()
