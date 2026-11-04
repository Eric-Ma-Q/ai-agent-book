"""模型档案：接口地址、模型 ID、密钥与推理参数。

档案元数据写入 `personal/lab/models.json`（入库），密钥单独写入
`personal/lab/models.keys.json`（600，不入库）。读取密钥的接口永远不经过 HTTP。
"""

from __future__ import annotations

import json
import os
import re
import stat
import tempfile
import threading
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

Protocol = Literal["openai-chat"]
InputType = Literal["text", "image"]
PricingSource = Literal["manual", "models.dev"]
KEY_FILE_MODE = 0o600
MAX_LEVELS = 8
MAX_PRICE = 10_000.0  # 美元 / 百万 token 的合理上限，挡住手滑多写几个零


class ModelError(ValueError):
    """档案内容或存储操作有误，消息可以直接展示给用户。"""


class ReasoningLevel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str = Field(min_length=1, max_length=40)
    value: Any = None


def _default_levels() -> tuple[ReasoningLevel, ...]:
    return (
        ReasoningLevel(name="off", value=None),
        ReasoningLevel(name="low", value="low"),
        ReasoningLevel(name="medium", value="medium"),
        ReasoningLevel(name="high", value="high"),
    )


class ReasoningConfig(BaseModel):
    """推理档位到请求体参数的映射。`value` 为 null 的档位不发送。"""

    model_config = ConfigDict(frozen=True, extra="forbid")

    parameter: str = Field(default="reasoning_effort", min_length=1, max_length=80)
    default: str | None = None
    levels: tuple[ReasoningLevel, ...] = Field(default_factory=_default_levels, min_length=1, max_length=MAX_LEVELS)

    @field_validator("parameter")
    @classmethod
    def _parameter(cls, value: str) -> str:
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*", value):
            raise ValueError("参数名只能包含字母、数字、下划线和点")
        return value

    @model_validator(mode="after")
    def _unique_and_default(self) -> "ReasoningConfig":
        names = [level.name for level in self.levels]
        if len(set(names)) != len(names):
            raise ValueError("档位名不能重复")
        if self.default is not None and self.default not in names:
            raise ValueError(f"默认档位 {self.default} 不在档位列表中")
        return self

    def level(self, name: str) -> ReasoningLevel | None:
        return next((item for item in self.levels if item.name == name), None)

    def extra_for(self, name: str | None = None) -> dict[str, Any]:
        """指定档位（或默认档位）要附加到请求体的字段；空值档位不附加。

        未知档位按不附加处理，入口负责先校验档位是否存在。
        """
        chosen = name or self.default
        if not chosen:
            return {}
        level = self.level(chosen)
        if level is None or level.value is None:
            return {}
        return {self.parameter: level.value}

    def extra(self) -> dict[str, Any]:
        """这次请求要附加到请求体的字段；默认档位为空时不附加。"""
        return self.extra_for(None)


DEFAULT_REASONING = ReasoningConfig()


class ModelPricing(BaseModel):
    """一个模型的挂牌单价，单位美元 / 百万 token。

    缓存写入价只保存和展示：OpenAI Chat Completions 的用量里没有这个字段，
    本实验台不计这一项。
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    currency: Literal["USD"] = "USD"
    input: float = Field(ge=0, le=MAX_PRICE)
    output: float = Field(ge=0, le=MAX_PRICE)
    cache_read: float = Field(default=0.0, ge=0, le=MAX_PRICE)
    cache_write: float = Field(default=0.0, ge=0, le=MAX_PRICE)
    source: PricingSource = "manual"
    model_key: str = Field(default="", max_length=200)
    synced_at: str | None = Field(default=None, max_length=40)

    @field_validator("model_key")
    @classmethod
    def _strip_key(cls, value: str) -> str:
        return value.strip()


class ModelProfile(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,39}$")
    name: str = Field(min_length=1, max_length=60)
    base_url: str
    protocol: Protocol = "openai-chat"
    model: str = Field(min_length=1, max_length=200)
    context_window: int = Field(default=200_000, ge=1, le=10_000_000)
    max_output_tokens: int = Field(default=8_192, ge=1, le=10_000_000)
    input_types: tuple[InputType, ...] = ("text",)
    reasoning: ReasoningConfig = DEFAULT_REASONING
    pricing: ModelPricing | None = None

    @field_validator("name", "model")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("不能为空")
        return value

    @field_validator("base_url")
    @classmethod
    def _base_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parsed = urlparse(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError("必须是 http:// 或 https:// 开头的完整地址")
        if parsed.query or parsed.fragment:
            raise ValueError("地址不能带查询参数或锚点")
        return value

    @field_validator("input_types")
    @classmethod
    def _input_types(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        unique = tuple(dict.fromkeys(value))
        if not unique:
            raise ValueError("至少选择一种输入类型")
        return unique  # type: ignore[return-value]

    @model_validator(mode="after")
    def _limits(self) -> "ModelProfile":
        if self.max_output_tokens > self.context_window:
            raise ValueError("最大输出 token 不能超过上下文窗口")
        return self

    def public(self, has_key: bool) -> dict[str, Any]:
        data = self.model_dump(mode="json")
        data["has_key"] = has_key
        return data


class ModelCatalog(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    version: int = 1
    default: str | None = None
    profiles: tuple[ModelProfile, ...] = ()

    def find(self, profile_id: str) -> ModelProfile | None:
        return next((profile for profile in self.profiles if profile.id == profile_id), None)


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    if len(slug) < 2:
        slug = f"{slug}-m" if slug else "model"
    return slug[:40].strip("-")


def _validate_profile(data: dict[str, Any]) -> ModelProfile:
    try:
        return ModelProfile.model_validate(data)
    except ValidationError as error:
        first = error.errors()[0]
        field = ".".join(str(part) for part in first.get("loc") or ()) or "档案"
        message = str(first.get("msg") or "格式无效")
        raise ModelError(f"{field}：{message}") from error


def _parse_catalog(raw: Any) -> ModelCatalog:
    if not isinstance(raw, dict):
        raise ModelError("模型档案文件必须是一个 JSON 对象")
    profiles = raw.get("profiles") or []
    if not isinstance(profiles, list):
        raise ModelError("profiles 必须是数组")
    parsed = tuple(_validate_profile(item) for item in profiles if isinstance(item, dict))
    if len(parsed) != len(profiles):
        raise ModelError("profiles 里每一项都必须是对象")
    ids = [profile.id for profile in parsed]
    if len(set(ids)) != len(ids):
        raise ModelError("模型档案 ID 不能重复")
    default = raw.get("default") or None
    if default is not None and default not in ids:
        raise ModelError(f"默认档案 {default} 不存在")
    return ModelCatalog(version=int(raw.get("version") or 1), default=default, profiles=parsed)


def _write_json(path: Path, data: Any, mode: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        if mode is not None:
            os.chmod(tmp, mode)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class ModelStore:
    """读写档案与密钥。所有写操作串行，文件替换是原子的。"""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / "models.json"
        self.keys_path = self.data_dir / "models.keys.json"
        self.lock = threading.RLock()

    # ---- 读取 ----

    def catalog(self) -> ModelCatalog:
        with self.lock:
            if not self.path.exists():
                return ModelCatalog()
            try:
                raw = json.loads(self.path.read_text(encoding="utf8"))
            except (OSError, ValueError) as error:
                raise ModelError(f"模型档案文件无法读取：{self.path}（{error}）") from error
            return _parse_catalog(raw)

    def keys(self) -> dict[str, str]:
        with self.lock:
            if not self.keys_path.exists():
                return {}
            try:
                raw = json.loads(self.keys_path.read_text(encoding="utf8"))
            except (OSError, ValueError) as error:
                raise ModelError(f"密钥文件无法读取：{self.keys_path}（{error}）") from error
            values = raw.get("keys") if isinstance(raw, dict) else None
            if not isinstance(values, dict):
                raise ModelError("密钥文件格式无效：缺少 keys 对象")
            return {str(key): str(value) for key, value in values.items() if value}

    def key_for(self, profile_id: str) -> str:
        return self.keys().get(profile_id, "")

    def has_key(self, profile_id: str) -> bool:
        return bool(self.key_for(profile_id))

    def default_profile(self) -> ModelProfile | None:
        catalog = self.catalog()
        return catalog.find(catalog.default) if catalog.default else None

    def resolve(self, profile_id: str | None) -> ModelProfile | None:
        """显式档案优先，其次默认档案；都没有返回 None。显式档案不存在时报错。"""
        catalog = self.catalog()
        if profile_id:
            profile = catalog.find(profile_id)
            if profile is None:
                raise ModelError(f"模型档案 {profile_id} 不存在")
            return profile
        return catalog.find(catalog.default) if catalog.default else None

    def listing(self) -> dict[str, Any]:
        catalog = self.catalog()
        warnings = []
        if self.keys_path.exists():
            mode = stat.S_IMODE(self.keys_path.stat().st_mode)
            if mode & 0o077:
                warnings.append(f"密钥文件权限为 {mode:o}，建议执行 chmod 600 {self.keys_path}")
        keys = self.keys()
        return {
            "version": catalog.version,
            "default": catalog.default,
            "profiles": [profile.public(bool(keys.get(profile.id))) for profile in catalog.profiles],
            "warnings": warnings,
        }

    # ---- 写入 ----

    def _save_catalog(self, profiles: tuple[ModelProfile, ...], default: str | None) -> ModelCatalog:
        catalog = ModelCatalog(version=1, default=default, profiles=profiles)
        data = json.loads(catalog.model_dump_json())
        _write_json(self.path, data)
        return catalog

    def _save_keys(self, keys: dict[str, str]) -> None:
        if not keys:
            if self.keys_path.exists():
                self.keys_path.unlink()
            return
        _write_json(self.keys_path, {"version": 1, "keys": keys}, mode=KEY_FILE_MODE)
        os.chmod(self.keys_path, KEY_FILE_MODE)

    def _new_id(self, name: str, existing: set[str]) -> str:
        base = slugify(name)
        candidate, counter = base, 2
        while candidate in existing:
            suffix = f"-{counter}"
            candidate = f"{base[: 40 - len(suffix)]}{suffix}"
            counter += 1
        return candidate

    def create(self, data: dict[str, Any], api_key: str | None = None, copy_key_from: str | None = None) -> dict[str, Any]:
        with self.lock:
            catalog = self.catalog()
            existing = {profile.id for profile in catalog.profiles}
            payload = {key: value for key, value in data.items() if key not in ("api_key", "id")}
            payload["id"] = self._new_id(str(payload.get("name") or "model"), existing)
            profile = _validate_profile(payload)
            keys = self.keys()
            if api_key:
                keys[profile.id] = api_key
            elif copy_key_from:
                source = catalog.find(copy_key_from)
                if source is None:
                    raise ModelError(f"模型档案 {copy_key_from} 不存在")
                source_key = keys.get(source.id, "")
                if source_key:
                    if profile.base_url != source.base_url:
                        raise ModelError("修改 API 地址时必须重新输入 API 密钥，避免把旧密钥发到新地址")
                    keys[profile.id] = source_key
            self._save_catalog((*catalog.profiles, profile), catalog.default)
            if keys.get(profile.id):
                self._save_keys(keys)
            return profile.public(bool(keys.get(profile.id)))

    def update(self, profile_id: str, data: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
        with self.lock:
            catalog = self.catalog()
            current = catalog.find(profile_id)
            if current is None:
                raise ModelError(f"模型档案 {profile_id} 不存在")
            payload = {key: value for key, value in data.items() if key not in ("api_key", "id")}
            payload["id"] = profile_id
            merged = {**current.model_dump(mode="json"), **payload}
            profile = _validate_profile(merged)
            keys = self.keys()
            if api_key:
                keys[profile_id] = api_key
            elif profile.base_url != current.base_url and keys.get(profile_id):
                raise ModelError("修改 API 地址时必须重新输入 API 密钥，避免把旧密钥发到新地址")
            profiles = tuple(profile if item.id == profile_id else item for item in catalog.profiles)
            self._save_catalog(profiles, catalog.default)
            if api_key:
                self._save_keys(keys)
            return profile.public(bool(keys.get(profile_id)))

    def apply_pricing(self, prices: dict[str, dict[str, Any] | None]) -> ModelCatalog:
        """一次性写入多个档案的价格，只落一次盘；不在 prices 里的档案保持不变。"""
        with self.lock:
            catalog = self.catalog()
            profiles = []
            for profile in catalog.profiles:
                if profile.id not in prices:
                    profiles.append(profile)
                    continue
                payload = {**profile.model_dump(mode="json"), "pricing": prices[profile.id]}
                profiles.append(_validate_profile(payload))
            return self._save_catalog(tuple(profiles), catalog.default)

    def delete(self, profile_id: str) -> None:
        with self.lock:
            catalog = self.catalog()
            if catalog.find(profile_id) is None:
                raise ModelError(f"模型档案 {profile_id} 不存在")
            profiles = tuple(item for item in catalog.profiles if item.id != profile_id)
            default = None if catalog.default == profile_id else catalog.default
            self._save_catalog(profiles, default)
            keys = self.keys()
            if keys.pop(profile_id, None) is not None:
                self._save_keys(keys)

    def set_default(self, profile_id: str) -> dict[str, Any]:
        with self.lock:
            catalog = self.catalog()
            profile = catalog.find(profile_id)
            if profile is None:
                raise ModelError(f"模型档案 {profile_id} 不存在")
            self._save_catalog(catalog.profiles, profile_id)
            return profile.public(self.has_key(profile_id))
