"""The plan: what gets installed, who does what, which settings are saved.

SETUP.md section 3 asks for one message with five parts and one confirmation.
The five keys below are those parts, in that order, and every line names the
actor so the reader can see what a script cannot do.
"""

from __future__ import annotations

from .probe import install_items


def build_plan(machine, probe_records, answers):
    repository = answers['repository']
    agent = answers['agent_account']
    feishu = 'feishu' in answers['sources']

    install = list(install_items(probe_records))
    if machine.profile_has_plugin:
        install.append(
            '升级已有 profile：直接编辑 ~/.dsh/profiles/superagent/cordis.patch.yml；'
            '不要跑 dsh superagent --from-default-profile，它会覆盖该文件'
        )
    else:
        install.append(
            '创建 profile：dsh superagent --from-default-profile web --dump-config（仅新装可用）'
        )
        install.append('安装插件：dsh plugin --profile superagent add "link:$PWD"')
    install.append('构建：pnpm install && pnpm build')

    accounts = [
        '操作者：创建专用 GitHub 账号作为 Agent 身份（不是 GitHub App，它要读通知）',
        '操作者：把 {} 邀请进该账号并接受邀请，确认有写权限'.format(repository),
        '操作者：写 gh-agent 包装器（GH_CONFIG_DIR 隔离），执行 gh-agent auth login',
        '操作者：确认 gh-agent api user --jq .login 输出的是 {}'.format(agent),
    ]
    if answers['auto_merge'] == 'yes':
        accounts.append('操作者：再用一个可以合并的账号登录一个包装器；Agent 账号不能自己合并')
    if feishu:
        accounts.append('操作者：创建并发布自建应用、开通机器人能力，执行 config init 填入应用 secret')

    settings = [
        'github 来源：repository={}；cli=<stateDir>/worker-bin/gh-agent'.format(repository),
    ]
    if feishu:
        settings.append(
            'feishu 来源：cli=lark-bot；chats={}；directMessages=on'.format(
                '、'.join(answers['chats']) or '（待用机器人 CLI 查 id）'
            )
        )
    settings.append('policy：allowed={}；accept 模式 observe'.format('、'.join(answers['allowed']) or '（空，会被拒绝）'))
    settings.append(
        'executor：prepare 命令（每工单一个 git worktree，目录根 {}）；maxWorkers=1；'
        'blockedCommands 列出个人 gh 与 lark-cli'.format(answers['checkout'])
    )
    settings.append(
        'prompts：提交署名 {}；自动合并 {}'.format(
            answers['commit_identity'], '开启（需另一个账号的 CLI）' if answers['auto_merge'] == 'yes' else '关闭'
        )
    )

    operator_steps = [
        '创建 Agent 账号、接受仓库邀请、完成上面每个包装器的 auth login',
        'stateDir 选一个绝对路径并在装机前定好：装完不能改',
        '设置保存前把完整计划看一遍：确认后才执行',
    ]
    if not machine.gh_login:
        operator_steps.insert(0, '先登录 GitHub CLI，否则推荐值只能是占位符')
    if feishu:
        operator_steps.append('飞书应用发布、secret 输入只能操作者本人完成，不在对话里传密钥')

    defaults = [
        'profile：superagent，从 web 模板复制，与日常 profile 分开，重启不影响日常 Session',
        '端口：3082，只绑定 127.0.0.1，Management API 要求 loopback 与 x-orchestrator-request 头',
        'stateDir：~/.dsh/state/superagent（绝对路径；orchestrator.sqlite 升级前必须备份）',
        '分支前缀：agent/',
        'accept 模式：observe，先只记录不执行',
        '每小时自检：建在操作者自己的 profile 里，Agent 停机时也能跑',
    ]

    return {
        'install': tuple(install),
        'accounts': tuple(accounts),
        'settings': tuple(settings),
        'operator_steps': tuple(operator_steps),
        'defaults': tuple(defaults),
    }
