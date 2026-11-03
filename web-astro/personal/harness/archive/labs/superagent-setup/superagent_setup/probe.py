"""The probe: which prerequisites hold on this machine.

SETUP.md section 1 says a missing prerequisite becomes an item of the plan, not
a question to the operator, so every ``missing`` record here turns into one line
of the plan's install section.
"""

from __future__ import annotations

from . import versions
from .model import Machine, Record

PREREQUISITES = (
    ('node', 'Node.js 22.19+ 或 24+', 'docs/006-deployment.md §3'),
    ('pnpm', 'pnpm', 'docs/006-deployment.md §3'),
    ('git', 'git 2.32+', 'docs/006-deployment.md §3'),
    ('tmux', 'tmux', 'docs/006-deployment.md §3'),
    ('python3', 'Python 3.8+', 'docs/006-deployment.md §3'),
    ('gh', 'GitHub CLI 2.48+', 'docs/006-deployment.md §3'),
    ('dsh', 'DSH 满足 engines.dsh ^0.2.1-alpha.2', 'docs/006-deployment.md §2'),
)

INSTALL_HINTS = {
    'node': '安装 Node.js 22.19+ 或 24+（引擎要求写在 package.json 的 engines.node）',
    'pnpm': '安装 pnpm（仓库用 pnpm 构建）',
    'git': '升级 git 到 2.32+（凭据配置能力从该版本起）',
    'tmux': '安装 tmux（后台进程与 start/stop/status 都依赖它）',
    'python3': '安装 Python 3.8+',
    'gh': '升级 GitHub CLI 到 2.48+（账号专用包装器基于它）',
    'dsh': '安装 @deepseek-ai/dsh，版本需满足 engines.dsh 的 ^0.2.1-alpha.2',
}


def _version_check(key, value):
    if key == 'node':
        return versions.node_ok(value)
    if key == 'git':
        return versions.git_ok(value)
    if key == 'gh':
        return versions.gh_ok(value)
    if key == 'python3':
        return versions.python_ok(value)
    if key == 'dsh':
        return versions.dsh_ok(value)
    return bool(value)


def probe(machine):
    """Return the probe records in a fixed order."""
    records = []
    for key, label, source in PREREQUISITES:
        value = getattr(machine, key)
        if not value:
            records.append(Record('probe', key, 'missing', '{} 未安装'.format(label), source))
            continue
        if _version_check(key, value):
            records.append(Record('probe', key, 'pass', '{} {} 满足要求'.format(label, value), source))
        else:
            records.append(
                Record('probe', key, 'missing', '{} {} 不满足要求'.format(label, value), source)
            )
    if machine.gh_login:
        records.append(
            Record(
                'probe',
                'gh_login',
                'pass',
                'GitHub CLI 已登录为 {}，作为允许名单的推荐值'.format(machine.gh_login),
                'SETUP.md §1',
            )
        )
    else:
        records.append(
            Record(
                'probe',
                'gh_login',
                'blocked',
                'GitHub CLI 未登录：需要操作者本人执行 gh-agent auth login，再核对 gh-agent api user',
                'SETUP.md §1',
            )
        )
    if machine.lark_cli:
        records.append(Record('probe', 'lark_cli', 'pass', 'lark-cli {} 可用，可以选择飞书来源'.format(machine.lark_cli), 'docs/006-deployment.md §3'))
    else:
        records.append(
            Record(
                'probe',
                'lark_cli',
                'info',
                '没有 lark-cli：飞书来源不可用，GitHub 链路不受影响',
                'docs/006-deployment.md §9',
            )
        )
    if machine.profile_has_plugin:
        records.append(
            Record(
                'probe',
                'profile',
                'info',
                '已有 profile 含 dsh-superagent 条目，走升级路径，不要重跑 --from-default-profile',
                'SETUP.md §1',
            )
        )
    else:
        records.append(
            Record('probe', 'profile', 'info', '没有现成 profile，按新装创建 superagent', 'SETUP.md §2')
        )
    if machine.foreign_worker_files:
        records.append(
            Record(
                'probe',
                'worker_bin',
                'blocked',
                'worker-bin / worker-gitconfig 存在非本程序写入的文件：{}；清理后才能完成 setup'.format(
                    '、'.join(machine.foreign_worker_files)
                ),
                'docs/006-deployment.md §6',
            )
        )
    if machine.db_schema > machine.program_schema:
        records.append(
            Record(
                'probe',
                'db_schema',
                'blocked',
                '数据库 schema {} 高于程序支持的 {}：旧版本无法打开，只能用创建它的版本'.format(
                    machine.db_schema, machine.program_schema
                ),
                'docs/006-deployment.md §12',
            )
        )
    return records


def install_items(records):
    """Plan lines for whatever the probe could not find."""
    items = []
    for record in records:
        if record.phase != 'probe' or record.status != 'missing':
            continue
        items.append(INSTALL_HINTS.get(record.key, record.message))
    return tuple(items)
