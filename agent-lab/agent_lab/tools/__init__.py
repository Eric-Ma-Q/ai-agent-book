"""全部内置工具。哪些工具对模型可见，由 AgentConfig.tools 决定。"""

from __future__ import annotations

from .registry import ToolSpec


def all_tools() -> list[ToolSpec]:
    from .book import BOOK_TOOLS
    from .code import CODE_TOOLS
    from .files import FILE_TOOLS
    from .page import PAGE_TOOLS
    from .personal import PERSONAL_TOOLS
    from .shell import SHELL_TOOLS
    from .web import WEB_TOOLS

    return [*BOOK_TOOLS, *PERSONAL_TOOLS, *CODE_TOOLS, *PAGE_TOOLS, *FILE_TOOLS, *SHELL_TOOLS, *WEB_TOOLS]
