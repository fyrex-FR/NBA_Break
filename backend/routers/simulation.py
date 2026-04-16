"""Break simulation endpoint."""

import json
import os

from fastapi import APIRouter, HTTPException

from ..models.schemas import BreakSimulationRequest, BreakSimulationResponse
from ..services.analysis_engine import load_master_data, enrich_dataframe
from ..services.break_engine import (
    build_break_simulation_pool,
    build_default_spots,
    build_deterministic_spot_summary,
    build_spot_player_map,
)

router = APIRouter(prefix="/api", tags=["simulation"])

_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
_keyword_overrides = {}
if os.path.exists(_OVERRIDES_PATH):
    with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
        _keyword_overrides = json.load(f)


@router.post("/simulate/break", response_model=BreakSimulationResponse)
def simulate_break(req: BreakSimulationRequest):
    """Run a break simulation."""
    try:
        df = load_master_data(req.sport_key, req.checklist_ids, req.master_key)
        df = enrich_dataframe(df, req.sport_key, _keyword_overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    pool = build_break_simulation_pool(df)
    if pool.empty:
        raise HTTPException(status_code=400, detail="Pool de simulation vide.")

    spots = req.custom_spots or build_default_spots(pool, req.method, req.extracted_players)
    if not spots:
        raise HTTPException(status_code=400, detail="Aucun spot généré.")

    result_df, summary = build_deterministic_spot_summary(
        pool,
        method=req.method,
        spots=spots,
        custom_scope=req.custom_scope,
        custom_map=req.custom_map,
        checklist_hits_guaranteed=req.checklist_hits_guaranteed,
        extracted_players=req.extracted_players,
    )

    player_map = build_spot_player_map(
        pool,
        method=req.method,
        custom_scope=req.custom_scope,
        custom_map=req.custom_map,
        custom_spots=spots,
        extracted_players=req.extracted_players,
    )
    # Convert sets to sorted lists for JSON serialization
    player_map_serializable = {k: sorted(v) for k, v in player_map.items()}

    return BreakSimulationResponse(
        spots=result_df.to_dict(orient="records"),
        summary=summary,
        player_map=player_map_serializable,
    )
