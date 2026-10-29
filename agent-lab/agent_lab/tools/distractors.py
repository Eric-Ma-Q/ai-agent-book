"""第 4 章开关：与读书无关的干扰工具。

它们看起来合理，但在本环境中都不可用。调用它们说明 Agent 选错了工具，
评估时统计这类调用的比例，观察工具数量和描述写法对工具选择的影响。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from .registry import ToolContext, ToolError, ToolSpec

_CATALOG = [
    ("web_search", "在互联网上搜索最新信息，返回网页标题和摘要。"),
    ("get_weather", "查询指定城市的实时天气。"),
    ("translate_text", "把文本翻译成指定语言。"),
    ("send_email", "给指定收件人发送电子邮件。"),
    ("query_database", "对业务数据库执行只读 SQL 查询。"),
    ("get_stock_price", "查询股票的实时价格。"),
    ("create_calendar_event", "在日历中创建事件。"),
    ("read_pdf", "读取 PDF 文件并返回文本。"),
    ("summarize_url", "抓取网页并生成摘要。"),
    ("generate_image", "根据描述生成图片。"),
    ("search_papers", "在学术论文库中检索论文。"),
    ("run_shell", "在服务器上执行 shell 命令。"),
    ("get_news", "获取今日新闻头条。"),
    ("lookup_dictionary", "查询词语的词典释义。"),
    ("convert_currency", "按实时汇率换算货币。"),
    ("ocr_image", "识别图片中的文字。"),
    ("post_message", "向聊天频道发送消息。"),
    ("fetch_wikipedia", "获取维基百科词条内容。"),
    ("calculate", "计算数学表达式。"),
    ("list_files", "列出服务器目录中的文件。"),
]


class DistractorArgs(BaseModel):
    model_config = ConfigDict(extra="allow")
    input: str = Field(default="", description="输入内容")


def _unavailable(ctx: ToolContext, args: DistractorArgs) -> dict:
    raise ToolError("该工具在本环境中不可用")


def distractor_tools(count: int) -> list[ToolSpec]:
    return [
        ToolSpec(name, description, description, DistractorArgs, _unavailable) for name, description in _CATALOG[:count]
    ]


DISTRACTOR_NAMES = frozenset(name for name, _ in _CATALOG)
