"""Guide des boîtes : formats (Hobby, FOTL, Mega, Blaster…), contenu moyen,
autos garantis, prix public et date de sortie, par collection.

Sources :
- backend/box_guides.json, produit par scripts/import_hobbychecklist_boxes.py
  (thehobbychecklist.com, avec l'accord de son éditeur) — prioritaire ;
- backend/box_guides_extra.json, produit par scripts/import_box_research.py
  (recherche web, sources et niveau de confiance par collection) pour les
  collections que The Hobby Checklist ne couvre pas.
Les clés sont nos checklist_id ; les collections que nous n'avons pas encore
sont rangées sous « thc:<slug> ».
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PATH = os.path.join(_DIR, "box_guides.json")
_EXTRA_PATH = os.path.join(_DIR, "box_guides_extra.json")


def _read(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _load() -> dict:
    data = _read(_PATH)
    extra = _read(_EXTRA_PATH)
    for key, value in extra.items():
        if key.startswith("_") or not isinstance(value, dict):
            continue
        sport = data.setdefault(key, {})
        for cid, guide in value.items():
            sport.setdefault(cid, guide)  # The Hobby Checklist reste prioritaire
    return data


def meta() -> dict:
    data = _load()
    return {k: v for k, v in data.items() if k.startswith("_")}


def guides_for_sport(sport_key: str) -> dict[str, dict]:
    return _load().get(sport_key, {})


def guide_for_checklist(sport_key: str, checklist_id: str) -> dict | None:
    guides = guides_for_sport(sport_key)
    if checklist_id in guides:
        return guides[checklist_id]
    try:
        from .checklist_aliases import canonical_checklist_id

        canonical = canonical_checklist_id(sport_key, checklist_id)
    except Exception:
        canonical = None
    return guides.get(canonical) if canonical else None


def summary(guide: dict) -> dict:
    """Version légère pour la liste : sans contenu détaillé ni présentation."""
    hobby = next((f for f in guide["formats"] if f["name"] == "Hobby"), guide["formats"][0] if guide["formats"] else None)
    release = min((f["release_date"] for f in guide["formats"] if f.get("release_date")), default=None)
    return {
        "checklist_id": guide.get("checklist_id"),
        "source_slug": guide["source_slug"],
        "name": guide.get("name"),
        "season": guide.get("season"),
        "brand": guide.get("brand"),
        "cover_image": guide.get("cover_image"),
        "release_date": release,
        "formats": [
            {k: f.get(k) for k in ("name", "cards_per_box", "packs_per_box", "boxes_per_case", "autos_per_box", "price_usd", "release_date", "hits_mixed")}
            for f in guide["formats"]
        ],
        "hobby_autos_per_box": hobby.get("autos_per_box") if hobby else None,
        "origin": guide.get("origin", "thehobbychecklist"),
        "confidence": guide.get("confidence"),
    }
