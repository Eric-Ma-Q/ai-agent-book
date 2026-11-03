"""Version rules behind the probe: boundaries and the dsh caret range."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_setup import versions


class TestParse(unittest.TestCase):
    def test_parses_release_and_prerelease(self):
        self.assertEqual(versions.parse_version('22.19.0'), (22, 19, 0, None))
        self.assertEqual(versions.parse_version('0.2.1-rc.3'), (0, 2, 1, 'rc.3'))
        self.assertEqual(versions.parse_version('v24.1.0'), (24, 1, 0, None))

    def test_rejects_garbage_and_empty(self):
        for value in ('', None, 'twenty-two', '22', '22.19'):
            self.assertIsNone(versions.parse_version(value), value)


class TestOrdering(unittest.TestCase):
    def test_prerelease_sorts_before_release(self):
        self.assertLess(versions.compare(versions.parse_version('0.2.1-alpha.2'), versions.parse_version('0.2.1')), 0)

    def test_prerelease_identifiers(self):
        pairs = [
            ('0.2.1-alpha.1', '0.2.1-alpha.2'),
            ('0.2.1-alpha.2', '0.2.1-alpha.2.1'),
            ('0.2.1-alpha.2', '0.2.1-rc.1'),
            ('0.2.1-rc.3', '0.2.1'),
        ]
        for lower, higher in pairs:
            self.assertLess(
                versions.compare(versions.parse_version(lower), versions.parse_version(higher)),
                0,
                '{} < {}'.format(lower, higher),
            )


class TestNode(unittest.TestCase):
    def test_22_19_is_the_floor(self):
        self.assertFalse(versions.node_ok('22.18.9'))
        self.assertTrue(versions.node_ok('22.19.0'))
        self.assertTrue(versions.node_ok('22.20.1'))

    def test_odd_major_23_does_not_pass(self):
        self.assertFalse(versions.node_ok('23.0.0'))

    def test_24_and_later_pass(self):
        self.assertTrue(versions.node_ok('24.0.0'))
        self.assertTrue(versions.node_ok('24.10.2'))

    def test_missing_version_fails(self):
        self.assertFalse(versions.node_ok(None))


class TestOtherTools(unittest.TestCase):
    def test_git_floor(self):
        self.assertFalse(versions.git_ok('2.31.9'))
        self.assertTrue(versions.git_ok('2.32.0'))

    def test_gh_floor(self):
        self.assertFalse(versions.gh_ok('2.47.9'))
        self.assertTrue(versions.gh_ok('2.48.0'))

    def test_python_floor(self):
        self.assertFalse(versions.python_ok('3.7.9'))
        self.assertTrue(versions.python_ok('3.8.0'))


class TestDshRange(unittest.TestCase):
    def test_accepts_versions_inside_the_caret_range(self):
        for value in ('0.2.1-alpha.2', '0.2.1-rc.3', '0.2.1', '0.2.9'):
            self.assertTrue(versions.dsh_ok(value), value)

    def test_rejects_outside_the_caret_range(self):
        for value in ('0.2.1-alpha.1', '0.1.9', '0.3.0', None, '1.0.0'):
            self.assertFalse(versions.dsh_ok(value), value)
