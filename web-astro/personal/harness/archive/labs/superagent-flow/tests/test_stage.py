"""The stage table, one row at a time."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.model import Assignment, Report, Ticket
from superagent_flow.stage import ticket_stage


def ticket(**overrides):
    base = dict(id='t-001', thread='issue-1', source='github')
    base.update(overrides)
    return Ticket(**base)


def report(kind, tick=2):
    return Report(kind=kind, text=kind, tick=tick)


class StageTests(unittest.TestCase):
    def test_an_ended_ticket_has_no_open_stage(self):
        self.assertEqual(ticket_stage(ticket(state='ended')), 'ended')

    def test_a_stopped_ticket_is_stopped(self):
        self.assertEqual(ticket_stage(ticket(state='stopped')), 'stopped')

    def test_an_undelivered_input_wins_first(self):
        item = ticket(delivery_failed=True, attention='question', reports=[report('ready')])
        self.assertEqual(ticket_stage(item), 'person / delivery')

    def test_an_attention_wins_over_a_ready_report(self):
        item = ticket(attention='which branch?', reports=[report('ready')])
        self.assertEqual(ticket_stage(item), 'person / answer')

    def test_a_ready_report_awaits_review(self):
        item = ticket(reports=[report('ready')], assignments=[Assignment('a-1', 'ended')])
        self.assertEqual(ticket_stage(item), 'person / review')

    def test_blocked_holds_until_a_person_writes(self):
        item = ticket(reports=[report('blocked', tick=3)], last_human_tick=1)
        self.assertEqual(ticket_stage(item), 'person / blocked')

    def test_failed_holds_until_a_person_writes(self):
        item = ticket(reports=[report('failed', tick=3)], last_human_tick=1)
        self.assertEqual(ticket_stage(item), 'person / failed')

    def test_a_person_message_releases_blocked(self):
        item = ticket(
            reports=[report('blocked', tick=3)],
            last_human_tick=4,
            assignments=[Assignment('a-1', 'ended')],
        )
        self.assertEqual(ticket_stage(item), 'idle')

    def test_no_assignment_means_working_queued(self):
        self.assertEqual(ticket_stage(ticket()), 'working / queued')

    def test_a_pending_assignment_is_queued(self):
        item = ticket(assignments=[Assignment('a-1', 'pending')])
        self.assertEqual(ticket_stage(item), 'working / queued')

    def test_a_waiting_report_is_idle(self):
        item = ticket(reports=[report('waiting')], assignments=[Assignment('a-1', 'running')])
        self.assertEqual(ticket_stage(item), 'idle')

    def test_an_ended_assignment_without_a_report_is_idle(self):
        item = ticket(assignments=[Assignment('a-1', 'ended')])
        self.assertEqual(ticket_stage(item), 'idle')

    def test_progress_keeps_the_ticket_working(self):
        item = ticket(reports=[report('progress')], assignments=[Assignment('a-1', 'running')])
        self.assertEqual(ticket_stage(item), 'working')


if __name__ == '__main__':
    unittest.main()
