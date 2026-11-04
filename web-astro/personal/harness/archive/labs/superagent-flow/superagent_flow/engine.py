"""The replay engine: Source -> Intake -> Eval -> Ticket -> Executor -> Channel.

The clock is the event index. No wall clock, no network, no disk: a run depends
only on the scenario it is given.
"""

from __future__ import annotations

from . import assignments, channel, evals, gate, intake, sources, tickets
from .model import (
    CITE_ACCEPT_MODE,
    CITE_CONCEPTS,
    CITE_EVAL_END,
    CITE_EXECUTOR,
    CITE_FLOW,
    CITE_POLICY,
    CITE_REVALIDATION,
    CITE_RESUME,
    CITE_ROUTING,
    CITE_STAGES,
    CITE_TWO_PATHS,
    Decision,
    EvalRun,
    Event,
    Policy,
    Record,
    Report,
    Result,
    ThreadState,
    Ticket,
    Trigger,
)
from .stage import ticket_stage


class ReplayError(Exception):
    """A scenario referred to something that does not exist."""


class Engine:
    def __init__(self, scenario):
        self.scenario = scenario
        self.policy = scenario.policy
        self.tick = 0
        self.records = []
        self.sources = {source.id: source for source in scenario.policy.sources}
        self.triggers = {}
        self.gates = {}
        self.threads = {}
        self.tickets = {}
        self.messages = []
        self.problems = []
        self.decisions = []
        self.seen = set()
        self.accepted = {}
        self.ticket_seq = 0
        self.decision_seq = 0

    # -- plumbing ---------------------------------------------------------

    def record(self, phase, key, outcome, detail, source):
        self.records.append(Record(self.tick, phase, key, outcome, detail, source))

    def source(self, source_id):
        source = self.sources.get(source_id)
        if source is None:
            raise ReplayError('unknown Source: {}'.format(source_id))
        return source

    def thread(self, key):
        if key not in self.threads:
            self.threads[key] = ThreadState(key=key)
        return self.threads[key]

    def ticket(self, ticket_id):
        ticket = self.tickets.get(ticket_id)
        if ticket is None:
            raise ReplayError('unknown Ticket: {}'.format(ticket_id))
        return ticket

    def decision(self, thread, kind, strength, rules, batch, reason):
        self.decision_seq += 1
        decision = Decision(
            id='d-{:03d}'.format(self.decision_seq),
            thread=thread.key,
            kind=kind,
            strength=strength,
            rules=tuple(rules),
            triggers=tuple(batch),
            reason=reason,
        )
        self.decisions.append(decision)
        thread.decisions.append(decision.id)
        self.record('decision', decision.id, kind, reason, CITE_ROUTING)
        return decision

    # -- run --------------------------------------------------------------

    def run(self):
        for event in self.scenario.events:
            self.tick += 1
            self.dispatch(event)
            self.expire()
        return Result(
            scenario=self.scenario.id,
            title=self.scenario.title,
            policy=self.policy,
            records=tuple(self.records),
            tickets=tuple(self.tickets[tid] for tid in sorted(self.tickets)),
            messages=tuple(self.messages),
            problems=tuple(self.problems),
            decisions=tuple(self.decisions),
        )

    def dispatch(self, event: Event):
        handler = getattr(self, 'on_{}'.format(event.kind), None)
        if handler is None:
            raise ReplayError('unknown event kind: {}'.format(event.kind))
        handler(event.data)

    # -- events -----------------------------------------------------------

    def on_tick(self, data):
        return None

    def on_trigger(self, data):
        self.receive(data['trigger'])

    def on_report(self, data):
        ticket = self.ticket(data['ticket'])
        if ticket.state != 'open':
            self.record('report', ticket.id, 'ignored', 'the Ticket is not open', CITE_EXECUTOR)
            return
        report = Report(
            kind=data['kind'],
            text=data.get('text', ''),
            tick=self.tick,
            pr=data.get('pr'),
        )
        assignments.apply_report(ticket, report)
        if report.kind == 'ready' and report.pr is not None:
            self._track_pr(ticket, report.pr)
        self.record(
            'report',
            ticket.id,
            report.kind,
            '{} (stage: {})'.format(report.text or report.kind, ticket_stage(ticket)),
            CITE_EXECUTOR,
        )

    def on_pr(self, data):
        ticket = self.ticket(data['ticket'])
        pr_id = data['pr']
        state = data['state']
        for pr in ticket.prs:
            if pr['id'] == pr_id:
                pr['state'] = state
                break
        else:
            ticket.prs.append({'id': pr_id, 'state': state})
        self.record('report', ticket.id, 'pr-{}'.format(state), 'pull request #{}'.format(pr_id), CITE_EXECUTOR)
        if ticket.prs and all(pr['state'] in ('merged', 'closed') for pr in ticket.prs):
            self._end(ticket, state)

    def on_retry(self, data):
        ticket = self.ticket(data['ticket'])
        if not assignments.can_retry(ticket):
            self.record('executor', ticket.id, 'retry-refused', 'stage: {}'.format(ticket_stage(ticket)), CITE_EXECUTOR)
            return
        assignments.start(ticket)
        self.record('executor', ticket.id, 'retried', 'new Assignment (stage: {})'.format(ticket_stage(ticket)), CITE_EXECUTOR)

    def on_handback(self, data):
        ticket = self.ticket(data['ticket'])
        trigger_id = data['trigger']
        reason = data.get('reason', 'outside the Ticket scope')
        self.record('ticket', ticket.id, 'handback', reason, CITE_TWO_PATHS)
        trigger = self.triggers[trigger_id]
        source = self.source(trigger.source)
        result = gate.admit(trigger, self.policy, source, self.thread_has_ticket(self.thread(ticket.thread)))
        self.gates[trigger_id] = result
        if not result.admitted:
            self.record('gate', trigger_id, 'not-admitted', result.reason, result.source)
            return
        self.record('gate', trigger_id, result.strength, result.reason, result.source)
        thread = self.thread(ticket.thread)
        thread.queue.append(trigger_id)
        self.record('intake', trigger_id, 'requeued', 'handed back for a fresh Eval', CITE_TWO_PATHS)
        self.start_eval(thread)

    def on_delivery_fail(self, data):
        ticket = self.ticket(data['ticket'])
        ticket.delivery_failed = True
        self.record('executor', ticket.id, 'delivery-failed', 'stage: {}'.format(ticket_stage(ticket)), CITE_STAGES)

    def on_stop(self, data):
        ticket = self.ticket(data['ticket'])
        tickets.stop(ticket)
        self.record('ticket', ticket.id, 'stopped', 'a person stopped the Ticket', CITE_RESUME)

    def on_policy(self, data):
        self.change_policy(data['policy'], data.get('affected'))

    # -- intake -----------------------------------------------------------

    def receive(self, trigger: Trigger):
        source = self.source(trigger.source)
        reason = sources.filter_reason(trigger, source)
        if reason:
            self.record('source', trigger.id, 'filtered', reason, CITE_FLOW)
            return
        if trigger.id in self.seen:
            self.record('intake', trigger.id, 'duplicate', 'Trigger already recorded', CITE_CONCEPTS)
            return

        self.seen.add(trigger.id)
        self.triggers[trigger.id] = trigger
        thread = self.thread(trigger.thread)
        thread.triggers.append(trigger.id)
        self.record('intake', trigger.id, 'stored', 'Thread {}'.format(thread.key), CITE_FLOW)

        targets = intake.fan_out_targets(
            [self.tickets[tid] for tid in thread.ticket_ids], thread.key, trigger
        )
        delivered = []
        for ticket in targets:
            if ticket.state == 'ended':
                ok, why, cite = tickets.resume(ticket, trigger, self.policy, source, self.tick)
                if not ok:
                    self.record('ticket', ticket.id, 'revoked', why, CITE_REVALIDATION)
                    continue
                self.record('ticket', ticket.id, 'resumed', why, CITE_RESUME)
            else:
                ticket.inputs.append(trigger.id)
            delivered.append(ticket)
            self.record(
                'intake',
                trigger.id,
                'fanned-out',
                'to {} (stage: {})'.format(ticket.id, ticket_stage(ticket)),
                CITE_TWO_PATHS,
            )
            self._wake(ticket, trigger)

        if not intake.needs_eval(trigger, delivered):
            self.record(
                'intake',
                trigger.id,
                'no-eval',
                'the message belongs to its Ticket Executor',
                CITE_TWO_PATHS,
            )
            return

        result = gate.admit(trigger, self.policy, source, self.thread_has_ticket(thread))
        self.gates[trigger.id] = result
        if not result.admitted:
            self.record('gate', trigger.id, 'not-admitted', result.reason, result.source)
            return
        self.record('gate', trigger.id, result.strength, result.reason, result.source)
        thread.queue.append(trigger.id)
        self.record('intake', trigger.id, 'queued', 'Thread {}'.format(thread.key), CITE_TWO_PATHS)
        self.start_eval(thread)

    def thread_has_ticket(self, thread: ThreadState) -> bool:
        return any(self.tickets[ticket_id].state != 'stopped' for ticket_id in thread.ticket_ids)

    def _wake(self, ticket: Ticket, trigger: Trigger):
        if trigger.is_bot or trigger.is_ci:
            return
        ticket.last_human_tick = self.tick
        if ticket.attention:
            ticket.attention = None
            self.record('ticket', ticket.id, 'answered', 'Attention cleared', CITE_STAGES)
        last = ticket.assignments[-1] if ticket.assignments else None
        if last is None or last.state == 'ended':
            assignments.start(ticket)
            self.record(
                'executor',
                ticket.id,
                'woken',
                'new Assignment (stage: {})'.format(ticket_stage(ticket)),
                CITE_EXECUTOR,
            )

    # -- eval -------------------------------------------------------------

    def assessment(self, signature: str) -> dict:
        keyed = '{}:{}'.format(self.policy.version, signature)
        if keyed in self.scenario.assessments:
            return self.scenario.assessments[keyed]
        return self.scenario.assessments.get(signature, {})

    def start_eval(self, thread: ThreadState, retries: int = 0):
        if thread.running is not None or not thread.queue:
            return
        batch = intake.merge_batch(thread)
        signature = ','.join(batch)
        entry = self.assessment(signature)
        run = EvalRun(
            thread=thread.key,
            batch=batch,
            deadline=evals.deadline(self.tick),
            retries=retries,
            entry=entry,
        )
        thread.running = run
        self.record('eval', signature, 'started', 'policy v{}'.format(self.policy.version), CITE_ACCEPT_MODE)
        if entry.get('timeout'):
            return
        self.resolve(thread, run)

    def resolve(self, thread: ThreadState, run: EvalRun):
        thread.running = None
        strengths = [self.gates.get(trigger_id) for trigger_id in run.batch]
        if all(result is not None and result.strength == 'explicit' for result in strengths):
            self.decision(thread, 'accept', 'explicit', (), run.batch, 'explicit candidate routed')
            self.accept(thread, run.batch, 'explicit', 'explicit', ())
            self.advance(thread)
            return

        kind, rules, reason = evals.decide(run.entry, self.policy)
        strength = 'inferred'
        basis = next(
            (result.basis for result in strengths if result is not None and result.strength == 'inferred'),
            'inferred',
        )
        self.decision(thread, kind, strength, rules, run.batch, reason)
        if kind == 'accept':
            self.accept(thread, run.batch, strength, basis, rules)
        elif kind == 'stop':
            self.stop_thread(thread, run.batch)
        self.advance(thread)

    def advance(self, thread: ThreadState):
        if thread.running is None and thread.queue:
            self.start_eval(thread)

    def expire(self):
        for thread in list(self.threads.values()):
            run = thread.running
            if run is None or self.tick < run.deadline:
                continue
            run.retries += 1
            if run.retries >= 3:
                thread.running = None
                self.decisions.append(
                    Decision(
                        id='d-{:03d}'.format(self.decision_seq + 1),
                        thread=thread.key,
                        kind='unavailable',
                        strength='inferred',
                        rules=(),
                        triggers=run.batch,
                        reason='Eval expired three times',
                    )
                )
                self.decision_seq += 1
                thread.decisions.append(self.decisions[-1].id)
                self.problems.append(
                    {'thread': thread.key, 'triggers': run.batch, 'reason': 'Eval unavailable'}
                )
                self.record('eval', ','.join(run.batch), 'unavailable', 'expired three times', CITE_EVAL_END)
                self.advance(thread)
                continue
            thread.queue = list(run.batch) + thread.queue
            thread.running = None
            self.record(
                'eval',
                ','.join(run.batch),
                'expired',
                'requeued, retry {}'.format(run.retries),
                CITE_EVAL_END,
            )
            self.start_eval(thread, run.retries)

    # -- tickets ----------------------------------------------------------

    def accept(self, thread: ThreadState, batch, strength, basis, rules):
        for trigger_id in batch:
            if trigger_id in self.accepted:
                self.record(
                    'decision',
                    self.accepted[trigger_id],
                    'duplicate-accept',
                    'Trigger {} already created a Ticket'.format(trigger_id),
                    CITE_CONCEPTS,
                )
                return

        trigger = self.triggers[batch[0]]
        self.ticket_seq += 1
        ticket_id = 't-{:03d}'.format(self.ticket_seq)
        ticket = tickets.create(ticket_id, thread.key, trigger, strength, basis, rules, self.policy)
        self.tickets[ticket_id] = ticket
        thread.ticket_ids.append(ticket_id)
        for trigger_id in batch:
            self.accepted[trigger_id] = ticket_id
        self.record(
            'ticket',
            ticket_id,
            'created',
            'mandate v{} {} rules={} (stage: {})'.format(
                ticket.mandate.policy_version,
                ticket.mandate.strength,
                ','.join(ticket.mandate.rules) or '-',
                ticket_stage(ticket),
            ),
            CITE_CONCEPTS,
        )
        assignments.start(ticket)
        self.record('executor', ticket_id, 'started', 'session worker-{}, stage: {}'.format(ticket_id, ticket_stage(ticket)), CITE_EXECUTOR)
        source = self.source(ticket.source)
        message = channel.send_ack(self.messages, ticket, source, self.tick)
        self.record('channel', ticket_id, message.state, 'ack: {}'.format(message.text), CITE_CONCEPTS)

    def stop_thread(self, thread: ThreadState, batch):
        for ticket_id in thread.ticket_ids:
            ticket = self.tickets[ticket_id]
            if ticket.state == 'open':
                tickets.stop(ticket)
                self.record('ticket', ticket.id, 'stopped', 'a person asked to stop', CITE_RESUME)

    def _end(self, ticket: Ticket, reason: str):
        tickets.end(ticket, reason)
        self.record('ticket', ticket.id, 'ended', 'reason: {}'.format(reason), CITE_EXECUTOR)
        source = self.source(ticket.source)
        message = channel.send_final(self.messages, ticket, source, self.tick)
        if message is not None:
            self.record('channel', ticket.id, message.state, 'final: {}'.format(message.text), CITE_CONCEPTS)

    def _track_pr(self, ticket: Ticket, pr_id: int):
        for pr in ticket.prs:
            if pr['id'] == pr_id:
                pr['state'] = 'open'
                return
        ticket.prs.append({'id': pr_id, 'state': 'open'})

    # -- policy -----------------------------------------------------------

    def change_policy(self, policy: Policy, affected=None):
        old = self.policy
        self.policy = policy
        self.sources = {source.id: source for source in policy.sources}
        self.record(
            'policy',
            'v{}'.format(policy.version),
            'changed',
            'mode={} rules={}'.format(policy.accept_mode, ','.join(policy.rules) or '-'),
            CITE_POLICY,
        )

        targets = affected if affected is not None else self.affected(old, policy)
        for ticket_id in targets:
            ticket = self.tickets.get(ticket_id)
            if ticket is None or ticket.state != 'open':
                continue
            ticket.inputs.append('policy-changed:{}'.format(policy.version))
            self.record('ticket', ticket.id, 'policy-input', 'policy v{} delivered'.format(policy.version), CITE_POLICY)

        for thread in list(self.threads.values()):
            run = thread.running
            if run is None:
                continue
            thread.queue = list(run.batch) + thread.queue
            thread.running = None
            self.record('eval', ','.join(run.batch), 'discarded', 'Policy version changed', CITE_POLICY)
            self.start_eval(thread)

    def affected(self, old: Policy, new: Policy):
        targets = []
        for ticket in self.tickets.values():
            if ticket.state != 'open' or ticket.mandate is None:
                continue
            mandate = ticket.mandate
            source = next((item for item in new.sources if item.id == ticket.source), None)
            if source is None:
                targets.append(ticket.id)
                continue
            if any(rule not in new.rules for rule in mandate.rules):
                targets.append(ticket.id)
            elif mandate.basis in ('inferred', 'bot', 'cell') and old.accept_mode == 'auto' and new.accept_mode != 'auto':
                targets.append(ticket.id)
            elif mandate.sender not in source.allowed and mandate.basis != 'bot':
                targets.append(ticket.id)
        return targets
