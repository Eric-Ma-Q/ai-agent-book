"""Version checks for the prerequisites SETUP.md section 1 lists.

Only the shapes the prototype actually asks for are implemented: a plain
``major.minor.patch`` with an optional prerelease, ordering, a lower bound and
the caret range used by ``engines.dsh``. Tilde ranges, wildcards and ``||``
are out of scope and documented as such in the README.
"""

from __future__ import annotations

import re

_VERSION_RE = re.compile(r'^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$')

# docs/006-deployment.md section 3 and section 2.
NODE_MIN_MINOR = 19
GIT_MIN = '2.32.0'
GH_MIN = '2.48.0'
PYTHON_MIN = '3.8.0'
DSH_RANGE = '0.2.1-alpha.2'


def parse_version(text):
    """Return ``(major, minor, patch, prerelease)`` or ``None``."""
    if not text:
        return None
    match = _VERSION_RE.match(text.strip())
    if not match:
        return None
    major, minor, patch, prerelease = match.groups()
    return (int(major), int(minor), int(patch), prerelease)


def _prerelease_key(prerelease):
    if prerelease is None:
        return None
    parts = []
    for part in prerelease.split('.'):
        if part.isdigit():
            parts.append((0, int(part)))
        else:
            parts.append((1, part))
    return tuple(parts)


def compare(left, right):
    """Compare two parsed versions; returns -1, 0 or 1.

    A prerelease sorts before the release with the same numbers, and
    ``alpha < alpha.1 < rc`` follows the semver ordering rules.
    """
    for index in range(3):
        if left[index] != right[index]:
            return -1 if left[index] < right[index] else 1
    left_pre = _prerelease_key(left[3])
    right_pre = _prerelease_key(right[3])
    if left_pre is None and right_pre is None:
        return 0
    if left_pre is None:
        return 1
    if right_pre is None:
        return -1
    for left_part, right_part in zip(left_pre, right_pre):
        if left_part == right_part:
            continue
        if left_part[0] != right_part[0]:
            # Numeric identifiers sort before alphanumeric ones.
            return -1 if left_part[0] < right_part[0] else 1
        return -1 if left_part[1] < right_part[1] else 1
    if len(left_pre) == len(right_pre):
        return 0
    return -1 if len(left_pre) < len(right_pre) else 1


def at_least(version, minimum):
    parsed = parse_version(version)
    floor = parse_version(minimum)
    if parsed is None or floor is None:
        return False
    return compare(parsed, floor) >= 0


def node_ok(version):
    """Node 22.19+ or 24+; 23.x is not listed, so it does not pass."""
    parsed = parse_version(version)
    if parsed is None:
        return False
    major, minor = parsed[0], parsed[1]
    if major == 22:
        return minor >= NODE_MIN_MINOR
    return major >= 24


def caret_satisfies(version, base):
    """Whether ``version`` falls inside ``^base``.

    ``^0.2.1-alpha.2`` means ``>= 0.2.1-alpha.2`` and ``< 0.3.0``.
    """
    parsed = parse_version(version)
    floor = parse_version(base)
    if parsed is None or floor is None:
        return False
    if compare(parsed, floor) < 0:
        return False
    if floor[0] > 0:
        return parsed[0] == floor[0]
    if floor[1] > 0:
        return parsed[0] == floor[0] and parsed[1] == floor[1]
    return parsed[:3] == floor[:3]


def dsh_ok(version):
    return caret_satisfies(version, DSH_RANGE)


def python_ok(version):
    return at_least(version, PYTHON_MIN)


def git_ok(version):
    return at_least(version, GIT_MIN)


def gh_ok(version):
    return at_least(version, GH_MIN)
