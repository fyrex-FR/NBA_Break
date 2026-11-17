#!/usr/bin/env python3
"""
Convertit la recherche web des configurations de boîtes (data/box_research_nba.json,
produite par un agent de recherche : formats, paquets, autos garantis, dates, avec
sources et niveau de confiance) au format du guide des boîtes.

Sortie : backend/box_guides_extra.json — fusionné par backend/services/box_guides.py
avec box_guides.json (The Hobby Checklist reste prioritaire si les deux existent).

Photos : data/box_research_photos.json (scripts/import_box_photos_research.py),
reprises ici comme photo de couverture et photo par format.

Usage : python3 scripts/import_box_research.py [data/box_research_nba.json]
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "box_research_nba.json"
PHOTOS = ROOT / "data" / "box_research_photos.json"  # scripts/import_box_photos_research.py
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
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    data = json.loads(src.read_text(encoding="utf-8"))
    photos = json.loads(PHOTOS.read_text(encoding="utf-8")) if PHOTOS.exists() else {}
    guides = {cid: convert(e, photos.get(cid)) for cid, e in sorted(data.items()) if e.get("formats")}
    out = {
        "_source": "Recherche web (fabricants, Cardboard Connection, Beckett…), sources par collection",
        "_imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "_script": "scripts/import_box_research.py",
        "nba": guides,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    from collections import Counter
    print(f"{len(guides)} collections écrites ({len(data) - len(guides)} sans configuration trouvée) :",
          dict(Counter(g["confidence"] for g in guides.values())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
