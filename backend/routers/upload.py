"""Upload endpoint for Excel checklists."""

import os
from io import BytesIO
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header
from typing import Optional

from ..services.sports_config import get_sport_profile
from ..services.data_pipeline import (
    read_uploaded_checklist,
    normalize_checklist_columns,
    checklist_name_from_filename,
    normalize_checklist_id,
    master_parquet_key_for_sport,
    ensure_master_dataframe_schema,
    normalize_team_value,
    extract_year,
    extract_product,
)
from ..services.disney_parser import parse_disney_checklist
from ..services.r2_storage import (
    get_r2_config,
    is_r2_configured,
    read_r2_parquet,
    upload_parquet_dataframe,
    r2_object_exists,
    delete_r2_object,
)

import pandas as pd

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload_checklist(
    file: UploadFile = File(...),
    sport_key: str = Form(...),
    overwrite: bool = Form(False),
):
    """Upload an Excel checklist to R2."""
    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="R2 non configuré.")

    sport_profile = get_sport_profile(sport_key)
    team_aliases = sport_profile.get("team_aliases", {})

    file_data = await file.read()
    try:
        filename = file.filename or "upload"
        if filename.lower().endswith(".csv"):
            df = normalize_checklist_columns(pd.read_csv(BytesIO(file_data)))
        elif sport_profile.get("disney_parser"):
            df = parse_disney_checklist(file_data)
        else:
            sheet_names = sport_profile.get("sheet_names", ["Teams_clean"])
            df = read_uploaded_checklist(file_data, sheet_names)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Normalize teams
    df["Team"] = df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))

    # Add metadata
    filename = file.filename or "upload.xlsx"
    # Disney parser already sets Hits per row — other parsers default to 1
    if "Hits" not in df.columns:
        df["Hits"] = 1
    df["File"] = filename
    df["Year"] = extract_year(filename, sport_key)
    df["Product"] = extract_product(filename)
    df["Sport"] = sport_key

    parquet_name = checklist_name_from_filename(filename)
    checklist_id = normalize_checklist_id(parquet_name)
    df["checklist_id"] = checklist_id
    df["checklist_name"] = parquet_name

    # Check existence
    parquet_key = f"parquet/{sport_key}/{parquet_name}"
    if not overwrite and r2_object_exists(config, parquet_key):
        raise HTTPException(status_code=409, detail=f"Le fichier '{parquet_name}' existe déjà. Activez le remplacement.")

    master_key = master_parquet_key_for_sport(sport_key)
    if r2_object_exists(config, master_key):
        existing_master = read_r2_parquet(config, master_key)
        existing_master = ensure_master_dataframe_schema(existing_master, sport_key)
        # Remove old rows for this checklist
        existing_master = existing_master[existing_master["checklist_id"] != checklist_id].copy()
        merged = pd.concat([existing_master, ensure_master_dataframe_schema(df, sport_key)], ignore_index=True)
    else:
        merged = ensure_master_dataframe_schema(df, sport_key)

    # Upload individual parquet
    upload_parquet_dataframe(config, parquet_key, df)
    upload_parquet_dataframe(config, master_key, merged)

    return {
        "status": "ok",
        "checklist_id": checklist_id,
        "checklist_name": parquet_name,
        "rows": len(df),
    }


@router.delete("/upload/{sport_key}/{checklist_id}")
async def delete_checklist(sport_key: str, checklist_id: str, x_admin_token: Optional[str] = Header(None)):
    """Delete a checklist from R2 and remove its rows from the master parquet."""
    admin_token = os.getenv("ADMIN_DELETE_TOKEN", "")
    if not admin_token or x_admin_token != admin_token:
        raise HTTPException(status_code=401, detail="Token invalide.")

    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="R2 non configuré.")

    master_key = master_parquet_key_for_sport(sport_key)
    if not r2_object_exists(config, master_key):
        raise HTTPException(status_code=404, detail="Master parquet introuvable.")

    master = read_r2_parquet(config, master_key)
    master = ensure_master_dataframe_schema(master, sport_key)

    checklist_rows = master[master["checklist_id"] == checklist_id]
    if checklist_rows.empty:
        raise HTTPException(status_code=404, detail=f"Checklist '{checklist_id}' introuvable.")

    checklist_names = checklist_rows["checklist_name"].unique()
    rows_before = len(master)
    master = master[master["checklist_id"] != checklist_id].copy()
    rows_removed = rows_before - len(master)

    upload_parquet_dataframe(config, master_key, master)

    # Delete individual parquet files (best effort)
    for name in checklist_names:
        parquet_key = f"parquet/{sport_key}/{name}"
        if r2_object_exists(config, parquet_key):
            delete_r2_object(config, parquet_key)

    return {"status": "ok", "checklist_id": checklist_id, "rows_removed": rows_removed}
