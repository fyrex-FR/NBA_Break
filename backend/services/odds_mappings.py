"""
Load/save du mapping manuel Box Type (checklist) -> set (odds).

Calqué exactement sur le pattern de backend/routers/overrides.py:27-47
(load/save de keyword_overrides.json) : R2 d'abord, fallback fichier local.

Structure : {"version": 1, "sports": {"<sport>": {"<checklist_id>": {"<Box Type exact>": "<set root>"}}}}
La valeur "__none__" marque un Box Type volontairement non rattaché.
"""

import json
import os

from .r2_storage import get_r2_config, is_r2_configured, read_r2_json, write_r2_json

ODDS_MAPPINGS_R2_KEY = "app/odds_mappings.json"
_LOCAL_MAPPINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "odds_mappings.json")


def _empty_mappings():
    return {"version": 1, "sports": {}}


def load_odds_mappings():
    """Load odds mappings from R2 first, then local file."""
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            data = read_r2_json(config, ODDS_MAPPINGS_R2_KEY)
            if isinstance(data, dict) and data:
                return data
        except Exception:
            pass
    if os.path.exists(_LOCAL_MAPPINGS_PATH):
        try:
            with open(_LOCAL_MAPPINGS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    return _empty_mappings()


def save_odds_mappings(data):
    """Save odds mappings to R2 and local file."""
    config = get_r2_config()
    if is_r2_configured(config):
        write_r2_json(config, ODDS_MAPPINGS_R2_KEY, data)
    with open(_LOCAL_MAPPINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def mappings_for_checklist(sport_key, checklist_id, mappings_root=None):
    """Extrait {Box Type: set_root} pour un (sport_key, checklist_id) donné."""
    root = mappings_root if isinstance(mappings_root, dict) else load_odds_mappings()
    sports = root.get("sports", {})
    if not isinstance(sports, dict):
        return {}
    sport_map = sports.get(sport_key, {})
    if not isinstance(sport_map, dict):
        return {}
    checklist_map = sport_map.get(checklist_id, {})
    return checklist_map if isinstance(checklist_map, dict) else {}


def set_mapping_entries(mappings_root, sport_key, checklist_id, entries):
    """Fusionne `entries` ({Box Type: set_root}) dans mappings_root, en place.

    Retourne mappings_root pour chaînage. `set_root` == "__none__" marque un
    rattachement volontairement absent.
    """
    if not isinstance(mappings_root, dict):
        mappings_root = _empty_mappings()
    mappings_root.setdefault("version", 1)
    sports = mappings_root.setdefault("sports", {})
    if not isinstance(sports, dict):
        sports = {}
        mappings_root["sports"] = sports
    sport_map = sports.setdefault(sport_key, {})
    if not isinstance(sport_map, dict):
        sport_map = {}
        sports[sport_key] = sport_map
    checklist_map = sport_map.setdefault(checklist_id, {})
    if not isinstance(checklist_map, dict):
        checklist_map = {}
        sport_map[checklist_id] = checklist_map

    for box_type, set_root in (entries or {}).items():
        box_type = str(box_type or "").strip()
        set_root = str(set_root or "").strip()
        if not box_type or not set_root:
            continue
        checklist_map[box_type] = set_root

    return mappings_root
