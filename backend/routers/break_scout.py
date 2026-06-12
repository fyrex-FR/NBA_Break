"""Voggt break scouting endpoints.

Public entry point: paste a Voggt show URL → list its breaks → pick one →
get its spots (with prices) + detected checklists. The premium ↔ price join
is done client-side from the existing /api/analyze result, so editing the
checklist selection updates the overview live.
"""

from __future__ import annotations

import re
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Query

from ..services.break_products import detect_break, normalize_team_name, normalize_key
from ..services.voggt_client import (
    VoggtError,
    fetch_break_list,
    fetch_break_spots,
    fetch_current_auction,
    fetch_show_products,
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
            "unmatched_products": detection["unmatched_products"],
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

    # Real prices: sold/instant-buy amounts come from the show "All" tab,
    # the live current bid from GetShowCurrentAuction. We match by name+type;
    # random-team auctions (sold as generic "RANDOM TEAM" lots) won't match and
    # keep their 1€ starting price, flagged as such.
    ordered, current = [], None
    if show_id:
        try:
            ordered = fetch_show_products(show_id)
        except VoggtError:
            ordered = []
        try:
            current = fetch_current_auction(show_id)
        except VoggtError:
            current = None

    amount_map: dict[tuple, list] = defaultdict(list)
    for o in ordered:
        if o.get("amount_cents") is not None:
            amount_map[(normalize_key(o.get("name") or ""), str(o.get("type") or "").upper())].append(o["amount_cents"])

    cur_pid = current.get("product_id") if current else None
    cur_amt = current.get("amount_cents") if current else None
    cur_live = bool(current) and str(current.get("status")).upper() == "IN_PROGRESS"

    def _eur(cents):
        return round(cents / 100, 2) if cents is not None else None

    spots = []
    for s in details.spots:
        stype = str(s.get("type") or "").upper()
        nkey = normalize_key(s.get("name") or "")
        price_eur = _price_to_float(s.get("price"))  # startingAmount-based
        source = "fixed" if stype == "INSTANT_BUY" else ("start" if stype == "AUCTION" else "fixed")

        if cur_live and cur_pid and s.get("id") == cur_pid and cur_amt is not None:
            price_eur, source = _eur(cur_amt), "live"
        else:
            cands = amount_map.get((nkey, stype))
            if cands and len(set(cands)) == 1:
                price_eur, source = _eur(cands[0]), "final"

        spots.append({
            **s,
            "team": normalize_team_name(s.get("name") or ""),
            "price_eur": price_eur,
            "price_source": source,
        })

    grille_total = round(sum(s["price_eur"] for s in spots if s["price_eur"] is not None), 2)
    grille_dispo = round(
        sum(s["price_eur"] for s in spots
            if s["price_eur"] is not None and str(s.get("status")).upper() != "SOLD"),
        2,
    )
    auction_unresolved = sum(1 for s in spots if s.get("price_source") == "start")

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
        "unmatched_products": detection["unmatched_products"],
        "spots": spots,
        "grille_total": grille_total,
        "grille_dispo": grille_dispo,
        "auction_unresolved": auction_unresolved,
    }
