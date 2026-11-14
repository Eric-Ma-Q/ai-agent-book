"""Gate: who may start work, and how strongly."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.gate import admit
from superagent_flow.model import Policy, SourceConfig, Trigger


def source(**overrides):
    base = dict(
        id='github',
        kind='github',
        allowed=('alice',),
        bots=('dependabot[bot]',),
    )
    base.update(overrides)
    return SourceConfig(**base)


def policy(**overrides):
    base = dict(version=1, accept_mode='observe', rules=('fix-bug',), sources=(source(),))
    base.update(overrides)
    return Policy(**base)


def trigger(**overrides):
    base = dict(
        id='t1',
        source='github',
        thread='issue-1',
        actor='alice',
        text='fix this',
        addressed=True,
    )
    base.update(overrides)
    return Trigger(**base)


class GateTests(unittest.TestCase):
    def test_allowed_person_who_addresses_the_agent_is_explicit(self):
        result = admit(trigger(), policy(), source(), thread_has_ticket=False)
        self.assertEqual(result.strength, 'explicit')
        self.assertEqual(result.basis, 'explicit')
        self.assertIn('docs/002-authorization.md', result.source)

    def test_allowed_person_without_a_mention_uses_the_admission_cell(self):
        result = admit(trigger(addressed=False), policy(), source(), thread_has_ticket=False)
        self.assertEqual(result.strength, 'inferred')
        self.assertEqual(result.basis, 'cell')

    def test_a_cell_set_to_ignore_blocks_the_message(self):
        source_config = source(admission=(('listed_unaddressed', 'ignore'),))
        result = admit(trigger(addressed=False), policy(), source_config, thread_has_ticket=False)
        self.assertFalse(result.admitted)
        self.assertEqual(result.reason, 'listed_unaddressed cell is ignore')

    def test_unlisted_person_who_addresses_the_agent_is_ignored_by_default(self):
        result = admit(trigger(actor='mallory'), policy(), source(), thread_has_ticket=False)
        self.assertFalse(result.admitted)

    def test_an_explicit_cell_admits_an_unlisted_person(self):
        source_config = source(admission=(('unlisted_addressed', 'explicit'),))
        result = admit(trigger(actor='mallory'), policy(), source_config, thread_has_ticket=False)
        self.assertEqual(result.strength, 'explicit')
        self.assertEqual(result.basis, 'cell')

    def test_an_inferred_cell_admits_an_unlisted_person_as_a_candidate(self):
        source_config = source(admission=(('unlisted_addressed', 'inferred'),))
        result = admit(trigger(actor='mallory'), policy(), source_config, thread_has_ticket=False)
        self.assertEqual(result.strength, 'inferred')

    def test_unlisted_unaddressed_defaults_to_ignore(self):
        result = admit(trigger(actor='mallory', addressed=False), policy(), source(), thread_has_ticket=False)
        self.assertFalse(result.admitted)

    def test_a_follow_up_from_an_allowed_person_is_explicit(self):
        result = admit(trigger(addressed=False), policy(), source(), thread_has_ticket=True)
        self.assertEqual(result.strength, 'explicit')
        self.assertEqual(result.basis, 'followup')

    def test_an_unlisted_follow_up_is_inferred(self):
        result = admit(trigger(actor='mallory', addressed=False), policy(), source(), thread_has_ticket=True)
        self.assertEqual(result.strength, 'inferred')
        self.assertEqual(result.basis, 'followup')

    def test_an_explicit_cell_can_upgrade_an_unlisted_follow_up(self):
        source_config = source(admission=(('unlisted_addressed', 'explicit'),))
        result = admit(trigger(actor='mallory'), policy(), source_config, thread_has_ticket=True)
        self.assertEqual(result.strength, 'explicit')

    def test_off_mode_turns_an_inferred_follow_up_away(self):
        result = admit(
            trigger(actor='mallory', addressed=False),
            policy(accept_mode='off'),
            source(),
            thread_has_ticket=True,
        )
        self.assertFalse(result.admitted)
        self.assertIn('accept mode is off', result.reason)

    def test_a_listed_bot_produces_an_inferred_candidate(self):
        result = admit(trigger(actor='dependabot[bot]', is_bot=True), policy(), source(), thread_has_ticket=False)
        self.assertEqual(result.strength, 'inferred')
        self.assertEqual(result.basis, 'bot')

    def test_an_unlisted_bot_is_not_admitted(self):
        result = admit(trigger(actor='renovate[bot]', is_bot=True), policy(), source(), thread_has_ticket=False)
        self.assertFalse(result.admitted)

    def test_off_mode_also_refuses_a_listed_bot(self):
        result = admit(
            trigger(actor='dependabot[bot]', is_bot=True),
            policy(accept_mode='off'),
            source(),
            thread_has_ticket=False,
        )
        self.assertFalse(result.admitted)

    def test_ci_uses_the_last_cell_and_has_no_sender(self):
        source_config = source(admission=(('unlisted_unaddressed', 'inferred'),))
        result = admit(trigger(actor='', is_ci=True), policy(), source_config, thread_has_ticket=False)
        self.assertEqual(result.strength, 'inferred')

    def test_explicit_requests_work_in_off_mode(self):
        result = admit(trigger(), policy(accept_mode='off'), source(), thread_has_ticket=False)
        self.assertEqual(result.strength, 'explicit')

    def test_inferred_candidates_still_reach_eval_in_observe_mode(self):
        result = admit(trigger(actor='dependabot[bot]', is_bot=True), policy(accept_mode='observe'), source(), False)
        self.assertTrue(result.admitted)


if __name__ == '__main__':
    unittest.main()
