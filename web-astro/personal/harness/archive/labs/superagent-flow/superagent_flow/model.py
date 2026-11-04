"""Data shapes shared by the replay engine.

Nothing here touches the disk, the clock or the network: a run is a function of
the scenario data alone, which is what keeps the lab reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# Section citations. Every record carries one of these, or the lab's own
# judgement, so a reader can check a claim against the prototype's documents.
CITE_FLOW = 'docs/001-domain.md §Flow'
CITE_CONCEPTS = 'docs/001-domain.md §Concepts'
CITE_TWO_PATHS = 'docs/002-authorization.md §Two paths for a Trigger'
CITE_STRENGTH = 'docs/002-authorization.md §Strength'
CITE_ADMISSION = 'docs/002-authorization.md §Admission'
CITE_ACCEPT_MODE = 'docs/002-authorization.md §Accept mode and rules'
CITE_ROUTING = 'docs/002-authorization.md §Routing candidates'
CITE_POLICY = 'docs/002-authorization.md §Policy version'
CITE_RESUME = 'docs/002-authorization.md §Resume and stop'
CITE_REVALIDATION = 'docs/002-authorization.md §Revalidation before resume'
CITE_EVAL_END = 'docs/002-authorization.md §When Eval does not finish'
CITE_STAGES = 'docs/003-execution.md §Ticket stages'
CITE_EXECUTOR = 'docs/003-execution.md §The Executor'
CITE_RECOVERY = 'docs/003-execution.md §Failure and recovery'
CITE_OWN_JUDGEMENT = '本实验判断'


@dataclass(frozen=True)
class SourceConfig:
    """One configured stream of events. Only the rules this lab replays."""

    id: str
    kind: str = 'github'  # github | feishu; feishu is the chat side of a Channel
    allowed: tuple = ()
    bots: tuple = ()
    admission: tuple = (
        ('listed_unaddressed', 'inferred'),
        ('unlisted_addressed', 'ignore'),
        ('unlisted_unaddressed', 'ignore'),
    )
    listening: bool = True

    def cell(self, name: str) -> str:
        for key, value in self.admission:
            if key == name:
                return value
        return 'ignore'


@dataclass(frozen=True)
class Policy:
    """The versioned rules: accept mode, enabled proactive rules, Source parts."""

    version: int
    accept_mode: str = 'observe'
    rules: tuple = ()
    sources: tuple = ()


@dataclass(frozen=True)
class Trigger:
    """One immutable event. `addressed` means a mention or a direct message."""

    id: str
    source: str
    thread: str
    actor: str
    text: str
    addressed: bool = False
    is_bot: bool = False
    is_ci: bool = False


@dataclass(frozen=True)
class Mandate:
    """What an accept grants. Immutable; only stop or failed revalidation removes it."""

    policy_version: int
    strength: str
    basis: str
    rules: tuple
    sender: str
    source: str
    scope: str


@dataclass
class Assignment:
    """A binding of one Ticket to one Executor instance."""

    id: str
    state: str = 'pending'  # pending | running | ended
    ended_reason: Optional[str] = None


@dataclass(frozen=True)
class Report:
    kind: str
    text: str
    tick: int
    pr: Optional[int] = None


@dataclass
class Ticket:
    id: str
    thread: str
    source: str
    state: str = 'open'  # open | ended | stopped
    mandate: Optional[Mandate] = None
    origin: str = ''
    subscriptions: list = field(default_factory=list)
    inputs: list = field(default_factory=list)
    assignments: list = field(default_factory=list)
    reports: list = field(default_factory=list)
    attention: Optional[str] = None
    delivery_failed: bool = False
    last_human_tick: int = -1
    prs: list = field(default_factory=list)
    ended_reason: Optional[str] = None


@dataclass
class ThreadState:
    key: str
    triggers: list = field(default_factory=list)
    ticket_ids: list = field(default_factory=list)
    queue: list = field(default_factory=list)
    running: Optional['EvalRun'] = None
    decisions: list = field(default_factory=list)


@dataclass
class EvalRun:
    thread: str
    batch: tuple
    deadline: int
    retries: int = 0
    entry: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Decision:
    id: str
    thread: str
    kind: str
    strength: str
    rules: tuple
    triggers: tuple
    reason: str


@dataclass(frozen=True)
class Message:
    ticket: str
    conversation: str
    kind: str  # ack | final
    text: str
    state: str  # sent | dropped
    tick: int


@dataclass(frozen=True)
class Record:
    tick: int
    phase: str
    key: str
    outcome: str
    detail: str
    source: str


@dataclass(frozen=True)
class Event:
    """One scripted step: a Trigger, a Report, a PR change, a policy change, or a tick."""

    kind: str
    data: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Scenario:
    id: str
    title: str
    summary: str
    policy: Policy
    events: tuple
    assessments: dict = field(default_factory=dict)
    expected: str = ''


@dataclass
class Result:
    scenario: str
    title: str
    policy: Policy
    records: tuple
    tickets: tuple
    messages: tuple
    problems: tuple
    decisions: tuple

    @property
    def final(self) -> str:
        open_count = sum(1 for ticket in self.tickets if ticket.state == 'open')
        return 'tickets={} open={} messages={} problems={}'.format(
            len(self.tickets), open_count, len(self.messages), len(self.problems)
        )
