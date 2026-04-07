"""Presets CRUD endpoints."""

from fastapi import APIRouter, HTTPException

from ..models.schemas import PresetSaveRequest
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_json, write_r2_json

router = APIRouter(prefix="/api/presets", tags=["presets"])

PRESETS_KEY = "app/presets.json"


def _load_all_presets():
    config = get_r2_config()
    if not is_r2_configured(config):
        return {}
    try:
        return read_r2_json(config, PRESETS_KEY)
    except Exception:
        return {}


def _save_all_presets(data):
    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="R2 non configuré.")
    write_r2_json(config, PRESETS_KEY, data)


@router.get("/{sport_key}")
def list_presets(sport_key: str):
    """List saved presets for a sport."""
    all_presets = _load_all_presets()
    sport_presets = all_presets.get(sport_key, {})
    return {
        "presets": [
            {"name": name, "checklist_ids": ids}
            for name, ids in sport_presets.items()
        ]
    }


@router.post("/{sport_key}")
def save_preset(sport_key: str, req: PresetSaveRequest):
    """Save or update a preset."""
    all_presets = _load_all_presets()
    if sport_key not in all_presets:
        all_presets[sport_key] = {}
    all_presets[sport_key][req.name] = req.checklist_ids
    _save_all_presets(all_presets)
    return {"status": "ok", "name": req.name}


@router.delete("/{sport_key}/{name}")
def delete_preset(sport_key: str, name: str):
    """Delete a preset."""
    all_presets = _load_all_presets()
    sport_presets = all_presets.get(sport_key, {})
    if name not in sport_presets:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")
    del sport_presets[name]
    all_presets[sport_key] = sport_presets
    _save_all_presets(all_presets)
    return {"status": "ok"}
