"""Intake: fan-out, duplicate delivery and which messages need an Eval."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.intake import fan_out_targets, merge_batch, needs_eval
from superagent_flow.model import SourceConfig, ThreadState, Ticket, Trigger
from superagent_flow.sources import filter_reason


def ticket(ticket_id='t-001', state='open', thread='issue-1'):
    return Ticket(id=ticket_id, thread=thread, source='github', state=state, subscriptions=[thread])


def trigger(**overrides):
    base = dict(id='t1', source='github', thread='issue-1', actor='alice', text='hi', addressed=True)
    base.update(overrides)
    return Trigger(**base)


class SourceTests(unittest.TestCase):
    def test_the_own_bot_message_never_enters(self):
        reason = filter_reason(
            trigger(actor='dsh-superagent[bot]', is_bot=True),
            SourceConfig(id='github'),
        )
        self.assertIn('own message', reason)

    def test_a_switched_off_source_drops_everything(self):
        reason = filter_reason(trigger(), SourceConfig(id='github', listening=False))
        self.assertEqual(reason, 'Source is off')

    def test_a_trigger_from_another_source_is_out_of_scope(self):
        reason = filter_reason(trigger(source='feishu'), SourceConfig(id='github'))
        self.assertIn('listening scope', reason)

    def test_a_normal_trigger_enters(self):
        self.assertIsNone(filter_reason(trigger(), SourceConfig(id='github')))


class FanOutTests(unittest.TestCase):
    def test_an_open_subscribed_ticket_receives_the_trigger(self):
        targets = fan_out_targets([ticket()], 'issue-1', trigger())
        self.assertEqual([item.id for item in targets], ['t-001'])

    def test_an_unsubscribed_ticket_receives_nothing(self):
        targets = fan_out_targets([ticket(thread='issue-2')], 'issue-1', trigger())
        self.assertEqual(targets, [])

    def test_a_stopped_ticket_receives_nothing(self):
        targets = fan_out_targets([ticket(state='stopped')], 'issue-1', trigger())
        self.assertEqual(targets, [])

    def test_a_person_message_reaches_an_ended_ticket(self):
        targets = fan_out_targets([ticket(state='ended')], 'issue-1', trigger())
        self.assertEqual(len(targets), 1)

    def test_bots_and_ci_do_not_wake_an_ended_ticket(self):
        bot = trigger(is_bot=True, actor='dependabot[bot]')
        ci = trigger(is_ci=True, actor='')
        self.assertEqual(fan_out_targets([ticket(state='ended')], 'issue-1', bot), [])
        self.assertEqual(fan_out_targets([ticket(state='ended')], 'issue-1', ci), [])


class EvalPathTests(unittest.TestCase):
    def test_a_human_message_delivered_to_a_ticket_needs_no_eval(self):
        self.assertFalse(needs_eval(trigger(), [ticket()]))

    def test_a_human_message_that_reached_no_ticket_needs_eval(self):
        self.assertTrue(needs_eval(trigger(), []))

    def test_a_bot_message_takes_the_eval_path_even_when_delivered(self):
        self.assertTrue(needs_eval(trigger(is_bot=True), [ticket()]))

    def test_a_ci_message_always_needs_eval(self):
        self.assertTrue(needs_eval(trigger(is_ci=True), [ticket()]))

    def test_merging_a_batch_clears_the_thread_queue(self):
        thread = ThreadState(key='issue-1', queue=['t1', 't2'])
        self.assertEqual(merge_batch(thread), ('t1', 't2'))
        self.assertEqual(thread.queue, [])


if __name__ == '__main__':
    unittest.main()
