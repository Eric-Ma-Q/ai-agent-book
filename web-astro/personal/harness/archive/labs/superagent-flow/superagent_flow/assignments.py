"""Assignments and their Reports.

An Assignment goes pending -> running -> ended independently of its Ticket.
Only the final Report may end a Ticket from the Executor's side.
"""

from __future__ import annotations

from .model import Assignment, Report, Ticket
from .stage import ticket_stage


def start(ticket: Ticket) -> Assignment:
    """Create the next Assignment for a Ticket and run it immediately."""

    number = len(ticket.assignments) + 1
    assignment = Assignment(
        id='a-{}-{}'.format(ticket.id.split('-')[-1], number),
        state='pending',
    )
    ticket.assignments.append(assignment)
    assignment.state = 'running'
    return assignment


def can_retry(ticket: Ticket) -> bool:
    return ticket_stage(ticket) in ('person / delivery', 'person / blocked', 'person / failed')


def apply_report(ticket: Ticket, report: Report) -> None:
    """Record a Report and settle the Assignment it came from."""

    ticket.reports.append(report)
    if not ticket.assignments:
        return
    assignment = ticket.assignments[-1]
    if assignment.state == 'ended':
        return
    if report.kind in ('ready', 'blocked', 'failed', 'dropped'):
        assignment.state = 'ended'
        assignment.ended_reason = report.kind
    else:
        assignment.state = 'running'
