"""S6：迷你 eval——5 个本地任务、可执行判分、结果表。

判分用 research/13 §4.2 的前两档："可执行测试"（比对文件终态）与
"规则/断言"（比对答案内容），不依赖 LLM-as-judge，结果确定。

T08-r1 教训（审核实测抓到的判分器 bug）：**期望值必须现算，不能写死**——
fixture 是 9 行而判分器写死 8，FakeModel 脚本也写死 "8"，参考解抄的是答案
本身，假模型 5/5 只证明"脚本和判分器错得一致"，两个真模型答对 9 却被判
FAIL。修复方式：
- 每个任务的期望值由 fixture 现算（check 时读工作区真文件），FakeModel
  脚本里的答案与判分器**共用同一个计算函数**——脚本答案不是证据，
  独立性由 tests/test_s6_evals.py 的两道闸门保证（no-op 必不过、
  独立参考解必过）；
- 每题用独立 FakeModel 实例，脚本永不跨题泄漏（调用方预置的脚本按题重放）。
"""
from __future__ import annotations

import json
import tempfile
import shutil
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .loop import Agent, HarnessConfig, default_tools
from .models import FakeModel, Model

EVAL_SYSTEM_PROMPT = (
    "你是编码 agent。用工具完成任务；除非任务另有说明，把最终答案写入任务指定的文件。"
    "工作区即当前目录，不要改动任务没让你改的文件。"
)


@dataclass
class EvalCase:
    name: str
    instruction: str            # 发给 agent 的任务描述
    setup: object               # (ws: Path) -> None，在临时工作区里造 fixture
    script: list                # FakeModel 脚本（答案由 fixture 现算，见模块 docstring）
    check: object               # (ws: Path, final_text: str) -> (bool, str)


@dataclass
class EvalRow:
    task: str
    passed: bool
    steps: int
    tool_calls: int
    token_estimate: int
    note: str


# ------------------------------------------------------- 期望值计算（唯一真相源）
# 以下函数既被 check() 用（读工作区真文件），也被 FakeModel 脚本用（工厂期从
# fixture 常量算出答案字面量）。改 fixture 只需要改 setup，期望值自动跟着变。


def _calc_callers(py_texts: dict[str, str]) -> tuple[str | None, list[str]]:
    """T1：在 {文件名: 内容} 里现算 format_price 的定义文件与调用者文件。"""
    defined: str | None = None
    callers: list[str] = []
    for name, text in py_texts.items():
        if any(ln.lstrip().startswith("def format_price") for ln in text.splitlines()):
            defined = name
        elif "format_price" in text:
            callers.append(name)
    return defined, callers


def _calc_py_lines(py_texts: dict[str, str]) -> int:
    """T3：现算 .py 文本的总行数（与 wc -l 一致的前提：文件以换行结尾）。"""
    return sum(len(t.splitlines()) for t in py_texts.values())


def _calc_todo_index(md_texts: dict[str, str]) -> list[tuple[str, int]]:
    """T4：现算 {文件: 行号} 形式的 TODO 索引，按文件名再按行号排序。"""
    out: list[tuple[str, int]] = []
    for name, text in md_texts.items():
        for i, ln in enumerate(text.splitlines(), 1):
            if "TODO" in ln:
                out.append((name, i))
    return sorted(out)


def _calc_top_error(log_text: str) -> str:
    """T5：现算出现次数最多的 ERROR 行原文。"""
    errors = [ln for ln in log_text.splitlines() if ln.startswith("ERROR")]
    return Counter(errors).most_common(1)[0][0] if errors else ""


def _read_texts(root: Path, pattern: str) -> dict[str, str]:
    return {p.relative_to(root).as_posix(): p.read_text(encoding="utf-8")
            for p in sorted(root.glob(pattern)) if p.is_file()}


# ---------------------------------------------------------------- 任务定义

def _case_find_callers() -> EvalCase:
    files = {
        "utils.py": 'def format_price(cents):\n    """分为单位的整数 -> 价格字符串"""\n    return f"{cents / 100:.2f}"\n',
        "billing.py": "from utils import format_price\n\ndef charge(cents):\n    return format_price(cents)\n",
        "report.py": "import utils\n\ndef render(order):\n    return utils.format_price(order['total'])\n",
        "README.md": "# demo repo\n\nA tiny python package used by the mini-harness eval.\n",
    }
    defined, callers = _calc_callers(files)  # 期望值由 fixture 现算

    def setup(ws: Path) -> None:
        for rel, content in files.items():
            f = ws / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(content, encoding="utf-8")

    def check(ws: Path, final: str) -> tuple[bool, str]:
        p = ws / "answer.md"
        if not p.exists():
            return False, "answer.md 不存在"
        t = p.read_text(encoding="utf-8")
        exp_defined, exp_callers = _calc_callers(_read_texts(ws, "*.py"))
        if exp_defined and exp_defined not in t:
            return False, f"没有指出定义在 {exp_defined}"
        missing = [c for c in exp_callers if c not in t]
        ok = not missing
        return ok, "定义与调用者都找到" if ok else f"调用者不全，缺 {missing}"

    return EvalCase(
        name="T1 找函数与调用者",
        instruction="当前目录是一个小型 Python 仓库。请找到 format_price 函数定义在哪个文件、"
                    "哪些文件调用了它。把结论写入 answer.md：第一行“定义: <文件名>”，"
                    "第二行“调用者: <逗号分隔的文件名列表>”。",
        setup=setup, check=check,
        script=[
            ("bash", {"command": "grep -rn 'format_price' --include='*.py' ."}),
            ("write_file", {"path": "answer.md",
                            "content": f"定义: {defined}\n调用者: {', '.join(callers)}\n"}),
            "已完成。",
        ],
    )


def _case_config_fix() -> EvalCase:
    cfg = {"database": {"host": "localhost", "port": 5432}, "retries": 3, "timeout": 30}
    target = {**cfg, "retries": 5}  # 期望终态由 fixture 现算（5 来自任务指令本身）

    def setup(ws: Path) -> None:
        (ws / "config.json").write_text(json.dumps(cfg, indent=2), encoding="utf-8")

    def check(ws: Path, final: str) -> tuple[bool, str]:
        p = ws / "config.json"
        if not p.exists():
            return False, "config.json 不存在"
        data = json.loads(p.read_text(encoding="utf-8"))
        ok = data == target
        return ok, "只改了 retries" if ok else f"改动不符: {data}"

    return EvalCase(
        name="T2 精确改配置",
        instruction="把 config.json 里的 retries 字段从 3 改成 5，其他内容保持不变。直接修改文件。",
        setup=setup, check=check,
        script=[
            ("read_file", {"path": "config.json"}),
            ("write_file", {"path": "config.json", "content": json.dumps(target, indent=2)}),
            "已修改。",
        ],
    )


def _case_count_lines() -> EvalCase:
    files = {
        "src/a.py": "x = 1\ny = 2\nz = 3\n",
        "src/b.py": "def f():\n    return 1\n\n\ndef g():\n    return 2\n",
        "src/notes.txt": "忽略我\n",  # 非 .py，应被排除
    }
    expected = _calc_py_lines({k: v for k, v in files.items() if k.endswith(".py")})

    def setup(ws: Path) -> None:
        for rel, content in files.items():
            f = ws / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(content, encoding="utf-8")

    def check(ws: Path, final: str) -> tuple[bool, str]:
        p = ws / "answer.txt"
        if not p.exists():
            return False, "answer.txt 不存在"
        try:
            n = int(p.read_text(encoding="utf-8").strip())
        except ValueError:
            return False, "answer.txt 不是整数"
        expected_now = _calc_py_lines(_read_texts(ws, "src/*.py"))  # 判分时现算
        return n == expected_now, (f"行数 {n}，正确" if n == expected_now
                                   else f"行数 {n}（现算期望 {expected_now}）")

    return EvalCase(
        name="T3 统计代码行数",
        instruction="统计 src/ 目录下所有 .py 文件的总行数，把数字写入 answer.txt（只要一个整数）。",
        setup=setup, check=check,
        script=[
            ("bash", {"command": "wc -l src/*.py"}),
            ("write_file", {"path": "answer.txt", "content": str(expected)}),
            "已完成。",
        ],
    )


def _case_todo_index() -> EvalCase:
    files = {
        "notes/meeting.md": "# 会议\nTODO: 补会议纪要\n散会\n",
        "notes/plan.md": "TODO: 定稿计划\n事项一\n事项二\nTODO: 复盘上季度\n",
    }
    expected = _calc_todo_index(files)

    def setup(ws: Path) -> None:
        for rel, content in files.items():
            f = ws / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(content, encoding="utf-8")

    def check(ws: Path, final: str) -> tuple[bool, str]:
        p = ws / "answer.json"
        if not p.exists():
            return False, "answer.json 不存在"
        try:
            items = json.loads(p.read_text(encoding="utf-8"))
            got = sorted((str(i["file"]), int(i["line"])) for i in items)
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as e:
            return False, f"answer.json 格式不符: {e}"
        expected_now = _calc_todo_index(_read_texts(ws, "notes/*.md"))
        return got == expected_now, ("TODO 索引正确" if got == expected_now
                                     else f"得到 {got}，现算期望 {expected_now}")

    return EvalCase(
        name="T4 建 TODO 索引",
        instruction="在 notes/ 目录里找出所有含“TODO”的行，把结果写入 answer.json：一个数组，"
                    '每项形如 {"file": "相对路径", "line": 行号}，按文件名再按行号排序。',
        setup=setup, check=check,
        script=[
            ("bash", {"command": "grep -rn 'TODO' notes/"}),
            ("write_file", {"path": "answer.json",
                            "content": json.dumps(
                                [{"file": f, "line": n} for f, n in expected], ensure_ascii=False)}),
            "已完成。",
        ],
    )


def _case_top_error() -> EvalCase:
    log_text = "\n".join([
        "INFO: service started", "ERROR: disk full on /data", "INFO: ok",
        "ERROR: connection timeout to db", "ERROR: disk full on /data", "INFO: retry",
        "ERROR: disk full on /data",
    ]) + "\n"
    expected = _calc_top_error(log_text)

    def setup(ws: Path) -> None:
        (ws / "logs").mkdir()
        (ws / "logs" / "app.log").write_text(log_text, encoding="utf-8")

    def check(ws: Path, final: str) -> tuple[bool, str]:
        p = ws / "answer.txt"
        if not p.exists():
            return False, "answer.txt 不存在"
        got = p.read_text(encoding="utf-8").strip()
        expected_now = _calc_top_error((ws / "logs" / "app.log").read_text(encoding="utf-8"))
        return got == expected_now, f"答案: {got!r}"

    return EvalCase(
        name="T5 找高频报错",
        instruction="logs/app.log 里出现次数最多的 ERROR 行是哪一行？把该行原文写入 answer.txt（只要这一行）。",
        setup=setup, check=check,
        script=[
            ("bash", {"command": "grep '^ERROR' logs/app.log | sort | uniq -c | sort -rn | head -1"}),
            ("write_file", {"path": "answer.txt", "content": expected}),
            "已完成。",
        ],
    )


def default_cases() -> list[EvalCase]:
    return [_case_find_callers(), _case_config_fix(), _case_count_lines(),
            _case_todo_index(), _case_top_error()]


# ---------------------------------------------------------------- 运行与判分

def run_evals(model: Model, cases: list[EvalCase] | None = None,
              config: HarnessConfig | None = None) -> list[EvalRow]:
    """逐任务：临时工作区 → 造 fixture → 跑 Agent → 可执行判分。

    FakeModel 每题一个独立实例：调用方预置了脚本就按题原样重放
    （no-op 闸门依赖此语义），否则用 case 自带脚本——脚本永不跨题泄漏。
    """
    rows: list[EvalRow] = []
    for case in (cases if cases is not None else default_cases()):
        tmp = Path(tempfile.mkdtemp(prefix="miniharness-eval-"))
        try:
            ws = tmp / "ws"
            ws.mkdir()
            case.setup(ws)
            cfg = config or HarnessConfig(max_steps=12)
            if isinstance(model, FakeModel):
                case_model: Model = FakeModel(list(model.script)) if model.script \
                    else FakeModel(list(case.script))
            else:
                case_model = model
            agent = Agent(model=case_model, tools=default_tools(ws, cfg), workspace=ws,
                          config=cfg, system_prompt=EVAL_SYSTEM_PROMPT)
            result = agent.run(case.instruction)
            ok, note = case.check(ws, result.content)
            rows.append(EvalRow(task=case.name, passed=ok, steps=result.steps,
                                tool_calls=result.tool_calls,
                                token_estimate=result.token_estimate, note=note))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return rows


def render_table(rows: list[EvalRow]) -> str:
    """Markdown 结果表：任务、通过与否、步数、工具次数、token 估算、判分说明。"""
    lines = [
        "| 任务 | 通过 | 步数 | 工具调用 | token 估算 | 判分说明 |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        mark = "PASS" if r.passed else "FAIL"
        lines.append(f"| {r.task} | {mark} | {r.steps} | {r.tool_calls} | {r.token_estimate} | {r.note} |")
    n_pass = sum(r.passed for r in rows)
    lines.append(f"\n通过率: {n_pass}/{len(rows)}")
    return "\n".join(lines)


__all__ = ["EvalCase", "EvalRow", "default_cases", "run_evals", "render_table",
           "EVAL_SYSTEM_PROMPT"]
