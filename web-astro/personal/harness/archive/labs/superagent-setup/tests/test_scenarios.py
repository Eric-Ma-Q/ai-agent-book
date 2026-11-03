"""End to end: six scenarios, determinism, no side effects, honest sources."""

import json
import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup import SCENARIO_ORDER, SCENARIOS, run, to_dict

PACKAGE = pathlib.Path(__file__).resolve().parents[1] / 'superagent_setup'


def codes():
    return {key: run(key).status for key in SCENARIO_ORDER}


class TestScenarios(unittest.TestCase):
    def test_six_scenarios_are_listed(self):
        self.assertEqual(
            SCENARIO_ORDER,
            ('clean', 'missing-tools', 'existing-profile', 'bad-config', 'thin-policy', 'feishu-no-lark'),
        )
        self.assertEqual(set(SCENARIOS), set(SCENARIO_ORDER))

    def test_status_codes_match_the_story(self):
        self.assertEqual(
            codes(),
            {
                'clean': 0,
                'missing-tools': 1,
                'existing-profile': 0,
                'bad-config': 3,
                'thin-policy': 3,
                'feishu-no-lark': 2,
            },
        )

    def test_clean_run_ends_with_handover(self):
        result = run('clean')
        handover = [record for record in result.records if record.key == 'handover']
        self.assertEqual(len(handover), 3)
        self.assertIn('127.0.0.1:3082', handover[0].message)

    def test_no_handover_while_setup_is_incomplete(self):
        for key in ('bad-config', 'thin-policy', 'missing-tools', 'feishu-no-lark'):
            keys = [record.key for record in run(key).records]
            self.assertNotIn('handover', keys, key)

    def test_a_refusal_skips_every_later_save(self):
        result = run('bad-config')
        skipped = [record for record in result.records if record.status == 'skipped' and record.phase == 'execute']
        self.assertEqual(len(skipped), 4)
        self.assertTrue(all(record.phase == 'execute' for record in skipped))

    def test_feishu_degrades_but_github_still_saves(self):
        result = run('feishu-no-lark')
        statuses = {record.key: record.status for record in result.records if record.phase == 'execute'}
        self.assertEqual(statuses['feishu'], 'degraded')
        self.assertEqual(statuses['github'], 'pass')
        self.assertEqual(statuses['policy'], 'pass')

    def test_existing_profile_never_recreates(self):
        result = run('existing-profile')
        self.assertFalse(any(line.startswith('创建 profile：') for line in result.plan['install']))

    def test_answers_override_changes_the_plan(self):
        result = run('clean', {'repository': 'acme/toolbox', 'auto_merge': 'yes'})
        self.assertTrue(any('acme/toolbox' in line for line in result.plan['settings']))
        self.assertTrue(any('可以合并的账号' in line for line in result.plan['accounts']))

    def test_unknown_scenario_raises(self):
        with self.assertRaises(KeyError):
            run('nope')


class TestDeterminism(unittest.TestCase):
    def test_two_runs_are_byte_identical(self):
        for key in SCENARIO_ORDER:
            first = json.dumps(to_dict(run(key)), ensure_ascii=False, sort_keys=True)
            second = json.dumps(to_dict(run(key)), ensure_ascii=False, sort_keys=True)
            self.assertEqual(first, second, key)

    def test_a_run_writes_nothing(self):
        before = os.getcwd()
        workdir = tempfile.mkdtemp(prefix='superagent-setup-')
        try:
            os.chdir(workdir)
            for key in SCENARIO_ORDER:
                run(key)
            self.assertEqual(os.listdir(workdir), [])
        finally:
            os.chdir(before)
            os.rmdir(workdir)

    def test_json_shape_is_stable(self):
        payload = to_dict(run('clean'))
        self.assertEqual(
            sorted(payload),
            ['handover', 'plan', 'records', 'scenario', 'status', 'title'],
        )
        self.assertEqual(sorted(payload['plan']), ['accounts', 'defaults', 'install', 'operator_steps', 'settings'])
        for record in payload['records']:
            self.assertEqual(sorted(record), ['key', 'message', 'phase', 'source', 'status'])


class TestSourceDiscipline(unittest.TestCase):
    ALLOWED = ('SETUP.md §', 'docs/006-deployment.md §', '本实验判断')

    def test_every_record_names_a_document_section(self):
        for key in SCENARIO_ORDER:
            for record in run(key).records:
                self.assertTrue(record.source.startswith(self.ALLOWED), '{}: {}'.format(key, record.source))

    def test_package_does_not_reach_the_network(self):
        for path in sorted(PACKAGE.glob('*.py')):
            text = path.read_text(encoding='utf-8')
            for needle in ('import socket', 'import urllib', 'import requests', 'http.client'):
                self.assertNotIn(needle, text, path.name)

    def test_package_does_not_write_files(self):
        for path in sorted(PACKAGE.glob('*.py')):
            if path.name == 'cli.py':
                continue  # cli.py opens the operator's answers file, read-only
            text = path.read_text(encoding='utf-8')
            self.assertNotIn('open(', text, path.name)
            self.assertNotIn('write_text', text, path.name)


if __name__ == '__main__':
    unittest.main()
