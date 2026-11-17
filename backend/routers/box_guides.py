"""Guide des boîtes — formats, contenu moyen et autos garantis par collection."""

from fastapi import APIRouter, HTTPException

from ..services import box_guides

router = APIRouter(prefix="/api/box-guides", tags=["box-guides"])


@router.get("/{sport_key}")
def list_box_guides(sport_key: str):
    guides = box_guides.guides_for_sport(sport_key)
    items = [box_guides.summary(g) for g in guides.values()]
    items.sort(key=lambda g: (g.get("season") or "", g.get("name") or ""), reverse=True)
    return {"sport_key": sport_key, "source": box_guides.meta(), "guides": items}


@router.get("/{sport_key}/{guide_id:path}")
def get_box_guide(sport_key: str, guide_id: str):
    """guide_id = notre checklist_id, ou « thc:<slug> » pour une collection non reliée."""
    guide = box_guides.guide_for_checklist(sport_key, guide_id)
    if guide is None:
        raise HTTPException(status_code=404, detail=f"Pas de guide des boîtes pour '{sport_key}/{guide_id}'.")
    return guide
