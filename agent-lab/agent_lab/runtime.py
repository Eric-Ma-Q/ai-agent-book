"""运行时装配：加载书稿、建立索引、创建客户端与存储。命令行和 HTTP 服务共用。"""

from __future__ import annotations

import hashlib
import subprocess
import threading
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

import httpx

from .agent import AgentDeps, RunOutcome, run_agent
from .book.index import SearchService
from .book.parser import Book, load_book
from .citations import CitationChecker
from .config import AgentConfig, Settings
from .llm.client import ChatClient, OpenAICompatClient
from .llm.pricing import Price, price_from_pricing
from .models import ModelError, ModelProfile, ModelStore
from .pricing_catalog import PriceCatalog
from .tools.registry import ToolRegistry
from .trace.schema import Event, RunEnd, RunStart
from .trace.store import RunStore, new_run_id


@lru_cache(maxsize=4)
def git_sha(repo_root: Path) -> str | None:
    try:
        out = subprocess.run(["git", "-C", str(repo_root), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def default_client(settings: Settings) -> ChatClient:
    return OpenAICompatClient(
        base_url=settings.llm_base_url, api_key=settings.llm_api_key, http=httpx.Client(timeout=settings.llm_timeout_s)
    )


def default_registry() -> ToolRegistry:
    from .tools import all_tools

    return ToolRegistry(all_tools())


@dataclass
class Lab:
    settings: Settings
    client: ChatClient
    book: Book
    search: SearchService
    checker: CitationChecker
    store: RunStore
    registry: ToolRegistry
    extras: dict[str, Any] = field(default_factory=dict)  # gate / notes / sandbox / memory / rules
    models: ModelStore | None = None
    pricing: PriceCatalog | None = None
    clients: dict[str, ChatClient] = field(default_factory=dict)  # 按档案缓存的真实客户端
    client_fingerprints: dict[str, str] = field(default_factory=dict)
    pinned_clients: dict[str, ChatClient] = field(default_factory=dict)  # 测试或回放注入的客户端

    @classmethod
    def create(
        cls,
        settings: Settings,
        client: ChatClient | None = None,
        clients: dict[str, ChatClient] | None = None,
        pricing: PriceCatalog | None = None,
        **extras: Any,
    ) -> "Lab":
        book = load_book(settings.book_dir)
        lab = cls(
            settings=settings,
            client=client or default_client(settings),
            book=book,
            search=SearchService(book),
            checker=CitationChecker(book),
            store=RunStore(settings.data_dir),
            registry=default_registry(),
            models=ModelStore(settings.data_dir),
            pricing=pricing or PriceCatalog(settings.data_dir, settings.pricing_url, settings.pricing_ttl_h * 3600),
            pinned_clients=dict(clients or {}),
        )
        lab.extras = {**lab.default_extras(), **extras}
        return lab

    def default_extras(self) -> dict[str, Any]:
        from .services import default_services

        return default_services(self.settings)

    def profile_for(self, config: AgentConfig) -> ModelProfile | None:
        if self.models is None:
            return None
        return self.models.resolve(config.model_profile or None)

    def adapt_config(self, config: AgentConfig) -> AgentConfig:
        """按档案覆盖模型 ID 和输出上限；没有档案时原样返回。"""
        profile = self.profile_for(config)
        if profile is None:
            return config
        return config.model_copy(
            update={
                "model": profile.model,
                "model_profile": profile.id,
                "max_output_tokens": min(config.max_output_tokens, profile.max_output_tokens),
            }
        )

    def price_for(self, config: AgentConfig) -> Price | None:
        """档案填了价格就用它；否则交给内置规则（免费模型 0、其余未知）。"""
        profile = self.profile_for(config)
        if profile is None or profile.pricing is None:
            return None
        return price_from_pricing(profile.pricing)

    def client_for(self, config: AgentConfig) -> ChatClient:
        """档案指定了接口时构造对应客户端；否则用 .env 的客户端。"""
        profile_id = config.model_profile
        if not profile_id or self.models is None:
            return self.client
        if profile_id in self.pinned_clients:
            return self.pinned_clients[profile_id]
        profile = self.models.resolve(profile_id)
        if profile is None:
            raise ModelError(f"模型档案 {profile_id} 不存在")
        key = self.models.key_for(profile.id)
        fingerprint = hashlib.sha1(f"{profile.model_dump_json()}|{key}".encode("utf8")).hexdigest()
        cached = self.clients.get(profile.id)
        if cached is not None and self.client_fingerprints.get(profile.id) == fingerprint:
            return cached
        client = OpenAICompatClient(
            base_url=profile.base_url, api_key=key, http=httpx.Client(timeout=self.settings.llm_timeout_s)
        )
        self.clients[profile.id] = client
        self.client_fingerprints[profile.id] = fingerprint
        return client

    def request_extra(self, config: AgentConfig, level: str | None = None) -> dict[str, Any]:
        """档案的推理参数；给了档位名时按该档位覆盖，空串或 None 用档案默认。"""
        profile = self.profile_for(config)
        return profile.reasoning.extra_for(level) if profile else {}

    def deps(
        self,
        client: ChatClient | None = None,
        services: dict[str, Any] | None = None,
        request_extra: dict[str, Any] | None = None,
        price: Price | None = None,
        page: Any = None,
        system_prompt: str | None = None,
    ) -> AgentDeps:
        extras = {**self.extras, **(services or {})}
        return AgentDeps(
            client=client or self.client,
            registry=self.registry,
            book=self.book,
            search=self.search,
            checker=self.checker,
            settings=self.settings,
            request_extra=request_extra or {},
            price=price,
            git_sha=git_sha(self.settings.repo_root),
            page=page,
            system_prompt=system_prompt,
            **extras,
        )

    def session_history(self, session_id: str | None) -> list[dict[str, Any]]:
        """同一会话里以前的问答（只带问题和最终回答，不带工具轨迹）。"""
        if not session_id:
            return []
        history: list[dict[str, Any]] = []
        for summary in self.store.session_runs(session_id):
            events = self.store.read(summary["run_id"])
            start = next(e for e in events if isinstance(e, RunStart))
            end = next((e for e in events if isinstance(e, RunEnd)), None)
            if end and end.answer:
                history += [{"role": "user", "content": start.question}, {"role": "assistant", "content": end.answer}]
            elif end and end.status != "ok":
                # 失败的轮次没有回答，但问题要留下；追问时模型才知道上次停在哪。
                note = end.error or end.status
                history += [
                    {"role": "user", "content": start.question},
                    {"role": "assistant", "content": f"（上一次运行未完成：{note}）"},
                ]
        return history

    def run(
        self,
        question: str,
        config: AgentConfig,
        *,
        run_id: str | None = None,
        session_id: str | None = None,
        meta: dict[str, Any] | None = None,
        cancel: threading.Event | None = None,
        client: ChatClient | None = None,
        on_event: Callable[[Event], None] | None = None,
        services: dict[str, Any] | None = None,
        page: Any = None,
        system_prompt: str | None = None,
        prelude: str | None = None,
        images: list[str] | None = None,
        reasoning_level: str | None = None,
    ) -> RunOutcome:
        run_id = run_id or new_run_id()
        config = self.adapt_config(config)
        selected = client or self.client_for(config)

        def emit(event: Event) -> Event:
            stamped = self.store.append(run_id, event)
            if on_event:
                on_event(stamped)
            return stamped

        return run_agent(
            self.deps(
                selected,
                services,
                request_extra=self.request_extra(config, reasoning_level),
                price=self.price_for(config),
                page=page,
                system_prompt=system_prompt,
            ),
            question,
            config,
            run_id=run_id,
            emit=emit,
            session_history=self.session_history(session_id),
            session_id=session_id,
            meta=meta,
            cancel=cancel,
            prelude=prelude,
            images=images,
        )
