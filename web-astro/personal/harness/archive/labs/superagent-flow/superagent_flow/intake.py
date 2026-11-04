"""Intake: one Trigger, two paths.

A Trigger fans out to every live Ticket subscribed to its Thread. That delivery
carries no authority and takes no Eval. Everything else queues for Eval on the
Thread, one Eval at a time.
"""

from __future__ import annotations

from .model import Trigger


def fan_out_targets(tickets, thread: str, trigger: Trigger):
    """Tickets that receive this Trigger as context, in creation order."""

    targets = []
    for ticket in tickets:
        if thread not in ticket.subscriptions:
            continue
        if ticket.state == 'stopped':
            continue
        # Bots and CI do not wake an ended Ticket; a person's message may.
        if ticket.state == 'ended' and (trigger.is_bot or trigger.is_ci):
            continue
        targets.append(ticket)
    return targets


def human_message_reaches_ticket(trigger: Trigger, delivered) -> bool:
    return not trigger.is_bot and not trigger.is_ci and bool(delivered)


def needs_eval(trigger: Trigger, delivered) -> bool:
    """Bot messages take the Eval path even when they also reach a Ticket."""

    if trigger.is_bot or trigger.is_ci:
        return True
    return not delivered


def merge_batch(thread) -> tuple:
    """Take the Thread's queued Triggers as one Eval batch."""

    batch = tuple(thread.queue)
    thread.queue = []
    return batch
