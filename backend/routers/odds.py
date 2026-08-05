"""Odds Topps endpoints — badges de disponibilité, feuille d'odds, mapping Box Type <-> set."""

from fastapi import APIRouter, HTTPException

from ..models.schemas import OddsBadgesRequest, OddsMappingDetectRequest, OddsMappingSaveRequest
from ..services.analysis_engine import load_master_data
from ..services.checklist_aliases import canonical_checklist_id, load_checklist_aliases
from ..services.data_pipeline import master_parquet_key_for_sport
from ..services.odds_engine import build_set_summaries, list_odds_checklists, load_odds_sheet, resolve_box_types
from ..services.odds_mappings import load_odds_mappings, mappings_for_checklist, save_odds_mappings, set_mapping_entries

router = APIRouter(prefix="/api/odds", tags=["odds"])


@router.get("/{sport_key}")
def get_odds_index(sport_key: str):
    """Liste des checklist_ids ayant un fichier d'odds pour ce sport."""
    return {"sport_key": sport_key, "checklist_ids": list_odds_checklists(sport_key)}


@router.get("/{sport_key}/{checklist_id}")
def get_odds_sheet(sport_key: str, checklist_id: str):
    """Feuille d'odds complète + set_summaries + configs. 404 propre si absente."""
    sheet = load_odds_sheet(sport_key, checklist_id)
    if sheet is None:
        raise HTTPException(status_code=404, detail=f"Aucun fichier d'odds pour '{sport_key}/{checklist_id}'.")

    summaries = build_set_summaries(sheet)
    return {
        "sheet": sheet,
        "set_summaries": summaries["sets"],
        "configs": sheet.get("configs", []),
    }


def _box_types_by_checklist(sport_key, checklist_ids):
    """Charge, pour chaque checklist_id demandé, ses Box Type distincts depuis le master."""
    result = {cid: [] for cid in checklist_ids}
    master_key = master_parquet_key_for_sport(sport_key)
    try:
        df = load_master_data(sport_key, checklist_ids, master_key)
    except Exception:
        return result

    if df.empty or "Box Type" not in df.columns:
        return result

    aliases_root = load_checklist_aliases()
    id_col = "checklist_id" if "checklist_id" in df.columns else None
    for cid in checklist_ids:
        canonical = canonical_checklist_id(sport_key, cid, aliases_root) or cid
        if id_col:
            sub = df[df[id_col].astype(str).apply(lambda v: canonical_checklist_id(sport_key, v, aliases_root)) == canonical]
        else:
            sub = df
        box_types = sub["Box Type"].astype(str).str.strip()
        result[cid] = sorted({v for v in box_types.tolist() if v})
    return result


@router.post("/badges")
def get_odds_badges(req: OddsBadgesRequest):
    """Map compacte {"<checklist_id>::<Box Type>": {badges, best_by_group, available_groups}}."""
    box_types_by_checklist = _box_types_by_checklist(req.sport_key, req.checklist_ids)
    mappings_root = load_odds_mappings()

    output = {}
    for checklist_id in req.checklist_ids:
        sheet = load_odds_sheet(req.sport_key, checklist_id)
        if sheet is None:
            continue
        summaries = build_set_summaries(sheet)["sets"]
        checklist_mapping = mappings_for_checklist(req.sport_key, checklist_id, mappings_root)
        box_types = box_types_by_checklist.get(checklist_id, [])
        resolved, _unresolved = resolve_box_types(sheet, box_types, checklist_mapping)

        for box_type, set_root in resolved.items():
            summary = summaries.get(set_root)
            if not summary:
                continue
            output[f"{checklist_id}::{box_type}"] = {
                "set": set_root,
                "badges": summary["badges"],
                "best_by_group": summary["best_by_group"],
                "available_groups": summary["groups_present"],
            }

    return {"badges": output}


@router.post("/mapping/detect")
def detect_odds_mapping(req: OddsMappingDetectRequest):
    """Box Types résolus / non résolus + sets candidats, pour l'écran de correction manuelle."""
    box_types_by_checklist = _box_types_by_checklist(req.sport_key, req.checklist_ids)
    mappings_root = load_odds_mappings()

    checklists = []
    for checklist_id in req.checklist_ids:
        sheet = load_odds_sheet(req.sport_key, checklist_id)
        box_types = box_types_by_checklist.get(checklist_id, [])
        if sheet is None:
            checklists.append({
                "checklist_id": checklist_id,
                "has_odds": False,
                "resolved": {},
                "unresolved": box_types,
                "available_sets": [],
            })
            continue

        summaries = build_set_summaries(sheet)["sets"]
        checklist_mapping = mappings_for_checklist(req.sport_key, checklist_id, mappings_root)
        resolved, unresolved = resolve_box_types(sheet, box_types, checklist_mapping)

        checklists.append({
            "checklist_id": checklist_id,
            "has_odds": True,
            "resolved": resolved,
            "unresolved": unresolved,
            "available_sets": sorted(summaries.keys()),
        })

    return {"sport_key": req.sport_key, "checklists": checklists}


@router.post("/mapping/save")
def save_odds_mapping(req: OddsMappingSaveRequest):
    """Écrit app/odds_mappings.json avec les corrections manuelles Box Type -> set root."""
    mappings_root = load_odds_mappings()
    set_mapping_entries(mappings_root, req.sport_key, req.checklist_id, req.mapping)
    save_odds_mappings(mappings_root)
    return {
        "status": "ok",
        "sport_key": req.sport_key,
        "checklist_id": req.checklist_id,
        "entries_count": len(mappings_for_checklist(req.sport_key, req.checklist_id, mappings_root)),
    }
