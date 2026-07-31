"""Marvel card attribution review endpoints."""

import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.analysis_engine import enrich_dataframe
from ..services.card_logic import HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM
from ..services.checklist_aliases import equivalent_checklist_ids, load_checklist_aliases
from ..services.data_pipeline import ensure_master_dataframe_schema
from ..services.marvel_attributions import (
    attribution_items,
    load_marvel_attributions,
    marvel_card_key,
    normalize_attribution_text,
    save_marvel_attributions,
)
from ..services.marvel_parser import _ARTIST_AUTOGRAPH_SUBJECTS
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_json, read_r2_parquet


router = APIRouter(prefix="/api/marvel/attributions", tags=["marvel-attributions"])

_KEYWORD_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
_KEYWORD_OVERRIDES_R2_KEY = "app/keyword_overrides.json"


def _load_keyword_overrides():
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            return read_r2_json(config, _KEYWORD_OVERRIDES_R2_KEY)
        except Exception:
            pass
    if os.path.exists(_KEYWORD_OVERRIDES_PATH):
        with open(_KEYWORD_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _load_raw_marvel_master(checklist_ids: list[str], master_key: Optional[str]):
    config = get_r2_config()
    if not is_r2_configured(config):
        raise RuntimeError("R2 non configure.")
    if not master_key:
        raise ValueError("Master parquet Marvel introuvable.")

    df = ensure_master_dataframe_schema(read_r2_parquet(config, master_key), "marvel")
    if checklist_ids:
        aliases_root = load_checklist_aliases()
        selected_ids = set()
        for value in checklist_ids:
            selected_ids.update(equivalent_checklist_ids("marvel", value, aliases_root))
        if selected_ids:
            df = df[df["checklist_id"].astype(str).isin(selected_ids)].copy()
    if df.empty:
        raise ValueError("Aucune ligne Marvel trouvee pour la selection.")
    return df.reset_index(drop=True)


class MarvelAttributionDetectRequest(BaseModel):
    checklist_ids: list[str] = []
    master_key: Optional[str] = None
    hits_only: bool = True


class MarvelAttributionCard(BaseModel):
    key: str
    checklist_id: str
    checklist_name: str
    number: str
    box_type: str
    hits: int
    category: str
    hit_type: str
    source_player: str
    source_team: str
    source_kind: str = "source"
    source_label: str = ""
    player: str
    team: str
    note: str = ""
    is_overridden: bool = False


class MarvelAttributionDetectResponse(BaseModel):
    cards: list[MarvelAttributionCard]
    overrides_count: int


class MarvelAttributionSaveItem(BaseModel):
    key: str
    player: str = ""
    team: str = ""
    note: str = ""
    source_player: str = ""
    source_team: str = ""
    checklist_id: str = ""
    checklist_name: str = ""
    number: str = ""
    box_type: str = ""


class MarvelAttributionSaveRequest(BaseModel):
    items: list[MarvelAttributionSaveItem]


@router.post("/detect", response_model=MarvelAttributionDetectResponse)
def detect_marvel_attributions(req: MarvelAttributionDetectRequest):
    try:
        raw_df = _load_raw_marvel_master(req.checklist_ids, req.master_key)
        enriched = enrich_dataframe(raw_df.copy(), "marvel", _load_keyword_overrides())
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    saved = load_marvel_attributions()
    items = attribution_items(saved)

    if req.hits_only:
        hit_types = {HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM}
        mask = enriched["Hit Type"].astype(str).isin(hit_types)
        mask = mask | enriched["Category"].astype(str).str.contains("Case Hit|Logoman", case=False, na=False)
        enriched = enriched[mask].copy()

    cards: list[MarvelAttributionCard] = []
    for idx, row in enriched.sort_values(["checklist_name", "Box Type", "Player", "Numbering"]).iterrows():
        key = marvel_card_key(raw_df.loc[idx])
        override = items.get(key, {}) if isinstance(items.get(key, {}), dict) else {}
        source_player = normalize_attribution_text(raw_df.loc[idx].get("Player", ""))
        source_team = normalize_attribution_text(raw_df.loc[idx].get("Team", ""))
        player = normalize_attribution_text(override.get("player", "")) or source_player
        team = normalize_attribution_text(override.get("team", "")) or source_team
        source_kind = "manual" if override else "source"
        source_label = ""
        parser_artists = _parser_artist_sources(
            checklist_id=normalize_attribution_text(row.get("checklist_id", "")),
            box_type=normalize_attribution_text(row.get("Box Type", "")),
            player=source_player,
        )
        if parser_artists:
            source_kind = "parser"
            source_label = f"Parser artiste: {parser_artists}"
        cards.append(MarvelAttributionCard(
            key=key,
            checklist_id=normalize_attribution_text(row.get("checklist_id", "")),
            checklist_name=normalize_attribution_text(row.get("checklist_name", "")),
            number=normalize_attribution_text(row.get("Numbering", "")),
            box_type=normalize_attribution_text(row.get("Box Type", "")),
            hits=int(row.get("Hits", 1) or 1),
            category=normalize_attribution_text(row.get("Category", "")),
            hit_type=normalize_attribution_text(row.get("Hit Type", "")),
            source_player=source_player,
            source_team=source_team,
            source_kind=source_kind,
            source_label=source_label,
            player=player,
            team=team,
            note=normalize_attribution_text(override.get("note", "")),
            is_overridden=bool(override),
        ))

    return MarvelAttributionDetectResponse(cards=cards, overrides_count=len(items))


@router.post("/save")
def save_marvel_attribution_overrides(req: MarvelAttributionSaveRequest):
    root = load_marvel_attributions()
    items = attribution_items(root)

    for row in req.items:
        key = normalize_attribution_text(row.key)
        if not key:
            continue
        player = normalize_attribution_text(row.player)
        team = normalize_attribution_text(row.team)
        source_player = normalize_attribution_text(row.source_player)
        source_team = normalize_attribution_text(row.source_team)
        note = normalize_attribution_text(row.note)

        if (not player or player == source_player) and (not team or team == source_team) and not note:
            items.pop(key, None)
            continue

        items[key] = {
            "player": player or source_player,
            "team": team or source_team,
            "note": note,
            "source_player": source_player,
            "source_team": source_team,
            "checklist_id": normalize_attribution_text(row.checklist_id),
            "checklist_name": normalize_attribution_text(row.checklist_name),
            "number": normalize_attribution_text(row.number),
            "box_type": normalize_attribution_text(row.box_type),
        }

    root["items"] = dict(sorted(items.items()))
    save_marvel_attributions(root)
    return {"status": "ok", "overrides_count": len(root["items"])}


def _parser_artist_sources(checklist_id: str, box_type: str, player: str) -> str:
    if "artist" not in box_type.lower() or "auto" not in box_type.lower():
        return ""
    checklist = checklist_id.lower()
    if "deadpool" in checklist:
        mapping = _ARTIST_AUTOGRAPH_SUBJECTS.get("deadpool", {})
    elif "comic-book-heroes" in checklist:
        mapping = _ARTIST_AUTOGRAPH_SUBJECTS.get("comic_book_heroes", {})
    else:
        mapping = {}
    if not mapping:
        return ""
    artists = [
        _title_artist(artist)
        for artist, subject in mapping.items()
        if normalize_attribution_text(subject).lower() == normalize_attribution_text(player).lower()
    ]
    return " / ".join(artists)


def _title_artist(value: str) -> str:
    overrides = {
        "ed mcguinness": "Ed McGuinness",
        "mike mckone": "Mike McKone",
        "steve mcniven": "Steve McNiven",
        "mike deodato jr.": "Mike Deodato Jr.",
    }
    normalized = normalize_attribution_text(value).lower()
    if normalized in overrides:
        return overrides[normalized]
    return " ".join(part.capitalize() if part.lower() != "jr." else "Jr." for part in value.split())
