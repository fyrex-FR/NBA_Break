"""Break simulation endpoint."""

import json
import os

from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    BreakSimulationRequest,
    BreakSimulationResponse,
    SimulationPreset,
    SimulationPresetSaveRequest,
)
from ..services.analysis_engine import enrich_dataframe, load_master_data
from ..services.break_engine import (
    build_break_simulation_pool,
    build_default_spots,
    build_deterministic_spot_summary,
    build_spot_player_map,
    extract_surname_initial,
)
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_json, write_r2_json, read_r2_parquet
from .rookies import ROOKIES_KEY

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
        raise HTTPException(status_code=400, detail=f"Aucun spot généré pour la méthode '{req.method}'. pool_empty={pool.empty}, extracted={req.extracted_players}, custom_spots={req.custom_spots}")

    # Charge la liste des rookies de la saison courante uniquement
    rookie_names = []
    try:
        config = get_r2_config()
        if is_r2_configured(config):
            rdf = read_r2_parquet(config, ROOKIES_KEY)
            rdf["year_start"] = rdf["year_start"].astype("Int64")
            current_season = rdf["year_start"].max()
            rookie_names = rdf[rdf["year_start"] == current_season]["player_name"].dropna().tolist()
    except Exception:
        pass

    result_df, summary, card_details = build_deterministic_spot_summary(
        pool,
        method=req.method,
        spots=spots,
        custom_scope=req.custom_scope,
        custom_map=req.custom_map,
        checklist_hits_guaranteed=req.checklist_hits_guaranteed,
        extracted_players=req.extracted_players,
        rookie_names=rookie_names,
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
        card_details=card_details,
    )


# ---------------------------------------------------------------------------
# Letter assignment UI helper
# ---------------------------------------------------------------------------

@router.post("/simulate/break/players")
def get_players_for_letter_break(req: BreakSimulationRequest):
    """Return all players from the pool grouped by their computed initial letter.

    Used by the Letter Assignment UI so the breaker can review/adjust assignments
    before running the simulation.
    """
    try:
        df = load_master_data(req.sport_key, req.checklist_ids, req.master_key)
        df = enrich_dataframe(df, req.sport_key, _keyword_overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    pool = build_break_simulation_pool(df)
    if pool.empty:
        return {"players": [], "grouped": {}, "stats": {}}

    # Compute per-player stats: cards count + auto/memo count
    from ..services.card_logic import CATEGORY_AUTO_MEM
    player_stats: dict[str, dict] = {}
    for _, row in pool.iterrows():
        players = row.get("Player List", [])
        hits = int(row.get("Hits", 1) or 1)
        is_auto = bool(row.get("Is AutoMemo", False))
        for player in players:
            if player not in player_stats:
                player_stats[player] = {"cards": 0, "auto": 0}
            player_stats[player]["cards"] += hits
            if is_auto:
                player_stats[player]["auto"] += hits

    # Build grouped dict: letter → sorted list of players
    grouped: dict[str, list[str]] = {ch: [] for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}
    for player in player_stats:
        initial = extract_surname_initial(player)
        if initial in grouped:
            grouped[initial].append(player)

    for letter in grouped:
        grouped[letter].sort()

    return {
        "players": sorted(player_stats.keys()),
        "grouped": grouped,
        "stats": player_stats,
    }


# ---------------------------------------------------------------------------
# Simulation Presets
# ---------------------------------------------------------------------------

SIM_PRESETS_KEY = "app/simulation_presets.json"


def _load_sim_presets():
    config = get_r2_config()
    if not is_r2_configured(config):
        return {}
    try:
        return read_r2_json(config, SIM_PRESETS_KEY)
    except Exception:
        return {}


def _save_sim_presets(data):
    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="R2 non configuré.")
    write_r2_json(config, SIM_PRESETS_KEY, data)


@router.get("/simulation/presets/{sport_key}")
def list_sim_presets(sport_key: str):
    """List saved simulation presets for a sport."""
    all_presets = _load_sim_presets()
    sport_presets = all_presets.get(sport_key, {})
    return {
        "presets": [
            {
                "name": name,
                "checklist_ids": p["checklist_ids"],
                "method": p["method"],
                "extracted_players": p.get("extracted_players", []),
                "hits_guaranteed": p.get("hits_guaranteed", {}),
                "custom_map": p.get("custom_map", {}),
            }
            for name, p in sport_presets.items()
        ]
    }


@router.post("/simulation/presets/{sport_key}")
def save_sim_preset(sport_key: str, req: SimulationPresetSaveRequest):
    """Save or update a simulation preset."""
    all_presets = _load_sim_presets()
    if sport_key not in all_presets:
        all_presets[sport_key] = {}

    all_presets[sport_key][req.name] = {
        "checklist_ids": req.checklist_ids,
        "method": req.method,
        "extracted_players": req.extracted_players,
        "hits_guaranteed": req.hits_guaranteed,
        "custom_map": req.custom_map or {},
    }
    _save_sim_presets(all_presets)
    return {"status": "ok", "name": req.name}


@router.delete("/simulation/presets/{sport_key}/{name}")
def delete_sim_preset(sport_key: str, name: str):
    """Delete a simulation preset."""
    all_presets = _load_sim_presets()
    sport_presets = all_presets.get(sport_key, {})
    if name not in sport_presets:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")

    del sport_presets[name]
    all_presets[sport_key] = sport_presets
    _save_sim_presets(all_presets)
    return {"status": "ok"}
