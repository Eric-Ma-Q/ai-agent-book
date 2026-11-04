"""Tickets, Mandates, resume, revalidation and stop.

A Ticket is a unit of authorized work. Its Mandate is immutable; only a person's
stop withdraws it, and failed revalidation revokes it before a resume.
"""

from __future__ import annotations

from .model import CITE_REVALIDATION, CITE_RESUME, Mandate, Policy, SourceConfig, Ticket, Trigger


def create(ticket_id: str, thread: str, trigger: Trigger, strength: str, basis: str, rules, policy: Policy) -> Ticket:
    mandate = Mandate(
        policy_version=policy.version,
        strength=strength,
        basis=basis,
        rules=tuple(rules),
        sender=trigger.actor,
        source=trigger.source,
        scope=thread,
    )
    ticket = Ticket(
        id=ticket_id,
        thread=thread,
        source=trigger.source,
        mandate=mandate,
        origin=trigger.id,
    )
    ticket.subscriptions.append(thread)
    ticket.inputs.append(trigger.id)
    return ticket


def end(ticket: Ticket, reason: str) -> None:
    ticket.state = 'ended'
    ticket.ended_reason = reason
    if ticket.assignments and ticket.assignments[-1].state != 'ended':
        ticket.assignments[-1].state = 'ended'
        ticket.assignments[-1].ended_reason = 'ticket ended'


def stop(ticket: Ticket) -> None:
    ticket.state = 'stopped'
    ticket.ended_reason = 'stopped by a person'


def _rules_enabled(mandate: Mandate, policy: Policy) -> bool:
    return all(rule in policy.rules for rule in mandate.rules)


def revalidate(ticket: Ticket, policy: Policy, source: SourceConfig):
    """Return (ok, reason). Called only before resuming an ended Ticket."""

    mandate = ticket.mandate
    if mandate is None:
        return False, 'no Mandate'
    if ticket.thread not in ticket.subscriptions:
        return False, 'the Source no longer listens to the Thread'
    if not source.listening:
        return False, 'the Source is off'

    if mandate.basis in ('explicit', 'followup'):
        return True, 'explicit follow-up Mandate passes'

    if mandate.basis == 'bot':
        if mandate.sender not in source.bots:
            return False, 'the bot left the Source bot list'
        if policy.accept_mode != 'auto':
            return False, 'accept mode is no longer auto'
        if not _rules_enabled(mandate, policy):
            return False, 'a matched rule is no longer enabled'
        return True, 'bot Mandate still holds'

    if mandate.basis == 'cell':
        cell = source.cell('unlisted_addressed')
        if mandate.strength == 'explicit' and cell != 'explicit':
            return False, 'the admission cell no longer grants explicit strength'
        if mandate.strength == 'inferred' and policy.accept_mode != 'auto':
            return False, 'accept mode is no longer auto'
        if not _rules_enabled(mandate, policy):
            return False, 'a matched rule is no longer enabled'
        return True, 'admission cell Mandate still holds'

    if mandate.basis == 'inferred':
        if mandate.sender not in source.allowed:
            return False, 'the sender left the allowed list'
        if policy.accept_mode != 'auto':
            return False, 'accept mode is no longer auto'
        if not _rules_enabled(mandate, policy):
            return False, 'a matched rule is no longer enabled'
        return True, 'inferred Mandate still holds'

    if mandate.sender not in source.allowed:
        return False, 'the sender left the allowed list'
    return True, 'Mandate still holds'


def resume(ticket: Ticket, trigger: Trigger, policy: Policy, source: SourceConfig, tick: int):
    """Resume an ended Ticket without a new Eval or Decision."""

    if ticket.state != 'ended':
        return False, 'the Ticket is not ended', CITE_RESUME
    if ticket.ended_reason == 'stopped by a person':
        return False, 'the Ticket was stopped', CITE_RESUME
    if trigger.is_bot or trigger.is_ci:
        return False, 'bots and CI do not wake an ended Ticket', CITE_RESUME

    ok, reason = revalidate(ticket, policy, source)
    if not ok:
        return False, reason, CITE_REVALIDATION

    ticket.state = 'open'
    ticket.ended_reason = None
    ticket.inputs.append(trigger.id)
    ticket.last_human_tick = tick
    return True, reason, CITE_RESUME
