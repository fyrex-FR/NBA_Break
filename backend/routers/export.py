"""Export and template endpoints."""

import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..models.schemas import ExportRequest
from ..services.analysis_engine import load_master_data, enrich_dataframe
from ..services.export_engine import (
    build_export_dataframe,
    build_team_detail_dataframe,
    generate_export_xlsx,
    generate_export_filename,
)
from ..services.data_pipeline import build_template_xlsx_bytes

router = APIRouter(prefix="/api", tags=["export"])

_OVERRIDES_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "keyword_overrides.json")
_keyword_overrides = {}
if os.path.exists(_OVERRIDES_PATH):
    with open(_OVERRIDES_PATH, "r", encoding="utf-8") as f:
        _keyword_overrides = json.load(f)


@router.get("/template")
def download_template():
    """Download the checklist Excel template."""
    data = build_template_xlsx_bytes()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=template_checklist.xlsx"},
    )


@router.post("/export/xlsx")
def export_xlsx(req: ExportRequest):
    """Generate and return an Excel export."""
    try:
        df = load_master_data(req.sport_key, req.checklist_ids, req.master_key)
        df = enrich_dataframe(df, req.sport_key, _keyword_overrides)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    export_df = build_export_dataframe(
        df,
        include_team=req.include_team,
        include_player=req.include_player,
        include_cards=req.include_cards,
        include_auto=req.include_auto,
        include_case=req.include_case,
        include_logoman=req.include_logoman,
        include_base=req.include_base,
        sort_mode=req.sort_mode,
    )

    team_detail_df = None
    team_label = None
    if req.team_detail is not None:
        team_label = req.team_detail or "Toutes les équipes"
        team_detail_df = build_team_detail_dataframe(
            df, team=req.team_detail if req.team_detail else None
        )

    xlsx_bytes = generate_export_xlsx(
        df, export_df, team_detail_df=team_detail_df, team_label=team_label
    )
    filename_base = generate_export_filename(df)

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=export_{filename_base}.xlsx"},
    )
