"""The write side: acknowledgements and the final notice.

GitHub already shows a pull request's outcome, so the final notice goes only to
chat Channels. A Source that no longer listens drops the message and records it.
"""

from __future__ import annotations

from .model import Message, SourceConfig, Ticket


def _send(messages, ticket: Ticket, source: SourceConfig, kind: str, text: str, tick: int) -> Message:
    state = 'sent' if source.listening else 'dropped'
    message = Message(
        ticket=ticket.id,
        conversation=ticket.thread,
        kind=kind,
        text=text,
        state=state,
        tick=tick,
    )
    messages.append(message)
    return message


def send_ack(messages, ticket: Ticket, source: SourceConfig, tick: int) -> Message:
    return _send(messages, ticket, source, 'ack', 'Accepted as {}.'.format(ticket.id), tick)


def send_final(messages, ticket: Ticket, source: SourceConfig, tick: int):
    """Chat Channels receive one final notice; GitHub does not duplicate the PR outcome."""

    if source.kind != 'feishu':
        return None
    text = 'Work item {} ended: {}.'.format(ticket.id, ticket.ended_reason or 'done')
    return _send(messages, ticket, source, 'final', text, tick)
