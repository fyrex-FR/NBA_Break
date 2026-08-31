"""Public community polls backed by private R2 objects."""

from __future__ import annotations

import hashlib
import os
import re
from collections import Counter
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from .sports import list_checklists
from ..services.r2_storage import (
    get_r2_config,
    is_r2_configured,
    list_r2_keys_with_prefix,
    read_r2_json,
    write_r2_json,
)

router = APIRouter(prefix="/api/polls/dbtk", tags=["polls"])

POLL_ID = "dbtk-next-pyp"
SPORT_KEY = "nba"
VOTES_PREFIX = f"polls/{POLL_ID}/votes/"


class ChecklistChoice(BaseModel):
    checklist_id: str = Field(min_length=1, max_length=200)
    preference: Literal["value", "guarantee", "mix"] = "guarantee"


class VotePayload(BaseModel):
    pseudo: str = Field(min_length=2, max_length=40)
    years: list[str] = Field(min_length=1, max_length=20)
    choices: list[ChecklistChoice] = Field(min_length=1, max_length=100)

    @field_validator("pseudo")
    @classmethod
    def clean_pseudo(cls, value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value.strip())
        if not re.fullmatch(r"[\w .@#'\-]{2,40}", cleaned, flags=re.UNICODE):
            raise ValueError("Pseudo invalide")
        return cleaned

    @field_validator("years")
    @classmethod
    def unique_values(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if not cleaned:
            raise ValueError("Au moins un choix est requis")
        return cleaned

    @field_validator("choices")
    @classmethod
    def unique_choices(cls, choices: list[ChecklistChoice]) -> list[ChecklistChoice]:
        unique = {choice.checklist_id: choice for choice in choices if choice.checklist_id.strip()}
        if not unique:
            raise ValueError("Au moins une box est requise")
        return list(unique.values())


def _config():
    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="Sondage temporairement indisponible")
    return config


def _catalog() -> list[dict]:
    response = list_checklists(SPORT_KEY)
    return response.get("checklists", [])


def _public_option(row: dict) -> dict:
    return {
        "checklist_id": row.get("checklist_id", ""),
        "checklist_name": row.get("checklist_name", ""),
        "display_name": row.get("display_name"),
        "year": row.get("year", ""),
    }


def _voter_key(pseudo: str) -> str:
    normalized = pseudo.casefold().strip()
    salt = os.getenv("POLL_PSEUDO_SALT", POLL_ID)
    digest = hashlib.sha256(f"{salt}:{normalized}".encode("utf-8")).hexdigest()
    return f"{VOTES_PREFIX}{digest}.json"


def _load_votes(config) -> list[dict]:
    votes = []
    for key in list_r2_keys_with_prefix(config, VOTES_PREFIX, suffix=".json"):
        try:
            vote = read_r2_json(config, key)
            if isinstance(vote, dict):
                votes.append(vote)
        except Exception:
            continue
    return votes


def _choices_for_vote(vote: dict) -> list[dict]:
    """Return current per-checklist choices, converting the deployed legacy shape."""
    choices = vote.get("choices")
    if isinstance(choices, list):
        return [choice for choice in choices if isinstance(choice, dict) and choice.get("checklist_id")]

    legacy_preference = vote.get("preference", "guarantee")
    preference = "mix" if legacy_preference == "either" else legacy_preference
    if preference not in {"value", "guarantee", "mix"}:
        preference = "guarantee"
    return [
        {"checklist_id": checklist_id, "preference": preference}
        for checklist_id in vote.get("checklist_ids", [])
    ]


@router.get("/options")
def poll_options():
    options = [_public_option(row) for row in _catalog() if row.get("checklist_id") and row.get("year")]
    options.sort(key=lambda row: (row["year"], row.get("display_name") or row["checklist_name"]), reverse=True)
    return {"poll_id": POLL_ID, "sport_key": SPORT_KEY, "options": options}


@router.post("/votes")
def submit_vote(payload: VotePayload):
    config = _config()
    catalog = {row.get("checklist_id"): row for row in _catalog()}
    unknown = [choice.checklist_id for choice in payload.choices if choice.checklist_id not in catalog]
    if unknown:
        raise HTTPException(status_code=422, detail="Une ou plusieurs box ne sont plus disponibles")

    selected_years = set(payload.years)
    if any(str(catalog[choice.checklist_id].get("year", "")) not in selected_years for choice in payload.choices):
        raise HTTPException(status_code=422, detail="Les box choisies ne correspondent pas aux années sélectionnées")

    vote = {
        "pseudo": payload.pseudo,
        "years": payload.years,
        "choices": [choice.model_dump() for choice in payload.choices],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    write_r2_json(config, _voter_key(payload.pseudo), vote)
    return {"status": "saved", "replaces_previous": True}


@router.get("/results")
def poll_results():
    config = _config()
    votes = _load_votes(config)
    years: Counter[str] = Counter()
    checklists: Counter[str] = Counter()
    checklist_preferences: dict[str, Counter[str]] = {}
    public_votes = []
    for vote in votes:
        years.update(set(vote.get("years", [])))
        choices = _choices_for_vote(vote)
        checklist_ids = {choice["checklist_id"] for choice in choices}
        checklists.update(checklist_ids)
        for choice in choices:
            checklist_id = choice["checklist_id"]
            if checklist_id not in checklist_preferences:
                checklist_preferences[checklist_id] = Counter()
            checklist_preferences[checklist_id][choice.get("preference", "guarantee")] += 1
        if vote.get("pseudo"):
            public_votes.append({
                "pseudo": vote["pseudo"],
                "years": vote.get("years", []),
                "choices": choices,
                "updated_at": vote.get("updated_at"),
            })

    public_votes.sort(key=lambda vote: (vote.get("updated_at") or ""), reverse=True)

    return {
        "voters": len(votes),
        "years": dict(years.most_common()),
        "checklists": dict(checklists.most_common()),
        "checklist_preferences": {
            checklist_id: {key: counts[key] for key in ("value", "guarantee", "mix")}
            for checklist_id, counts in checklist_preferences.items()
        },
        "votes": public_votes,
    }
