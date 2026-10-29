import json
from pathlib import Path

import pytest

from agent_lab.sandbox import Sandbox, SandboxUnavailable

sandbox = Sandbox(timeout_s=5)
needs_sandbox = pytest.mark.skipif(not sandbox.available, reason="需要 macOS sandbox-exec")


@needs_sandbox
def test_runs_code_and_captures_output():
    result = sandbox.run("print(sum(range(10)))")
    assert result.stdout.strip() == "45" and result.exit_code == 0 and not result.timed_out


@needs_sandbox
def test_reads_stdin():
    result = sandbox.run("import json,sys\nprint(json.loads(sys.stdin.read())['x'] * 2)", stdin=json.dumps({"x": 21}))
    assert result.stdout.strip() == "42"


@needs_sandbox
def test_errors_are_returned():
    result = sandbox.run("raise ValueError('boom')")
    assert result.exit_code == 1 and "ValueError: boom" in result.stderr


@needs_sandbox
def test_blocks_network():
    code = "import socket\ntry:\n    socket.create_connection(('1.1.1.1', 80), timeout=3)\n    print('ALLOWED')\nexcept Exception as e:\n    print(type(e).__name__)"
    assert sandbox.run(code).stdout.strip() != "ALLOWED"


@needs_sandbox
def test_blocks_reading_home_and_writing_outside():
    env_file = Path(__file__).resolve().parents[2] / "pyproject.toml"
    code = (
        f"r=[]\nfor action in ('read', 'write'):\n    try:\n"
        f"        open({str(env_file)!r}).read() if action == 'read' else open('/tmp/agent-lab-escape.txt', 'w').write('x')\n"
        f"        r.append('ALLOWED')\n    except Exception as e:\n        r.append(type(e).__name__)\nprint(r)"
    )
    output = sandbox.run(code).stdout
    assert "ALLOWED" not in output and "PermissionError" in output
    assert not Path("/tmp/agent-lab-escape.txt").exists()


@needs_sandbox
def test_environment_is_empty():
    assert "LAB_LLM_API_KEY" not in sandbox.run("import os\nprint(list(os.environ))").stdout


@needs_sandbox
def test_timeout_kills_process():
    result = Sandbox(timeout_s=1).run("while True:\n    pass")
    assert result.timed_out and result.exit_code is None


@needs_sandbox
def test_output_is_clipped():
    result = sandbox.run("print('x' * 10000)")
    assert len(result.stdout) < 4100 and "截断" in result.stdout


def test_unavailable_without_sandbox_exec(tmp_path):
    with pytest.raises(SandboxUnavailable):
        Sandbox(python=tmp_path / "no-python").run("print(1)")
