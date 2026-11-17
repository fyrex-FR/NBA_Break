"""« Qui a signé ? » et équipes toutes collections (index du catalogue entier)."""

from fastapi import APIRouter, HTTPException, Query

from ..services import catalog_index

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


def _index(sport_key: str) -> dict:
    index = catalog_index.ensure_index(sport_key)
    if index is None:
        # Première construction en cours (quelques dizaines de secondes) : le client réessaie.
        raise HTTPException(status_code=503, detail="Index du catalogue en préparation, réessaie dans un instant.")
    return index


@router.get("/{sport_key}/status")
def status(sport_key: str):
    index = catalog_index.ensure_index(sport_key)
    return {"ready": index is not None, "built_at": index["built_at"] if index else None}


@router.get("/{sport_key}/players")
def search_players(sport_key: str, q: str = Query("", max_length=80), limit: int = Query(20, ge=1, le=50)):
    return {"players": catalog_index.search_players(_index(sport_key), q, limit)}


@router.get("/{sport_key}/players/{name}")
def player_detail(sport_key: str, name: str):
    detail = catalog_index.player_detail(_index(sport_key), name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Joueur introuvable : {name}")
    return detail


@router.get("/{sport_key}/teams")
def list_teams(sport_key: str):
    return {"teams": catalog_index.list_teams(_index(sport_key))}


@router.get("/{sport_key}/teams/{name}")
def team_detail(sport_key: str, name: str):
    detail = catalog_index.team_detail(_index(sport_key), name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Équipe introuvable : {name}")
    return detail
