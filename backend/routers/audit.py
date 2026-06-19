"""Audit endpoints — FC Compta break verification."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..services.voggt_client import VoggtError
from ..services.audit_engine import audit_show
from ..services import box_prices

router = APIRouter(prefix="/api", tags=["audit"])


@router.get("/audit")
def run_audit(url: str = Query(..., description="URL ou ID du show Voggt")):
    """Run a full break audit on a Voggt show."""
    try:
        return audit_show(url)
    except VoggtError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur audit: {exc}")


@router.get("/box-prices")
def get_box_prices():
    """Return the box price reference table."""
    return box_prices.get_all()


@router.put("/box-prices")
def update_box_prices(data: dict):
    """Replace the box price reference table."""
    box_prices.save_prices(data)
    return {"status": "ok"}
