"""
Player stats endpoint — powered by nba_api with R2 cache.
"""

import json
import time
import logging
from fastapi import APIRouter, HTTPException

from ..services.player_stats import get_player_stats
from ..services.team_stats import get_team_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/players", tags=["players"])


@router.get("/{player_name}/stats")
def player_stats(player_name: str):
    try:
        return get_player_stats(player_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"player_stats error for '{player_name}': {e}")
        raise HTTPException(status_code=503, detail="NBA stats temporarily unavailable")


@router.get("/teams/{team_name}/stats")
def team_stats(team_name: str):
    try:
        return get_team_stats(team_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"team_stats error for '{team_name}': {e}")
        raise HTTPException(status_code=503, detail="NBA stats temporarily unavailable")
