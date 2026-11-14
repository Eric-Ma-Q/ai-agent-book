"""Python 沙箱：macOS sandbox-exec 禁止联网、禁止读家目录、只能写临时工作目录。

用解释器自带的标准库（-I -S，不加载第三方包），清空环境变量（不带 API 密钥），
限制 CPU 时间并设置超时。sandbox-exec 不可用时直接报不可用，不降级成无保护执行。
"""

from __future__ import annotations

import os
import resource
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

SANDBOX_EXEC = "/usr/bin/sandbox-exec"
OUTPUT_LIMIT = 4000


class SandboxUnavailable(Exception):
    pass


@dataclass(frozen=True)
class SandboxResult:
    stdout: str
    stderr: str
    exit_code: int | None
    duration_ms: int
    timed_out: bool

    def to_dict(self) -> dict:
        # 耗时不返回给模型：它每次都不同，会破坏前缀缓存和回放；轨迹的 tool_call 事件另有 duration_ms
        return {"stdout": self.stdout, "stderr": self.stderr, "exit_code": self.exit_code, "timed_out": self.timed_out}


def _profile(work: Path, python_prefix: Path, home: Path) -> str:
    return f"""(version 1)
(allow default)
(deny network*)
(deny file-write*)
(allow file-write* (subpath "{work}") (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))
(deny file-read* (subpath "{home}"))
(allow file-read* (subpath "{python_prefix}") (subpath "{work}"))
"""


def _clip(text: str) -> str:
    return text if len(text) <= OUTPUT_LIMIT else text[:OUTPUT_LIMIT] + f"…（输出已截断，共 {len(text)} 字）"


class Sandbox:
    def __init__(self, timeout_s: float = 10.0, cpu_s: int = 10, python: Path | None = None):
        self.timeout_s, self.cpu_s = timeout_s, cpu_s
        prefix = Path(sys.base_prefix).resolve()
        self.python = python or prefix / "bin" / f"python{sys.version_info.major}.{sys.version_info.minor}"
        self.prefix = prefix

    @property
    def available(self) -> bool:
        return Path(SANDBOX_EXEC).exists() and self.python.exists()

    def run(self, code: str, stdin: str = "") -> SandboxResult:
        if not self.available:
            raise SandboxUnavailable("本机没有 sandbox-exec，出于安全考虑不运行代码")
        work = Path(tempfile.mkdtemp(prefix="agent-lab-sbx-", dir="/private/tmp")).resolve()
        try:
            (work / "main.py").write_text(code, encoding="utf8")
            (work / "profile.sb").write_text(_profile(work, self.prefix, Path.home().resolve()), encoding="utf8")
            return self._execute(work, stdin)
        finally:
            shutil.rmtree(work, ignore_errors=True)

    def _execute(self, work: Path, stdin: str) -> SandboxResult:
        def limits() -> None:
            resource.setrlimit(resource.RLIMIT_CPU, (self.cpu_s, self.cpu_s))

        command = [SANDBOX_EXEC, "-f", str(work / "profile.sb"), str(self.python), "-I", "-S", "main.py"]
        env = {"PATH": "/usr/bin:/bin", "HOME": str(work), "LANG": "en_US.UTF-8", "PYTHONIOENCODING": "utf-8"}
        started = time.monotonic()
        process = subprocess.Popen(
            command, cwd=work, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, preexec_fn=limits, start_new_session=True,
        )
        try:
            stdout, stderr = process.communicate(stdin, timeout=self.timeout_s)
            timed_out = False
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
            timed_out = True
        duration = int((time.monotonic() - started) * 1000)
        return SandboxResult(_clip(stdout), _clip(stderr), None if timed_out else process.returncode, duration, timed_out)
