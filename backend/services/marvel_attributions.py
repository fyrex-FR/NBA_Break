"""Manual Marvel card attribution overrides.

These overrides map a source checklist row to the breakable Marvel entity:
Player = character/subject, Team = universe/franchise.
"""

import hashlib
import json
import os
import re
from typing import Any

import pandas as pd

from .r2_storage import get_r2_config, is_r2_configured, read_r2_json, write_r2_json


MARVEL_ATTRIBUTIONS_R2_KEY = "app/marvel_attribution_overrides.json"
_LOCAL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "marvel_attribution_overrides.json")


def normalize_attribution_text(value: Any) -> str:
    text = "" if value is None else str(value).strip()
    return re.sub(r"\s+", " ", text)


def marvel_card_key(row: Any) -> str:
    """Build a stable key from source row fields before attribution is applied."""
    parts = [
        normalize_attribution_text(row.get("checklist_id", "")).lower(),
        normalize_attribution_text(row.get("Numbering", "")).lower(),
        normalize_attribution_text(row.get("Box Type", "")).lower(),
        normalize_attribution_text(row.get("Player", "")).lower(),
        normalize_attribution_text(row.get("Team", "")).lower(),
    ]
    raw = "||".join(parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def load_marvel_attributions() -> dict:
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            data = read_r2_json(config, MARVEL_ATTRIBUTIONS_R2_KEY)
            return data if isinstance(data, dict) else {}
        except Exception:
            pass
    if os.path.exists(_LOCAL_PATH):
        with open(_LOCAL_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    return {}


def save_marvel_attributions(data: dict) -> None:
    config = get_r2_config()
    if is_r2_configured(config):
        write_r2_json(config, MARVEL_ATTRIBUTIONS_R2_KEY, data)
    with open(_LOCAL_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def attribution_items(root: dict | None = None) -> dict:
    data = root if isinstance(root, dict) else load_marvel_attributions()
    items = data.get("items", {})
    return items if isinstance(items, dict) else {}


def apply_marvel_attributions(df: pd.DataFrame, root: dict | None = None) -> pd.DataFrame:
    """Apply saved Marvel attribution overrides to Player and Team columns."""
    if df is None or df.empty:
        return df
    if "Sport" in df.columns and not df["Sport"].astype(str).str.lower().eq("marvel").any():
        return df

    items = attribution_items(root)
    if not items:
        return df

    work = df.copy()
    keys = work.apply(marvel_card_key, axis=1)
    for idx, key in keys.items():
        override = items.get(key)
        if not isinstance(override, dict):
            continue
        player = normalize_attribution_text(override.get("player", ""))
        team = normalize_attribution_text(override.get("team", ""))
        if player:
            work.at[idx, "Player"] = player
        if team:
            work.at[idx, "Team"] = team
    return work
