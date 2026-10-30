"""模型价格目录：从 models.dev 拉取、裁剪、缓存，并按模型 ID 匹配。

价格只用于成本统计，不影响请求。目录缓存在 `personal/lab/pricing/models.dev.json`
（不入库）；所有网络访问都经过注入的 fetcher，测试不联网。
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import httpx

from .models import ModelError, ModelPricing, ModelStore, ModelProfile

MODELS_DEV_URL = "https://models.dev/api.json"
FETCH_TIMEOUT_S = 20.0
CURL_TIMEOUT_S = 30
USER_AGENT = "agent-lab/1.0 (model pricing sync)"
MAX_CANDIDATES = 20
EXACT = 3
CONTAINS = 2
ALIAS = 2  # 只在 canonical 上对得上：用来展示候选，不用于自动同步
HOST_BONUS = 1
MIN_CONTAINS_LEN = 4

# 声音、图像、向量类模型没有文本 token 单价，或单价没有可比性，目录里直接丢掉。
_NON_TEXT_MARKERS = (
    "embedding",
    "moderation",
    "rerank",
    "transcribe",
    "whisper",
    "text-to-speech",
    "image-generation",
    "stable-diffusion",
)
_NON_TEXT_OUTPUTS = {"audio", "image", "video"}


class PricingError(ModelError):
    """价格目录或匹配有误，消息可以直接展示给用户。"""


class PricingUnavailable(PricingError):
    """拉取失败且没有可用缓存，接口层按 503 处理。"""


def normalize_model_id(raw: str) -> str:
    """把不同写法归一到 models.dev 的模型 ID。

    去掉 `vendor/` 前缀、`[1m]` 标记和短命名空间前缀（`cn:`、`openai:`），
    保留带数字的冒号前段（`glm-5:free` 里的 `glm-5` 是模型名，不是前缀）。
    """
    value = str(raw or "").strip().lower().replace("@", "-")
    if not value:
        return ""
    value = value.rsplit("/", 1)[-1].strip()
    value = re.sub(r"\[[^\]]*\]$", "", value).strip()
    if ":" in value:
        head, tail = value.rsplit(":", 1)
        namespace = head.strip() and len(head.strip()) <= 8 and not re.search(r"[\d-]", head)
        value = (tail if namespace else head).strip()
    return value


def _now_iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_time(text: Any) -> datetime | None:
    if not isinstance(text, str) or not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if value >= 0 else None


def _short(error: Exception) -> str:
    message = str(error).replace("\n", " ").strip()
    return message[:200] or type(error).__name__


def _is_text_model(model_id: str, model: dict[str, Any]) -> bool:
    if str(model.get("status") or "").lower() == "deprecated":
        return False
    outputs = [str(item).lower() for item in (model.get("modalities") or {}).get("output") or []]
    if outputs and ("text" not in outputs or any(item in _NON_TEXT_OUTPUTS for item in outputs)):
        return False
    searchable = f"{model_id} {model.get('name') or ''}".lower()
    return not any(marker in searchable for marker in _NON_TEXT_MARKERS)


def _entry(provider_id: str, provider: dict[str, Any], model_id: str, model: dict[str, Any]) -> dict[str, Any] | None:
    if not _is_text_model(model_id, model):
        return None
    cost = model.get("cost") or {}
    input_price, output_price = _number(cost.get("input")), _number(cost.get("output"))
    if input_price is None or output_price is None:
        return None
    limit = model.get("limit") or {}
    modalities = model.get("modalities") or {}
    canonical = str(model.get("canonical_model_id") or "")
    return {
        "provider": provider_id,
        "provider_name": str(provider.get("name") or provider_id),
        "api": str(provider.get("api") or ""),
        "model": model_id,
        "name": str(model.get("name") or model_id),
        "key": f"{provider_id}/{model_id}",
        "canonical": canonical,
        # 原厂条目的 canonical 指回自己；转售、聚合器和没有 canonical 的条目都不算原厂。
        "original": bool(canonical) and canonical.startswith(f"{provider_id}/"),
        "cost": {
            "input": input_price,
            "output": output_price,
            "cache_read": _number(cost.get("cache_read")) or 0.0,
            "cache_write": _number(cost.get("cache_write")) or 0.0,
        },
        "limit": {"context": limit.get("context"), "output": limit.get("output")},
        "modalities": {
            "input": list(modalities.get("input") or []),
            "output": list(modalities.get("output") or []),
        },
        "release_date": str(model.get("release_date") or ""),
    }


def build_entries(raw: Any) -> list[dict[str, Any]]:
    """models.dev 的 api.json → 查找用的条目。格式不对时明确报错。"""
    if not isinstance(raw, dict):
        raise PricingUnavailable("价格目录格式无效：期望一个 JSON 对象")
    entries: list[dict[str, Any]] = []
    for provider_id, provider in raw.items():
        if not isinstance(provider, dict):
            continue
        models = provider.get("models")
        if not isinstance(models, dict):
            continue
        for model_id, model in models.items():
            if not isinstance(model, dict):
                continue
            entry = _entry(str(provider_id), provider, str(model_id), model)
            if entry is not None:
                entries.append(entry)
    if not entries:
        raise PricingUnavailable("价格目录里没有可用的文本模型价格")
    return entries


def _fetch_with_curl(curl: str, url: str) -> Any:
    command = [
        curl, "-fsSL", "--compressed", "--max-time", str(CURL_TIMEOUT_S),
        "--proto", "=http,https", "-A", USER_AGENT, "-H", "accept: application/json", "--", url,
    ]
    try:
        result = subprocess.run(command, capture_output=True, timeout=CURL_TIMEOUT_S + 5, check=False)
    except (OSError, subprocess.SubprocessError) as error:
        raise PricingUnavailable(f"curl 请求失败：{error}") from error
    if result.returncode != 0:
        message = result.stderr.decode("utf8", "replace").strip()[:200] or "无错误输出"
        raise PricingUnavailable(f"curl 退出码 {result.returncode}：{message}")
    try:
        return json.loads(result.stdout)
    except ValueError as error:
        raise PricingUnavailable("价格目录不是合法 JSON") from error


def _fetch_with_httpx(url: str) -> Any:
    with httpx.Client(timeout=FETCH_TIMEOUT_S, follow_redirects=True) as http:
        response = http.get(url, headers={"accept": "application/json", "user-agent": USER_AGENT})
        response.raise_for_status()
        return response.json()


def _fetch_json(url: str) -> Any:
    """先试 curl，失败再试 httpx。

    models.dev 前面的 CDN 对 Python 的默认 TLS 握手和请求频率都敏感；两条 TLS 栈
    都试一遍能多一层机会，仍失败时由 `entries()` 统一转成可读错误或回退缓存。
    """
    problems: list[str] = []
    curl = shutil.which("curl")
    if curl:
        try:
            return _fetch_with_curl(curl, url)
        except Exception as error:  # noqa: BLE001 - 换一条路再试
            problems.append(_short(error))
    try:
        return _fetch_with_httpx(url)
    except Exception as error:  # noqa: BLE001 - 汇总后交给上层
        problems.append(_short(error))
    raise PricingUnavailable("价格目录拉取失败：" + "；".join(problems))


def _cost_key(entry: dict[str, Any]) -> tuple[float, float, float, float]:
    """四项单价完全一样就视为同一档价格；多家转售不必让人逐个选。"""
    cost = entry["cost"]
    return (cost["input"], cost["output"], cost["cache_read"], cost["cache_write"])


def _same_host(left: str, right: str) -> bool:
    if not left or not right:
        return False
    host = (urlparse(right).hostname or "").lower()
    return bool(host) and (host == left or host.endswith("." + left) or left.endswith("." + host))


class PriceCatalog:
    """价格目录的读取、缓存与匹配。线程内串行，写缓存用临时文件替换。"""

    def __init__(
        self,
        data_dir: Path,
        url: str = MODELS_DEV_URL,
        ttl_s: float = 24 * 3600,
        fetcher: Callable[[str], Any] | None = None,
        now: Callable[[], datetime] | None = None,
    ):
        self.path = Path(data_dir) / "pricing" / "models.dev.json"
        self.url = url
        self.ttl_s = max(float(ttl_s), 60.0)
        self.fetcher = fetcher or _fetch_json
        self.now = now or (lambda: datetime.now(timezone.utc))
        self.lock = threading.RLock()

    # ---- 缓存 ----

    def _load_cache(self) -> dict[str, Any] | None:
        if not self.path.exists():
            return None
        try:
            raw = json.loads(self.path.read_text(encoding="utf8"))
        except (OSError, ValueError):
            return None
        if not isinstance(raw, dict) or not isinstance(raw.get("entries"), list):
            return None
        return raw

    def _write_cache(self, payload: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".models.dev.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
                handle.write("\n")
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def _age_s(self, cache: dict[str, Any]) -> float:
        fetched = _parse_time(cache.get("fetched_at"))
        if fetched is None:
            return self.ttl_s + 1
        return max((self.now() - fetched).total_seconds(), 0.0)

    def _meta(self, cache: dict[str, Any] | None, stale: bool) -> dict[str, Any]:
        entries = (cache or {}).get("entries") or []
        return {
            "url": (cache or {}).get("url") or self.url,
            "fetched_at": (cache or {}).get("fetched_at"),
            "age_s": int(self._age_s(cache)) if cache else None,
            "count": len(entries),
            "stale": stale,
            "ttl_h": round(self.ttl_s / 3600, 2),
            "warnings": [],
        }

    def status(self) -> dict[str, Any]:
        with self.lock:
            cache = self._load_cache()
            meta = self._meta(cache, stale=True)
            meta["stale"] = bool(cache) and self._age_s(cache) > self.ttl_s
            return meta

    # ---- 拉取 ----

    def entries(self, force: bool = False) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        with self.lock:
            cache = self._load_cache()
            if cache is not None and not force and self._age_s(cache) <= self.ttl_s:
                return cache["entries"], self._meta(cache, stale=False)
            try:
                entries = build_entries(self.fetcher(self.url))
            except Exception as error:  # noqa: BLE001 - 网络、JSON、结构问题都按不可用处理
                if cache is not None:
                    meta = self._meta(cache, stale=True)
                    meta["warnings"] = [f"价格目录刷新失败，使用 {cache.get('fetched_at')} 的缓存：{_short(error)}"]
                    return cache["entries"], meta
                if isinstance(error, PricingUnavailable):
                    raise
                raise PricingUnavailable(
                    f"无法获取模型价格目录（{self.url}）：{_short(error)}。检查网络，或用 LAB_PRICING_URL 指向镜像"
                ) from error
            fetched_at = _now_iso(self.now())
            self._write_cache({"version": 1, "url": self.url, "fetched_at": fetched_at, "entries": entries})
            meta = {"url": self.url, "fetched_at": fetched_at, "age_s": 0, "count": len(entries), "stale": False,
                    "ttl_h": round(self.ttl_s / 3600, 2), "warnings": []}
            return entries, meta

    # ---- 查找 ----

    @staticmethod
    def _score_for(query: str, entry: dict[str, Any]) -> int:
        """0 表示不相关；EXACT 才允许自动同步，其余只用于展示候选。"""
        candidate = normalize_model_id(entry["model"])
        canonical = normalize_model_id(entry.get("canonical") or "")
        if candidate == query:
            return EXACT
        if len(query) >= MIN_CONTAINS_LEN and (query in candidate or candidate in query):
            return CONTAINS
        if canonical and len(query) >= MIN_CONTAINS_LEN and (canonical == query or query in canonical or canonical in query):
            # 接口里的模型名可能是别名（deepseek-v4.1-flash 对应 deepseek-flash），
            # 用 canonical 把它找出来给人选；自动同步仍只认精确匹配。
            return ALIAS
        return 0

    def lookup(self, model: str, base_url: str = "", limit: int = MAX_CANDIDATES, force: bool = False) -> dict[str, Any]:
        query = normalize_model_id(model)
        if not query:
            raise PricingError("模型 ID 不能为空")
        entries, meta = self.entries(force=force)
        host = (urlparse(base_url).hostname or "").lower() if base_url else ""
        matches: list[dict[str, Any]] = []
        for entry in entries:
            score = self._score_for(query, entry)
            if not score:
                continue
            if host and _same_host(host, entry.get("api") or ""):
                score += HOST_BONUS
            matches.append({**entry, "score": score})
        matches.sort(
            key=lambda item: (
                not item["original"],
                -item["score"],
                -_release_ord(item["release_date"]),
                item["cost"]["input"],
                item["provider"],
                item["model"],
            )
        )
        return {"matches": matches[:limit], "catalog": meta, "warnings": meta.get("warnings") or []}

    # ---- 同步 ----

    def _best_match(self, profile: ModelProfile, force: bool = False) -> dict[str, Any]:
        found = self.lookup(profile.model, profile.base_url, limit=MAX_CANDIDATES, force=force)
        exact = [item for item in found["matches"] if item["score"] >= EXACT]
        by_host = [item for item in exact if item["score"] >= EXACT + HOST_BONUS]
        if by_host:
            best = by_host
        else:
            originals = [item for item in found["matches"] if item["original"]]
            if len(originals) == 1:
                # 唯一原厂条目（含别名）直接用：接口里的别名不该被几十家转售价淹没。
                return originals[0]
            if not exact:
                if originals:
                    names = "、".join(item["key"] for item in originals[:3])
                    raise PricingError(f"{profile.model} 有 {len(originals)} 个原厂候选（{names}），价格可能不同，需要选择")
                raise PricingError(f"models.dev 里没有与 {profile.model} 相关的价格；在页面上查找候选，或手填单价")
            best = exact
            if len(best) > 1:
                originals = [item for item in best if item["original"]]
                if originals:
                    best = originals
        if len(best) > 1 and len({_cost_key(item) for item in best}) == 1:
            # 多家同价：价格没有歧义，取排在最前面的那家。
            best = best[:1]
        if len(best) > 1:
            names = "、".join(f"{item['provider']}/{item['model']}" for item in best[:3])
            raise PricingError(f"{profile.model} 匹配到 {len(best)} 条价格（{names}），价格不一致；在页面上选择一条候选，或手填单价")
        return best[0]

    def _pricing_payload(self, match: dict[str, Any]) -> dict[str, Any]:
        pricing = ModelPricing(
            input=match["cost"]["input"],
            output=match["cost"]["output"],
            cache_read=match["cost"]["cache_read"],
            cache_write=match["cost"]["cache_write"],
            source="models.dev",
            model_key=match["key"],
            synced_at=_now_iso(self.now()),
        )
        return pricing.model_dump(mode="json")

    def apply_profile(self, store: ModelStore, profile_id: str, key: str) -> dict[str, Any]:
        """把用户选中的候选价格写入档案。候选必须与档案模型对得上，不能随便写别家的价。"""
        profile = store.catalog().find(profile_id)
        if profile is None:
            raise ModelError(f"模型档案 {profile_id} 不存在")
        entries, _ = self.entries()
        entry = next((item for item in entries if item["key"] == key), None)
        if entry is None:
            raise PricingError(f"价格候选 {key} 不存在，目录可能已刷新，请重新查找")
        if not self._score_for(normalize_model_id(profile.model), entry):
            raise PricingError(f"候选 {key} 与档案模型 {profile.model} 不匹配")
        catalog = store.apply_pricing({profile.id: self._pricing_payload(entry)})
        updated = catalog.find(profile.id)
        assert updated is not None
        return {"profile": updated.public(store.has_key(profile.id)), "match": entry}

    def sync_profile(self, store: ModelStore, profile_id: str, force: bool = False) -> dict[str, Any]:
        profile = store.catalog().find(profile_id)
        if profile is None:
            raise ModelError(f"模型档案 {profile_id} 不存在")
        match = self._best_match(profile, force=force)
        catalog = store.apply_pricing({profile.id: self._pricing_payload(match)})
        updated = catalog.find(profile.id)
        assert updated is not None  # 刚写入的档案一定存在
        return {"profile": updated.public(store.has_key(profile.id)), "match": match}

    def sync_all(self, store: ModelStore, force: bool = False) -> dict[str, Any]:
        # 强制刷新只拉一次目录，后面的逐个匹配都用这份缓存。
        self.entries(force=force)
        catalog = store.catalog()
        prices: dict[str, dict[str, Any] | None] = {}
        updated: list[str] = []
        skipped: list[dict[str, str]] = []
        for profile in catalog.profiles:
            if profile.pricing is not None and profile.pricing.source == "manual":
                skipped.append({"id": profile.id, "reason": "手填价格不覆盖"})
                continue
            try:
                match = self._best_match(profile)
            except PricingError as error:
                skipped.append({"id": profile.id, "reason": str(error)})
                continue
            prices[profile.id] = self._pricing_payload(match)
            updated.append(profile.id)
        if prices:
            store.apply_pricing(prices)
        return {"updated": updated, "skipped": skipped}


def _release_ord(text: str) -> int:
    digits = re.sub(r"\D", "", text or "")
    return int(digits) if digits else 0
