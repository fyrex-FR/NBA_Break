"""
Export engine: Excel/CSV generation.
Extracted from app.py lines 3076-3300 — zero Streamlit dependency.
"""

import os
import re
from io import BytesIO

import pandas as pd

from .analysis_engine import normalize_player_name
from .data_pipeline import get_checklist_labels


def build_export_dataframe(
    df,
    include_team=True,
    include_player=True,
    include_cards=True,
    include_auto=True,
    include_case=True,
    include_logoman=False,
    include_base=False,
    sort_mode="Équipe (A-Z)",
):
    """Build an aggregated export dataframe with selected columns.

    Args:
        df: Enriched DataFrame with Category, Hits columns.
        include_*: Which columns to include.
        sort_mode: "Équipe (A-Z)" or "Joueur (A-Z)".

    Returns:
        Aggregated DataFrame ready for export.
    """
    exp_df = df.copy()
    exp_df["Player"] = exp_df["Player"].apply(normalize_player_name)

    # Group columns
    if include_team and include_player:
        group_cols = ["Team", "Player"]
    elif include_team:
        group_cols = ["Team"]
    else:
        group_cols = ["Player"]

    # Build aggregation dict
    agg_dict = {}
    if include_cards:
        agg_dict["Cartes"] = ("Hits", "sum")
    if include_auto:
        exp_df["_auto"] = (exp_df["Category"] == "💎 Auto/Mem").astype(int) * exp_df["Hits"]
        agg_dict["Auto/Memo"] = ("_auto", "sum")
    if include_case:
        exp_df["_case"] = (exp_df["Category"] == "✨ Case Hit").astype(int) * exp_df["Hits"]
        agg_dict["Case Hits"] = ("_case", "sum")
    if include_logoman:
        exp_df["_logo"] = (exp_df["Category"] == "🔥 Logoman").astype(int) * exp_df["Hits"]
        agg_dict["Logoman"] = ("_logo", "sum")
    if include_base:
        exp_df["_base"] = (exp_df["Category"] == "📄 Base/Autre").astype(int) * exp_df["Hits"]
        agg_dict["Base/Autre"] = ("_base", "sum")

    if not agg_dict:
        agg_dict["Cartes"] = ("Hits", "sum")

    export_df = exp_df.groupby(group_cols, as_index=False).agg(**agg_dict)

    # Rename columns to French
    rename_map = {"Team": "Équipe", "Player": "Joueur"}
    export_df = export_df.rename(columns=rename_map)

    # Sort
    if sort_mode == "Équipe (A-Z)" and "Équipe" in export_df.columns:
        sort_col = "Équipe"
    elif "Joueur" in export_df.columns:
        sort_col = "Joueur"
    else:
        sort_col = export_df.columns[0]

    export_df = export_df.sort_values(sort_col, key=lambda x: x.str.lower())

    # Convert numeric columns to int
    for col in export_df.columns:
        if col not in ["Équipe", "Joueur"]:
            export_df[col] = export_df[col].astype(int)

    return export_df


def build_team_detail_dataframe(df, team=None):
    """Build a detailed card listing, optionally filtered by team.

    Args:
        df: Enriched DataFrame.
        team: Team name to filter, or None for all teams.

    Returns:
        DataFrame with card details.
    """
    detail_cols_wanted = ["Player", "Team", "Box Type", "Card Type", "Numbering", "File", "Category"]
    detail_cols = [c for c in detail_cols_wanted if c in df.columns]

    if team:
        mask = df["Team"].astype(str).str.contains(team, case=False, na=False)
        detail_df = df[mask][detail_cols].copy()
    else:
        detail_df = df[detail_cols].copy()

    sort_cols = ["Player", "Box Type"] if "Box Type" in detail_cols else ["Player"]
    detail_df = detail_df.sort_values(sort_cols)

    rename_map = {
        "Player": "Joueur",
        "Team": "Équipe",
        "Box Type": "Type",
        "Card Type": "Variante",
        "Numbering": "Numérotation",
        "File": "Checklist",
        "Category": "Catégorie",
    }
    detail_df = detail_df.rename(columns={k: v for k, v in rename_map.items() if k in detail_cols})
    return detail_df


def generate_export_xlsx(
    df,
    export_df,
    team_detail_df=None,
    team_label=None,
):
    """Generate an Excel file with Info, Export, and optional detail sheets.

    Returns:
        bytes of the Excel file.
    """
    checklists_in_export = get_checklist_labels(df)

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        # Info sheet
        info_df = pd.DataFrame({"Checklists incluses": checklists_in_export})
        info_df.to_excel(writer, index=False, sheet_name="Info")

        # Export sheet
        export_df.to_excel(writer, index=False, sheet_name="Export")

        # Optional detail sheet
        if team_detail_df is not None and not team_detail_df.empty:
            sheet_name = f"Détail {team_label or 'Toutes'}"[:31]
            team_detail_df.to_excel(writer, index=False, sheet_name=sheet_name)

        writer.book.active = writer.book.worksheets[0]

    return buffer.getvalue()


def generate_export_filename(df):
    """Generate a filename based on checklists in the data."""
    checklists = get_checklist_labels(df)
    if len(checklists) == 1:
        single = os.path.splitext(os.path.basename(checklists[0]))[0]
        base = re.sub(r"[^\w\-]+", "_", single).strip("_") or "checklist"
    else:
        base = f"multi_{len(checklists)}_checklists"
    return base
