"""End to end: the eight scenarios, determinism, citations and the CLI."""

import ast
import contextlib
import io
import json
import os
import pathlib
import re
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from superagent_flow import SCENARIOS, replay, to_dict
from superagent_flow.cli import main
from superagent_flow.stage import ticket_stage

CITATION = re.compile(r'^(docs/00[1-7]-[a-z]+\.md §.+|本实验判断)$')
STAGES = {
    'person / delivery',
    'person / answer',
    'person / review',
    'person / blocked',
    'person / failed',
    'working / queued',
    'idle',
    'working',
    'ended',
    'stopped',
}


def results():
    return {scenario.id: replay(scenario.id) for scenario in SCENARIOS}


class ScenarioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runs = results()

    def test_there_are_eight_scenarios_with_unique_ids(self):
        self.assertEqual(len(SCENARIOS), 8)
        self.assertEqual(len({scenario.id for scenario in SCENARIOS}), 8)

    def test_explicit_request_ends_with_one_ticket_and_one_ack(self):
        result = self.runs['explicit-request']
        self.assertEqual(len(result.tickets), 1)
        self.assertEqual(result.tickets[0].state, 'ended')
        self.assertEqual(len(result.messages), 1)
        self.assertEqual(result.decisions[0].kind, 'accept')
        outcomes = [record.outcome for record in result.records]
        self.assertIn('no-eval', outcomes)
        self.assertEqual(len(result.tickets[0].assignments), 2)

    def test_noise_filter_creates_no_ticket(self):
        result = self.runs['noise-filter']
        self.assertEqual(result.tickets, ())
        self.assertEqual(result.decisions, ())
        outcomes = [record.outcome for record in result.records]
        self.assertIn('filtered', outcomes)
        self.assertIn('not-admitted', outcomes)

    def test_observe_records_would_accept_then_auto_creates_a_ticket(self):
        result = self.runs['observe-then-auto']
        self.assertEqual([item.kind for item in result.decisions], ['ignore', 'accept'])
        self.assertIn('would accept', result.decisions[0].reason)
        ticket = result.tickets[0]
        self.assertEqual(ticket.mandate.strength, 'inferred')
        self.assertEqual(ticket.mandate.basis, 'bot')
        self.assertEqual(ticket.mandate.rules, ('fix-ci',))

    def test_duplicate_delivery_does_not_create_a_second_ticket(self):
        result = self.runs['duplicate-accept']
        self.assertEqual(len(result.tickets), 1)
        self.assertEqual(len(result.tickets[0].assignments), 1)
        outcomes = [record.outcome for record in result.records]
        self.assertIn('duplicate', outcomes)
        self.assertEqual(len(result.messages), 1)

    def test_resume_skips_eval_and_handback_reassesses(self):
        result = self.runs['resume-followup']
        outcomes = [record.outcome for record in result.records]
        self.assertIn('resumed', outcomes)
        self.assertIn('no-eval', outcomes)
        self.assertIn('handback', outcomes)
        self.assertIn('requeued', outcomes)
        self.assertEqual([item.kind for item in result.decisions], ['accept', 'ignore'])
        self.assertEqual(len(result.tickets[0].assignments), 3)

    def test_policy_change_delivers_an_input_and_revokes_on_resume(self):
        result = self.runs['policy-change']
        outcomes = [record.outcome for record in result.records]
        self.assertIn('policy-input', outcomes)
        self.assertIn('discarded', outcomes)
        self.assertIn('revoked', outcomes)
        self.assertEqual(result.tickets[0].state, 'ended')
        self.assertEqual([item.kind for item in result.decisions], ['accept', 'ignore', 'ignore'])

    def test_blocked_ticket_is_woken_and_retried(self):
        result = self.runs['blocked-recovery']
        ticket = result.tickets[0]
        self.assertEqual(len(ticket.assignments), 3)
        outcomes = [record.outcome for record in result.records]
        self.assertIn('blocked', outcomes)
        self.assertIn('woken', outcomes)
        self.assertIn('retried', outcomes)
        self.assertEqual(ticket.state, 'ended')

    def test_eval_timeout_leaves_one_problem_and_a_later_accept(self):
        result = self.runs['eval-timeout']
        self.assertEqual(len(result.problems), 1)
        self.assertEqual([item.kind for item in result.decisions], ['unavailable', 'accept'])
        self.assertEqual(result.tickets[0].state, 'ended')

    def test_every_stage_is_one_of_the_documented_stages(self):
        for result in self.runs.values():
            for ticket in result.tickets:
                self.assertIn(ticket_stage(ticket), STAGES)

    def test_every_record_cites_a_document_section(self):
        for result in self.runs.values():
            for record in result.records:
                self.assertRegex(record.source, CITATION, '{}: {}'.format(result.scenario, record))

    def test_the_same_scenario_produces_byte_identical_json(self):
        for scenario in SCENARIOS:
            first = json.dumps(to_dict(replay(scenario.id)), ensure_ascii=False)
            second = json.dumps(to_dict(replay(scenario.id)), ensure_ascii=False)
            self.assertEqual(first, second, scenario.id)

    def test_a_run_writes_nothing(self):
        here = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)
            try:
                for scenario in SCENARIOS:
                    replay(scenario.id)
                self.assertEqual(os.listdir('.'), [])
            finally:
                os.chdir(here)

    def test_the_package_has_no_network_or_process_imports(self):
        forbidden = {'socket', 'urllib', 'http', 'requests', 'subprocess', 'asyncio'}
        root = pathlib.Path(__file__).resolve().parents[1] / 'superagent_flow'
        for path in sorted(root.glob('*.py')):
            tree = ast.parse(path.read_text(encoding='utf-8'))
            for node in ast.walk(tree):
                names = []
                if isinstance(node, ast.Import):
                    names = [alias.name.split('.')[0] for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and node.module:
                    names = [node.module.split('.')[0]]
                for name in names:
                    self.assertNotIn(name, forbidden, '{} imports {}'.format(path.name, name))


class JsonTests(unittest.TestCase):
    def test_the_json_shape_is_fixed(self):
        payload = to_dict(replay('explicit-request'))
        self.assertEqual(
            list(payload),
            ['scenario', 'title', 'policy', 'records', 'tickets', 'messages', 'problems', 'decisions', 'final'],
        )
        self.assertEqual(
            list(payload['tickets'][0]),
            ['id', 'thread', 'state', 'stage', 'ended_reason', 'mandate', 'inputs', 'assignments', 'prs'],
        )
        self.assertEqual(
            list(payload['records'][0]),
            ['tick', 'phase', 'key', 'outcome', 'detail', 'source'],
        )

    def test_json_is_serialisable(self):
        json.dumps(to_dict(replay('policy-change')), ensure_ascii=False)


class CliTests(unittest.TestCase):
    def run_cli(self, argv):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            code = main(argv)
        return code, buffer.getvalue()

    def test_list_prints_eight_rows(self):
        code, output = self.run_cli(['--list'])
        self.assertEqual(code, 0)
        self.assertEqual(len(output.strip().splitlines()), 8)

    def test_all_prints_one_row_per_scenario(self):
        code, output = self.run_cli(['--all'])
        self.assertEqual(code, 0)
        self.assertEqual(len(output.strip().splitlines()), 8)
        self.assertIn('tickets=0', output)

    def test_scenario_prints_records_and_final(self):
        code, output = self.run_cli(['--scenario', 'explicit-request'])
        self.assertEqual(code, 0)
        self.assertIn('final: tickets=1', output)
        self.assertIn('docs/001-domain.md', output)

    def test_json_flag_prints_structured_output(self):
        code, output = self.run_cli(['--scenario', 'eval-timeout', '--json'])
        self.assertEqual(code, 0)
        payload = json.loads(output)
        self.assertEqual(payload['scenario'], 'eval-timeout')
        self.assertEqual(payload['final'], 'tickets=1 open=0 messages=1 problems=1')

    def test_an_unknown_scenario_exits_two(self):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(io.StringIO()):
            code = main(['--scenario', 'nope'])
        self.assertEqual(code, 2)


if __name__ == '__main__':
    unittest.main()
