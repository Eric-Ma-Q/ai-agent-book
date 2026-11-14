#!/usr/bin/env bash
# Update this checkout in place (requirement 031): fetch tags, fast-forward the
# current branch, install dependencies only when their lock files changed, then
# restart the reader. Safe to publish: no private host names or service names.
#
# Usage: scripts/update.sh [--dry-run]
#
# Environment:
#   UPDATE_TARGET       version tag written by the server (takes precedence)
#   UPDATE_BRANCH       branch to fast-forward when no tag is given (default main)
#   UPDATE_RESTART_CMD  command run through `bash -c` instead of launchctl
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPDATE_DIR="$ROOT/personal/update"
LOCK_DIR="$UPDATE_DIR/lock"
STATUS_FILE="$UPDATE_DIR/status.json"
LOG_DIR="$ROOT/run-logs"
LOG_FILE="$LOG_DIR/update.log"
LAUNCHD_LABEL="local.agentbook.ai-agent-book"
BRANCH="${UPDATE_BRANCH:-main}"
TARGET_TAG="${UPDATE_TARGET:-}"
DRY_RUN=0
FROM=""
TO=""
FAILING=0

log() { printf '%s\n' "$*"; }

for argument in "$@"; do
  case "$argument" in
    --dry-run) DRY_RUN=1 ;;
    --help | -h)
      sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf '未知参数：%s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

git_repo() { git -C "$ROOT" "$@"; }

# Status files are written by python3 so arbitrary log text is escaped correctly
# and a half-written file is never observed.
write_status() {
  local state="$1" from="$2" to="$3" error="${4:-}"
  python3 - "$STATUS_FILE" "$state" "$from" "$to" "$error" "$TARGET_TAG" <<'PY'
import datetime
import json
import os
import sys

path, state, source, target, error, target_tag = sys.argv[1:7]
existing = {}
try:
    with open(path, encoding='utf-8') as handle:
        loaded = json.load(handle)
    if isinstance(loaded, dict):
        existing = loaded
except Exception:
    existing = {}

now = datetime.datetime.now(datetime.timezone.utc).astimezone().isoformat(timespec='seconds')
data = {
    'state': state,
    'from': existing.get('from') or source or None,
    'to': target or existing.get('to') or None,
    'startedAt': existing.get('startedAt') or now,
    'finishedAt': now if state in ('done', 'failed') else None,
    'error': error or None,
    'pid': existing.get('pid') or os.getpid(),
    'target': target_tag or existing.get('target') or None,
}
os.makedirs(os.path.dirname(path), exist_ok=True)
temp = path + '.tmp'
with open(temp, 'w', encoding='utf-8') as handle:
    json.dump(data, handle, ensure_ascii=False, indent=2)
    handle.write('\n')
os.replace(temp, path)
PY
}

fail() {
  if [ "$FAILING" -eq 1 ]; then exit 1; fi
  FAILING=1
  set +e
  local message="$1"
  printf '更新失败：%s\n' "$message" >&2
  write_status failed "$FROM" "$TO" "$message" || printf '警告：状态文件写入失败\n' >&2
  rm -rf "$LOCK_DIR"
  exit 1
}

trap 'fail "命令执行失败（退出码 $?）：$BASH_COMMAND"' ERR

acquire_lock() {
  mkdir -p "$UPDATE_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '已有更新正在进行（%s），本次退出。\n' "$LOCK_DIR" >&2
    exit 1
  fi
  trap 'rm -rf "$LOCK_DIR"' EXIT
}

check_worktree() {
  local dirty
  dirty="$(git_repo status --porcelain --untracked-files=no)"
  if [ -n "$dirty" ]; then
    fail "工作区有未提交的改动，请先提交或还原：$(printf '%s' "$dirty" | head -n 5 | tr '\n' ' ')"
  fi
}

resolve_target() {
  if [ -n "$TARGET_TAG" ]; then
    if git_repo rev-parse --verify --quiet "refs/tags/${TARGET_TAG}^{commit}" >/dev/null; then
      printf 'refs/tags/%s' "$TARGET_TAG"
      return 0
    fi
    if git_repo rev-parse --verify --quiet "${TARGET_TAG}^{commit}" >/dev/null; then
      printf '%s' "$TARGET_TAG"
      return 0
    fi
    return 1
  fi
  printf 'origin/%s' "$BRANCH"
}

file_hash() {
  git_repo rev-parse --verify --quiet "HEAD:$1" 2>/dev/null || printf ''
}

install_dependencies() {
  local before_web="$1" before_lab="$2" after_web after_lab
  after_web="$(file_hash web-astro/package-lock.json)"
  after_lab="$(file_hash agent-lab/uv.lock)"

  if [ "$before_web" != "$after_web" ]; then
    log "web-astro/package-lock.json 有变化，执行 npm ci"
    if ! ( cd "$ROOT/web-astro" && npm ci ); then
      fail "npm ci 失败"
    fi
  else
    log "前端依赖未变化，跳过 npm ci"
  fi

  if [ "$before_lab" != "$after_lab" ]; then
    log "agent-lab/uv.lock 有变化，执行 uv sync --frozen"
    if ! ( cd "$ROOT/agent-lab" && uv sync --frozen ); then
      fail "uv sync --frozen 失败"
    fi
  else
    log "实验台依赖未变化，跳过 uv sync"
  fi
}

restart_reader() {
  if [ -n "${UPDATE_RESTART_CMD:-}" ]; then
    log "重启：bash -c（UPDATE_RESTART_CMD）"
    if ! bash -c "$UPDATE_RESTART_CMD"; then
      fail "UPDATE_RESTART_CMD 执行失败"
    fi
    return 0
  fi
  if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
    local domain="gui/${UID:-$(id -u)}"
    if launchctl print "$domain/$LAUNCHD_LABEL" >/dev/null 2>&1; then
      log "重启：launchctl kickstart -k $domain/$LAUNCHD_LABEL"
      if ! launchctl kickstart -k "$domain/$LAUNCHD_LABEL"; then
        fail "launchctl kickstart 失败"
      fi
      return 0
    fi
  fi
  log "未检测到 launchd 服务 $LAUNCHD_LABEL，请手动重启阅读器。"
}

main() {
  local dirty before_web before_lab target
  FROM="$(git_repo rev-parse --short HEAD 2>/dev/null || true)"
  dirty="$(git_repo status --porcelain --untracked-files=no 2>/dev/null || true)"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "更新计划（dry-run，不修改仓库、不安装依赖、不重启）："
    log "  仓库：$ROOT"
    log "  当前提交：${FROM:-未知}"
    log "  工作区检查：git status --porcelain --untracked-files=no"
    if [ -n "$dirty" ]; then
      log "  注意：工作区有已跟踪文件的改动，实际更新会中止，请先提交或还原。"
    fi
    log "  拉取：git fetch --tags origin"
    if [ -n "$TARGET_TAG" ]; then
      log "  目标：tag $TARGET_TAG（不存在则中止）"
    else
      log "  目标：origin/$BRANCH"
    fi
    log "  合并：git merge --ff-only <目标>"
    log "  依赖：仅当 web-astro/package-lock.json 或 agent-lab/uv.lock 变化时执行 npm ci / uv sync --frozen"
    if [ -n "${UPDATE_RESTART_CMD:-}" ]; then
      log "  重启：bash -c \"\$UPDATE_RESTART_CMD\""
    else
      log "  重启：launchctl kickstart（若 $LAUNCHD_LABEL 存在），否则打印手动提示"
    fi
    return 0
  fi

  acquire_lock
  log "=== 更新开始 $(date '+%Y-%m-%d %H:%M:%S') ==="
  check_worktree
  write_status running "$FROM" "$TARGET_TAG"

  before_web="$(file_hash web-astro/package-lock.json)"
  before_lab="$(file_hash agent-lab/uv.lock)"

  log "拉取 tags：git fetch --tags origin"
  git_repo fetch --tags origin

  if ! target="$(resolve_target)"; then
    fail "找不到目标版本：${TARGET_TAG:-origin/$BRANCH}"
  fi
  log "合并：git merge --ff-only $target"
  git_repo merge --ff-only "$target"
  TO="$(git_repo describe --tags --always 2>/dev/null || git_repo rev-parse --short HEAD)"

  install_dependencies "$before_web" "$before_lab"
  restart_reader

  write_status done "$FROM" "$TO"
  log "=== 更新完成 ${FROM} -> ${TO} ==="
}

main "$@"
