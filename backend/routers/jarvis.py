"""Jarvis-friendly summary endpoints.

Structured, no-LLM helpers for external assistants. This router intentionally
keeps all logic read-only and isolated from the existing UI/chat endpoints.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import unicodedata
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..services.analysis_engine import run_analysis
from ..services.card_logic import CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN
from ..services.data_pipeline import master_parquet_key_for_sport, split_slash_values
from ..routers.presets import _load_all_presets
from ..services.player_stats import get_player_stats

router = APIRouter(prefix="/api/jarvis", tags=["jarvis"])

SummaryType = Literal["player", "team"]

_PLAYER_ALIASES = {
    "wemby": "Victor Wembanyama",
    "victor": "Victor Wembanyama",
    "ant": "Anthony Edwards",
    "antman": "Anthony Edwards",
    "sga": "Shai Gilgeous-Alexander",
    "shai": "Shai Gilgeous-Alexander",
    "joker": "Nikola Jokic",
    "jokic": "Nikola Jokic",
    "bron": "LeBron James",
    "lebron": "LeBron James",
    "king james": "LeBron James",
    "luka": "Luka Doncic",
    "doncic": "Luka Doncic",
    "steph": "Stephen Curry",
    "curry": "Stephen Curry",
    "kd": "Kevin Durant",
    "durant": "Kevin Durant",
}

_TEAM_ALIASES = {
    "hawks": "Atlanta Hawks",
    "celtics": "Boston Celtics",
    "nets": "Brooklyn Nets",
    "hornets": "Charlotte Hornets",
    "bulls": "Chicago Bulls",
    "cavs": "Cleveland Cavaliers",
    "cavaliers": "Cleveland Cavaliers",
    "mavs": "Dallas Mavericks",
    "mavericks": "Dallas Mavericks",
    "nuggets": "Denver Nuggets",
    "pistons": "Detroit Pistons",
    "warriors": "Golden State Warriors",
    "rockets": "Houston Rockets",
    "pacers": "Indiana Pacers",
    "clippers": "Los Angeles Clippers",
    "lakers": "Los Angeles Lakers",
    "grizzlies": "Memphis Grizzlies",
    "heat": "Miami Heat",
    "bucks": "Milwaukee Bucks",
    "wolves": "Minnesota Timberwolves",
    "twolves": "Minnesota Timberwolves",
    "timberwolves": "Minnesota Timberwolves",
    "pelicans": "New Orleans Pelicans",
    "knicks": "New York Knicks",
    "okc": "Oklahoma City Thunder",
    "thunder": "Oklahoma City Thunder",
    "magic": "Orlando Magic",
    "sixers": "Philadelphia 76ers",
    "76ers": "Philadelphia 76ers",
    "suns": "Phoenix Suns",
    "blazers": "Portland Trail Blazers",
    "kings": "Sacramento Kings",
    "spurs": "San Antonio Spurs",
    "raptors": "Toronto Raptors",
    "jazz": "Utah Jazz",
    "wizards": "Washington Wizards",
}


def _normalize(text: str) -> str:
    text = "" if text is None else str(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace(",", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _load_keyword_overrides() -> dict:
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _resolve_preset(sport_key: str, preset: str) -> list[str]:
    all_presets = _load_all_presets()
    sport_presets = all_presets.get(sport_key, {})
    if preset in sport_presets:
        return sport_presets[preset]

    norm_query = _normalize(preset)
    for name, checklist_ids in sport_presets.items():
        if _normalize(name) == norm_query:
            return checklist_ids

    candidates = difflib.get_close_matches(norm_query, [_normalize(n) for n in sport_presets.keys()], n=5, cutoff=0.55)
    original_candidates = [n for n in sport_presets.keys() if _normalize(n) in candidates]
    detail = {"status": "preset_not_found", "query": preset, "candidates": original_candidates}
    raise HTTPException(status_code=404, detail=detail)


def _candidate_values(df, entity_type: SummaryType) -> list[str]:
    column = "Player" if entity_type == "player" else "Team"
    values: set[str] = set()
    for raw in df[column].dropna().astype(str):
        for part in split_slash_values(raw):
            if part:
                values.add(part)
    return sorted(values, key=lambda v: v.lower())


def _resolve_entity(name: str, candidates: list[str], entity_type: SummaryType) -> str:
    aliases = _PLAYER_ALIASES if entity_type == "player" else _TEAM_ALIASES
    query_norm = _normalize(name)
    alias_target = aliases.get(query_norm)
    if alias_target:
        target_norm = _normalize(alias_target)
        for cand in candidates:
            if _normalize(cand) == target_norm:
                return cand

    norm_to_original: dict[str, str] = {_normalize(c): c for c in candidates}
    if query_norm in norm_to_original:
        return norm_to_original[query_norm]

    contains = [c for c in candidates if query_norm and query_norm in _normalize(c)]
    if len(contains) == 1:
        return contains[0]
    if len(contains) > 1:
        raise HTTPException(status_code=409, detail={"status": "ambiguous", "query": name, "candidates": contains[:10]})

    close_norms = difflib.get_close_matches(query_norm, list(norm_to_original.keys()), n=5, cutoff=0.72)
    close = [norm_to_original[n] for n in close_norms]
    if len(close) == 1:
        return close[0]
    if len(close) > 1:
        raise HTTPException(status_code=409, detail={"status": "ambiguous", "query": name, "candidates": close})

    raise HTTPException(status_code=404, detail={"status": "not_found", "query": name, "type": entity_type})


def _category_counts(df) -> dict:
    return {
        "cards_total": int(len(df)),
        "auto_mem": int((df["Category"] == CATEGORY_AUTO_MEM).sum()) if "Category" in df else 0,
        "logoman": int((df["Category"] == CATEGORY_LOGOMAN).sum()) if "Category" in df else 0,
        "case_hit": int((df["Category"] == CATEGORY_CASE_HIT).sum()) if "Category" in df else 0,
    }


def _top_records(df, group_col: str, limit: int = 10) -> list[dict]:
    if df.empty or group_col not in df.columns:
        return []
    rows = []
    grouped = df.groupby(group_col, dropna=True)
    for key, part in grouped:
        rows.append({
            "name": str(key),
            **_category_counts(part),
            "checklists_count": int(part["checklist_name"].nunique()) if "checklist_name" in part else None,
        })
    return sorted(rows, key=lambda r: r["cards_total"], reverse=True)[:limit]


@router.get("/summary")
def jarvis_summary(
    type: SummaryType = Query(..., description="Entity type: player or team"),
    preset: str = Query(..., description="Saved preset name, e.g. DBTK #7"),
    name: str = Query(..., description="Player/team name or nickname"),
    sport_key: str = Query("nba"),
    include_nba_stats: bool = Query(True),
):
    """Return a compact structured summary for one player or team in a preset."""
    checklist_ids = _resolve_preset(sport_key, preset)
    result = run_analysis(
        sport_key=sport_key,
        checklist_ids=checklist_ids,
        master_key=master_parquet_key_for_sport(sport_key),
        keyword_overrides_root=_load_keyword_overrides(),
    )

    source_df = result["df_p"] if type == "player" else result["df_t"]
    candidates = _candidate_values(source_df, type)
    resolved = _resolve_entity(name, candidates, type)

    column = "Player" if type == "player" else "Team"
    entity_df = source_df[source_df[column].astype(str).map(_normalize) == _normalize(resolved)].copy()
    if entity_df.empty:
        raise HTTPException(status_code=404, detail={"status": "not_found", "query": name, "resolved": resolved, "type": type})

    payload = {
        "status": "ok",
        "type": type,
        "sport_key": sport_key,
        "preset": preset,
        "name": resolved,
        "query": name,
        **_category_counts(entity_df),
        "checklists_count": int(entity_df["checklist_name"].nunique()) if "checklist_name" in entity_df else None,
        "top_checklists": _top_records(entity_df, "checklist_name", limit=10),
    }

    if type == "player":
        teams = sorted({t for raw in entity_df["Team"].dropna().astype(str) for t in split_slash_values(raw) if t})
        payload["teams"] = teams
        payload["premium_cards"] = entity_df[
            entity_df["Category"].isin([CATEGORY_AUTO_MEM, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT])
        ][[c for c in ["Box Type", "Numbering", "Category", "checklist_name"] if c in entity_df.columns]].head(20).to_dict(orient="records")
        if include_nba_stats and sport_key == "nba":
            try:
                stats = get_player_stats(resolved)
                payload["nba_stats"] = {
                    k: stats.get(k)
                    for k in ["player_id", "full_name", "is_active", "position", "height", "weight", "country", "team", "jersey", "draft", "awards"]
                }
            except Exception as exc:  # keep checklist summary usable if nba_api is down
                payload["nba_stats_error"] = str(exc)
    else:
        # Use the player-exploded frame for top players, otherwise multi-player
        # cards would stay grouped as "A / B / C".
        player_df = result["df_p"]
        team_player_df = player_df[player_df["Team"].astype(str).map(_normalize) == _normalize(resolved)].copy()
        payload["top_players"] = _top_records(team_player_df, "Player", limit=15)

    return payload
