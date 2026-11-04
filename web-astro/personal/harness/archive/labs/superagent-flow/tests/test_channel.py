"""Channel: acknowledgements, the final chat notice and dropped messages."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import unittest

from superagent_flow.channel import send_ack, send_final
from superagent_flow.model import SourceConfig, Ticket


def ticket(**overrides):
    base = dict(id='t-001', thread='issue-1', source='github')
    base.update(overrides)
    return Ticket(**base)


class ChannelTests(unittest.TestCase):
    def test_an_acknowledgement_is_sent(self):
        messages = []
        message = send_ack(messages, ticket(), SourceConfig(id='github'), 1)
        self.assertEqual(message.state, 'sent')
        self.assertEqual(message.kind, 'ack')
        self.assertEqual(len(messages), 1)

    def test_github_does_not_repeat_the_pull_request_outcome(self):
        messages = []
        item = ticket(state='ended', ended_reason='merged')
        self.assertIsNone(send_final(messages, item, SourceConfig(id='github', kind='github'), 4))
        self.assertEqual(messages, [])

    def test_a_chat_source_receives_the_final_notice(self):
        messages = []
        item = ticket(state='ended', ended_reason='merged')
        message = send_final(messages, item, SourceConfig(id='feishu', kind='feishu'), 4)
        self.assertIsNotNone(message)
        self.assertEqual(message.kind, 'final')
        self.assertIn('merged', message.text)

    def test_a_switched_off_source_drops_the_message(self):
        messages = []
        message = send_ack(messages, ticket(), SourceConfig(id='github', listening=False), 1)
        self.assertEqual(message.state, 'dropped')

    def test_messages_keep_their_order(self):
        messages = []
        item = ticket(state='ended', ended_reason='merged')
        send_ack(messages, item, SourceConfig(id='feishu', kind='feishu'), 1)
        send_final(messages, item, SourceConfig(id='feishu', kind='feishu'), 2)
        self.assertEqual([message.kind for message in messages], ['ack', 'final'])

    def test_messages_reference_the_ticket_and_the_conversation(self):
        messages = []
        message = send_ack(messages, ticket(), SourceConfig(id='github'), 1)
        self.assertEqual(message.ticket, 't-001')
        self.assertEqual(message.conversation, 'issue-1')
        self.assertEqual(message.tick, 1)


if __name__ == '__main__':
    unittest.main()
