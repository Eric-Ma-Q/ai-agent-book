"""The deterministic first layer of Eval: who may start work, and how strongly.

Only the parts this lab replays are here. In particular a Source's admission
table is reduced to its three cells, and a Deployment's extra rules are absent.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .model import (
    CITE_ACCEPT_MODE,
    CITE_ADMISSION,
    CITE_STRENGTH,
    CITE_TWO_PATHS,
    Policy,
    SourceConfig,
    Trigger,
)


@dataclass(frozen=True)
class GateResult:
    strength: Optional[str]
    basis: str
    reason: str
    source: str

    @property
    def admitted(self) -> bool:
        return self.strength is not None


_NOT_ADMITTED = 'not-admitted'


def _from_cell(cell: str, label: str, policy: Policy) -> GateResult:
    if cell == 'ignore':
        return GateResult(None, _NOT_ADMITTED, '{} cell is ignore'.format(label), CITE_ADMISSION)
    if cell == 'explicit':
        return GateResult('explicit', 'cell', '{} cell is explicit'.format(label), CITE_ADMISSION)
    if policy.accept_mode == 'off':
        return GateResult(
            None, _NOT_ADMITTED, '{} cell is inferred, accept mode is off'.format(label), CITE_ACCEPT_MODE
        )
    return GateResult('inferred', 'cell', '{} cell is inferred'.format(label), CITE_ADMISSION)


def admit(trigger: Trigger, policy: Policy, source: SourceConfig, thread_has_ticket: bool) -> GateResult:
    """Judge one Trigger. A human message delivered to a Ticket never reaches here."""

    if trigger.is_bot:
        if trigger.actor not in source.bots:
            return GateResult(None, _NOT_ADMITTED, 'bot is not on the Source bot list', CITE_ADMISSION)
        if policy.accept_mode == 'off':
            return GateResult(None, _NOT_ADMITTED, 'inferred candidate, accept mode is off', CITE_ACCEPT_MODE)
        return GateResult('inferred', 'bot', 'bot on the bot list', CITE_STRENGTH)

    if trigger.is_ci:
        return _from_cell(source.cell('unlisted_unaddressed'), 'unlisted_unaddressed', policy)

    on_list = trigger.actor in source.allowed

    if on_list and trigger.addressed:
        return GateResult('explicit', 'explicit', 'allowed person addresses the agent', CITE_STRENGTH)

    if thread_has_ticket:
        if on_list:
            return GateResult('explicit', 'followup', 'allowed person follows up on a Thread with a Ticket', CITE_STRENGTH)
        if source.cell('unlisted_addressed') == 'explicit':
            return _from_cell('explicit', 'unlisted_addressed', policy)
        if policy.accept_mode == 'off':
            return GateResult(None, _NOT_ADMITTED, 'inferred follow-up, accept mode is off', CITE_ACCEPT_MODE)
        return GateResult('inferred', 'followup', 'unlisted person follows up on a Thread with a Ticket', CITE_TWO_PATHS)

    if on_list:
        return _from_cell(source.cell('listed_unaddressed'), 'listed_unaddressed', policy)
    if trigger.addressed:
        return _from_cell(source.cell('unlisted_addressed'), 'unlisted_addressed', policy)
    return _from_cell(source.cell('unlisted_unaddressed'), 'unlisted_unaddressed', policy)
