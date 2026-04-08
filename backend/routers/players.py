"""
Player stats endpoint — powered by nba_api with R2 cache.
"""

import json
import time
import logging
from fastapi import APIRouter, HTTPException

from ..services.player_stats import get_player_stats

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/players", tags=["players"])


@router.get("/{player_name}/stats")
def player_stats(player_name: str):
    """
    Returns career stats + bio for a NBA player.
    Data is cached in R2 to avoid repeated NBA.com calls.
    """
    try:
        return get_player_stats(player_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"player_stats error for '{player_name}': {e}")
        raise HTTPException(status_code=503, detail="NBA stats temporarily unavailable")
