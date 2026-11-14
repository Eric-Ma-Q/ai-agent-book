"""开关的中文元数据：网页按章分组生成表单，并解释每个开关对应书里的什么机制。"""

from __future__ import annotations

from typing import Any

from .config import AgentConfig

KNOB_GROUPS: list[dict[str, Any]] = [
    {
        "chapter": 1,
        "title": "第 1 章 · 上下文消融",
        "summary": "Agent = LLM + 上下文 + 工具。拿掉一类上下文，看 Agent 怎样坏掉。",
        "fields": [
            {"name": "drop_history", "label": "去掉历史", "help": "只保留问题和最近一轮工具调用（实验 1-1 的 NO_HISTORY）。"},
            {"name": "drop_tool_results", "label": "去掉工具结果", "help": "工具照常执行，但模型只看到「结果已省略」。"},
            {"name": "drop_tool_definitions", "label": "去掉工具定义", "help": "不发送 tools 字段，模型无法调用工具，只能凭记忆回答。"},
        ],
    },
    {
        "chapter": 2,
        "title": "第 2 章 · 上下文工程",
        "summary": "前缀稳定才能命中缓存；上下文太长时需要压缩；状态栏帮模型掌握进度。",
        "fields": [
            {"name": "stable_prefix", "label": "稳定前缀", "help": "关闭后，系统提示开头会带上时间戳，每次请求的前缀都不同，缓存失效。"},
            {"name": "status_bar", "label": "状态栏", "help": "每轮末尾追加轮次、预算和已读小节（第 2 章 Agent 状态栏）。"},
            {"name": "compression", "label": "上下文压缩", "help": "truncate：旧工具结果只留前 200 字；summarize：调一次模型把旧轮次压成摘要。"},
            {"name": "compress_after_tokens", "label": "压缩阈值（估计 token）", "help": "历史超过这个长度才压缩。"},
        ],
    },
    {
        "chapter": 3,
        "title": "第 3 章 · 检索与记忆",
        "summary": "检索方式决定能找到什么；跨会话记忆让 Agent 记住读者。",
        "fields": [
            {"name": "retrieval", "label": "检索方式", "help": "bm25：关键词；tfidf：词频向量余弦；hybrid：两者用 RRF 融合。"},
            {"name": "memory", "label": "跨会话记忆", "help": "把以前的问答摘要注入系统提示，回答结束后记下这次问答。"},
        ],
    },
    {
        "chapter": 4,
        "title": "第 4 章 · 工具设计",
        "summary": "工具越多越容易选错；描述写得好不好直接影响选择。",
        "fields": [
            {"name": "distractor_tools", "label": "干扰工具数量", "help": "加入看似合理但本环境不可用的工具，统计选错的比例。"},
            {"name": "tool_descriptions", "label": "工具描述", "help": "detailed：完整说明用途和用法；terse：只有几个字。"},
        ],
    },
    {
        "chapter": 5,
        "title": "第 5 章 · 代码即工具",
        "summary": "代码是能创造新工具的工具。",
        "fields": [
            {"name": "tools", "label": "可用工具", "help": "勾选 run_python 运行代码，勾选 create_tool 允许 Agent 现场写新工具。"},
        ],
    },
    {
        "chapter": 9,
        "title": "第 9 章 · 持续进化",
        "summary": "从失败中学到的规则，经过回归门禁后才生效。",
        "fields": [
            {"name": "learned_rules", "label": "使用学习规则", "help": "把当前生效版本的规则追加到系统提示。"},
        ],
    },
    {
        "chapter": 10,
        "title": "第 10 章 · 多 Agent 协作",
        "summary": "多 Agent 只有引入新信息时才优于单 Agent；子 Agent 是否共享上下文，是最基础的设计决策。",
        "fields": [
            {
                "name": "subagent",
                "label": "子 Agent",
                "help": "主 Agent 只规划和作答，查书交给子 Agent（delegate 工具）。shared：子 Agent 带上主 Agent 的完整对话；isolated：只拿到一句任务说明。",
            },
            {"name": "subagent_max_turns", "label": "子 Agent 最大轮数", "help": "每个子 Agent 自己的轮数上限；一次运行最多委派 4 次。"},
            {
                "name": "reviewer",
                "label": "审核者",
                "help": "回答后交给审核者，退回则主 Agent 修改。self：只看问题和回答；evidence：另外拿到每条引用的原文核对结果（外部工具反馈）。",
            },
            {"name": "review_rounds", "label": "最多退回次数", "help": "审核者最多退回几次；最后一次修改稿直接作为最终回答。"},
        ],
    },
]

BASIC_FIELDS = [
    {"name": "model_profile", "label": "模型档案"},
    {"name": "model", "label": "模型 ID"},
    {"name": "max_turns", "label": "最大轮数"},
    {"name": "max_total_tokens", "label": "token 预算"},
    {"name": "temperature", "label": "温度"},
]


def knob_catalog(tool_names: list[str]) -> dict[str, Any]:
    schema = AgentConfig.model_json_schema()
    return {
        "defaults": AgentConfig().model_dump(mode="json"),
        "schema": schema["properties"],
        "basic": BASIC_FIELDS,
        "groups": KNOB_GROUPS,
        "tools": tool_names,
    }
