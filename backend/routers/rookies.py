"""Rookies endpoint — lit nba_rookies.parquet depuis R2."""

import logging
from fastapi import APIRouter, HTTPException
from ..services.r2_storage import get_r2_config, is_r2_configured, make_r2_client, read_r2_parquet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rookies", tags=["rookies"])

ROOKIES_KEY = "parquet_master/nba_rookies.parquet"


@router.get("/{sport_key}")
def get_rookies(sport_key: str):
    if sport_key != "nba":
        return {"rookies": []}
    try:
        config = get_r2_config()
        if not is_r2_configured(config):
            return {"rookies": []}
        df = read_r2_parquet(config, ROOKIES_KEY)
        df["year_start"] = df["year_start"].astype("Int64")
        df["year_end"] = df["year_end"].astype("Int64")
        df["draft_pick"] = df["draft_pick"].astype("Int64")
        rookies = df.where(df.notna(), None).to_dict(orient="records")
        return {"rookies": rookies}
    except Exception as e:
        logger.error(f"get_rookies error: {e}")
        raise HTTPException(status_code=500, detail="Erreur chargement rookies")
