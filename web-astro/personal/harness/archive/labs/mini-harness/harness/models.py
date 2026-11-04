"""模型接口层：统一的 chat(messages, tools) 协议。

- FakeModel：按脚本返回预设响应，让所有测试/eval 离线可跑、结果确定（任务单 S 约束）。
- OpenAICompatModel：OpenAI 兼容 Chat Completions + tools，HTTP 用 urllib，零依赖。
  配置全部来自环境变量，代码里不写任何密钥：
    HARNESS_BASE_URL  默认 http://localhost:8080/v1
    HARNESS_MODEL     模型名（真模型必填）
    HARNESS_API_KEY   可空；为空则不带 Authorization 头
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field

DEFAULT_BASE_URL = "http://localhost:8080/v1"


@dataclass
class ToolCall:
    """模型发出的一次工具调用（已把 JSON 参数解析成 dict）。"""

    id: str
    name: str
    arguments: dict


@dataclass
class ModelResponse:
    """一次模型调用的结果：要么带文本，要么带工具调用，通常二者只取其一。"""

    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict | None = None  # {"prompt_tokens": int, "completion_tokens": int}，假模型为 None


class Model:
    """所有模型实现的最小协议：输入 wire 格式消息与工具 schema，输出 ModelResponse。"""

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> ModelResponse:
        raise NotImplementedError


def estimate_tokens(messages: list[dict]) -> int:
    """token 估算：JSON 序列化后的字符数 / 4。

    中英混合场景的粗略近似，教学用；真模型的 usage 字段优先于它。
    """
    total = sum(len(json.dumps(m, ensure_ascii=False)) for m in messages)
    return max(1, total // 4)


class FakeModel(Model):
    """按脚本顺序吐出预设响应。

    脚本项支持三种写法：
      "一段文本"            → 纯文本回复（不再调用工具，循环结束）
      ("bash", {...})       → 单个工具调用
      [("bash", {...}), …]  → 同一条消息里的多个工具调用
      ModelResponse(...)    → 原样返回

    两个队列：
      script            主对话调用（chat 带 tools 参数）按序消费；
      compaction_script 压缩这类系统调用（chat 不带 tools 参数）按序消费，
                        为空时回落到主队列。分队列是为了让"第 N 步触发压缩"
                        这类时序在测试里可精确表达。
    脚本耗尽后返回固定文本，保证主循环必然终止（测试不会挂死）。
    """

    def __init__(self, script: list | None = None, compaction_script: list | None = None):
        self.script: list = list(script or [])
        self.compaction_script: list = list(compaction_script or [])
        self.calls: list[list[dict]] = []  # 每次 chat 收到的消息快照，供测试断言

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> ModelResponse:
        self.calls.append([dict(m) for m in messages])
        queue = self.compaction_script if (tools is None and self.compaction_script) else self.script
        if not queue:
            return ModelResponse(content="(FakeModel 脚本已用尽，结束循环)")
        item = queue.pop(0)
        if isinstance(item, ModelResponse):
            return item
        if isinstance(item, str):
            return ModelResponse(content=item)
        if isinstance(item, tuple):
            item = [item]
        if isinstance(item, list):
            tcs = [
                ToolCall(id=f"fake_{i}", name=name, arguments=dict(args))
                for i, (name, args) in enumerate(item)
            ]
            return ModelResponse(tool_calls=tcs)
        raise TypeError(f"FakeModel 不认识的脚本项: {item!r}")


class OpenAICompatModel(Model):
    """OpenAI 兼容的 Chat Completions + tools 客户端（urllib 实现，零第三方依赖）。"""

    def __init__(self, base_url: str | None = None, model: str | None = None,
                 api_key: str | None = None, timeout: int = 180):
        self.base_url = (base_url or os.environ.get("HARNESS_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.model = model or os.environ.get("HARNESS_MODEL", "")
        self.api_key = api_key if api_key is not None else os.environ.get("HARNESS_API_KEY", "")
        self.timeout = timeout
        if not self.model:
            raise ValueError("缺少模型名：请设置环境变量 HARNESS_MODEL")

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> ModelResponse:
        payload: dict = {"model": self.model, "messages": messages, "temperature": 0}
        if tools:
            payload["tools"] = [{"type": "function", "function": t} for t in tools]
        req = urllib.request.Request(
            self.base_url + "/chat/completions",
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        if self.api_key:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:500]
            raise RuntimeError(f"模型服务返回 {e.code}: {body}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(
                f"连不上模型服务 {self.base_url}（{e.reason}）。"
                "请确认 HARNESS_BASE_URL 指向一个 OpenAI 兼容服务。"
            ) from e

        msg = data["choices"][0]["message"]
        tcs = []
        for i, tc in enumerate(msg.get("tool_calls") or []):
            fn = tc["function"]
            raw = fn.get("arguments") or "{}"
            try:
                args = json.loads(raw)
            except json.JSONDecodeError:
                args = {"_raw": raw}  # 参数不是合法 JSON 时原样透传，让工具层报可读错误
            tcs.append(ToolCall(id=tc.get("id") or f"call_{i}", name=fn["name"], arguments=args))
        return ModelResponse(
            content=msg.get("content"),
            tool_calls=tcs,
            usage=data.get("usage"),
        )
