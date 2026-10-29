"""随页问答的文件、Glob、Grep 与 Bash 工作区（需求 016）。

边界比功能更重要：
- 读：只读仓库里的公开文本；`personal/`、`.env`、密钥、依赖目录和点目录都拒绝。
- 写：只写 `personal/lab/page-assistant/workspace/`，不碰书稿与读者数据。
- 命令：macOS 用 sandbox-exec 禁止联网、禁止写仓库、只允许写工作区；没有 sandbox
  时直接报不可用，不降级成无保护执行。
"""

from __future__ import annotations

import fnmatch
import os
import re
import shutil
import signal
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

SANDBOX_EXEC = "/usr/bin/sandbox-exec"
MAX_READ_CHARS = 12_000
MAX_WRITE_CHARS = 200_000
MAX_GLOB = 200
MAX_GREP = 50
MAX_FILE_BYTES = 1_000_000
OUTPUT_LIMIT = 8_000
DEFAULT_TIMEOUT_S = 10.0
TEXT_SUFFIXES = {
    ".astro",
    ".css",
    ".csv",
    ".html",
    ".js",
    ".json",
    ".jsonl",
    ".md",
    ".mjs",
    ".py",
    ".sh",
    ".svg",
    ".toml",
    ".ts",
    ".txt",
    ".yaml",
    ".yml",
}
DENY_PARTS = {".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".mypy_cache", ".next", "dist", "build"}
DENY_NAMES = {".env", ".env.local", ".env.production", "id_rsa", "id_ed25519", "models.keys.json"}
DENY_SUFFIXES = {".keys.json", ".pem", ".key", ".p12", ".pfx"}


class WorkspaceError(ValueError):
    """路径或命令越界；消息可以直接给模型。"""


class BashUnavailable(WorkspaceError):
    pass


def _clip(text: str, limit: int = OUTPUT_LIMIT) -> str:
    return text if len(text) <= limit else f"{text[:limit]}…（输出已截断，共 {len(text)} 字）"


def _is_denied(relative: Path) -> bool:
    if any(part in DENY_PARTS for part in relative.parts):
        return True
    if relative.parts and relative.parts[0] == "personal":
        return True
    name = relative.name
    return name in DENY_NAMES or any(name.endswith(suffix) for suffix in DENY_SUFFIXES)


def _relative_parts(raw: str) -> Path:
    if not raw or "\x00" in raw or "\\" in raw:
        raise WorkspaceError("路径不能为空，也不能包含空字符或反斜杠")
    path = Path(raw)
    if path.is_absolute() or raw.startswith("~"):
        raise WorkspaceError("只能使用仓库内的相对路径")
    parts = [part for part in path.parts if part not in ("", ".")]
    if any(part == ".." for part in parts):
        raise WorkspaceError("路径不能包含 ..")
    return Path(*parts)


def _matches(relative: str, pattern: str) -> bool:
    """`**/*` 在 fnmatch 里要求至少一层目录；这里让顶层文件也能命中。"""
    if pattern in {"**/*", "*", "**"}:
        return True
    if fnmatch.fnmatch(relative, pattern):
        return True
    if pattern.startswith("**/") and fnmatch.fnmatch(relative, pattern[3:]):
        return True
    return False


@dataclass(frozen=True)
class BashResult:
    stdout: str
    stderr: str
    exit_code: int | None
    timed_out: bool
    duration_ms: int

    def to_dict(self) -> dict:
        return {
            "stdout": self.stdout,
            "stderr": self.stderr,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
        }


class BashRunner:
    """Bash 和宿主机之间的唯一通道；测试可以注入 execute。"""

    def __init__(
        self,
        repo_root: Path,
        workspace_root: Path,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        execute: Callable[[Path, Path, str, float], BashResult] | None = None,
    ):
        self.repo_root = Path(repo_root).resolve()
        self.workspace_root = Path(workspace_root).resolve()
        self.timeout_s = timeout_s
        self._execute = execute

    @property
    def available(self) -> bool:
        return bool(self._execute) or (Path(SANDBOX_EXEC).exists() and Path("/bin/bash").exists())

    def _profile(self, work: Path, home: Path) -> str:
        repo = str(self.repo_root)
        workspace = str(self.workspace_root)
        personal = str(self.repo_root / "personal")
        env_file = str(self.repo_root / "agent-lab" / ".env")
        return f"""(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write* (subpath "{workspace}") (subpath "{work}") (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))
(deny file-read* (subpath "{home}"))
(allow file-read* (subpath "{repo}") (subpath "{workspace}") (subpath "{work}") (subpath "/usr") (subpath "/bin") (subpath "/sbin") (subpath "/System") (subpath "/Library") (subpath "/private/etc") (subpath "/private/var/db") (subpath "/dev"))
(deny file-read* (subpath "{personal}") (literal "{env_file}") (literal "{env_file}.local"))
(allow file-read* (subpath "{workspace}") (subpath "{work}"))
"""

    def run(self, command: str, cwd: str = "") -> BashResult:
        command = command.strip()
        if not command:
            raise WorkspaceError("命令不能为空")
        if len(command) > 4000:
            raise WorkspaceError("命令过长（上限 4000 字）")
        workdir = self.repo_root
        if cwd:
            workdir = self._cwd(cwd)
        if self._execute is not None:
            return self._execute(self.repo_root, workdir, command, self.timeout_s)
        if not self.available:
            raise BashUnavailable("本机没有 sandbox-exec，出于安全考虑不运行 shell 命令；可以改用 read_file、glob、grep 或 code_interpreter")
        work = Path(tempfile.mkdtemp(prefix="agent-lab-page-bash-", dir="/private/tmp")).resolve()
        try:
            profile = work / "profile.sb"
            profile.write_text(self._profile(work, Path.home().resolve()), encoding="utf8")
            started = time.monotonic()
            env = {
                "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                "HOME": str(self.workspace_root),
                "LANG": "en_US.UTF-8",
                "LC_ALL": "en_US.UTF-8",
                "PYTHONIOENCODING": "utf-8",
                "PA_WORKSPACE": str(self.workspace_root),
            }
            process = subprocess.Popen(
                [SANDBOX_EXEC, "-f", str(profile), "/bin/bash", "-c", command],
                cwd=workdir,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,
            )
            try:
                stdout, stderr = process.communicate(timeout=self.timeout_s)
                timed_out = False
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                stdout, stderr = process.communicate()
                timed_out = True
            duration = int((time.monotonic() - started) * 1000)
            return BashResult(_clip(stdout), _clip(stderr), None if timed_out else process.returncode, timed_out, duration)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _cwd(self, raw: str) -> Path:
        if raw == "workspace":
            return self.workspace_root
        relative = _relative_parts(raw)
        candidate = (self.repo_root / relative).resolve()
        if not candidate.is_relative_to(self.repo_root) or not candidate.is_dir():
            raise WorkspaceError("cwd 必须是仓库内已存在的目录")
        if _is_denied(self._relative(candidate)):
            raise WorkspaceError("cwd 指向了不允许读取的目录")
        return candidate

    def _relative(self, path: Path) -> Path:
        try:
            return path.relative_to(self.repo_root)
        except ValueError as error:
            raise WorkspaceError("路径不在仓库内") from error


class Workspace:
    """读仓库、写工作区、跑命令；所有路径解析集中在这里。"""

    def __init__(
        self,
        repo_root: Path,
        workspace_root: Path,
        *,
        bash: BashRunner | None = None,
    ):
        self.repo_root = Path(repo_root).resolve()
        self.workspace_root = Path(workspace_root).resolve()
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.bash_runner = bash or BashRunner(self.repo_root, self.workspace_root)

    # ---- 路径 ----

    def _resolve_read(self, raw: str) -> Path:
        relative = _relative_parts(raw)
        if _is_denied(relative):
            raise WorkspaceError("该路径不允许读取：只开放仓库公开内容，读者数据、密钥与依赖目录不可读")
        candidate = (self.repo_root / relative).resolve()
        if not candidate.is_relative_to(self.repo_root):
            raise WorkspaceError("路径越出了仓库")
        if _is_denied(candidate.relative_to(self.repo_root)):
            raise WorkspaceError("该路径不允许读取")
        return candidate

    def _resolve_write(self, raw: str) -> Path:
        relative = _relative_parts(raw)
        if not relative.parts:
            raise WorkspaceError("必须指定文件名")
        candidate = (self.workspace_root / relative).resolve()
        if not candidate.is_relative_to(self.workspace_root):
            raise WorkspaceError("只能写实验台工作区")
        return candidate

    # ---- 读 ----

    def read_file(self, path: str, offset: int = 0, limit: int = 4000) -> dict:
        target = self._resolve_read(path)
        if not target.is_file():
            raise WorkspaceError(f"文件不存在：{path}")
        size = target.stat().st_size
        if size > MAX_FILE_BYTES:
            raise WorkspaceError(f"文件过大（{size} 字节）；只读不超过 {MAX_FILE_BYTES} 字节的文本")
        try:
            text = target.read_text(encoding="utf8")
        except UnicodeDecodeError as error:
            raise WorkspaceError("不是 UTF-8 文本文件") from error
        if "\x00" in text:
            raise WorkspaceError("看起来是二进制文件，不能按文本读取")
        limit = min(max(limit, 200), MAX_READ_CHARS)
        offset = max(offset, 0)
        page = text[offset : offset + limit]
        end = offset + len(page)
        return {
            "path": str(target.relative_to(self.repo_root)),
            "bytes": size,
            "content": page,
            "offset": offset,
            "next_offset": end if end < len(text) else None,
            "total_chars": len(text),
        }

    def glob(self, pattern: str, limit: int = MAX_GLOB) -> dict:
        relative = _relative_parts(pattern)
        if not relative.parts:
            raise WorkspaceError("glob 模式不能为空")
        pattern_text = str(relative)
        matches: list[str] = []
        try:
            iterator = self.repo_root.glob(pattern_text)
            for path in iterator:
                if not path.is_file():
                    continue
                try:
                    resolved = path.resolve()
                    rel = resolved.relative_to(self.repo_root)
                except (OSError, ValueError):
                    continue
                if _is_denied(rel) or not self._is_text(rel):
                    continue
                matches.append(str(rel))
                if len(matches) >= max(1, min(limit, MAX_GLOB)):
                    break
        except (OSError, ValueError) as error:
            raise WorkspaceError(f"glob 模式不合法：{error}") from error
        return {"pattern": pattern_text, "count": len(matches), "files": sorted(matches)}

    def grep(
        self,
        pattern: str,
        glob: str = "**/*",
        max_results: int = 30,
        context: int = 0,
        fixed: bool = False,
    ) -> dict:
        if not pattern:
            raise WorkspaceError("检索词不能为空")
        if len(pattern) > 300:
            raise WorkspaceError("检索词过长")
        try:
            regex = re.compile(re.escape(pattern) if fixed else pattern, re.IGNORECASE)
        except re.error as error:
            raise WorkspaceError(f"正则不合法：{error}") from error
        limit = max(1, min(max_results, MAX_GREP))
        context = max(0, min(context, 2))
        pattern_path = _relative_parts(glob)
        if not pattern_path.parts:
            raise WorkspaceError("文件模式不能为空")
        pattern_text = str(pattern_path)
        matches: list[dict] = []
        for path in sorted(self.repo_root.rglob("*")):
            if len(matches) >= limit:
                break
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(self.repo_root)
                resolved = path.resolve()
                resolved.relative_to(self.repo_root)
            except (OSError, ValueError):
                continue
            if _is_denied(rel) or _is_denied(resolved.relative_to(self.repo_root)) or not self._is_text(rel):
                continue
            if not _matches(str(rel), pattern_text):
                continue
            try:
                if path.stat().st_size > MAX_FILE_BYTES:
                    continue
                lines = path.read_text(encoding="utf8").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            for index, line in enumerate(lines):
                if not regex.search(line):
                    continue
                before = lines[max(0, index - context) : index]
                after = lines[index + 1 : index + 1 + context]
                matches.append(
                    {
                        "path": str(rel),
                        "line": index + 1,
                        "text": line[:500],
                        "before": before,
                        "after": after,
                    }
                )
                if len(matches) >= limit:
                    break
        return {"pattern": pattern, "glob": pattern_text, "count": len(matches), "matches": matches, "truncated": len(matches) >= limit}

    @staticmethod
    def _is_text(relative: Path) -> bool:
        if relative.suffix.lower() in TEXT_SUFFIXES:
            return True
        if relative.suffix:
            return False
        return relative.name in {"Makefile", "Dockerfile", "LICENSE", "README"}

    # ---- 写 ----

    def write_file(self, path: str, content: str, overwrite: bool = False) -> dict:
        if len(content) > MAX_WRITE_CHARS:
            raise WorkspaceError(f"内容过长（上限 {MAX_WRITE_CHARS} 字）")
        target = self._resolve_write(path)
        if target.exists() and not overwrite:
            raise WorkspaceError(f"文件已存在：{path}；需要覆盖时传 overwrite=true")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf8")
        return {
            "path": str(target.relative_to(self.workspace_root)),
            "absolute_path": str(target),
            "bytes": len(content.encode("utf8")),
            "overwritten": bool(overwrite),
            "note": "已写入实验台工作区；没有修改书稿或读者数据。",
        }

    def edit_file(self, path: str, old: str, new: str, replace_all: bool = False) -> dict:
        if not old:
            raise WorkspaceError("old 不能为空")
        if len(old) > 20_000 or len(new) > MAX_WRITE_CHARS:
            raise WorkspaceError("替换内容过大")
        target = self._resolve_write(path)
        if not target.is_file():
            raise WorkspaceError(f"工作区文件不存在：{path}")
        text = target.read_text(encoding="utf8")
        count = text.count(old)
        if count == 0:
            raise WorkspaceError("在工作区文件里找不到要替换的原文")
        if count > 1 and not replace_all:
            raise WorkspaceError(f"原文出现 {count} 次；需要全部替换时传 replace_all=true")
        updated = text.replace(old, new) if replace_all else text.replace(old, new, 1)
        target.write_text(updated, encoding="utf8")
        return {
            "path": str(target.relative_to(self.workspace_root)),
            "absolute_path": str(target),
            "replaced": count if replace_all else 1,
            "note": "已修改实验台工作区文件；没有修改书稿或读者数据。",
        }

    def bash(self, command: str, cwd: str = "", timeout_s: float | None = None) -> dict:
        runner = self.bash_runner
        if timeout_s is not None and timeout_s > 0:
            runner = BashRunner(self.repo_root, self.workspace_root, timeout_s=min(timeout_s, 30.0), execute=runner._execute)
        return runner.run(command, cwd).to_dict()

    def workspace_listing(self) -> list[str]:
        return sorted(
            str(path.relative_to(self.workspace_root))
            for path in self.workspace_root.rglob("*")
            if path.is_file()
        )[:200]


__all__ = [
    "BashRunner",
    "BashUnavailable",
    "Workspace",
    "WorkspaceError",
    "_relative_parts",
]
