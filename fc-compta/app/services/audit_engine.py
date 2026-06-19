"""Audit engine — break verification logic.

Stateless: fetches everything from Voggt live, computes metrics and
inconsistencies, and returns a structured report.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter

from backend.services.voggt_client import (
    fetch_break_list,
    fetch_break_spots,
    fetch_show_products,
    fetch_current_auction,
    parse_show_id,
    VoggtError,
)
from backend.services.break_products import detect_break, normalize_key

from .box_prices import estimate_price, detect_box_type


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _price_to_float(price: str | None) -> float | None:
    if not price:
        return None
    m = re.search(r"[0-9]+(?:[.,][0-9]+)?", price)
    return float(m.group(0).replace(",", ".")) if m else None


def _eur(cents) -> float | None:
    return round(cents / 100, 2) if cents is not None else None


# ---------------------------------------------------------------------------
# Inconsistency checks
# ---------------------------------------------------------------------------

def _check_inconsistencies(spots: list[dict], break_total: int | None) -> list[dict]:
    """Return a list of {type, severity, message} inconsistencies."""
    issues: list[dict] = []

    # Count vs announced total
    if break_total is not None and len(spots) != break_total:
        issues.append({
            "type": "spot_count_mismatch",
            "severity": "warning",
            "message": f"Le break annonce {break_total} spots mais en contient {len(spots)}.",
        })

    # Mixed types (auction + instant_buy in same break)
    types = {str(s.get("type") or "").upper() for s in spots}
    types.discard("")
    if len(types) > 1:
        issues.append({
            "type": "mixed_types",
            "severity": "warning",
            "message": f"Types mélangés dans le même break: {', '.join(sorted(types))}.",
        })

    # Duplicate team names
    names = [s.get("name") or "" for s in spots]
    name_counts = Counter(names)
    dupes = [(n, c) for n, c in name_counts.items() if c > 1 and n]
    if dupes:
        dupe_str = ", ".join(f"{n} (×{c})" for n, c in dupes[:5])
        issues.append({
            "type": "duplicate_spots",
            "severity": "info",
            "message": f"Spots dupliqués: {dupe_str}.",
        })

    # Suspect prices
    prices = [_price_to_float(s.get("price")) for s in spots if s.get("type", "").upper() == "INSTANT_BUY"]
    prices = [p for p in prices if p is not None]
    if prices:
        if any(p == 0 for p in prices):
            issues.append({
                "type": "zero_price",
                "severity": "error",
                "message": "Un ou plusieurs spots à 0€.",
            })
        very_high = [p for p in prices if p > 500]
        if very_high:
            issues.append({
                "type": "very_high_price",
                "severity": "info",
                "message": f"{len(very_high)} spot(s) au-dessus de 500€ (max {max(very_high)}€).",
            })

    return issues


# ---------------------------------------------------------------------------
# Price resolution (same logic as NoClim's break_scout router)
# ---------------------------------------------------------------------------

def _resolve_prices(spots: list[dict], ordered: list[dict], current: dict | None) -> list[dict]:
    """Enrich spots with resolved prices and source."""
    from collections import defaultdict
    amount_map: dict[tuple, list] = defaultdict(list)
    for o in ordered:
        if o.get("amount_cents") is not None:
            amount_map[(normalize_key(o.get("name") or ""), str(o.get("type") or "").upper())].append(o["amount_cents"])

    cur_pid = current.get("product_id") if current else None
    cur_amt = current.get("amount_cents") if current else None
    cur_live = bool(current) and str(current.get("status")).upper() == "IN_PROGRESS"

    enriched = []
    for s in spots:
        stype = str(s.get("type") or "").upper()
        nkey = normalize_key(s.get("name") or "")
        price_eur = _price_to_float(s.get("price"))
        source = "fixed" if stype == "INSTANT_BUY" else ("auction" if stype == "AUCTION" else "fixed")

        if cur_live and cur_pid and s.get("id") == cur_pid and cur_amt is not None:
            price_eur, source = _eur(cur_amt), "live"
        else:
            cands = amount_map.get((nkey, stype))
            if cands and len(set(cands)) == 1:
                price_eur, source = _eur(cands[0]), "final"

        if source == "auction":
            price_eur = None

        enriched.append({
            "name": s.get("name") or "",
            "team": _norm(s.get("name") or ""),
            "price_eur": price_eur,
            "price_source": source,
            "status": s.get("status") or "UNKNOWN",
            "type": stype,
        })
    return enriched


# ---------------------------------------------------------------------------
# Box cost estimation
# ---------------------------------------------------------------------------

def _estimate_box_costs(detected_products: list[dict], sport: str, description: str) -> list[dict]:
    """For each detected product, estimate its retail box cost."""
    estimates = []
    for p in detected_products:
        label = p.get("label") or ""
        # Try to extract quantity from description (e.g. "(2) Panini Prizm...")
        qty = 1
        desc_lower = (description or "").lower()
        for m in re.finditer(r"\((\d+)\)\s*" + re.escape(label[:20].lower()[:10]), desc_lower):
            qty = int(m.group(1))
            break
        # Also check "NxProduct" pattern
        for m in re.finditer(r"(\d+)\s*x\s*" + re.escape(label[:15].lower()[:8]), desc_lower):
            qty = int(m.group(1))
            break

        box_type = detect_box_type(label) or detect_box_type(description)
        est = estimate_price(sport, label, box_type)
        estimates.append({
            "product": label,
            "quantity": qty,
            "box_type": box_type,
            "unit_price_eur": est["price_eur"] if est else None,
            "total_price_eur": (est["price_eur"] * qty) if est else None,
            "matched_reference": est["product_match"] if est else None,
            "confidence": est["confidence"] if est else None,
        })
    return estimates


# ---------------------------------------------------------------------------
# Main audit
# ---------------------------------------------------------------------------

def audit_show(url: str) -> dict:
    """Run a full audit on a Voggt show.

    Returns a structured report with per-break data.
    """
    show_id = parse_show_id(url)
    breaks_list = fetch_break_list(show_id)

    # Fetch show-level sold products (for price resolution)
    try:
        ordered = fetch_show_products(show_id)
    except VoggtError:
        ordered = []
    try:
        current = fetch_current_auction(show_id)
    except VoggtError:
        current = None

    break_reports = []
    for b in breaks_list:
        # Fetch spots
        try:
            details = fetch_break_spots(b.break_id, show_id)
        except VoggtError:
            break_reports.append({
                "break_id": b.break_id,
                "title": b.title,
                "error": "Impossible de récupérer les spots.",
            })
            continue

        # Detect products
        detection = detect_break(details.title, details.description)
        sport = detection.get("sport") or "nba"

        # Resolve prices
        spots = _resolve_prices(details.spots, ordered, current)

        # Grille metrics
        fixed_prices = [s["price_eur"] for s in spots if s["price_eur"] is not None and s["price_source"] == "fixed"]
        final_prices = [s["price_eur"] for s in spots if s["price_eur"] is not None and s["price_source"] == "final"]
        live_prices = [s["price_eur"] for s in spots if s["price_eur"] is not None and s["price_source"] == "live"]
        auction_unresolved = sum(1 for s in spots if s["price_source"] == "auction")

        grille_announced = round(sum(fixed_prices), 2)
        total_sold = round(sum(final_prices) + sum(fixed_prices), 2)
        sold_count = sum(1 for s in spots if str(s.get("status")).upper() in ("SOLD", "UNAVAILABLE"))
        dispo_count = sum(1 for s in spots if str(s.get("status")).upper() not in ("SOLD", "UNAVAILABLE"))

        # Box cost estimation
        box_estimates = _estimate_box_costs(detection.get("detected_products", []), sport, details.description)
        total_box_cost = sum(e["total_price_eur"] or 0 for e in box_estimates)
        margin = round(grille_announced - total_box_cost, 2) if total_box_cost > 0 and grille_announced > 0 else None
        margin_pct = round((margin / grille_announced) * 100, 1) if margin is not None and grille_announced > 0 else None

        # Inconsistencies
        inconsistencies = _check_inconsistencies(details.spots, b.total)

        break_reports.append({
            "break_id": b.break_id,
            "title": b.title,
            "sport": sport,
            "total_spots": len(spots),
            "sold_count": sold_count,
            "dispo_count": dispo_count,
            "auction_unresolved": auction_unresolved,
            "grille_announced": grille_announced,
            "total_sold": total_sold,
            "coverage": detection.get("coverage"),
            "detected_products": detection.get("detected_products", []),
            "unmatched_products": detection.get("unmatched_products", []),
            "box_estimates": box_estimates,
            "total_box_cost": round(total_box_cost, 2),
            "margin_eur": margin,
            "margin_pct": margin_pct,
            "inconsistencies": inconsistencies,
            "spots": spots,
        })

    return {
        "show_id": show_id,
        "show_url": f"https://voggt.com/fr/shows/{show_id}",
        "breaks_count": len(break_reports),
        "breaks": break_reports,
    }
