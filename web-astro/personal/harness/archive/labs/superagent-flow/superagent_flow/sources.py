"""Source-side filtering: what never enters the domain at all.

A Source drops its own bot's messages and everything outside what it listens to
before the Trigger reaches Intake, so a restart cannot replay them.
"""

from __future__ import annotations

from typing import Optional

from .model import SourceConfig, Trigger

OWN_BOT = 'dsh-superagent[bot]'


def filter_reason(trigger: Trigger, source: SourceConfig) -> Optional[str]:
    """Return why a Trigger is dropped before Intake, or None when it enters."""

    if not source.listening:
        return 'Source is off'
    if trigger.source != source.id:
        return 'outside the Source listening scope'
    if trigger.is_bot and trigger.actor == OWN_BOT:
        return 'the bot own message'
    return None
