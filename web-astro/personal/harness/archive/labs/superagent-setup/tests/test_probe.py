"""Probe: what holds, what is missing, what only a person can finish."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup.model import Machine
from superagent_setup.probe import install_items, probe


def machine(**overrides):
    base = dict(
        node='22.19.0',
        pnpm='11.7.0',
        git='2.39.5',
        tmux='3.4',
        python3='3.12.4',
        gh='2.62.0',
        dsh='0.2.1-rc.3',
        gh_login='ops-agent',
    )
    base.update(overrides)
    return Machine(**base)


def by_key(records):
    return {record.key: record for record in records}


class TestProbe(unittest.TestCase):
    def test_clean_machine_passes_every_tool(self):
        records = probe(machine())
        missing = [record.key for record in records if record.status == 'missing']
        self.assertEqual(missing, [])
        self.assertEqual(by_key(records)['node'].status, 'pass')
        self.assertEqual(by_key(records)['dsh'].status, 'pass')

    def test_missing_tools_become_install_items(self):
        records = probe(machine(tmux=None, pnpm=None, dsh=None))
        self.assertEqual(by_key(records)['tmux'].status, 'missing')
        items = install_items(records)
        self.assertEqual(len(items), 3)
        self.assertTrue(any('tmux' in item for item in items))
        self.assertTrue(any('dsh' in item.lower() or 'DSH' in item for item in items))

    def test_version_mismatch_counts_as_missing(self):
        records = probe(machine(node='20.11.0', git='2.30.0', gh='2.46.0', dsh='0.3.0'))
        keys = [record.key for record in records if record.status == 'missing']
        self.assertEqual(keys, ['node', 'git', 'gh', 'dsh'])

    def test_unlogged_cli_blocks_and_names_the_step(self):
        record = by_key(probe(machine(gh_login=None)))['gh_login']
        self.assertEqual(record.status, 'blocked')
        self.assertIn('gh-agent auth login', record.message)

    def test_profile_and_lark_are_information_only(self):
        records = probe(machine(profile_has_plugin=True))
        self.assertEqual(by_key(records)['profile'].status, 'info')
        self.assertIn('--from-default-profile', by_key(records)['profile'].message)
        self.assertEqual(by_key(records)['lark_cli'].status, 'info')

    def test_foreign_worker_bin_blocks(self):
        record = by_key(probe(machine(foreign_worker_files=('gh',))))['worker_bin']
        self.assertEqual(record.status, 'blocked')
        self.assertIn('gh', record.message)

    def test_newer_database_blocks(self):
        record = by_key(probe(machine(db_schema=12)))['db_schema']
        self.assertEqual(record.status, 'blocked')
        self.assertIn('旧版本无法打开', record.message)

    def test_every_record_carries_a_source(self):
        for record in probe(machine()):
            self.assertTrue(record.source.startswith('SETUP.md §') or record.source.startswith('docs/006-deployment.md §'))
