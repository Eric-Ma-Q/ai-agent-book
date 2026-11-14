"""Eval: the judgement on a batch of Triggers.

The model call is scripted by the scenario, so a run is reproducible. What the
module keeps is the part the documents fix: one judgement per enabled rule, a
proactive accept needs at least one match, and accept mode decides what happens
to a positive inferred candidate.
"""

from __future__ import annotations

from dataclasses import dataclass

from .model import Policy

EVAL_TICKS = 2


@dataclass(frozen=True)
class Assessment:
    positive: bool
    rules: tuple
    reason: str


def assess(entry: dict, policy: Policy) -> Assessment:
    """Judge every enabled rule exactly once; only enabled matches count."""

    if entry.get('fail'):
        return Assessment(False, (), 'assessment failed')
    requested = tuple(entry.get('rules', ()))
    matched = tuple(rule for rule in requested if rule in policy.rules)
    if entry.get('positive') and matched:
        return Assessment(True, matched, 'matched rule(s): {}'.format(', '.join(matched)))
    if entry.get('positive'):
        return Assessment(False, (), 'no enabled rule matched')
    return Assessment(False, (), entry.get('reason', 'no enabled rule matched'))


def decide(entry: dict, policy: Policy):
    """Return (kind, rules, reason) for a batch that reached the main Session."""

    if entry.get('decision') == 'stop':
        return 'stop', (), 'a person asked to stop'
    assessment = assess(entry, policy)
    if assessment.positive:
        if policy.accept_mode == 'auto':
            return 'accept', assessment.rules, assessment.reason
        return 'ignore', assessment.rules, assessment.reason + ' (would accept)'
    return 'ignore', (), assessment.reason


def deadline(tick: int) -> int:
    return tick + EVAL_TICKS
