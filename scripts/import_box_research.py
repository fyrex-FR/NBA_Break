#!/usr/bin/env python3
"""
Convertit la recherche web des configurations de boîtes (data/box_research_nba.json,
produite par un agent de recherche : formats, paquets, autos garantis, dates, avec
sources et niveau de confiance) au format du guide des boîtes.

Sortie : backend/box_guides_extra.json — fusionné par backend/services/box_guides.py
avec box_guides.json (The Hobby Checklist reste prioritaire si les deux existent).

Photos : data/box_research_photos.json (scripts/import_box_photos_research.py),
reprises ici comme photo de couverture et photo par format.

Usage : python3 scripts/import_box_research.py [--sport nba|soccer] [fichier.json]
        (n'écrit que la clé du sport demandé: les autres sports du fichier de sortie sont conservés)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPORT_DEFAULT = "nba"


def paths(sport: str):
    """nba garde ses noms historiques; les autres sports: data/box_research_<sport>.json et ..._photos_<sport>.json."""
    if sport == "nba":
        return ROOT / "data" / "box_research_nba.json", ROOT / "data" / "box_research_photos.json"
    return ROOT / "data" / f"box_research_{sport}.json", ROOT / "data" / f"box_research_photos_{sport}.json"
OUT = ROOT / "backend" / "box_guides_extra.json"

MIXED = re.compile(r"\b(or|ou)\s+(memorabilia|relics?|memo)\b|autographs?/memorabilia|hits?\b", re.I)
AUTO = re.compile(r"auto|signature|signed", re.I)


def pos_int(x):
    return x if isinstance(x, int) and x > 0 else None


def convert(entry: dict, photos: dict | None = None) -> dict:
    photos = photos or {}
    formats = []
    for f in entry.get("formats") or []:
        cpp, ppb = pos_int(f.get("cards_per_pack")), pos_int(f.get("packs_per_box"))
        contents = [c.strip() for c in f.get("contents") or [] if isinstance(c, str) and c.strip()]
        mixed = any(MIXED.search(c) for c in contents if AUTO.search(c) or "memorabilia" in c.lower())
        formats.append({
            "name": f.get("name") or "Hobby",
            "aliases": [f.get("name") or "Hobby"],
            "description": None,
            "release_date": f.get("release_date") or None,
            "cards_per_pack": cpp,
            "packs_per_box": ppb,
            "boxes_per_case": pos_int(f.get("boxes_per_case")),
            "cards_per_box": cpp * ppb if cpp and ppb else None,
            "price_usd": f.get("price_usd") if isinstance(f.get("price_usd"), (int, float)) else None,
            "autos_per_box": pos_int(f.get("autos_per_box")),
            "autos_per_case": pos_int(f.get("autos_per_case")),
            # « 3 Autographs or Memorabilia » : le nombre garanti mélange autos et relics.
            "hits_mixed": mixed,
            "case_from_shops": False,
            "contents": [{"fr": c, "vo": c, "auto": bool(AUTO.search(c))} for c in contents],
            "image": (photos.get("formats") or {}).get(f.get("name") or "Hobby"),
        })
    name = entry.get("name") or entry["checklist_id"]
    return {
        "checklist_id": entry["checklist_id"],
        "source_slug": entry["checklist_id"],
        "origin": "recherche",
        "name": name,
        "season": entry.get("season"),
        "brand": entry.get("brand"),
        "photo_page": entry.get("photo_page"),
        "checklist_updated": None,
        "odds_published": False,
        "cover_image": photos.get("cover"),
        "formats": formats,
        "presentation": [],
        "confidence": entry.get("confidence") or "low",
        "sources": [s for s in entry.get("sources") or [] if isinstance(s, str) and s.startswith("http")],
        "notes": entry.get("notes") or "",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sport", default=SPORT_DEFAULT)
    ap.add_argument("src", nargs="?")
    args = ap.parse_args()
    default_src, photos_path = paths(args.sport)
    src = Path(args.src) if args.src else default_src
    data = json.loads(src.read_text(encoding="utf-8"))
    photos = json.loads(photos_path.read_text(encoding="utf-8")) if photos_path.exists() else {}
    guides = {cid: convert(e, photos.get(cid)) for cid, e in sorted(data.items()) if e.get("formats")}
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    out.update({
        "_source": "Recherche web (fabricants, Cardboard Connection, Beckett…), sources par collection",
        "_imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "_script": "scripts/import_box_research.py",
        args.sport: guides,
    })
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from collections import Counter
    print(f"[{args.sport}] {len(guides)} collections écrites ({len(data) - len(guides)} sans configuration trouvée) :",
          dict(Counter(g["confidence"] for g in guides.values())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
