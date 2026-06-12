"""Voggt break product detection + team normalization.

Maps a Voggt break (title + description) to NoClim checklist ids via explicit,
auditable regex rules. Ported from the standalone Card Scout bot so the logic
lives where the checklists are maintained.
"""

from __future__ import annotations

import re
import unicodedata


# ---------------------------------------------------------------------------
# Product → checklist mapping. Keep this boring and auditable.
# checklist_id=None means: product detected, but no mapped checklist yet.
# ---------------------------------------------------------------------------

PRODUCT_RULES = [
    {
        "label": "Panini Totally Certified 2024/25",
        "regex": re.compile(r"\b2024\s*[/\-]?\s*25\b.*\btotally\s+certified\b|\btotally\s+certified\b.*\b2024\s*[/\-]?\s*25\b", re.I),
        "sport_key": "nba",
        "checklist_id": "2024-25-panini-totally-certified-basketball-checklist",
    },
    {
        "label": "Bowman Basketball 2025/26",
        "regex": re.compile(r"\b2025\s*[/\-]?\s*26\b.*\bbowman\b|\bbowman\b.*\b25\s*[/\-]?\s*26\b|\bbowman\b.*\b2025\s*[/\-]?\s*26\b", re.I),
        "sport_key": "nba",
        "checklist_id": "2025-26-topps-bowman-basketball-checklist",
    },
    {
        "label": "Donruss Optic 2020/21",
        "regex": re.compile(r"\b2020\s*[/\-]?\s*21\b.*\boptic\b|\boptic\b.*\b20\s*[/\-]?\s*21\b|\boptic\b.*\b2020\s*[/\-]?\s*21\b", re.I),
        "sport_key": "nba",
        "checklist_id": "2020-21-panini-donruss-optic-basketball-checklist",
    },
    {
        "label": "Donruss Optic 2024/25",
        "regex": re.compile(r"\b2024\s*[/\-]?\s*25\b.*\boptic\b|\boptic\b.*\b24\s*[/\-]?\s*25\b|\boptic\b.*\b2024\s*[/\-]?\s*25\b", re.I),
        "sport_key": "nba",
        "checklist_id": "2024-25-panini-donruss-optic-basketball-checklist",
    },
    {
        "label": "Panini Certified 2019/20",
        "regex": re.compile(r"\b2019\s*[/\-]?\s*(?:20|2020)\b.*\bcertified\b|\bcertified\b.*\b2019\s*[/\-]?\s*(?:20|2020)\b", re.I),
        "sport_key": "nba",
        "checklist_id": None,
        "reason": "checklist absente/non mappée dans NoClim",
    },
    {
        "label": "Topps Chrome UEFA Club Competitions Soccer 2025/26",
        "regex": re.compile(r"\b(?:topps\s+)?chrome\b.*\b(?:uefa|ucc|club\s+competitions?)\b.*\b(?:25|2025)\s*[/\-]?\s*(?:26|2026)\b|\b(?:25|2025)\s*[/\-]?\s*(?:26|2026)\b.*\b(?:topps\s+)?chrome\b.*\b(?:uefa|ucc|club\s+competitions?)\b|\bucc\b.*\bchrome\b", re.I),
        "sport_key": "soccer",
        "checklist_id": "2025-26-topps-chrome-uefa-club-competitions-soccer-checklist",
    },
    {
        "label": "Topps Carnaval UEFA 2025/26",
        "regex": re.compile(r"\b(?:topps\s+)?carnaval\b.*\b(?:uefa|25|2025)\b|\b(?:uefa|25|2025)\b.*\b(?:topps\s+)?carnaval\b", re.I),
        "sport_key": "soccer",
        "checklist_id": "2025-26-topps-carnaval-uefa",
    },
    {
        "label": "Topps Merlin UEFA Club Competitions 2025/26",
        "regex": re.compile(r"\b(?:topps\s+)?merlin\b.*\b(?:uefa|club\s+competitions?|25|2025)\b|\b(?:uefa|club\s+competitions?|25|2025)\b.*\b(?:topps\s+)?merlin\b", re.I),
        "sport_key": "soccer",
        "checklist_id": "2025-25-topps-merlin-uefa-club-competitions-checklist",
    },
    {
        "label": "Topps UEFA Club Competitions 2025/26",
        "regex": re.compile(r"\btopps\b(?!.*\bchrome\b)(?!.*\bmerlin\b)(?!.*\bcarnaval\b).*\b(?:uefa|club\s+competitions?)\b.*\b(?:25|2025)\s*[/\-]?\s*(?:26|2026)\b|\b(?:25|2025)\s*[/\-]?\s*(?:26|2026)\b.*\btopps\b(?!.*\bchrome\b)(?!.*\bmerlin\b)(?!.*\bcarnaval\b).*\b(?:uefa|club\s+competitions?)\b", re.I),
        "sport_key": "soccer",
        "checklist_id": "2025-26-topps-uefa-club-competitions-checklist",
    },
]


# ---------------------------------------------------------------------------
# Team display-name normalization (Voggt label → canonical NoClim name)
# ---------------------------------------------------------------------------

TEAM_ALIASES = {
    "LA Clippers": "Los Angeles Clippers",
    "AJAX": "AFC Ajax",
    "ARSENAL": "Arsenal FC",
    "ATLETIC CLUB BILBAO": "Athletic Club",
    "ATLETICO MADRID": "Atlético de Madrid",
    "BAYER LEVERKUSEN": "Bayer 04 Leverkusen",
    "BENFICA": "SL Benfica",
    "CELTIC": "Celtic FC",
    "FC BARCELONE": "FC Barcelona",
    "FC BAYERN MUNICH": "FC Bayern München",
    "INTER MILAN": "FC Internazionale Milano",
    "LIVERPOOL": "Liverpool FC",
    "MANCHESTER UNITED": "Manchester United",
    "NEW CASTLE": "Newcastle United",
    "NAPOLI": "SSC Napoli",
    "PSG": "Paris Saint-Germain",
    "RANGERS": "Rangers F.C.",
    "REAL BETIS": "Real Betis Balompié",
    "REAL MADRID": "Real Madrid C.F.",
    "SPORTING CP": "Sporting Clube de Portugal",
    "STRASBOURG": "RC Strasbourg Alsace",
    "TOTTENHAM": "Tottenham Hotspur",
}


def normalize_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or ""))
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_team_name(team: str) -> str:
    team = str(team or "").strip()
    return TEAM_ALIASES.get(team, TEAM_ALIASES.get(team.upper(), team))


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------

def detect_products(title: str, description: str) -> dict:
    """Match a break's title+description against PRODUCT_RULES.

    Returns:
        detected_products, checklist_ids, checklist_ids_by_sport,
        unmapped_products, coverage.
    """
    hay = f"{title or ''}\n{description or ''}"
    detected = []
    checklist_ids_by_sport: dict[str, list[str]] = {}
    unmapped = []

    for rule in PRODUCT_RULES:
        if rule["regex"].search(hay):
            sport_key = rule.get("sport_key") or "nba"
            product = {
                "label": rule["label"],
                "sport_key": sport_key,
                "checklist_id": rule.get("checklist_id"),
                "status": "mapped" if rule.get("checklist_id") else "unmapped",
                "reason": rule.get("reason"),
            }
            detected.append(product)
            if rule.get("checklist_id"):
                sport_checklists = checklist_ids_by_sport.setdefault(sport_key, [])
                if rule["checklist_id"] not in sport_checklists:
                    sport_checklists.append(rule["checklist_id"])
            else:
                unmapped.append(product)

    checklist_ids = [cid for ids in checklist_ids_by_sport.values() for cid in ids]
    if not detected:
        coverage = "unknown"
    elif unmapped and checklist_ids:
        coverage = "partial"
    elif unmapped and not checklist_ids:
        coverage = "unmapped"
    else:
        coverage = "complete"

    return {
        "detected_products": detected,
        "checklist_ids": checklist_ids,
        "checklist_ids_by_sport": checklist_ids_by_sport,
        "unmapped_products": unmapped,
        "coverage": coverage,
    }


def guess_sport(title: str, description: str, detection: dict | None = None) -> str | None:
    """Best-effort sport guess for a break, for the picker UI.

    Prefers a mapped product's sport; falls back to emoji/keyword heuristics.
    """
    detection = detection or detect_products(title, description)
    by_sport = detection.get("checklist_ids_by_sport") or {}
    if len(by_sport) == 1:
        return next(iter(by_sport))
    if detection.get("detected_products"):
        return detection["detected_products"][0].get("sport_key")

    hay = f"{title or ''} {description or ''}"
    low = hay.lower()
    emoji_map = [
        ("🏀", "nba"), ("🏈", "nfl"), ("⚾", "mlb"),
        ("⚽", "soccer"), ("🎾", "tennis"),
    ]
    for emoji, sport in emoji_map:
        if emoji in hay:
            return sport
    keyword_map = [
        ("nba", "nba"), ("basket", "nba"),
        ("nfl", "nfl"), ("football americain", "nfl"),
        ("mlb", "mlb"), ("baseball", "mlb"),
        ("soccer", "soccer"), ("uefa", "soccer"), ("foot", "soccer"),
        ("wwe", "wwe"), ("tennis", "tennis"),
    ]
    for kw, sport in keyword_map:
        if kw in low:
            return sport
    return None


def detect_break(title: str, description: str) -> dict:
    """Full break detection: curated regex rules + catalog auto-matching.

    Returns the regex detection shape augmented with auto-matched checklists,
    a resolved ``sport``, and per-product match metadata.
    """
    from .break_match import get_catalog, match_break_checklists, detect_sport

    det = detect_products(title, description)
    sport = guess_sport(title, description, det) or detect_sport(title, description)

    auto_matches = []
    if sport:
        try:
            catalog = list(get_catalog(sport))
            if catalog:
                auto_matches = match_break_checklists(title, description, catalog)
        except Exception:
            auto_matches = []

    existing_ids = set(det["checklist_ids"])
    sport_ids = det["checklist_ids_by_sport"].setdefault(sport, []) if sport else []
    for m in auto_matches:
        cid = m["checklist_id"]
        if cid in existing_ids:
            continue
        existing_ids.add(cid)
        if cid not in sport_ids:
            sport_ids.append(cid)
        det["detected_products"].append({
            "label": m.get("checklist_name") or cid,
            "sport_key": sport,
            "checklist_id": cid,
            "status": "mapped",
            "source": "catalog",
            "score": round(float(m.get("score", 0)), 2),
            "matched_products": m.get("products", []),
            "reason": None,
        })

    # Mark regex-detected products with a source flag for the UI.
    for p in det["detected_products"]:
        p.setdefault("source", "rule")

    det["checklist_ids"] = [cid for ids in det["checklist_ids_by_sport"].values() for cid in ids]

    unmapped = det["unmapped_products"]
    if not det["detected_products"]:
        det["coverage"] = "unknown"
    elif unmapped and det["checklist_ids"]:
        det["coverage"] = "partial"
    elif unmapped and not det["checklist_ids"]:
        det["coverage"] = "unmapped"
    else:
        det["coverage"] = "complete"

    det["sport"] = sport
    return det
