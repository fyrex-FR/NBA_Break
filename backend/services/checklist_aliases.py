"""Checklist alias loading and canonical ID helpers."""

from __future__ import annotations

import json
import os
import re

from .r2_storage import get_r2_config, is_r2_configured, read_r2_json


CHECKLIST_ALIASES_R2_KEY = "app/checklist_aliases.json"
_LOCAL_ALIASES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "checklist_aliases.json")


def _empty_aliases():
    return {"version": 1, "sports": {}}


def load_checklist_aliases():
    """Load checklist aliases from R2 first, then local fallback."""
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            data = read_r2_json(config, CHECKLIST_ALIASES_R2_KEY)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
    if os.path.exists(_LOCAL_ALIASES_PATH):
        with open(_LOCAL_ALIASES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    return _empty_aliases()


def aliases_for_sport(sport_key, aliases_root=None):
    root = aliases_root if isinstance(aliases_root, dict) else load_checklist_aliases()
    sports = root.get("sports", {})
    if not isinstance(sports, dict):
        return {}
    sport_aliases = sports.get(sport_key, {})
    return sport_aliases if isinstance(sport_aliases, dict) else {}


def canonical_checklist_id(sport_key, checklist_id, aliases_root=None):
    value = str(checklist_id or "").strip()
    if not value:
        return value
    sport_aliases = aliases_for_sport(sport_key, aliases_root)
    legacy_to_canonical = sport_aliases.get("legacy_to_canonical", {})
    if not isinstance(legacy_to_canonical, dict):
        return value
    return str(legacy_to_canonical.get(value, value)).strip()


def canonicalize_checklist_ids(sport_key, checklist_ids, aliases_root=None):
    seen = set()
    out = []
    for checklist_id in checklist_ids or []:
        canonical = canonical_checklist_id(sport_key, checklist_id, aliases_root)
        if canonical and canonical not in seen:
            seen.add(canonical)
            out.append(canonical)
    return out


def equivalent_checklist_ids(sport_key, checklist_id, aliases_root=None):
    canonical = canonical_checklist_id(sport_key, checklist_id, aliases_root)
    if not canonical:
        return set()
    values = {canonical}
    sport_aliases = aliases_for_sport(sport_key, aliases_root)
    canonical_to_legacy = sport_aliases.get("canonical_to_legacy", {})
    if isinstance(canonical_to_legacy, dict):
        for legacy in canonical_to_legacy.get(canonical, []) or []:
            if str(legacy).strip():
                values.add(str(legacy).strip())
    return values


def display_name_from_checklist_id(checklist_id):
    stem = re.sub(r"\.parquet$", "", str(checklist_id or ""), flags=re.I)
    stem = re.sub(r"-basketball-checklist$", "-basketball", stem)
    season = ""
    match = re.match(r"^((?:19|20)\d{2}-\d{2})-(.+)$", stem)
    if match:
        season, stem = match.groups()
    label = " ".join(
        part.upper() if part in {"nba", "nfl", "uefa"} else part.capitalize()
        for part in stem.split("-")
    )
    return f"{season} {label}".strip()


def alias_metadata_for_id(sport_key, checklist_id, aliases_root=None):
    canonical = canonical_checklist_id(sport_key, checklist_id, aliases_root)
    sport_aliases = aliases_for_sport(sport_key, aliases_root)
    canonical_to_legacy = sport_aliases.get("canonical_to_legacy", {})
    legacy_ids = canonical_to_legacy.get(canonical, []) if isinstance(canonical_to_legacy, dict) else []
    status = "canonical"
    if str(checklist_id or "").strip() != canonical:
        status = "legacy_alias"
    elif legacy_ids:
        status = "canonical_with_aliases"
    return {
        "canonical_checklist_id": canonical,
        "legacy_checklist_ids": legacy_ids,
        "display_name": display_name_from_checklist_id(canonical),
        "normalization_status": status,
    }
