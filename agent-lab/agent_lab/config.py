"""Agent 配置（开关）与运行环境设置。"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

DEFAULT_TOOLS = ("list_chapters", "search_book", "read_section")
REPO_ROOT = Path(__file__).resolve().parents[2]


class AgentConfig(BaseModel):
    """一次运行的全部行为设定。新增开关时，默认值必须保持原有行为。"""

    model_config = ConfigDict(frozen=True, extra="forbid")

    model: str = "big-pickle"
    model_profile: str = ""  # 模型档案 id；空表示按默认档案或 .env
    max_turns: int = Field(default=12, ge=1, le=50)
    max_total_tokens: int = Field(default=200_000, ge=1_000)
    max_output_tokens: int = Field(default=4_096, ge=64)
    temperature: float = Field(default=0.2, ge=0.0, le=2.0)
    tools: tuple[str, ...] = DEFAULT_TOOLS

    # 第 1 章：上下文消融
    drop_history: bool = False  # 只保留最近一轮工具调用（实验 1-1 的 NO_HISTORY）
    drop_tool_results: bool = False  # 工具结果替换为占位文字
    drop_tool_definitions: bool = False  # 不发送 tools 字段

    # 第 2 章：上下文工程
    stable_prefix: bool = True  # False 时在系统提示开头放时间戳，破坏前缀缓存
    status_bar: bool = False  # 每轮末尾追加状态栏（轮次、预算、已读小节）
    final_answer: bool = False  # 最后一轮关闭工具，强制用已有材料作答
    compression: Literal["none", "truncate", "summarize"] = "none"
    compress_after_tokens: int = Field(default=12_000, ge=1_000)
    keep_recent_tool_results: int = Field(default=2, ge=0)

    # 第 3 章：检索与记忆
    retrieval: Literal["bm25", "tfidf", "hybrid"] = "bm25"
    memory: bool = False  # 跨会话记忆：把过去的问答摘要注入系统提示

    # 第 4 章：工具设计
    distractor_tools: int = Field(default=0, ge=0, le=20)  # 加入无关的干扰工具
    tool_descriptions: Literal["detailed", "terse"] = "detailed"

    # 第 9 章：自我改进
    learned_rules: bool = False  # 把已生效的学习规则追加到系统提示

    # 第 10 章：多 Agent 协作
    subagent: Literal["none", "shared", "isolated"] = "none"  # 管理者 + 子 Agent；子 Agent 是否共享上下文
    subagent_max_turns: int = Field(default=6, ge=1, le=20)
    reviewer: Literal["none", "self", "evidence"] = "none"  # 审核者；evidence 时拿到引用核对结果
    review_rounds: int = Field(default=1, ge=1, le=3)  # 最多退回几次


# 在这些字段之后加入的开关：取默认值时不计入哈希，已有配置的哈希（评估录制目录名）保持不变。
_HASH_OPTIONAL = {
    name: AgentConfig.model_fields[name].default
    for name in ("model_profile", "subagent", "subagent_max_turns", "reviewer", "review_rounds", "final_answer")
}


def config_hash(cfg: AgentConfig) -> str:
    data = {k: v for k, v in cfg.model_dump(mode="json").items() if k not in _HASH_OPTIONAL or v != _HASH_OPTIONAL[k]}
    canonical = json.dumps(data, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf8")).hexdigest()[:12]


def _parse_value(field: str, raw: str) -> Any:
    if field == "tools":
        return tuple(name.strip() for name in raw.split(",") if name.strip())
    lowered = raw.strip().lower()
    if lowered in ("true", "false"):
        return lowered == "true"
    return raw.strip()


def apply_overrides(cfg: AgentConfig, overrides: list[str] | dict[str, Any]) -> AgentConfig:
    """返回应用了覆盖项的新配置。overrides 可以是 ["k=v", ...] 或字典。"""
    if isinstance(overrides, dict):
        updates = dict(overrides)
    else:
        updates = {}
        for item in overrides:
            if "=" not in item:
                raise ValueError(f"覆盖项必须写成 key=value：{item!r}")
            key, raw = item.split("=", 1)
            updates[key.strip()] = _parse_value(key.strip(), raw)
    try:
        return AgentConfig.model_validate({**cfg.model_dump(), **updates})
    except ValidationError as error:
        raise ValueError(f"配置无效：{error}") from error


def load_config_file(path: Path) -> AgentConfig:
    data = yaml.safe_load(Path(path).read_text(encoding="utf8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} 必须是一个 YAML 映射")
    return apply_overrides(AgentConfig(), data)


def _read_env_file(path: Path | None) -> dict[str, str]:
    if path is None or not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


class Settings(BaseModel):
    """运行环境：模型接口地址、密钥、数据目录。来自环境变量和 .env。"""

    model_config = ConfigDict(frozen=True)

    llm_base_url: str = "http://127.0.0.1:8080/v1"
    llm_api_key: str = Field(default="", repr=False)
    model: str = "big-pickle"
    # 没有模型档案时的输出上限；有档案时以档案的 max_output_tokens 为准。
    max_output_tokens: int = Field(default=4_096, ge=64)
    repo_root: Path = REPO_ROOT
    book_dir_override: Path | None = None
    personal_dir_override: Path | None = None
    data_dir_override: Path | None = None
    harness_dir_override: Path | None = None
    reader_url: str = "http://127.0.0.1:4321"
    llm_timeout_s: float = 120.0
    pricing_url: str = "https://models.dev/api.json"
    pricing_ttl_h: float = Field(default=24.0, ge=1.0, le=720.0)
    web_search_url: str = ""
    web_search_timeout_s: float = Field(default=25.0, ge=1.0, le=120.0)

    # 需求 024：MCP 知识服务。token 为空表示端点关闭；长度不足 16 位同样按未配置处理。
    mcp_token: str = Field(default="", repr=False)
    mcp_ask_wait_s: float = Field(default=45.0, ge=0.0, le=120.0)
    mcp_ask_max_turns: int = Field(default=8, ge=1, le=12)
    mcp_max_active_asks: int = Field(default=2, ge=1, le=4)
    mcp_asks_per_minute: int = Field(default=12, ge=1, le=60)
    mcp_session_ttl_s: int = Field(default=3600, ge=60, le=86400)

    @property
    def book_dir(self) -> Path:
        return self.book_dir_override or self.repo_root / "book"

    @property
    def personal_dir(self) -> Path:
        return self.personal_dir_override or self.repo_root / "personal"

    @property
    def data_dir(self) -> Path:
        return self.data_dir_override or self.personal_dir / "lab"

    @property
    def harness_dir(self) -> Path:
        return self.harness_dir_override or self.repo_root / "web-astro" / "personal" / "harness"

    @classmethod
    def load(cls, env_file: Path | None = None, repo_root: Path | None = None) -> "Settings":
        root = repo_root or REPO_ROOT
        env_path = env_file if env_file is not None else root / "agent-lab" / ".env"
        values = {**_read_env_file(env_path), **{k: v for k, v in os.environ.items() if k.startswith("LAB_")}}

        def path(key: str) -> Path | None:
            return Path(values[key]).expanduser() if values.get(key) else None

        fields: dict[str, Any] = {"repo_root": root}
        mapping = {
            "LAB_LLM_BASE_URL": "llm_base_url",
            "LAB_LLM_API_KEY": "llm_api_key",
            "LAB_MODEL": "model",
            "LAB_MAX_OUTPUT_TOKENS": "max_output_tokens",
            "LAB_READER_URL": "reader_url",
            "LAB_LLM_TIMEOUT_S": "llm_timeout_s",
            "LAB_PRICING_URL": "pricing_url",
            "LAB_PRICING_TTL_H": "pricing_ttl_h",
            "LAB_WEB_SEARCH_URL": "web_search_url",
            "LAB_WEB_SEARCH_TIMEOUT_S": "web_search_timeout_s",
            "LAB_MCP_TOKEN": "mcp_token",
            "LAB_MCP_ASK_WAIT_S": "mcp_ask_wait_s",
            "LAB_MCP_ASK_MAX_TURNS": "mcp_ask_max_turns",
            "LAB_MCP_MAX_ACTIVE_ASKS": "mcp_max_active_asks",
            "LAB_MCP_ASKS_PER_MINUTE": "mcp_asks_per_minute",
            "LAB_MCP_SESSION_TTL_S": "mcp_session_ttl_s",
        }
        for key, name in mapping.items():
            if key not in values or values[key] == "":
                continue
            raw = values[key]
            fields[name] = raw
        fields["book_dir_override"] = path("LAB_BOOK_DIR")
        fields["personal_dir_override"] = path("LAB_PERSONAL_DIR")
        fields["data_dir_override"] = path("LAB_DATA_DIR")
        fields["harness_dir_override"] = path("LAB_HARNESS_DIR")
        return cls(**fields)
