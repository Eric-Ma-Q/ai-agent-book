"""工具输出的两种"泄洪"机制，对应任务单 S1（截断可续）与 S4（大输出落盘）。

复合顺序：先看是否落盘（S4，超过 spill_chars 就整段写进 .harness/artifacts/，
只回传路径 + 行数 + 前几行），再看是否硬截断（S1，超过 max_chars 截断并提示
怎么取下一段）。默认 spill_chars(2000) < max_chars(10000)，所以落盘先触发，
硬截断是 spill 关闭（spill_chars=None）或未来落盘失败时的兜底——真实
harness 也是"分页/落盘优先，硬截断兜底"（research/09 §八 第 8 条）。
"""
from __future__ import annotations

from pathlib import Path

SPILL_DIR = ".harness/artifacts"  # 相对工作区
PREVIEW_LINES = 5
PREVIEW_CHAR_CAP = 500


def process_output(raw: object, ctx, *, tool_name: str = "tool",
                   spill_chars: int | None = 2_000,
                   max_chars: int | None = 10_000) -> str:
    """把工具原始输出加工成回传给模型的最终字符串。"""
    raw = raw if isinstance(raw, str) else str(raw)
    if spill_chars and len(raw) > spill_chars:
        return spill_to_artifact(raw, ctx, tool_name)
    if max_chars and len(raw) > max_chars:
        return truncate_with_hint(raw, max_chars)
    return raw


def spill_to_artifact(raw: str, ctx, tool_name: str) -> str:
    """S4：整段输出写进 .harness/artifacts/，只回传路径 + 行数 + 前几行。"""
    art_dir = Path(ctx.workspace) / SPILL_DIR
    art_dir.mkdir(parents=True, exist_ok=True)
    seq = ctx.state.get("artifact_seq", 0) + 1
    ctx.state["artifact_seq"] = seq
    fname = f"{tool_name}-{seq:04d}.txt"
    (art_dir / fname).write_text(raw, encoding="utf-8")

    n_lines = raw.count("\n") + 1
    preview = "\n".join(raw.splitlines()[:PREVIEW_LINES])
    if len(preview) > PREVIEW_CHAR_CAP:
        preview = preview[:PREVIEW_CHAR_CAP] + "…"
    rel = f"{SPILL_DIR}/{fname}"
    return (
        f"[输出过大（{n_lines} 行 / {len(raw)} 字符），已保存到 {rel}]。\n"
        f"前 {PREVIEW_LINES} 行:\n{preview}\n"
        f"[完整内容用 read_file(path=\"{rel}\") 读取，可加 offset/limit 分段]"
    )


def truncate_with_hint(raw: str, max_chars: int) -> str:
    """S1：硬截断，并告诉模型怎么拿到剩余部分（09 §八：截断必须"可续"）。"""
    cut = raw[:max_chars]
    return (
        f"{cut}\n[输出已截断：显示 {max_chars} / 共 {len(raw)} 字符。"
        f"请缩小输出范围（head/tail/grep、按行号 read_file）后重试]"
    )


__all__ = ["process_output", "spill_to_artifact", "truncate_with_hint", "SPILL_DIR"]
