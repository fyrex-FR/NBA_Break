"""Main analysis endpoint."""

import hashlib
import json
import os
import threading

from fastapi import APIRouter, HTTPException, Response

from ..models.schemas import AnalyzeRequest, AnalyzeResponse
from ..services.analysis_engine import run_analysis
from ..services.checklist_aliases import load_checklist_aliases
from ..services.r2_storage import cached_r2, get_r2_config, is_r2_configured, read_r2_json_cached

router = APIRouter(prefix="/api", tags=["analysis"])

_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
_KEYWORD_OVERRIDES_R2_KEY = "app/keyword_overrides.json"


def _load_keyword_overrides():
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            return read_r2_json_cached(config, _KEYWORD_OVERRIDES_R2_KEY)
        except Exception:
            pass
    if os.path.exists(_OVERRIDES_PATH):
        with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


# Réponses déjà calculées, par (sélection, overrides, alias). Le magasin vit dans le cache ETag
# du master du sport: il repart vide dès que le master change; overrides et alias sont dans la clé.
# "all" (plusieurs masters) et Marvel (attributions dans un autre fichier) ne sont pas mémorisés.
_RESULTS_MAX = 12
_UNCACHED_SPORTS = {"all", "marvel"}
_results_lock = threading.Lock()


def _digest(obj) -> str:
    return hashlib.md5(json.dumps(obj, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _compute_body(req: AnalyzeRequest, overrides) -> bytes:
    result = run_analysis(
        sport_key=req.sport_key,
        checklist_ids=req.checklist_ids,
        master_key=req.master_key,
        keyword_overrides_root=overrides,
    )
    # Convert DataFrames to JSON-serializable dicts
    response = AnalyzeResponse(
        cards=result["df"].to_dict(orient="records"),
        player_rankings=result["player_rankings"].to_dict(orient="records"),
        team_rankings=result["team_rankings"].to_dict(orient="records"),
        category_summary=result["category_summary"],
        enabled_views=result["enabled_views"],
        metadata=result["metadata"],
    )
    # Sérialiseur de pydantic (Rust): ~7x plus rapide que jsonable_encoder + json.dumps, même JSON.
    return response.model_dump_json().encode("utf-8")


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    """Run the full analysis pipeline: load, enrich, aggregate."""
    overrides = _load_keyword_overrides()
    store = key = None
    config = get_r2_config()
    if is_r2_configured(config) and req.master_key and req.sport_key not in _UNCACHED_SPORTS:
        store = cached_r2(config, req.master_key, dict, namespace=f"results:{req.sport_key}")
        key = (tuple(sorted(req.checklist_ids)), _digest(overrides), _digest(load_checklist_aliases()))
        body = store.get(key)
        if body is not None:
            return Response(content=body, media_type="application/json")

    try:
        body = _compute_body(req, overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if store is not None:
        with _results_lock:
            store[key] = body
            while len(store) > _RESULTS_MAX:
                store.pop(next(iter(store)))
    return Response(content=body, media_type="application/json")
