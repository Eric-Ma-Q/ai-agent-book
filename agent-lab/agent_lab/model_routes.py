"""模型档案的 HTTP 接口：增删改查、默认档案、测试连接、价格查找与同步。

密钥只在写请求里出现，任何读接口都只返回 `has_key`。价格来自公开的 models.dev 目录。
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from .llm.client import OpenAICompatClient
from .models import ModelError, ModelStore
from .pricing_catalog import PriceCatalog, PricingUnavailable

if TYPE_CHECKING:
    from .server import LabService

PROBE_TIMEOUT_S = 10.0


class ProfileBody(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    base_url: str = Field(min_length=1, max_length=500)
    protocol: str = "openai-chat"
    model: str = Field(min_length=1, max_length=200)
    api_key: str | None = None
    copy_key_from: str | None = Field(default=None, max_length=40)
    context_window: int = Field(default=200_000, ge=1, le=10_000_000)
    max_output_tokens: int = Field(default=8_192, ge=1, le=10_000_000)
    input_types: list[str] = ["text"]
    reasoning: dict[str, Any] | None = None
    pricing: dict[str, Any] | None = None


class LookupBody(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    base_url: str | None = Field(default=None, max_length=500)
    limit: int = Field(default=20, ge=1, le=50)
    force: bool = False


class SyncBody(BaseModel):
    force: bool = False


class ApplyBody(BaseModel):
    key: str = Field(min_length=1, max_length=200)


class ProbeBody(BaseModel):
    base_url: str = Field(min_length=1, max_length=500)
    api_key: str | None = None
    id: str | None = Field(default=None, max_length=40)


def _ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def _api_error(status: int, message: str):
    from .server import ApiError

    return ApiError(status, message)


def _safe_error(error: Exception) -> str:
    message = str(error).replace("\n", " ").strip()
    return message[:300] or type(error).__name__


def probe_endpoint(base_url: str, api_key: str = "", timeout_s: float = PROBE_TIMEOUT_S) -> dict[str, Any]:
    """请求 `GET {base_url}/models`，不发起对话，不产生 token 费用。"""
    started = time.monotonic()
    try:
        with httpx.Client(timeout=timeout_s) as http:
            client = OpenAICompatClient(base_url=base_url, api_key=api_key, http=http, max_retries=0)
            models = client.list_models()
    except Exception as error:  # noqa: BLE001 - 任何连接/解析问题都如实返回给界面
        return {"ok": False, "models": [], "latency_ms": int((time.monotonic() - started) * 1000), "error": _safe_error(error)}
    return {"ok": True, "models": models, "latency_ms": int((time.monotonic() - started) * 1000), "error": None}


def model_routes(service: "LabService") -> APIRouter:
    router = APIRouter()
    lab = service.lab

    def store() -> ModelStore:
        if lab.models is None:
            raise _api_error(503, "模型档案存储未启用")
        return lab.models

    def catalog() -> PriceCatalog:
        if lab.pricing is None:
            raise _api_error(503, "价格目录未启用")
        return lab.pricing

    def handle(action):
        try:
            return action()
        except PricingUnavailable as error:
            raise _api_error(503, str(error)) from error
        except ModelError as error:
            raise _api_error(400, str(error)) from error

    @router.get("/models")
    def list_models() -> dict:
        try:
            return _ok(store().listing())
        except ModelError as error:
            raise _api_error(500, str(error)) from error

    @router.post("/models")
    def create(body: ProfileBody) -> dict:
        data = body.model_dump(exclude={"api_key", "copy_key_from"}, exclude_unset=True)
        return _ok(handle(lambda: store().create(data, api_key=body.api_key, copy_key_from=body.copy_key_from)))

    @router.put("/models/{profile_id}")
    def update(profile_id: str, body: ProfileBody) -> dict:
        if body.copy_key_from:
            raise _api_error(400, "copy_key_from 只用于新建档案")
        data = body.model_dump(exclude={"api_key", "copy_key_from"}, exclude_unset=True)
        return _ok(handle(lambda: store().update(profile_id, data, api_key=body.api_key)))

    @router.delete("/models/{profile_id}")
    def delete(profile_id: str) -> dict:
        handle(lambda: store().delete(profile_id))
        return _ok({"deleted": profile_id})

    @router.post("/models/{profile_id}/default")
    def make_default(profile_id: str) -> dict:
        return _ok(handle(lambda: store().set_default(profile_id)))

    @router.post("/models/{profile_id}/test")
    def test_saved(profile_id: str) -> dict:
        catalog = handle(store().catalog)
        profile = catalog.find(profile_id)
        if profile is None:
            raise _api_error(404, f"模型档案 {profile_id} 不存在")
        key = handle(lambda: store().key_for(profile_id))
        return _ok(probe_endpoint(profile.base_url, key))

    @router.get("/pricing/status")
    def pricing_status() -> dict:
        return _ok(handle(lambda: catalog().status()))

    @router.post("/pricing/lookup")
    def pricing_lookup(body: LookupBody) -> dict:
        return _ok(handle(lambda: catalog().lookup(body.model, body.base_url or "", body.limit, body.force)))

    @router.post("/models/pricing/sync")
    def sync_all(body: SyncBody | None = None) -> dict:
        force = bool(body and body.force)
        return _ok(handle(lambda: catalog().sync_all(store(), force=force)))

    @router.post("/models/{profile_id}/pricing/sync")
    def sync_one(profile_id: str, body: SyncBody | None = None) -> dict:
        force = bool(body and body.force)
        return _ok(handle(lambda: catalog().sync_profile(store(), profile_id, force=force)))

    @router.post("/models/{profile_id}/pricing/apply")
    def apply_pricing(profile_id: str, body: ApplyBody) -> dict:
        return _ok(handle(lambda: catalog().apply_profile(store(), profile_id, body.key)))

    @router.post("/models/test")
    def test_draft(body: ProbeBody) -> dict:
        base_url = body.base_url.strip().rstrip("/")
        key = body.api_key or ""
        if not key and body.id:
            key = handle(lambda: store().key_for(body.id or ""))
        return _ok(probe_endpoint(base_url, key))

    return router
