"""The stage table from docs/003-execution.md, first matching row wins."""

from __future__ import annotations

from .model import Ticket


def ticket_stage(ticket: Ticket) -> str:
    if ticket.state == 'stopped':
        return 'stopped'
    if ticket.state == 'ended':
        return 'ended'

    last_report = ticket.reports[-1] if ticket.reports else None

    if ticket.delivery_failed:
        return 'person / delivery'
    if ticket.attention:
        return 'person / answer'
    if last_report is not None and last_report.kind == 'ready':
        return 'person / review'
    if (
        last_report is not None
        and last_report.kind in ('blocked', 'failed')
        and ticket.last_human_tick <= last_report.tick
    ):
        return 'person / {}'.format(last_report.kind)

    last_assignment = ticket.assignments[-1] if ticket.assignments else None
    if last_assignment is None or last_assignment.state == 'pending':
        return 'working / queued'
    if (last_report is not None and last_report.kind == 'waiting') or last_assignment.state == 'ended':
        return 'idle'
    return 'working'
