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
from ..services.card_logic import CATEGORY_BASE_OTHER, HIT_TYPE_NONE
from ..services.checklist_aliases import (
    canonical_checklist_id,
    equivalent_checklist_ids,
    load_checklist_aliases,
)

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
    checklist_id: str = ""
    current_category: str
    hit_type: str = "none"
    is_auto_only: bool = False
    is_mem: bool = False
    is_auto: bool
    is_case: bool


class DetectionResponse(BaseModel):
    candidates: List[CardTypeCandidate]
    files: List[str]


class DetectRequest(BaseModel):
    sport_key: str
    checklist_ids: List[str]
    master_key: Optional[str] = None


class SaveOverridesRequest(BaseModel):
    sport_key: str
    auto: Optional[List[str]] = None
    mem: Optional[List[str]] = None
    auto_mem: Optional[List[str]] = None
    case_hit: Optional[List[str]] = None
    scoped_auto: List[Dict[str, str]] = []
    scoped_mem: List[Dict[str, str]] = []
    scoped_auto_mem: List[Dict[str, str]] = []
    scoped_case_hit: List[Dict[str, str]] = []


@router.post("/detect")
def detect_card_types(req: DetectRequest):
    """Get card types that are candidates for reclassification."""
    overrides_root = _load_overrides()
    aliases_root = load_checklist_aliases()

    try:
        df = load_master_data(req.sport_key, req.checklist_ids, req.master_key)
        df = enrich_dataframe(df, req.sport_key, overrides_root)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get current override sets for this sport
    effective = get_effective_exact_category_by_sport(overrides_root)
    sport_overrides = effective.get(req.sport_key, {})
    current_auto_only_set = {normalize_box_type_text(v) for v in (sport_overrides.get("auto", []) if isinstance(sport_overrides, dict) else [])}
    current_mem_set = {normalize_box_type_text(v) for v in (sport_overrides.get("mem", []) if isinstance(sport_overrides, dict) else [])}
    current_auto_set = {normalize_box_type_text(v) for v in (sport_overrides.get("auto_mem", []) if isinstance(sport_overrides, dict) else [])}
    current_case_set = {normalize_box_type_text(v) for v in (sport_overrides.get("case_hit", []) if isinstance(sport_overrides, dict) else [])}
    scoped_root = overrides_root.get("scoped_category_by_sport", {})
    sport_scoped = scoped_root.get(req.sport_key, {}) if isinstance(scoped_root, dict) else {}
    scoped_auto_only = sport_scoped.get("auto", {}) if isinstance(sport_scoped, dict) else {}
    scoped_mem = sport_scoped.get("mem", {}) if isinstance(sport_scoped, dict) else {}
    scoped_auto = sport_scoped.get("auto_mem", {}) if isinstance(sport_scoped, dict) else {}
    scoped_case = sport_scoped.get("case_hit", {}) if isinstance(sport_scoped, dict) else {}
    scoped_auto_only_sets = {
        normalize_box_type_text(scope): {normalize_box_type_text(v) for v in values}
        for scope, values in scoped_auto_only.items()
        if isinstance(values, list)
    }
    scoped_mem_sets = {
        normalize_box_type_text(scope): {normalize_box_type_text(v) for v in values}
        for scope, values in scoped_mem.items()
        if isinstance(values, list)
    }
    scoped_auto_sets = {
        normalize_box_type_text(scope): {normalize_box_type_text(v) for v in values}
        for scope, values in scoped_auto.items()
        if isinstance(values, list)
    }
    scoped_case_sets = {
        normalize_box_type_text(scope): {normalize_box_type_text(v) for v in values}
        for scope, values in scoped_case.items()
        if isinstance(values, list)
    }

    # Build review: group by File + Box Type
    if df.empty or "Box Type" not in df.columns or "Category" not in df.columns or "File" not in df.columns:
        return DetectionResponse(candidates=[], files=[])

    if "checklist_id" not in df.columns:
        df["checklist_id"] = ""

    grouped = (
        df.groupby(["File", "checklist_id", "Box Type"], dropna=False)
        .agg(
            Hits=("Hits", "sum"),
            Category=("Category", lambda x: x.value_counts().idxmax()),
            **{"Hit Type": ("Hit Type", lambda x: x.value_counts().idxmax() if len(x) else "none")},
        )
        .reset_index()
    )
    grouped["File"] = grouped["File"].astype(str).str.strip()
    grouped["checklist_id"] = grouped["checklist_id"].astype(str).str.strip()
    grouped["Box Type"] = grouped["Box Type"].astype(str).str.strip()
    grouped = grouped[(grouped["File"] != "") & (grouped["Box Type"] != "")].copy()
    grouped["Norm"] = grouped["Box Type"].apply(normalize_box_type_text)

    # Candidates: Base/Other OR already overridden
    candidate_mask = (
        (grouped["Category"] == CATEGORY_BASE_OTHER)
        | (grouped["Hit Type"].astype(str) != HIT_TYPE_NONE)
        | grouped["Norm"].isin(current_auto_only_set)
        | grouped["Norm"].isin(current_mem_set)
        | grouped["Norm"].isin(current_auto_set)
        | grouped["Norm"].isin(current_case_set)
    )
    candidates_df = grouped[candidate_mask].sort_values(["File", "Hits"], ascending=[True, False])

    candidates = []
    for _, row in candidates_df.iterrows():
        norm = row["Norm"]
        scope = normalize_box_type_text(row["checklist_id"] or row["File"])
        equivalent_scopes = {
            normalize_box_type_text(v)
            for v in equivalent_checklist_ids(req.sport_key, row["checklist_id"], aliases_root)
        } or {scope}
        candidates.append(CardTypeCandidate(
            box_type=row["Box Type"],
            norm=norm,
            hits=int(row["Hits"]),
            file=row["File"],
            checklist_id=row["checklist_id"],
            current_category=row["Category"],
            hit_type=str(row.get("Hit Type", "none") or "none"),
            is_auto_only=norm in current_auto_only_set or any(norm in scoped_auto_only_sets.get(s, set()) for s in equivalent_scopes),
            is_mem=norm in current_mem_set or any(norm in scoped_mem_sets.get(s, set()) for s in equivalent_scopes),
            is_auto=norm in current_auto_set or any(norm in scoped_auto_sets.get(s, set()) for s in equivalent_scopes),
            is_case=norm in current_case_set or any(norm in scoped_case_sets.get(s, set()) for s in equivalent_scopes),
        ))

    files = sorted(candidates_df["File"].unique().tolist())
    return DetectionResponse(candidates=candidates, files=files)


@router.post("/save")
def save_overrides(req: SaveOverridesRequest):
    """Save updated auto_mem and case_hit overrides for a sport."""
    overrides_root = _load_overrides()
    aliases_root = load_checklist_aliases()

    # Case hit has priority over auto_mem
    by_sport = overrides_root.get("exact_category_by_sport", {})
    if not isinstance(by_sport, dict):
        by_sport = {}
    current_exact = by_sport.get(req.sport_key, {})
    if not isinstance(current_exact, dict):
        current_exact = {}
    if req.auto is None and req.mem is None and req.auto_mem is None and req.case_hit is None:
        final_auto_only = sorted(current_exact.get("auto", []))
        final_mem = sorted(current_exact.get("mem", []))
        final_auto = sorted(current_exact.get("auto_mem", []))
        final_case = sorted(current_exact.get("case_hit", []))
    else:
        auto_only = req.auto or []
        mem = req.mem or []
        auto_mem = req.auto_mem or []
        case_hit = req.case_hit or []
        case_norm = {normalize_box_type_text(v) for v in case_hit}
        auto_mem_norm = {normalize_box_type_text(v) for v in auto_mem}
        final_auto_only = sorted(v for v in auto_only if normalize_box_type_text(v) not in case_norm and normalize_box_type_text(v) not in auto_mem_norm)
        final_mem = sorted(v for v in mem if normalize_box_type_text(v) not in case_norm and normalize_box_type_text(v) not in auto_mem_norm)
        final_auto = sorted(v for v in auto_mem if normalize_box_type_text(v) not in case_norm)
        final_case = sorted(case_hit)
    by_sport[req.sport_key] = {"auto": final_auto_only, "mem": final_mem, "auto_mem": final_auto, "case_hit": final_case}
    overrides_root["exact_category_by_sport"] = by_sport

    scoped_by_sport = overrides_root.get("scoped_category_by_sport", {})
    if not isinstance(scoped_by_sport, dict):
        scoped_by_sport = {}
    sport_scoped = scoped_by_sport.get(req.sport_key, {})
    if not isinstance(sport_scoped, dict):
        sport_scoped = {}

    def _merge_scoped(existing, rows):
        merged = existing if isinstance(existing, dict) else {}
        for row in rows:
            scope = str(row.get("checklist_id") or row.get("file") or "").strip()
            scope = canonical_checklist_id(req.sport_key, scope, aliases_root)
            box_type = str(row.get("box_type") or "").strip()
            if not scope or not box_type:
                continue
            values = merged.get(scope, [])
            if not isinstance(values, list):
                values = []
            norm_seen = {normalize_box_type_text(v) for v in values}
            if normalize_box_type_text(box_type) not in norm_seen:
                values.append(box_type)
            merged[scope] = sorted(values)
        return merged

    sport_scoped["auto"] = _merge_scoped(sport_scoped.get("auto", {}), req.scoped_auto)
    sport_scoped["mem"] = _merge_scoped(sport_scoped.get("mem", {}), req.scoped_mem)
    sport_scoped["auto_mem"] = _merge_scoped(sport_scoped.get("auto_mem", {}), req.scoped_auto_mem)
    sport_scoped["case_hit"] = _merge_scoped(sport_scoped.get("case_hit", {}), req.scoped_case_hit)
    scoped_by_sport[req.sport_key] = sport_scoped
    overrides_root["scoped_category_by_sport"] = scoped_by_sport

    # Cleanup legacy key
    legacy = overrides_root.get("auto_mem_exact_by_sport", {})
    if isinstance(legacy, dict) and req.sport_key in legacy:
        del legacy[req.sport_key]
        overrides_root["auto_mem_exact_by_sport"] = legacy

    _save_overrides(overrides_root)

    return {
        "status": "ok",
        "auto_count": len(final_auto_only),
        "mem_count": len(final_mem),
        "auto_mem_count": len(final_auto),
        "case_hit_count": len(final_case),
        "scoped_auto_count": sum(len(v) for v in sport_scoped.get("auto", {}).values() if isinstance(v, list)),
        "scoped_mem_count": sum(len(v) for v in sport_scoped.get("mem", {}).values() if isinstance(v, list)),
        "scoped_auto_mem_count": sum(len(v) for v in sport_scoped.get("auto_mem", {}).values() if isinstance(v, list)),
        "scoped_case_hit_count": sum(len(v) for v in sport_scoped.get("case_hit", {}).values() if isinstance(v, list)),
    }
