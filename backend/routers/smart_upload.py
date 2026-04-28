"""Smart upload via Gemini Flash — preview then confirm."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import pandas as pd

from ..services.gemini_parser import parse_with_gemini, parse_excel_beckett
from ..services.data_pipeline import (
    ensure_master_dataframe_schema,
    master_parquet_key_for_sport,
    checklist_name_from_filename,
    normalize_checklist_id,
)
from ..services.r2_storage import (
    get_r2_config,
    is_r2_configured,
    read_r2_parquet,
    upload_parquet_dataframe,
    r2_object_exists,
)

router = APIRouter(prefix="/api", tags=["smart-upload"])


class SmartRow(BaseModel):
    Player: str
    Team: str
    Box_Type: str = ""
    Numbering: str = ""

    class Config:
        populate_by_name = True


class SmartConfirmRequest(BaseModel):
    sport_key: str
    checklist_name: str
    rows: list[dict]
    overwrite: Optional[bool] = False


@router.post("/upload/smart/preview")
async def smart_preview(
    sport_key: str = Form(...),
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    instructions: Optional[str] = Form(None),
):
    """Parse raw content with Gemini and return a preview — nothing is written to R2."""
    if not text and not file:
        raise HTTPException(status_code=400, detail="Fournissez du texte ou un fichier.")

    try:
        if file:
            file_bytes = await file.read()
            fname = (file.filename or "upload").lower()
            if fname.endswith((".xlsx", ".xls")):
                result = parse_excel_beckett(file_bytes, file.filename or "upload")
            else:
                raw_content = file_bytes.decode("utf-8", errors="replace")
                result = parse_with_gemini(raw_content, instructions=instructions)
        else:
            result = parse_with_gemini(text or "", instructions=instructions)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur parsing : {e}")

    return {
        "checklist_name": result["checklist_name"],
        "sport_key": sport_key,
        "rows": result["rows"],
        "row_count": len(result["rows"]),
    }


@router.post("/upload/smart/confirm")
async def smart_confirm(body: SmartConfirmRequest):
    """Write the confirmed rows to R2 master parquet."""
    config = get_r2_config()
    if not is_r2_configured(config):
        raise HTTPException(status_code=503, detail="R2 non configuré.")

    if not body.rows:
        raise HTTPException(status_code=400, detail="Aucune ligne à importer.")

    df = pd.DataFrame(body.rows)
    # Rename Box_Type → Box Type if frontend sent snake_case
    if "Box_Type" in df.columns and "Box Type" not in df.columns:
        df = df.rename(columns={"Box_Type": "Box Type"})

    parquet_name = checklist_name_from_filename(body.checklist_name)
    checklist_id = normalize_checklist_id(parquet_name)

    df["File"] = parquet_name
    df["Sport"] = body.sport_key
    df["checklist_id"] = checklist_id
    df["checklist_name"] = parquet_name
    df["Hits"] = 1

    parquet_key = f"parquet/{body.sport_key}/{parquet_name}"
    master_key = master_parquet_key_for_sport(body.sport_key)

    if not body.overwrite and r2_object_exists(config, parquet_key):
        raise HTTPException(status_code=409, detail=f"'{parquet_name}' existe déjà. Activez le remplacement.")

    df = ensure_master_dataframe_schema(df, body.sport_key)

    if r2_object_exists(config, master_key):
        existing = read_r2_parquet(config, master_key)
        existing = ensure_master_dataframe_schema(existing, body.sport_key)
        existing = existing[existing["checklist_id"] != checklist_id].copy()
        merged = pd.concat([existing, df], ignore_index=True)
    else:
        merged = df

    upload_parquet_dataframe(config, parquet_key, df)
    upload_parquet_dataframe(config, master_key, merged)

    return {
        "status": "ok",
        "checklist_id": checklist_id,
        "checklist_name": parquet_name,
        "rows": len(df),
    }
