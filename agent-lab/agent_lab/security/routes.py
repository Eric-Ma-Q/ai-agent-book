"""提示注入实验的 HTTP 接口。"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .campaign import CampaignRequest, SecurityError, SecurityService

router = APIRouter()


def _ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def security_routes(service: SecurityService) -> APIRouter:
    @router.get("/security/catalog")
    def catalog() -> dict[str, Any]:
        return _ok(service.catalog())

    @router.post("/security/campaigns")
    def start(body: CampaignRequest) -> dict[str, Any]:
        campaign_id = service.start(body)
        return _ok({"campaign_id": campaign_id})

    @router.get("/security/campaigns")
    def campaigns(limit: int = 20) -> dict[str, Any]:
        return _ok(service.list(limit=min(max(limit, 1), 50)))

    @router.get("/security/campaigns/{campaign_id}")
    def campaign(campaign_id: str) -> dict[str, Any]:
        return _ok(service.get(campaign_id).model_dump(mode="json"))

    @router.post("/security/campaigns/{campaign_id}/cancel")
    def cancel(campaign_id: str) -> dict[str, Any]:
        return _ok(service.cancel(campaign_id).model_dump(mode="json"))

    return router


def install_error_handler(app: Any) -> None:
    @app.exception_handler(SecurityError)
    async def security_error(_request: Request, error: SecurityError) -> JSONResponse:
        return JSONResponse({"success": False, "data": None, "error": str(error)}, status_code=getattr(error, "status", 400))
