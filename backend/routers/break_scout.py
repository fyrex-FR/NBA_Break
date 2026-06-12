"""Voggt break scouting endpoints.

Public entry point: paste a Voggt show URL → list its breaks → pick one →
get its spots (with prices) + detected checklists. The premium ↔ price join
is done client-side from the existing /api/analyze result, so editing the
checklist selection updates the overview live.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Query

from ..services.break_products import detect_break, normalize_team_name
from ..services.voggt_client import (
    VoggtError,
    fetch_break_list,
    fetch_break_spots,
    parse_show_id,
)

router = APIRouter(prefix="/api/break", tags=["break"])


def _price_to_float(price: str | None) -> float | None:
    if not price:
        return None
    m = re.search(r"[0-9]+(?:[.,][0-9]+)?", price)
    return float(m.group(0).replace(",", ".")) if m else None


@router.get("/show")
def get_show_breaks(url: str = Query(..., description="Voggt show URL or id")):
    """List the breaks of a Voggt show, with a per-break product detection preview."""
    try:
        show_id = parse_show_id(url)
        breaks = fetch_break_list(show_id)
    except VoggtError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    items = []
    for b in breaks:
        detection = detect_break(b.title, b.description)
        items.append({
            "break_id": b.break_id,
            "title": b.title,
            "available": b.available,
            "total": b.total,
            "cover_url": b.cover_url,
            "sport_guess": detection.get("sport"),
            "coverage": detection["coverage"],
            "checklist_ids": detection["checklist_ids"],
            "checklist_ids_by_sport": detection["checklist_ids_by_sport"],
            "detected_products": detection["detected_products"],
        })

    return {"show_id": show_id, "breaks": items}


@router.get("/detail")
def get_break_detail(
    break_id: str = Query(..., description="Voggt break node id (Break|...)"),
    show_id: str | None = Query(None, description="Parent show id (for referer)"),
):
    """Full break: spots with prices + product detection → checklist ids."""
    try:
        details = fetch_break_spots(break_id, show_id)
    except VoggtError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    detection = detect_break(details.title, details.description)
    sport = detection.get("sport")

    spots = []
    for s in details.spots:
        spots.append({
            **s,
            "team": normalize_team_name(s.get("name") or ""),
            "price_eur": _price_to_float(s.get("price")),
        })

    grille_total = round(sum(s["price_eur"] for s in spots if s["price_eur"] is not None), 2)
    grille_dispo = round(
        sum(s["price_eur"] for s in spots
            if s["price_eur"] is not None and str(s.get("status")).upper() != "SOLD"),
        2,
    )

    return {
        "break_id": break_id,
        "show_id": show_id,
        "title": details.title,
        "description": details.description,
        "available": details.available,
        "total": details.total,
        "sport": sport,
        "coverage": detection["coverage"],
        "checklist_ids": detection["checklist_ids"],
        "checklist_ids_by_sport": detection["checklist_ids_by_sport"],
        "detected_products": detection["detected_products"],
        "unmapped_products": detection["unmapped_products"],
        "spots": spots,
        "grille_total": grille_total,
        "grille_dispo": grille_dispo,
    }
