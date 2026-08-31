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


class VotePayload(BaseModel):
    pseudo: str = Field(min_length=2, max_length=40)
    years: list[str] = Field(min_length=1, max_length=20)
    checklist_ids: list[str] = Field(min_length=1, max_length=100)
    preference: Literal["value", "guarantee", "either"]

    @field_validator("pseudo")
    @classmethod
    def clean_pseudo(cls, value: str) -> str:
        cleaned = re.sub(r"\s+", " ", value.strip())
        if not re.fullmatch(r"[\w .@#'\-]{2,40}", cleaned, flags=re.UNICODE):
            raise ValueError("Pseudo invalide")
        return cleaned

    @field_validator("years", "checklist_ids")
    @classmethod
    def unique_values(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if not cleaned:
            raise ValueError("Au moins un choix est requis")
        return cleaned


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


@router.get("/options")
def poll_options():
    options = [_public_option(row) for row in _catalog() if row.get("checklist_id") and row.get("year")]
    options.sort(key=lambda row: (row["year"], row.get("display_name") or row["checklist_name"]), reverse=True)
    return {"poll_id": POLL_ID, "sport_key": SPORT_KEY, "options": options}


@router.post("/votes")
def submit_vote(payload: VotePayload):
    config = _config()
    catalog = {row.get("checklist_id"): row for row in _catalog()}
    unknown = [checklist_id for checklist_id in payload.checklist_ids if checklist_id not in catalog]
    if unknown:
        raise HTTPException(status_code=422, detail="Une ou plusieurs box ne sont plus disponibles")

    selected_years = set(payload.years)
    if any(str(catalog[checklist_id].get("year", "")) not in selected_years for checklist_id in payload.checklist_ids):
        raise HTTPException(status_code=422, detail="Les box choisies ne correspondent pas aux années sélectionnées")

    vote = {
        "years": payload.years,
        "checklist_ids": payload.checklist_ids,
        "preference": payload.preference,
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
    preferences: Counter[str] = Counter()
    for vote in votes:
        years.update(set(vote.get("years", [])))
        checklists.update(set(vote.get("checklist_ids", [])))
        preference = vote.get("preference")
        if preference in {"value", "guarantee", "either"}:
            preferences[preference] += 1

    return {
        "voters": len(votes),
        "years": dict(years.most_common()),
        "checklists": dict(checklists.most_common()),
        "preferences": {key: preferences[key] for key in ("value", "guarantee", "either")},
    }
