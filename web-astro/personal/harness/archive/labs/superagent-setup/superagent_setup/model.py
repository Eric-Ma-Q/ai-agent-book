"""Data shapes shared by every stage of the walkthrough.

Nothing here touches the disk, the clock or the network: a run is a function of
the scenario data alone, which is what keeps the lab reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Machine:
    """The probe output, i.e. what SETUP.md section 1 collects from a host."""

    node: str = None
    pnpm: str = None
    git: str = None
    tmux: str = None
    python3: str = None
    gh: str = None
    dsh: str = None
    gh_login: str = None
    lark_cli: str = None
    profile_has_plugin: bool = False
    foreign_worker_files: tuple = ()
    db_schema: int = 11
    program_schema: int = 11


@dataclass(frozen=True)
class Record:
    """One line of the walkthrough with the document section it comes from."""

    phase: str
    key: str
    status: str
    message: str
    source: str


@dataclass(frozen=True)
class Attempt:
    """One save against the Management API, including its request shape."""

    section: str
    payload: dict
    host: str = '127.0.0.1:3082'
    has_header: bool = True


@dataclass(frozen=True)
class Result:
    """The whole walkthrough: records, the plan and the simulated status."""

    scenario: str
    title: str
    records: tuple
    plan: dict
    status: int
    handover: tuple
