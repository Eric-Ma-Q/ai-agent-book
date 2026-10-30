"""读者数据相关的工具：读笔记（只读）与提交补充（经确认门禁）。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..book.parser import normalize_for_match
from ..trace.schema import Gate
from .registry import ToolContext, ToolError, ToolSpec

MAX_INSERT_CHARS = 5000


class ChapterFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int | None = Field(default=None, description="只看这一章；省略时返回全部")
    only_with_notes: bool = Field(default=False, description="只返回写了笔记的划线")


class InsertListArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int | None = Field(default=None, description="只看这一章")


class AnnotationListArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int | None = Field(default=None, description="只看这一章")
    kind: str | None = Field(default=None, description="批注类型：term / ref / entity / update / extend")
    query: str | None = Field(default=None, max_length=100, description="在引文、标题、正文中做包含匹配")


class ProposeInsertArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chapter: int = Field(description="章号")
    after: str = Field(description="补充要放在哪一段之后：该段落开头的原文，至少 10 个字，逐字复制")
    markdown: str = Field(description="补充内容（Markdown）")


def _notes(ctx: ToolContext):
    if ctx.notes is None:
        raise ToolError("当前环境没有接入读者笔记")
    return ctx.notes


def list_highlights(ctx: ToolContext, args: ChapterFilter) -> dict:
    items = _notes(ctx).highlights(args.chapter)
    if args.only_with_notes:
        items = [i for i in items if i["note"]]
    return {"count": len(items), "highlights": items}


def list_inserts(ctx: ToolContext, args: InsertListArgs) -> dict:
    items = _notes(ctx).inserts(args.chapter)
    return {"count": len(items), "inserts": [{**i, "markdown": i["markdown"][:800]} for i in items]}


def list_annotations(ctx: ToolContext, args: AnnotationListArgs) -> dict:
    items = _notes(ctx).annotations(args.chapter)
    if args.kind:
        items = [item for item in items if item["kind"] == args.kind]
    if args.query:
        needle = args.query.strip().lower()
        items = [item for item in items if needle in (item["quote"] + item["title"] + item["body"]).lower()]
    return {
        "count": len(items),
        "annotations": [
            {
                "chapter": item["chapter"],
                "id": item["id"],
                "quote": item["quote"],
                "kind": item["kind"],
                "title": item["title"],
                "body": item["body"][:1200],
                "sources": item.get("sources", []),
            }
            for item in items[:200]
        ],
    }


def _anchor_exists(ctx: ToolContext, chapter: int, after: str) -> bool:
    target = ctx.book.chapters.get(chapter) if ctx.book else None
    wanted = normalize_for_match(after)
    return bool(target) and any(normalize_for_match(b.text).startswith(wanted) for b in target.blocks)


def propose_insert(ctx: ToolContext, args: ProposeInsertArgs) -> dict:
    if ctx.gate is None:
        raise ToolError("当前环境不支持写入补充")
    if len(normalize_for_match(args.after)) < 10:
        raise ToolError("after 太短：请逐字复制目标段落开头至少 10 个字")
    if not args.markdown.strip() or len(args.markdown) > MAX_INSERT_CHARS:
        raise ToolError(f"补充内容不能为空，也不能超过 {MAX_INSERT_CHARS} 字")
    if not _anchor_exists(ctx, args.chapter, args.after):
        raise ToolError(f"第 {args.chapter} 章找不到以这段文字开头的段落，请先用 read_section 读原文再逐字复制")
    payload = {"chapter": args.chapter, "after": args.after, "markdown": args.markdown}
    action = ctx.gate.create("insert", payload, run_id=ctx.run_id)
    ctx.state.proposed_actions.append(action.action_id)
    if ctx.emit:
        ctx.emit(Gate(action_id=action.action_id, kind="insert", payload=payload, status="pending"))
    return {"action_id": action.action_id, "status": "pending", "message": "已提交，等待读者在网页上确认；在确认之前不要声称已经写入。"}


PERSONAL_TOOLS = [
    ToolSpec(
        "list_highlights",
        "列出读者在阅读器里的划线和笔记（按章节）。用于了解读者关注什么、有哪些疑问，出题和答疑时优先围绕这些内容。",
        "列出划线。",
        ChapterFilter,
        list_highlights,
    ),
    ToolSpec("list_inserts", "列出读者已经保存在阅读器里的补充内容。", "列出补充。", InsertListArgs, list_inserts),
    ToolSpec(
        "list_annotations",
        "只读列出阅读器批注（术语、出处、实体、时效、延伸），可按章、类型和关键词过滤。来源 URL 是站外资料。",
        "列出批注。",
        AnnotationListArgs,
        list_annotations,
    ),
    ToolSpec(
        "propose_insert",
        "把一段 Markdown 提交为阅读器补充，放在指定段落之后。只会生成待确认请求，读者在网页上批准后才真正写入。",
        "提交补充。",
        ProposeInsertArgs,
        propose_insert,
    ),
]
