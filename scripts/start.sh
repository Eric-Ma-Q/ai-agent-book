#!/usr/bin/env bash
# 前台启动公开版的阅读器与实验台，Ctrl-C 一起退出。
#
#   bash scripts/start.sh              # 只监听 127.0.0.1
#   bash scripts/start.sh --lan        # 监听 0.0.0.0，局域网可访问（笔记 API 也会暴露，谨慎）
#   READER_PORT=4421 LAB_PORT=4430 bash scripts/start.sh
#
# 依赖：Node >= 22.12、uv、Python >= 3.11。缺依赖时只提示，不自动安装。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 可选：仓库根的 .env 提供端口与更新配置；已有的环境变量优先。
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
READER_PORT="${READER_PORT:-4321}"
LAB_PORT="${LAB_PORT:-4330}"
HOST="127.0.0.1"
LOGS="$ROOT/run-logs"

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --lan) HOST="0.0.0.0"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

command -v node >/dev/null 2>&1 || die "找不到 node（需要 >= 22.12）"
command -v uv >/dev/null 2>&1 || die "找不到 uv（https://docs.astral.sh/uv/）"
[ -d "$ROOT/web-astro/node_modules" ] || die "缺 web-astro/node_modules，先执行：cd web-astro && npm ci"
[ -d "$ROOT/agent-lab/.venv" ] || die "缺 agent-lab/.venv，先执行：cd agent-lab && uv sync --frozen"
[ -f "$ROOT/agent-lab/.env" ] || echo "warning: 没有 agent-lab/.env，实验台会使用 127.0.0.1:8080 与空密钥；问答前请在设置页添加模型档案。"

mkdir -p "$LOGS"
children=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${children[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "启动实验台 http://127.0.0.1:$LAB_PORT ..."
(
  cd "$ROOT/agent-lab"
  exec env LAB_READER_URL="http://127.0.0.1:$READER_PORT" uv run python -m agent_lab serve --port "$LAB_PORT"
) >"$LOGS/agent-lab.out.log" 2>"$LOGS/agent-lab.err.log" &
children+=("$!")

echo "启动阅读器 http://$HOST:$READER_PORT ..."
(
  cd "$ROOT/web-astro"
  node scripts/prepare-assets.mjs
  exec npx astro dev --host "$HOST" --port "$READER_PORT"
) >"$LOGS/reader.out.log" 2>"$LOGS/reader.err.log" &
children+=("$!")

echo "日志：$LOGS/reader.*.log、$LOGS/agent-lab.*.log"
echo "就绪后打开 http://127.0.0.1:$READER_PORT/ ，按 Ctrl-C 停止。"

# 任一进程退出就一起收尾，避免留下孤儿。macOS 自带 bash 3.2 没有 wait -n。
while kill -0 "${children[0]}" 2>/dev/null && kill -0 "${children[1]}" 2>/dev/null; do
  sleep 1
done
echo "某个服务已退出，查看 $LOGS 下的日志。" >&2
exit 1
