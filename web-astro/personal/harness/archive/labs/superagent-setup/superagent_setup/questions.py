"""The question flow: one question per message, a recommendation each time.

SETUP.md section 2 fixes the order and asks the setup agent to skip anything the
probe already answered. The walkthrough keeps that order literally so the
reader can see which questions a GitHub-only install never has to ask.
"""

from __future__ import annotations

from .model import Machine, Record

QUESTIONS = (
    ('q.sources', '来源：只接 GitHub，还是也接飞书会话？', 'github', 'SETUP.md §2'),
    ('q.repository', '仓库：Agent 为哪个 github.com 仓库工作（owner/name）？', 'owner/name', 'SETUP.md §2'),
    ('q.agent_account', '身份：Agent 用哪个 GitHub 账号行动（不要用操作者本人账号）？', '<operator>-agent', 'SETUP.md §2'),
    ('q.chats', '飞书：监听哪些群（按群名）？', '第一个群', 'SETUP.md §2'),
    ('q.allowed', '策略：哪些 GitHub 登录名可以向它派活？', '<operator login>', 'SETUP.md §2'),
    ('q.allowed_feishu', '飞书：哪些人可以在群里派活？', '第一个群的成员', 'SETUP.md §2'),
    ('q.checkout', '执行：每个工单从哪份本地克隆检出？', '~/src/<repo>', 'SETUP.md §2'),
    ('q.commit_identity', '提交身份：Agent 的提交署谁的名？', '<agent account>', 'SETUP.md §2'),
    ('q.auto_merge', '合并：Agent 的 PR 就绪后要不要自动合并？', 'no', 'SETUP.md §2'),
)

FEISHU_ONLY = ('q.chats', 'q.allowed_feishu')


def _repo_name(repository):
    if repository and '/' in repository:
        return repository.split('/', 1)[1]
    return '<repo>'


def defaults(machine, answers=None):
    """Fill every answer the operator did not override."""
    answers = dict(answers or {})
    agent = answers.get('agent_account')
    if not agent:
        agent = '{}-agent'.format(machine.gh_login) if machine.gh_login else 'agent-account'
    resolved = {
        'sources': answers.get('sources', 'github'),
        'repository': answers.get('repository', 'owner/name'),
        'agent_account': agent,
        'chats': list(answers.get('chats', [])),
        'allowed': list(answers.get('allowed', [machine.gh_login] if machine.gh_login else [])),
        'allowed_feishu': list(answers.get('allowed_feishu', [])),
        'checkout': answers.get('checkout', ''),
        'commit_identity': answers.get('commit_identity', agent),
        'auto_merge': answers.get('auto_merge', 'no'),
    }
    if not resolved['checkout']:
        resolved['checkout'] = '~/src/{}'.format(_repo_name(resolved['repository']))
    return resolved


def _recommendation(key, resolved):
    if key == 'q.sources':
        return resolved['sources']
    if key == 'q.repository':
        return resolved['repository']
    if key == 'q.agent_account':
        return resolved['agent_account']
    if key == 'q.chats':
        return '、'.join(resolved['chats']) or '第一个群'
    if key == 'q.allowed':
        return '、'.join(resolved['allowed']) or '<operator login>'
    if key == 'q.allowed_feishu':
        return '、'.join(resolved['allowed_feishu']) or '第一个群的成员'
    if key == 'q.checkout':
        return resolved['checkout']
    if key == 'q.commit_identity':
        return resolved['commit_identity']
    return resolved['auto_merge']


def ask(machine, answers=None):
    """Return the question records and the resolved answers."""
    resolved = defaults(machine, answers)
    records = []
    for key, text, _recommend, source in QUESTIONS:
        if key in FEISHU_ONLY and 'feishu' not in resolved['sources']:
            records.append(
                Record('question', key, 'skipped', '{}：本次只接 GitHub，跳过'.format(text), source)
            )
            continue
        records.append(
            Record(
                'question',
                key,
                'info',
                '{} 推荐：{}'.format(text, _recommendation(key, resolved)),
                source,
            )
        )
    return records, resolved
