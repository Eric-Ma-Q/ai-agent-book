"""验证器：把候选实现放进一次性沙箱跑分，并给出**可复现的证据**。

一句话：这个文件是整个系统的地基。循环本身只有几十行，价值全在"你能不能
诚实地知道它变好了"。

四道闸门
  1. 可见测试   —— agent 能看到的那部分，占分 35%
  2. 隐藏用例   —— 随机 + 边界输入，期望值由参考实现算出，占分 65%
  3. canary     —— 分布不同的退化输入，只用于判定 verified，不影响分数
  4. 完整性     —— 禁止文件读写 / 子进程 / eval / 反射，测试文件哈希不变

之所以要 3：隐藏集和 canary 都用随机输入，硬编码答案不可能同时通过两者。
之所以要 4：自我循环系统最典型的失败模式是"把没验证过的工作报告成已验证"，
所以证据必须是机器产生、可复现的，而不是模型自己声称的。
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .tasks import Task

RUNNER_SRC = r'''
import json, sys, traceback, unittest

with open("cases.json", encoding="utf-8") as f:
    payload = json.load(f)

def norm(x):
    if isinstance(x, (list, tuple)):
        return tuple(norm(i) for i in x)
    return x

result = {"hidden": [], "canary": []}

# ---- 可见测试：逐个方法跑，拿到名字与失败原因 ----
visible = {"total": 0, "passed": 0, "failures": []}
try:
    sys.path.insert(0, ".")
    sys.path.insert(0, "tests")
    import unittest as _ut
    loader = _ut.TestLoader()
    suite = loader.loadTestsFromName("test_visible")
    flat = []
    def flatten(s):
        for t in s:
            if isinstance(t, _ut.TestSuite):
                flatten(t)
            else:
                flat.append(t)
    flatten(suite)
    for case in flat:
        name = case.id().split(".")[-1]
        visible["total"] += 1
        r = _ut.TestResult()
        case.run(r)
        if r.wasSuccessful():
            visible["passed"] += 1
        else:
            msgs = []
            for _, tb in list(r.failures) + list(r.errors):
                msgs.append(tb.strip().splitlines()[-1][:400])
            visible["failures"].append({"test": name, "reason": (msgs[0] if msgs else "unknown")[:400]})
except Exception:
    visible["load_error"] = traceback.format_exc(limit=2)[-800:]


def run_case(case):
    fn = case["fn"]
    args = tuple(norm(a) for a in case["args"])
    expected = norm(case["expected"])
    try:
        got = norm(getattr(mod, fn)(*args))
        ok = got == expected
        err = None
    except Exception as e:
        got, ok, err = None, False, f"{type(e).__name__}: {e}"[:300]
    return {"fn": fn, "args": repr(args)[:220], "expected": repr(expected)[:220],
            "got": repr(got)[:220], "ok": ok, "error": err}


try:
    import intervalkit as mod
except Exception:
    result["import_error"] = traceback.format_exc(limit=3)[-1200:]
    result["visible"] = visible
    with open("result.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    sys.exit(0)

for name in ("hidden", "canary"):
    for case in payload[name]:
        result[name].append(run_case(case))

result["visible"] = visible
with open("result.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False)
'''


@dataclass
class VerifyResult:
    ok: bool = True
    score: float = 0.0
    verified: bool = False
    visible_passed: int = 0
    visible_total: int = 0
    visible_failures: list[dict] = field(default_factory=list)
    hidden_passed: int = 0
    hidden_total: int = 0
    hidden_failures: list[dict] = field(default_factory=list)
    canary_passed: int = 0
    canary_total: int = 0
    canary_ok: bool = False
    integrity_ok: bool = True
    integrity_issues: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    duration_ms: int = 0
    source_bytes: int = 0
    error: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


# 硬失败：这些能力对这个任务完全没必要，出现即判作弊
HARD_FORBIDDEN = [
    (re.compile(r"\bopen\s*\("), "文件读写 open()"),
    (re.compile(r"\bexec\s*\("), "exec()"),
    (re.compile(r"\beval\s*\("), "eval()"),
    (re.compile(r"__import__"), "__import__ 动态导入"),
    (re.compile(r"\bsubprocess\b"), "subprocess"),
    (re.compile(r"\bos\.system\b"), "os.system"),
    (re.compile(r"\bsys\.modules\b"), "篡改 sys.modules"),
    (re.compile(r"\binspect\b"), "inspect 反射"),
]
# 软告警：可能是无意的，人工看一眼
SOFT_FORBIDDEN = [
    (re.compile(r"\bimportlib\b"), "importlib"),
    (re.compile(r"test_visible"), "引用可见测试"),
    (re.compile(r"\bcanary\b"), "引用 canary"),
    (re.compile(r"\bhidden\b"), "引用隐藏集"),
]

MAX_SOURCE_BYTES = 60_000


def _scan_source(source: str, res: VerifyResult) -> None:
    for pat, label in HARD_FORBIDDEN:
        if pat.search(source):
            res.integrity_ok = False
            res.integrity_issues.append(f"出现禁用能力：{label}")
    for pat, label in SOFT_FORBIDDEN:
        if pat.search(source):
            res.warnings.append(f"可疑引用：{label}")
    if len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        res.integrity_ok = False
        res.integrity_issues.append(f"源码过大（>{MAX_SOURCE_BYTES // 1000}KB）")
    for fn in ("normalize", "insert", "gaps", "coverage"):
        if not re.search(rf"^def\s+{fn}\s*\(", source, re.M):
            res.integrity_ok = False
            res.integrity_issues.append(f"缺少函数 {fn}")


def _build_payload(task: Task) -> dict:
    def enc(cases):
        return [{"fn": fn, "args": list(args), "expected": task.expected(fn, args)} for fn, args in cases]

    return {"hidden": enc(task.hidden_cases), "canary": enc(task.canary_cases)}


def verify_source(source: str, task: Task, timeout: float = 30.0) -> VerifyResult:
    """在临时沙箱里执行候选实现并打分。纯函数式：同样的输入必得同样的输出。"""
    res = VerifyResult(source_bytes=len(source.encode("utf-8")))
    t0 = time.time()
    _scan_source(source, res)

    work = Path(tempfile.mkdtemp(prefix="selfloop-"))
    try:
        (work / "intervalkit.py").write_text(source, encoding="utf-8")
        (work / "tests").mkdir()
        (work / "tests" / "test_visible.py").write_text(task.visible_tests, encoding="utf-8")
        (work / "runner.py").write_text(RUNNER_SRC, encoding="utf-8")
        (work / "cases.json").write_text(json.dumps(_build_payload(task)), encoding="utf-8")
        tests_hash = hashlib.sha256(task.visible_tests.encode()).hexdigest()

        try:
            proc = subprocess.run(
                [sys.executable, "-I", "runner.py"],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            res.ok = False
            res.score = 0.0
            res.error = f"验证超时（>{timeout:.0f}s）"
            res.duration_ms = int((time.time() - t0) * 1000)
            return res

        # 测试文件是否被候选人动过（有 open() 的话就可能发生）
        after = (work / "tests" / "test_visible.py").read_text(encoding="utf-8", errors="ignore")
        if hashlib.sha256(after.encode()).hexdigest() != tests_hash:
            res.integrity_ok = False
            res.integrity_issues.append("可见测试文件被修改")

        out = work / "result.json"
        if not out.exists():
            res.ok = False
            res.score = 0.0
            res.error = "沙箱没有产出结果（可能是 import 期崩溃）"
            tail = (proc.stderr or proc.stdout or "")[-600:]
            if tail:
                res.error += f"：{tail}"
            res.duration_ms = int((time.time() - t0) * 1000)
            return res

        data = json.loads(out.read_text(encoding="utf-8"))
        if data.get("import_error"):
            res.ok = False
            res.error = data["import_error"]
            res.duration_ms = int((time.time() - t0) * 1000)
            return res

        vis = data.get("visible", {})
        res.visible_passed = vis.get("passed", 0)
        res.visible_total = vis.get("total", 0)
        res.visible_failures = vis.get("failures", [])[:6]

        hid = data.get("hidden", [])
        res.hidden_total = len(hid)
        res.hidden_passed = sum(1 for c in hid if c["ok"])
        res.hidden_failures = [c for c in hid if not c["ok"]][:5]

        can = data.get("canary", [])
        res.canary_total = len(can)
        res.canary_passed = sum(1 for c in can if c["ok"])
        res.canary_ok = res.canary_total > 0 and res.canary_passed == res.canary_total

        vis_ratio = (res.visible_passed / res.visible_total) if res.visible_total else 0.0
        hid_ratio = (res.hidden_passed / res.hidden_total) if res.hidden_total else 0.0
        res.score = round(0.35 * vis_ratio + 0.65 * hid_ratio, 4) if res.integrity_ok else 0.0
        res.verified = (
            res.integrity_ok
            and res.visible_total > 0
            and res.visible_passed == res.visible_total
            and res.hidden_passed == res.hidden_total
            and res.canary_ok
        )
        res.duration_ms = int((time.time() - t0) * 1000)
        return res
    finally:
        shutil.rmtree(work, ignore_errors=True)
