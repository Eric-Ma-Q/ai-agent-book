"""Offline replay of dsh-superagent's flow, from Trigger to Channel."""

from __future__ import annotations

from .engine import Engine
from .scenarios import BY_ID, SCENARIOS
from .stage import ticket_stage


def replay(scenario_id: str):
    scenario = BY_ID.get(scenario_id)
    if scenario is None:
        raise KeyError(scenario_id)
    return Engine(scenario).run()


def to_dict(result) -> dict:
    tickets = []
    for ticket in result.tickets:
        mandate = None
        if ticket.mandate is not None:
            mandate = {
                'policy_version': ticket.mandate.policy_version,
                'strength': ticket.mandate.strength,
                'basis': ticket.mandate.basis,
                'rules': list(ticket.mandate.rules),
                'sender': ticket.mandate.sender,
                'source': ticket.mandate.source,
                'scope': ticket.mandate.scope,
            }
        tickets.append(
            {
                'id': ticket.id,
                'thread': ticket.thread,
                'state': ticket.state,
                'stage': ticket_stage(ticket),
                'ended_reason': ticket.ended_reason,
                'mandate': mandate,
                'inputs': list(ticket.inputs),
                'assignments': [
                    {'id': item.id, 'state': item.state, 'ended_reason': item.ended_reason}
                    for item in ticket.assignments
                ],
                'prs': [dict(pr) for pr in ticket.prs],
            }
        )
    return {
        'scenario': result.scenario,
        'title': result.title,
        'policy': {
            'version': result.policy.version,
            'accept_mode': result.policy.accept_mode,
            'rules': list(result.policy.rules),
        },
        'records': [
            {
                'tick': record.tick,
                'phase': record.phase,
                'key': record.key,
                'outcome': record.outcome,
                'detail': record.detail,
                'source': record.source,
            }
            for record in result.records
        ],
        'tickets': tickets,
        'messages': [
            {
                'ticket': message.ticket,
                'conversation': message.conversation,
                'kind': message.kind,
                'text': message.text,
                'state': message.state,
                'tick': message.tick,
            }
            for message in result.messages
        ],
        'problems': list(result.problems),
        'decisions': [
            {
                'id': decision.id,
                'thread': decision.thread,
                'kind': decision.kind,
                'strength': decision.strength,
                'rules': list(decision.rules),
                'triggers': list(decision.triggers),
                'reason': decision.reason,
            }
            for decision in result.decisions
        ],
        'final': result.final,
    }


__all__ = ['Engine', 'SCENARIOS', 'replay', 'ticket_stage', 'to_dict']
