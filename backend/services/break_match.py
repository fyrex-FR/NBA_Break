"""Voggt break → checklist catalog matching.

Faithful Python port of the proven matcher from the browser extension
(voggt-description-overlay/extension/background.js): it splits a break's
title+description into product lines, normalizes them, and scores each against
the sport's checklist catalog by token overlap.

Adds a light year-affinity tie-breaker (on equal scores, prefer the checklist
whose season is mentioned in the product line). This never changes which
products match — it only disambiguates same-product / different-season ties.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

_GENERIC_RE = re.compile(r"\b(box|boite|hobby|jumbo|mega|value|basketball|cards?|checklist|case|mixer|random|pyt|pick|your|team|break|spot|spots|nba|nfl|mlb|soccer|football|baseball)\b", re.I)
_SEASON_RE = re.compile(r"\b(20)?(\d{2})\s*[/\-]\s*(\d{2})\b")


def normalize_match_text(value: str) -> str:
    text = str(value or "").lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"\.(parquet|xlsx)$", "", text)
    text = re.sub(r"[_-]+", " ", text)
    # Expand seasons so the year participates as separate tokens (then dropped):
    # "2025-26" -> "2025 25 26", "25/26" -> "2025 25 26"
    text = _SEASON_RE.sub(r"20\2 \2 \3", text)
    text = _GENERIC_RE.sub(" ", text)
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def token_set(value: str) -> set[str]:
    return {
        tok for tok in str(value or "").split()
        if len(tok) >= 3 and not tok.isdigit()
    }


def match_score(product_norm: str, product_tokens: set[str], catalog_norm: str) -> float:
    catalog_tokens = token_set(catalog_norm)
    if not catalog_tokens:
        return 0.0
    overlap = sum(1 for t in product_tokens if t in catalog_tokens)
    token_score = overlap / max(len(product_tokens), 1)
    includes_boost = 0.25 if (product_norm in catalog_norm or catalog_norm in product_norm) else 0.0
    return min(1.0, token_score + includes_boost)


_PACK_MARKER_RE = re.compile(r"\b(mixer|break|pyt|random|pick your team)\b", re.I)
_BRAND_RE = re.compile(r"\b(topps|panini|donruss|hoops|prizm|select|bowman|mosaic|optic)\b", re.I)
_CARDS_RE = re.compile(r"\b\d+\+?\s*cartes\b", re.I)
_CARDS_BRAND_RE = re.compile(r"\b(topps|panini|donruss|hoops|signature)\b", re.I)


def is_break_packaging_line(value: str) -> bool:
    text = str(value or "").lower()
    if _PACK_MARKER_RE.search(text) and not _BRAND_RE.search(text):
        return True
    if _CARDS_RE.search(text) and not _CARDS_BRAND_RE.search(text):
        return True
    return False


_INTRO_RE = re.compile(
    r"\b(?:ce|this)\s+(?:boxbreak|break)\s+(?:comprend|includes|contains|contient)\s*:?", re.I
)
_BREAK_WORD_RE = re.compile(r"\b(?:boxbreak|break)\b", re.I)
_SPLIT_RE = re.compile(r"\s*(?:\(\s*\d+\s*\)|\b\d+\s*x\b|•|\n|;)\s*", re.I)


def extract_break_products(title: str, description: str) -> list[str]:
    text = f"{title or ''}\n{description or ''}"
    title_norm = normalize_match_text(title or "")
    cleaned = _INTRO_RE.sub(" ", text)
    cleaned = _BREAK_WORD_RE.sub(" ", cleaned)
    parts = [p.strip() for p in _SPLIT_RE.split(cleaned)]
    parts = [p for p in parts if len(p) >= 8]
    candidates = parts if parts else [cleaned.strip()]

    out = []
    for item in candidates:
        item = re.sub(r"^\d+\s+", "", item)
        item = re.sub(r"\s+", " ", item).strip()
        if not item:
            continue
        if normalize_match_text(item) == title_norm:
            continue
        if is_break_packaging_line(item):
            continue
        out.append(item)
    # If nothing extracted (e.g. title-only break with no description),
    # use the title itself as the product to match against the catalog.
    if not out and title:
        out = [title]
    return out[:12]


def detect_sport(title: str, description: str) -> str:
    text = f"{title or ''} {description or ''}".lower()
    if re.search(r"\b(nba|basket|basketball|panini|topps|donruss|hoops|prizm|select)\b", text):
        return "nba"
    if re.search(r"\b(nfl|football|mosaic football|score football|optic football)\b", text):
        return "nfl"
    if re.search(r"\b(mlb|baseball|bowman|chrome baseball)\b", text):
        return "mlb"
    return "nba"


# ---------------------------------------------------------------------------
# Year affinity (tie-breaker only)
# ---------------------------------------------------------------------------

def _year_tokens(value: str) -> set[str]:
    """Year tokens for affinity: '2023-24' -> {'2023','24','23'}, '2024' -> {'2024','24'}."""
    out: set[str] = set()
    for m in re.finditer(r"\d{4}", str(value or "")):
        y = m.group(0)
        out.add(y)
        out.add(y[2:])
    for m in re.finditer(r"\b(\d{2})\b", str(value or "")):
        out.add(m.group(1))
    return out


def _year_affinity(product: str, item_year: str) -> bool:
    yt = _year_tokens(item_year)
    if not yt:
        return False
    plow = str(product or "").lower()
    return any(tok and tok in plow for tok in yt)


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------

def match_break_checklists(title: str, description: str, catalog: list[dict], threshold: float = 0.42) -> list[dict]:
    """Return checklist matches for a break, deduped by checklist_id.

    Each match: {checklist_id, checklist_name, year, score, products, alternatives}.
    alternatives is a list of close matches (within 0.05 of the best score).
    """
    products = extract_break_products(title, description)
    raw_matches = []

    for product in products:
        product_norm = normalize_match_text(product)
        product_tokens = token_set(product_norm)
        if not product_tokens:
            continue

        # Collect all scores above threshold
        scored = []
        for item in catalog:
            haystack = normalize_match_text(f"{item.get('checklist_name', '')} {item.get('checklist_id', '')}")
            score = match_score(product_norm, product_tokens, haystack)
            if score >= threshold:
                scored.append({**item, "score": score})

        if not scored:
            continue

        # Sort by score desc, then apply year affinity tiebreaker for top candidates
        scored.sort(key=lambda x: -x["score"])
        best = scored[0]
        # Year affinity tiebreaker among equally-scored top candidates
        top_score = best["score"]
        for candidate in scored[1:]:
            if candidate["score"] < top_score:
                break
            if _year_affinity(product, candidate.get("year", "")) and not _year_affinity(product, best.get("year", "")):
                best = candidate
                break

        # Alternatives: other checklists within 0.05 of the best, excluding the best itself
        alternatives = [
            {"checklist_id": s["checklist_id"], "checklist_name": s.get("checklist_name", ""), "year": s.get("year", ""), "score": round(s["score"], 3)}
            for s in scored
            if s["checklist_id"] != best["checklist_id"] and s["score"] >= best["score"] - 0.05
        ][:3]

        raw_matches.append({**best, "product": product, "alternatives": alternatives})

    return _dedupe_by_checklist(raw_matches)


def _dedupe_by_checklist(matches: list[dict]) -> list[dict]:
    best: dict[str, dict] = {}
    for item in matches:
        cid = item["checklist_id"]
        prev = best.get(cid)
        if prev is None:
            best[cid] = {**item, "products": [item["product"]] if item.get("product") else []}
            continue
        products = prev["products"]
        if item.get("product") and item["product"] not in products:
            products.append(item["product"])
        if item["score"] > prev["score"]:
            best[cid] = {**item, "products": products}
        else:
            prev["products"] = products
    return list(best.values())


# ---------------------------------------------------------------------------
# Catalog provider (cached per sport)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=16)
def get_catalog(sport_key: str) -> tuple:
    """Load the sport's checklist catalog from the master parquet (cached)."""
    from .r2_storage import get_r2_config, is_r2_configured, read_r2_parquet
    from .data_pipeline import (
        ensure_master_dataframe_schema,
        build_master_catalog,
        master_parquet_key_for_sport,
    )

    config = get_r2_config()
    if not is_r2_configured(config):
        return ()
    try:
        df = read_r2_parquet(config, master_parquet_key_for_sport(sport_key))
        df = ensure_master_dataframe_schema(df, sport_key)
        cat = build_master_catalog(df, sport_key)
    except Exception:
        return ()
    return tuple(
        {
            "checklist_id": str(r["checklist_id"]),
            "checklist_name": str(r["checklist_name"]),
            "year": str(r["year"]),
        }
        for _, r in cat.iterrows()
    )


def clear_catalog_cache() -> None:
    get_catalog.cache_clear()
