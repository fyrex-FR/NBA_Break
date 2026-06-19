"""Box price reference table.

Reads prices from box_prices.json (persisted, editable). Provides lookup
by sport + product name + box type (hobby/mega/blaster/value/pack).
"""

from __future__ import annotations

import json
import os
import re
import unicodedata

_PRICES_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "box_prices.json")
_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        if os.path.exists(_PRICES_PATH):
            with open(_PRICES_PATH, "r", encoding="utf-8") as f:
                _cache = json.load(f)
        else:
            _cache = {}
    return _cache


def reload():
    global _cache
    _cache = None
    return _load()


def get_all() -> dict:
    return _load()


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


_BOX_TYPE_PATTERNS = [
    ("hobby", re.compile(r"\bhobby\b", re.I)),
    ("mega", re.compile(r"\bmega\b", re.I)),
    ("blaster", re.compile(r"\bblaster\b", re.I)),
    ("value", re.compile(r"\bvalue\b", re.I)),
    ("pack", re.compile(r"\b(?:fat\s*pack|pack|hanger)\b", re.I)),
]


def detect_box_type(product_text: str) -> str | None:
    for btype, pat in _BOX_TYPE_PATTERNS:
        if pat.search(product_text):
            return btype
    return "hobby"


def estimate_price(sport: str, product_label: str, box_type: str | None = None) -> dict | None:
    """Estimate a box price from the reference table.

    Returns {price_eur, box_type, product_match} or None if no match found.
    """
    data = _load()
    sport_data = data.get(sport)
    if not sport_data:
        return None

    btype = box_type or detect_box_type(product_label)
    type_data = sport_data.get(btype)
    if not type_data:
        return None

    product_norm = _norm(product_label)

    best_match = None
    best_score = 0
    for product_name, price in type_data.items():
        name_norm = _norm(product_name)
        tokens = set(name_norm.split())
        if not tokens:
            continue
        overlap = sum(1 for t in tokens if t in product_norm)
        score = overlap / len(tokens)
        if score > best_score:
            best_score = score
            best_match = (product_name, price)

    if best_match and best_score >= 0.5:
        return {
            "price_eur": best_match[1],
            "box_type": btype,
            "product_match": best_match[0],
            "confidence": round(best_score, 2),
        }
    return None


def save_prices(data: dict) -> None:
    """Overwrite the box_prices.json with new data."""
    global _cache
    with open(_PRICES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    _cache = data
