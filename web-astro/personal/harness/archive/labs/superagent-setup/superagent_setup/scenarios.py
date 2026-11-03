"""Six built-in scenarios: the happy path plus five ways it goes sideways.

Each scenario is a frozen snapshot of a host, a set of answers and the saves the
setup agent would attempt, so a run needs no disk, no network and no clock.
"""

from __future__ import annotations

from .model import Attempt, Machine

STATE_DIR = '/home/ops/.dsh/state/superagent'
AGENT_CLI = STATE_DIR + '/worker-bin/gh-agent'
REPOSITORY = 'example-org/demo-repo'


def _machine(**overrides):
    base = dict(
        node='22.19.0',
        pnpm='11.7.0',
        git='2.39.5',
        tmux='3.4',
        python3='3.12.4',
        gh='2.62.0',
        dsh='0.2.1-rc.3',
        gh_login='ops-agent',
        lark_cli=None,
        profile_has_plugin=False,
    )
    base.update(overrides)
    return Machine(**base)


def _answers(**overrides):
    base = dict(
        sources='github',
        repository=REPOSITORY,
        agent_account='ops-agent-bot',
        allowed=['ops-agent'],
        checkout='~/src/demo-repo',
        commit_identity='ops-agent-bot',
        auto_merge='no',
    )
    base.update(overrides)
    return base


def _saves(**overrides):
    machine = {'stateDir': STATE_DIR}
    github = {'repository': REPOSITORY, 'cli': AGENT_CLI}
    feishu = None
    policy = {'allowed': ['ops-agent'], 'accept': 'observe'}
    executor = {
        'prepare': 'git worktree add ../work/<ticket>',
        'maxWorkers': 1,
        'blockedCommands': ['gh', 'lark-cli'],
    }
    prompts = {'commit_author': 'ops-agent-bot', 'auto_merge': 'no'}
    for key, value in overrides.items():
        if key == 'machine':
            machine = value
        elif key == 'github':
            github = value
        elif key == 'feishu':
            feishu = value
        elif key == 'policy':
            policy = value
        elif key == 'executor':
            executor = value
        elif key == 'prompts':
            prompts = value
    attempts = [Attempt('machine', machine), Attempt('github', github)]
    if feishu is not None:
        attempts.append(Attempt('feishu', feishu))
    attempts.extend(
        [
            Attempt('policy', policy),
            Attempt('executor', executor),
            Attempt('prompts', prompts),
        ]
    )
    return tuple(attempts)


SCENARIOS = {
    'clean': {
        'title': '干净机器，只接 GitHub',
        'summary': '前置齐全、新建 profile、五个配置段依次保存成功，状态码 0。',
        'machine': _machine(),
        'answers': _answers(),
        'attempts': _saves(),
    },
    'missing-tools': {
        'title': '缺 tmux、pnpm 与 DSH',
        'summary': '缺失项变成计划里的安装项而不是提问；进程起不来，状态码 1。',
        'machine': _machine(tmux=None, pnpm=None, dsh=None),
        'answers': _answers(),
        'attempts': _saves(),
    },
    'existing-profile': {
        'title': '已有 profile，走升级路径',
        'summary': '已有 dsh-superagent 条目时，计划里不得出现 --from-default-profile，状态码 0。',
        'machine': _machine(profile_has_plugin=True),
        'answers': _answers(),
        'attempts': _saves(),
    },
    'bad-config': {
        'title': 'stateDir 写成相对路径',
        'summary': '机器配置被拒，后续四段全部跳过；状态码 3，修法是把路径写成绝对路径。',
        'machine': _machine(),
        'answers': _answers(),
        'attempts': _saves(machine={'stateDir': 'state/superagent'}),
    },
    'thin-policy': {
        'title': '允许名单是空的',
        'summary': '策略被拒：没有允许账号就永远不会有工单。状态码 3。',
        'machine': _machine(),
        'answers': _answers(allowed=[]),
        'attempts': _saves(policy={'allowed': [], 'accept': 'observe'}),
    },
    'feishu-no-lark': {
        'title': '要接飞书但没装 lark-cli',
        'summary': '飞书来源降级关闭，GitHub 五段照常保存；状态码 2，重启也不会修好。',
        'machine': _machine(),
        'answers': _answers(sources='feishu', chats=['ops-room'], allowed_feishu=['ops-agent']),
        'attempts': _saves(feishu={'chats': ['oc_demo_room']}),
    },
}

SCENARIO_ORDER = ('clean', 'missing-tools', 'existing-profile', 'bad-config', 'thin-policy', 'feishu-no-lark')
