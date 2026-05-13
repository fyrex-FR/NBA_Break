"""Main analysis endpoint."""

import json
import os

from fastapi import APIRouter, HTTPException

from ..models.schemas import AnalyzeRequest, AnalyzeResponse
from ..services.analysis_engine import run_analysis
from ..services.r2_storage import get_r2_config, is_r2_configured, read_r2_json

router = APIRouter(prefix="/api", tags=["analysis"])

_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
_KEYWORD_OVERRIDES_R2_KEY = "app/keyword_overrides.json"


def _load_keyword_overrides():
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            return read_r2_json(config, _KEYWORD_OVERRIDES_R2_KEY)
        except Exception:
            pass
    if os.path.exists(_OVERRIDES_PATH):
        with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    """Run the full analysis pipeline: load, enrich, aggregate."""
    try:
        result = run_analysis(
            sport_key=req.sport_key,
            checklist_ids=req.checklist_ids,
            master_key=req.master_key,
            keyword_overrides_root=_load_keyword_overrides(),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Convert DataFrames to JSON-serializable dicts
    cards = result["df"].to_dict(orient="records")
    player_rankings = result["player_rankings"].to_dict(orient="records")
    team_rankings = result["team_rankings"].to_dict(orient="records")

    return AnalyzeResponse(
        cards=cards,
        player_rankings=player_rankings,
        team_rankings=team_rankings,
        category_summary=result["category_summary"],
        enabled_views=result["enabled_views"],
        metadata=result["metadata"],
    )
