"""S2：权限与 hooks —— PreToolUse 钩子链 + JSON 规则引擎（策略即代码）。

对应 research/10 §3.5：Claude Code 的 PreToolUse 钩子（工具执行前触发、可拦截）、
permissions 规则文件（allow/deny 写进版本库）、Codex 规则引擎（多条命中取最严）。
本模块把三者合成一个最小实现：
- Hook：任何实现 check(event) -> Decision | None 的对象都能挂进链；
- RuleEngine：从 JSON 规则构建，deny > ask > allow 取最严，全不命中用 default；
- ask 在无人值守下的默认语义是"拒绝并说明原因"（Agent.on_ask 可改成真交互）。

局限（写进 README 的设计取舍）：规则匹配的是命令/参数形态而非语义，
经解释器间接执行的绕过面依然存在（research/10 §3.5 同款局限）。
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

VERDICT_ORDER = {"allow": 0, "ask": 1, "deny": 2}


@dataclass
class Decision:
    """一次钩子裁决。verdict: allow | ask | deny；reason 会回传给模型。"""

    verdict: str
    reason: str = ""
    source: str = ""  # 命中的规则描述，便于调试与审计


@dataclass
class ToolEvent:
    """传给钩子的事件：工具名 + 参数 + 工作区。钩子只读，不改参数。"""

    tool: str
    args: dict
    workspace: Path


class Hook:
    """钩子基类：返回 None 表示弃权（当作 allow 继续）。"""

    def check(self, event: ToolEvent) -> Decision | None:
        raise NotImplementedError


class RuleEngine(Hook):
    """JSON 规则引擎。规则文件格式见 labs/mini-harness/rules.example.json：

    {
      "default": "allow",
      "rules": [
        {"tool": "bash", "match": {"type": "regex", "pattern": "rm\\\\s+-\\\\w*r"},
         "decision": "deny", "reason": "禁止递归删除"},
        {"tool": "write_file", "match": {"type": "outside_workspace"},
         "decision": "deny", "reason": "禁止写工作区外"}
      ]
    }

    match.type: regex（对 command 参数或参数 JSON 全文做正则）
              | outside_workspace（对 path 参数做工作区逃逸检查）
              | always（默认，只按 tool 匹配）
    多条命中取最严（deny > ask > allow），与 Codex 规则引擎同款语义。
    """

    def __init__(self, doc: dict):
        if not isinstance(doc, dict):
            raise ValueError("规则文件顶层必须是 JSON 对象")
        self.default: str = doc.get("default", "allow")
        if self.default not in VERDICT_ORDER:
            raise ValueError(f"未知 default 裁决: {self.default}")
        self.rules: list[dict] = doc.get("rules", [])
        for i, r in enumerate(self.rules):
            if "tool" not in r:
                raise ValueError(f"第 {i} 条规则缺少 tool 字段")
            if r.get("decision", "deny") not in VERDICT_ORDER:
                raise ValueError(f"第 {i} 条规则 decision 非法: {r.get('decision')}")

    @classmethod
    def from_file(cls, path: str | Path) -> "RuleEngine":
        return cls(json.loads(Path(path).read_text(encoding="utf-8")))

    def check(self, event: ToolEvent) -> Decision | None:
        worst: Decision | None = None
        for r in self.rules:
            if r.get("tool") != event.tool:
                continue
            if not self._matches(r.get("match", {"type": "always"}), event):
                continue
            d = Decision(
                verdict=r.get("decision", "deny"),
                reason=r.get("reason", ""),
                source=f"rule[{r.get('tool')}]",
            )
            if worst is None or VERDICT_ORDER[d.verdict] > VERDICT_ORDER[worst.verdict]:
                worst = d
        # 全不命中 → 用 default 兜底（default 是规则文件的一部分，不是"弃权"）
        return worst or Decision(self.default, "默认规则")

    @staticmethod
    def _matches(m: dict, event: ToolEvent) -> bool:
        t = m.get("type", "always")
        if t == "always":
            return True
        if t == "regex":
            text = event.args.get("command")
            if text is None:
                text = json.dumps(event.args, ensure_ascii=False)
            return re.search(m["pattern"], str(text)) is not None
        if t == "outside_workspace":
            p = event.args.get("path")
            if p is None:
                return False
            path = Path(str(p))
            if not path.is_absolute():
                path = Path(event.workspace) / path
            try:
                resolved = path.resolve()
                inside = resolved.is_relative_to(Path(event.workspace).resolve())
            except OSError:
                inside = False
            return not inside
        raise ValueError(f"未知 match 类型: {t}")


def run_hooks(hooks: list[Hook], event: ToolEvent) -> Decision:
    """执行 PreToolUse 钩子链，返回最严裁决。

    语义：任何一个钩子说 deny 就 deny；有 ask 无 deny 就 ask；
    全部弃权/allow 才是 allow。与 Claude Code PreToolUse "can block it" 对齐。
    """
    worst = Decision("allow", "所有钩子弃权")
    for h in hooks:
        d = h.check(event)
        if d and VERDICT_ORDER[d.verdict] > VERDICT_ORDER[worst.verdict]:
            worst = d
    return worst


__all__ = ["Decision", "ToolEvent", "Hook", "RuleEngine", "run_hooks", "VERDICT_ORDER"]
