"""Ticket lifecycle: create, end, stop, resume and revalidation."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.model import Assignment, Mandate, Policy, SourceConfig, Ticket, Trigger
from superagent_flow.tickets import create, end, revalidate, resume, stop


def source(**overrides):
    base = dict(id='github', kind='github', allowed=('alice',), bots=('dependabot[bot]',))
    base.update(overrides)
    return SourceConfig(**base)


def policy(**overrides):
    base = dict(version=1, accept_mode='auto', rules=('fix-ci', 'fix-bug'), sources=(source(),))
    base.update(overrides)
    return Policy(**base)


def trigger(**overrides):
    base = dict(id='t1', source='github', thread='issue-1', actor='alice', text='hi', addressed=True)
    base.update(overrides)
    return Trigger(**base)


def ticket(**overrides):
    base = dict(
        id='t-001',
        thread='issue-1',
        source='github',
        mandate=Mandate(1, 'explicit', 'explicit', (), 'alice', 'github', 'issue-1'),
        subscriptions=['issue-1'],
    )
    base.update(overrides)
    return Ticket(**base)


class CreateTests(unittest.TestCase):
    def test_create_records_the_mandate_and_the_origin(self):
        item = create('t-001', 'issue-1', trigger(), 'inferred', 'bot', ('fix-ci',), policy())
        self.assertEqual(item.mandate.strength, 'inferred')
        self.assertEqual(item.mandate.basis, 'bot')
        self.assertEqual(item.mandate.rules, ('fix-ci',))
        self.assertEqual(item.origin, 't1')
        self.assertEqual(item.inputs, ['t1'])
        self.assertEqual(item.subscriptions, ['issue-1'])

    def test_end_marks_the_ticket_and_closes_a_running_assignment(self):
        item = ticket()
        item.assignments.append(Assignment('a-1', 'running'))
        end(item, 'merged')
        self.assertEqual(item.state, 'ended')
        self.assertEqual(item.assignments[0].state, 'ended')

    def test_stop_marks_the_ticket_stopped(self):
        item = ticket()
        stop(item)
        self.assertEqual(item.state, 'stopped')


class RevalidationTests(unittest.TestCase):
    def test_an_explicit_mandate_passes(self):
        ok, reason = revalidate(ticket(), policy(), source())
        self.assertTrue(ok)
        self.assertIn('explicit', reason)

    def test_a_bot_mandate_fails_when_its_rule_is_disabled(self):
        item = ticket(mandate=Mandate(1, 'inferred', 'bot', ('fix-ci',), 'dependabot[bot]', 'github', 'issue-1'))
        ok, reason = revalidate(item, policy(rules=('fix-bug',)), source())
        self.assertFalse(ok)
        self.assertIn('rule', reason)

    def test_a_bot_mandate_fails_when_the_bot_leaves(self):
        item = ticket(mandate=Mandate(1, 'inferred', 'bot', ('fix-ci',), 'dependabot[bot]', 'github', 'issue-1'))
        ok, reason = revalidate(item, policy(), source(bots=()))
        self.assertFalse(ok)
        self.assertIn('bot list', reason)

    def test_a_bot_mandate_fails_when_auto_turns_off(self):
        item = ticket(mandate=Mandate(1, 'inferred', 'bot', ('fix-ci',), 'dependabot[bot]', 'github', 'issue-1'))
        ok, reason = revalidate(item, policy(accept_mode='observe'), source())
        self.assertFalse(ok)
        self.assertIn('auto', reason)

    def test_an_inferred_mandate_fails_when_the_sender_leaves(self):
        item = ticket(mandate=Mandate(1, 'inferred', 'inferred', ('fix-ci',), 'alice', 'github', 'issue-1'))
        ok, reason = revalidate(item, policy(), source(allowed=()))
        self.assertFalse(ok)
        self.assertIn('allowed list', reason)

    def test_a_cell_mandate_fails_when_the_cell_drops(self):
        item = ticket(mandate=Mandate(1, 'explicit', 'cell', ('fix-ci',), 'mallory', 'github', 'issue-1'))
        ok, reason = revalidate(item, policy(), source())
        self.assertFalse(ok)
        self.assertIn('admission cell', reason)

    def test_a_switched_off_source_cannot_resume(self):
        ok, reason = revalidate(ticket(), policy(), source(listening=False))
        self.assertFalse(ok)
        self.assertIn('off', reason)

    def test_a_missing_subscription_cannot_resume(self):
        ok, reason = revalidate(ticket(subscriptions=[]), policy(), source())
        self.assertFalse(ok)
        self.assertIn('listen', reason)


class ResumeTests(unittest.TestCase):
    def test_a_person_message_resumes_an_ended_ticket_without_eval(self):
        item = ticket(state='ended', ended_reason='merged')
        ok, reason, cite = resume(item, trigger(), policy(), source(), 7)
        self.assertTrue(ok)
        self.assertEqual(item.state, 'open')
        self.assertEqual(item.inputs, ['t1'])
        self.assertEqual(item.last_human_tick, 7)
        self.assertIn('Mandate passes', reason)
        self.assertIn('docs/002-authorization.md', cite)

    def test_a_bot_cannot_wake_an_ended_ticket(self):
        item = ticket(state='ended', ended_reason='merged')
        ok, _, _ = resume(item, trigger(is_bot=True), policy(), source(), 7)
        self.assertFalse(ok)
        self.assertEqual(item.state, 'ended')

    def test_a_stopped_ticket_takes_nothing(self):
        item = ticket(state='stopped', ended_reason='stopped by a person')
        ok, _, _ = resume(item, trigger(), policy(), source(), 7)
        self.assertFalse(ok)

    def test_failed_revalidation_keeps_the_ticket_ended(self):
        item = ticket(
            state='ended',
            ended_reason='merged',
            mandate=Mandate(1, 'inferred', 'bot', ('fix-ci',), 'dependabot[bot]', 'github', 'issue-1'),
        )
        ok, reason, cite = resume(item, trigger(actor='mallory'), policy(rules=('fix-bug',)), source(), 7)
        self.assertFalse(ok)
        self.assertEqual(item.state, 'ended')
        self.assertIn('docs/002-authorization.md', cite)


if __name__ == '__main__':
    unittest.main()
