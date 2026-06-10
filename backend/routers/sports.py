"""Sports and checklists endpoints."""

from fastapi import APIRouter, HTTPException

from ..services.sports_config import SPORT_PROFILES, get_sport_profile
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_parquet
from ..services.data_pipeline import (
    ensure_master_dataframe_schema,
    build_master_catalog,
    master_parquet_key_for_sport,
)
from ..services.checklist_aliases import load_checklist_aliases, alias_metadata_for_id

router = APIRouter(prefix="/api/sports", tags=["sports"])


@router.get("")
def list_sports():
    """List all available sports."""
    return [
        {
            "key": key,
            "label": profile.get("label", key),
            "page_icon": profile.get("page_icon", "🏀"),
        }
        for key, profile in SPORT_PROFILES.items()
    ]


@router.get("/{sport_key}/profile")
def get_profile(sport_key: str):
    """Get full sport profile (team aliases, hype tiers, enabled views, etc.)."""
    profile = get_sport_profile(sport_key)
    if not profile:
        raise HTTPException(status_code=404, detail=f"Sport '{sport_key}' not found")
    return {
        "key": sport_key,
        "label": profile.get("label", sport_key),
        "page_icon": profile.get("page_icon", "🏀"),
        "enabled_views": profile.get("enabled_views", {}),
        "hype_tiers": profile.get("hype_tiers", {}),
        "top_rookies_by_year": profile.get("top_rookies_by_year", {}),
    }


@router.get("/{sport_key}/checklists")
def list_checklists(sport_key: str):
    """List available checklists for a sport from R2."""
    config = get_r2_config()
    if not is_r2_configured(config):
        return {"checklists": [], "master_key": None, "source_mode": "none"}

    # Check for master parquet
    master_key = master_parquet_key_for_sport(sport_key)
    try:
        master_df = read_r2_parquet(config, master_key)
        master_df = ensure_master_dataframe_schema(master_df, sport_key)
        catalog = build_master_catalog(master_df, sport_key)
        aliases_root = load_checklist_aliases()
        if not catalog.empty:
            alias_rows = [
                alias_metadata_for_id(sport_key, row.get("checklist_id"), aliases_root)
                for row in catalog.to_dict(orient="records")
            ]
            alias_df = catalog.__class__(alias_rows)
            catalog = catalog.reset_index(drop=True).join(alias_df)
        checklists = catalog.to_dict(orient="records")
        return {
            "checklists": checklists,
            "master_key": master_key,
            "source_mode": "master",
        }
    except Exception:
        pass

    return {
        "checklists": [],
        "master_key": None,
        "source_mode": "none",
    }
