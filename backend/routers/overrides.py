"""Keyword overrides endpoints for card type detection."""

import json
import os
import re
from typing import List, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.analysis_engine import load_master_data, enrich_dataframe, normalize_box_type_text
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_json, write_r2_json
from ..services.sports_config import get_effective_exact_category_by_sport
from ..services.card_logic import CATEGORY_BASE_OTHER

router = APIRouter(prefix="/api/overrides", tags=["overrides"])

_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
KEYWORD_OVERRIDES_R2_KEY = "app/keyword_overrides.json"


def _load_overrides():
    """Load keyword overrides from R2 first, then local file."""
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            return read_r2_json(config, KEYWORD_OVERRIDES_R2_KEY)
        except Exception:
            pass
    if os.path.exists(_OVERRIDES_PATH):
        with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_overrides(data):
    """Save keyword overrides to R2 and local file."""
    config = get_r2_config()
    if is_r2_configured(config):
        write_r2_json(config, KEYWORD_OVERRIDES_R2_KEY, data)
    with open(_OVERRIDES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class CardTypeCandidate(BaseModel):
    box_type: str
    norm: str
    hits: int
    file: str
    current_category: str
    is_auto: bool
    is_case: bool


class DetectionResponse(BaseModel):
    candidates: List[CardTypeCandidate]
    files: List[str]


class SaveOverridesRequest(BaseModel):
    sport_key: str
    auto_mem: List[str]
    case_hit: List[str]


@router.post("/detect")
def detect_card_types(
    sport_key: str,
    checklist_ids: List[str],
    master_key: Optional[str] = None,
):
    """Get card types that are candidates for reclassification."""
    overrides_root = _load_overrides()

    try:
        df = load_master_data(sport_key, checklist_ids, master_key)
        df = enrich_dataframe(df, sport_key, overrides_root)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get current override sets for this sport
    effective = get_effective_exact_category_by_sport(overrides_root)
    sport_overrides = effective.get(sport_key, {})
    current_auto_set = {normalize_box_type_text(v) for v in (sport_overrides.get("auto_mem", []) if isinstance(sport_overrides, dict) else [])}
    current_case_set = {normalize_box_type_text(v) for v in (sport_overrides.get("case_hit", []) if isinstance(sport_overrides, dict) else [])}

    # Build review: group by File + Box Type
    if df.empty or "Box Type" not in df.columns or "Category" not in df.columns or "File" not in df.columns:
        return DetectionResponse(candidates=[], files=[])

    grouped = (
        df.groupby(["File", "Box Type"], dropna=False)
        .agg(Hits=("Hits", "sum"), Category=("Category", lambda x: x.value_counts().idxmax()))
        .reset_index()
    )
    grouped["File"] = grouped["File"].astype(str).str.strip()
    grouped["Box Type"] = grouped["Box Type"].astype(str).str.strip()
    grouped = grouped[(grouped["File"] != "") & (grouped["Box Type"] != "")].copy()
    grouped["Norm"] = grouped["Box Type"].apply(normalize_box_type_text)

    # Candidates: Base/Other OR already overridden
    candidate_mask = (
        (grouped["Category"] == CATEGORY_BASE_OTHER)
        | grouped["Norm"].isin(current_auto_set)
        | grouped["Norm"].isin(current_case_set)
    )
    candidates_df = grouped[candidate_mask].sort_values(["File", "Hits"], ascending=[True, False])

    candidates = []
    for _, row in candidates_df.iterrows():
        norm = row["Norm"]
        candidates.append(CardTypeCandidate(
            box_type=row["Box Type"],
            norm=norm,
            hits=int(row["Hits"]),
            file=row["File"],
            current_category=row["Category"],
            is_auto=norm in current_auto_set,
            is_case=norm in current_case_set,
        ))

    files = sorted(candidates_df["File"].unique().tolist())
    return DetectionResponse(candidates=candidates, files=files)


@router.post("/save")
def save_overrides(req: SaveOverridesRequest):
    """Save updated auto_mem and case_hit overrides for a sport."""
    overrides_root = _load_overrides()

    # Case hit has priority over auto_mem
    case_norm = {normalize_box_type_text(v) for v in req.case_hit}
    final_auto = sorted(v for v in req.auto_mem if normalize_box_type_text(v) not in case_norm)
    final_case = sorted(req.case_hit)

    by_sport = overrides_root.get("exact_category_by_sport", {})
    if not isinstance(by_sport, dict):
        by_sport = {}
    by_sport[req.sport_key] = {
        "auto_mem": final_auto,
        "case_hit": final_case,
    }
    overrides_root["exact_category_by_sport"] = by_sport

    # Cleanup legacy key
    legacy = overrides_root.get("auto_mem_exact_by_sport", {})
    if isinstance(legacy, dict) and req.sport_key in legacy:
        del legacy[req.sport_key]
        overrides_root["auto_mem_exact_by_sport"] = legacy

    _save_overrides(overrides_root)

    return {
        "status": "ok",
        "auto_mem_count": len(final_auto),
        "case_hit_count": len(final_case),
    }
