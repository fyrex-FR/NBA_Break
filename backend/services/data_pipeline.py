"""
Data pipeline: normalization, extraction, deduplication.
Extracted from app.py lines 49-428 — zero Streamlit dependency.
"""

import os
import re
import hashlib
from io import BytesIO

import pandas as pd

from .card_logic import normalize_team_name
from .sports_config import DEFAULT_SPORT_KEY
from .r2_storage import is_r2_uri, r2_uri_to_key, source_filename, source_label


# ---------------------------------------------------------------------------
# Metadata extraction
# ---------------------------------------------------------------------------

def extract_year(filename, sport_key=DEFAULT_SPORT_KEY):
    base_name = os.path.basename(filename)

    if sport_key == "nfl":
        match = re.search(r"((?:19|20)\d{2})", base_name)
        return match.group(1) if match else "Inconnue"

    season_match = re.search(r"((?:19|20)\d{2}-\d{2})", base_name)
    if season_match:
        return season_match.group(1)

    year_match = re.search(r"((?:19|20)\d{2})", base_name)
    return year_match.group(1) if year_match else "Inconnue"


def extract_product(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r"\d{4}-\d{2}", "", name)
    name = re.sub(r"checklist", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name)
    return name.strip(" -_")


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------

def split_slash_values(value):
    text = "" if value is None else str(value)
    return [p.strip() for p in text.split("/") if p and p.strip() and p.strip().lower() != "nan"]


def normalize_team_value(value, team_aliases):
    parts = split_slash_values(value)
    if not parts:
        raw = "" if value is None else str(value).strip()
        return normalize_team_name(raw, team_aliases)

    normalized = [normalize_team_name(team, team_aliases).strip() for team in parts]
    deduped = []
    for team in normalized:
        if team and team not in deduped:
            deduped.append(team)
    return "/".join(deduped)


# ---------------------------------------------------------------------------
# Source entries (file labelling)
# ---------------------------------------------------------------------------

def build_source_entries(sources):
    ordered = sorted(sources, key=lambda s: source_filename(s).lower())
    used_labels = set()
    entries = []

    for src in ordered:
        base_label = source_label(src)
        label = base_label
        suffix = 2
        while label in used_labels:
            label = f"{base_label} ({suffix})"
            suffix += 1
        used_labels.add(label)
        entries.append({
            "label": label,
            "source": src,
            "filename": source_filename(src),
            "is_cloud": is_r2_uri(src),
        })
    return entries


# ---------------------------------------------------------------------------
# Checklist helpers
# ---------------------------------------------------------------------------

def count_distinct_checklists(df):
    if df is None or df.empty:
        return 0
    for col in ["checklist_name", "File", "checklist_id"]:
        if col not in df.columns:
            continue
        values = df[col].astype(str).str.strip()
        values = values[~values.isin(["", "nan", "None"])]
        if not values.empty:
            return int(values.nunique())
    return 0


def get_checklist_labels(df):
    if df is None or df.empty:
        return []
    for col in ["checklist_name", "File", "checklist_id"]:
        if col not in df.columns:
            continue
        values = df[col].astype(str).str.strip()
        values = values[~values.isin(["", "nan", "None"])]
        if not values.empty:
            return sorted(values.unique().tolist(), key=lambda v: str(v).lower())
    return []


# ---------------------------------------------------------------------------
# Column normalization
# ---------------------------------------------------------------------------

def normalize_checklist_columns(df):
    work = df.copy()
    work.columns = [str(c).strip() for c in work.columns]
    cols = list(work.columns)
    has_required_base = all(c in cols for c in ["Player", "Team", "Numbering"])
    has_card_type = "Card Type" in cols
    has_box_type = "Box Type" in cols

    if not has_required_base or (not has_card_type and not has_box_type):
        raise ValueError(
            "Format invalide. Colonnes autorisées: "
            "Player, Team, Card Type, Numbering (ou Box Type au lieu de Card Type). "
            f"Colonnes trouvées: {cols}"
        )

    if has_card_type and not has_box_type:
        work = work.rename(columns={"Card Type": "Box Type"})

    work = work[["Player", "Team", "Box Type", "Numbering"]].copy()
    work = work.dropna(subset=["Player", "Team"])
    work["Player"] = (
        work["Player"]
        .astype(str)
        .str.replace(r",$", "", regex=True)
        .str.strip()
    )
    work["Team"] = work["Team"].astype(str).str.strip()
    work["Box Type"] = work["Box Type"].astype(str).str.strip()
    work["Numbering"] = work["Numbering"].astype(str).str.strip()
    return work


def read_uploaded_checklist(file_data, sheet_names):
    """Read an uploaded Excel file and normalize columns.

    Args:
        file_data: Raw bytes of the Excel file.
        sheet_names: Ordered list of sheet names to try.
    """
    xls = pd.ExcelFile(file_data, engine="openpyxl")
    for sheet_name in sheet_names:
        if sheet_name in xls.sheet_names:
            df = pd.read_excel(file_data, sheet_name=sheet_name, engine="openpyxl")
            return normalize_checklist_columns(df)
    raise ValueError(f"Aucun onglet compatible trouvé ({', '.join(sheet_names)}).")


# ---------------------------------------------------------------------------
# Master parquet schema
# ---------------------------------------------------------------------------

MASTER_PARQUET_PREFIX = "parquet_master"
MASTER_COLUMNS = [
    "Player",
    "Team",
    "Box Type",
    "Numbering",
    "Hits",
    "File",
    "Year",
    "Product",
    "Sport",
    "checklist_id",
    "checklist_name",
]


def master_parquet_key_for_sport(sport_key):
    return f"{MASTER_PARQUET_PREFIX}/{sport_key}.parquet"


def checklist_name_from_filename(original_filename):
    stem = os.path.splitext(os.path.basename(original_filename))[0]
    safe_stem = re.sub(r"[^\w\-\. ]+", "-", stem).strip().replace(" ", "-")
    safe_stem = re.sub(r"-{2,}", "-", safe_stem).strip("-")
    return f"{safe_stem}.parquet" if safe_stem else "checklist.parquet"


def normalize_checklist_id(value):
    text = os.path.splitext(os.path.basename(str(value or "")))[0].lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    if text:
        return text
    raw = str(value or "").strip()
    if not raw:
        raw = "checklist"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def ensure_master_dataframe_schema(df, sport_key):
    work = df.copy()
    work.columns = [str(c).strip() for c in work.columns]

    if "Card Type" in work.columns and "Box Type" not in work.columns:
        work = work.rename(columns={"Card Type": "Box Type"})

    for col in ["Player", "Team", "Box Type", "Numbering"]:
        if col not in work.columns:
            work[col] = ""

    if "checklist_name" not in work.columns:
        if "File" in work.columns:
            work["checklist_name"] = work["File"].astype(str).str.strip()
        else:
            work["checklist_name"] = ""

    if "checklist_id" not in work.columns:
        work["checklist_id"] = work["checklist_name"].apply(normalize_checklist_id)
    else:
        work["checklist_id"] = work["checklist_id"].astype(str).str.strip()
        empty_id = work["checklist_id"].eq("") | work["checklist_id"].isna()
        if empty_id.any():
            work.loc[empty_id, "checklist_id"] = work.loc[empty_id, "checklist_name"].apply(normalize_checklist_id)

    if "File" not in work.columns:
        work["File"] = work["checklist_name"]
    else:
        work["File"] = work["File"].astype(str).str.strip()
        empty_file = work["File"].eq("") | work["File"].isna()
        if empty_file.any():
            work.loc[empty_file, "File"] = work.loc[empty_file, "checklist_name"]

    if "Year" not in work.columns:
        work["Year"] = work["checklist_name"].apply(lambda n: extract_year(n, sport_key))
    else:
        work["Year"] = work["Year"].astype(str).str.strip()
        empty_year = work["Year"].eq("") | work["Year"].isna()
        if empty_year.any():
            work.loc[empty_year, "Year"] = work.loc[empty_year, "checklist_name"].apply(lambda n: extract_year(n, sport_key))

    if "Product" not in work.columns:
        work["Product"] = work["checklist_name"].apply(extract_product)
    else:
        work["Product"] = work["Product"].astype(str).str.strip()
        empty_product = work["Product"].eq("") | work["Product"].isna()
        if empty_product.any():
            work.loc[empty_product, "Product"] = work.loc[empty_product, "checklist_name"].apply(extract_product)

    if "Sport" not in work.columns:
        work["Sport"] = sport_key
    else:
        work["Sport"] = work["Sport"].astype(str).str.strip().replace("", sport_key)
        work["Sport"] = work["Sport"].fillna(sport_key)

    if "Hits" not in work.columns:
        work["Hits"] = 1
    else:
        work["Hits"] = pd.to_numeric(work["Hits"], errors="coerce").fillna(1).astype(int)

    for col in MASTER_COLUMNS:
        if col not in work.columns:
            work[col] = ""

    work["Player"] = work["Player"].astype(str).str.strip()
    work["Team"] = work["Team"].astype(str).str.strip()
    work["Box Type"] = work["Box Type"].astype(str).str.strip()
    work["Numbering"] = work["Numbering"].astype(str).str.strip()
    work["checklist_name"] = work["checklist_name"].astype(str).str.strip()
    work["checklist_id"] = work["checklist_id"].astype(str).str.strip()
    work["Year"] = work["Year"].astype(str).str.strip()
    work["Product"] = work["Product"].astype(str).str.strip()
    work["File"] = work["File"].astype(str).str.strip()
    work["Sport"] = work["Sport"].astype(str).str.strip()

    work = work[(work["Player"] != "") & (work["Team"] != "")].copy()
    return work[MASTER_COLUMNS].copy()


def build_master_catalog(df, sport_key):
    if df is None or df.empty:
        return pd.DataFrame(columns=["checklist_id", "checklist_name", "year", "rows"])

    work = ensure_master_dataframe_schema(df, sport_key)
    if work.empty:
        return pd.DataFrame(columns=["checklist_id", "checklist_name", "year", "rows"])

    catalog = (
        work.groupby(["checklist_id", "checklist_name", "Year"], dropna=False)
        .size()
        .reset_index(name="rows")
        .rename(columns={"Year": "year"})
    )
    catalog["checklist_id"] = catalog["checklist_id"].astype(str).str.strip()
    catalog["checklist_name"] = catalog["checklist_name"].astype(str).str.strip()
    catalog["year"] = catalog["year"].astype(str).str.strip()
    catalog = catalog[(catalog["checklist_id"] != "") & (catalog["checklist_name"] != "")].copy()
    catalog = catalog.sort_values(["year", "checklist_name"], ascending=[False, True])
    return catalog.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------

def build_template_xlsx_bytes():
    template_df = pd.DataFrame(
        [
            {
                "Player": "Nom du joueur",
                "Team": "Nom de l equipe / nationalite",
                "Card Type": "Base",
                "Numbering": "",
            }
        ]
    )
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        template_df.to_excel(writer, index=False, sheet_name="Teams_clean")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Multi-player deduplication
# ---------------------------------------------------------------------------

def dedupe_multiplayer_projection_rows(df):
    if df.empty or "Player" not in df.columns or "Team" not in df.columns:
        return df, 0

    work = df.copy()
    work["_player_parts"] = work["Player"].apply(split_slash_values)
    work["_player_count"] = work["_player_parts"].apply(len)
    multi_mask = work["_player_count"] > 1
    if not multi_mask.any():
        return df, 0

    work["_player_canon"] = work["_player_parts"].apply(lambda parts: "/".join(sorted(dict.fromkeys(parts))))
    work["_box_type_key"] = work["Box Type"].astype(str) if "Box Type" in work.columns else ""
    work["_numbering_key"] = work["Numbering"].astype(str) if "Numbering" in work.columns else ""
    work["_file_key"] = work["File"].astype(str) if "File" in work.columns else ""
    work["_dedupe_key"] = (
        work["_file_key"]
        + "||"
        + work["_box_type_key"]
        + "||"
        + work["_numbering_key"]
        + "||"
        + work["_player_canon"]
    )

    key_counts = work.loc[multi_mask, "_dedupe_key"].value_counts()
    duplicated_keys = set(key_counts[key_counts > 1].index.tolist())
    if not duplicated_keys:
        return df, 0

    duplicated_rows = work[multi_mask & work["_dedupe_key"].isin(duplicated_keys)].copy()
    keep_rows = work[~(multi_mask & work["_dedupe_key"].isin(duplicated_keys))].copy()

    def build_team_union(group):
        teams = []
        for raw_team in group["Team"].tolist():
            teams.extend(split_slash_values(raw_team))
        ordered_unique = []
        for t in teams:
            if t not in ordered_unique:
                ordered_unique.append(t)
        return "/".join(ordered_unique)

    team_map = duplicated_rows.groupby("_dedupe_key").apply(build_team_union).to_dict()
    collapsed_rows = duplicated_rows.drop_duplicates(subset=["_dedupe_key"]).copy()
    collapsed_rows["Team"] = collapsed_rows["_dedupe_key"].map(team_map).fillna(collapsed_rows["Team"])

    result = pd.concat([keep_rows, collapsed_rows], ignore_index=True)
    rows_removed = len(work) - len(result)

    helper_cols = [
        "_player_parts", "_player_count", "_player_canon", "_box_type_key", "_numbering_key", "_file_key", "_dedupe_key"
    ]
    result = result.drop(columns=[c for c in helper_cols if c in result.columns], errors="ignore")
    return result, rows_removed
