"""
Analysis engine: enrichment (categorization + scoring) and aggregation.
Extracted from app.py enrichment logic (lines ~1916-2003) — zero Streamlit dependency.
"""

import re
import os
import json

import pandas as pd

from .card_logic import (
    CATEGORY_AUTO_MEM,
    CATEGORY_BASE_OTHER,
    CATEGORY_CASE_HIT,
    CATEGORY_LOGOMAN,
    build_hype_map,
    calculate_score,
    categorize_card,
    get_hype_multiplier,
    rarity_multiplier,
)
from .sports_config import get_sport_profile, get_effective_exact_category_by_sport
from .data_pipeline import (
    split_slash_values,
    normalize_team_value,
    count_distinct_checklists,
    get_checklist_labels,
    dedupe_multiplayer_projection_rows,
    ensure_master_dataframe_schema,
)
from .r2_storage import read_r2_parquet, get_r2_config, is_r2_configured
from .checklist_aliases import load_checklist_aliases, equivalent_checklist_ids


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def normalize_box_type_text(value):
    text = "" if value is None else str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_scope_text(value):
    return normalize_box_type_text(value)


def _build_scoped_override_sets(keyword_overrides_root, sport_keys):
    scoped_root = keyword_overrides_root.get("scoped_category_by_sport", {})
    if not isinstance(scoped_root, dict):
        return {}, {}

    auto_sets = {}
    case_sets = {}
    for sk in sport_keys:
        sport_scoped = scoped_root.get(sk, {})
        if not isinstance(sport_scoped, dict):
            continue
        for target, bucket in ((auto_sets, "auto_mem"), (case_sets, "case_hit")):
            values = sport_scoped.get(bucket, {})
            if not isinstance(values, dict):
                continue
            parsed = {}
            for scope, box_types in values.items():
                if not isinstance(box_types, list):
                    continue
                parsed[normalize_scope_text(scope)] = {
                    normalize_box_type_text(v) for v in box_types if str(v).strip()
                }
            target[sk] = parsed
    return auto_sets, case_sets


def normalize_player_name(name):
    if pd.isna(name):
        return name
    name = str(name).strip()
    parts = name.split()
    normalized = []
    for i, part in enumerate(parts):
        lower_part = part.lower()
        if lower_part in ["jr.", "sr.", "jr", "sr", "ii", "iii", "iv", "v"]:
            normalized.append(part.upper().rstrip('.') + ('.' if '.' in part else ''))
        elif lower_part in ["de", "da", "van", "von", "del", "la", "le"] and i > 0:
            normalized.append(lower_part)
        else:
            normalized.append(part.capitalize())
    return " ".join(normalized)


# ---------------------------------------------------------------------------
# Data loading (master mode)
# ---------------------------------------------------------------------------

def load_master_data(sport_key, checklist_ids, master_key):
    """Load and filter data from a master parquet on R2."""
    config = get_r2_config()
    if not is_r2_configured(config):
        raise RuntimeError("R2 non configuré.")
    if not master_key:
        raise ValueError("Master parquet introuvable.")

    master_df = read_r2_parquet(config, master_key)
    sport_profile = get_sport_profile(sport_key)
    master_df = ensure_master_dataframe_schema(master_df, sport_key)
    team_aliases = sport_profile.get("team_aliases", {})
    master_df["Team"] = master_df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))

    if checklist_ids:
        aliases_root = load_checklist_aliases()
        selected_ids = set()
        for value in checklist_ids:
            selected_ids.update(equivalent_checklist_ids(sport_key, value, aliases_root))
        if selected_ids:
            master_df = master_df[master_df["checklist_id"].astype(str).isin(selected_ids)].copy()

    if master_df.empty:
        raise ValueError("Aucune ligne trouvée pour la sélection.")

    return master_df.reset_index(drop=True)


# ---------------------------------------------------------------------------
# Enrichment pipeline
# ---------------------------------------------------------------------------

def enrich_dataframe(df, sport_key, keyword_overrides_root=None):
    """Apply categorization, scoring, and rarity to a raw dataframe.

    Args:
        df: DataFrame with at least Player, Team, Box Type, Numbering, Hits, Category (optional).
        sport_key: Current sport key.
        keyword_overrides_root: Optional dict of keyword overrides (from keyword_overrides.json).

    Returns:
        Enriched DataFrame with Category, Rarity Mult, Score columns added.
    """
    if df is None or df.empty:
        return df

    sport_profile = get_sport_profile(sport_key)
    category_rules = sport_profile.get("category_rules", {})

    # Build per-sport rule map
    sport_rule_map = {}
    if "Sport" in df.columns:
        for sk in df["Sport"].dropna().astype(str).unique().tolist():
            sport_rule_map[sk] = get_sport_profile(sk).get("category_rules", category_rules)
    if not sport_rule_map:
        sport_rule_map[sport_key] = category_rules

    # Exact overrides
    keyword_overrides_root = keyword_overrides_root or {}
    effective_exact_by_sport = get_effective_exact_category_by_sport(keyword_overrides_root)

    auto_override_sets = {}
    case_override_sets = {}
    for sk in sport_rule_map.keys():
        sport_overrides = effective_exact_by_sport.get(sk, {})
        auto_values = sport_overrides.get("auto_mem", []) if isinstance(sport_overrides, dict) else []
        case_values = sport_overrides.get("case_hit", []) if isinstance(sport_overrides, dict) else []
        auto_override_sets[sk] = {normalize_box_type_text(v) for v in auto_values if str(v).strip()}
        case_override_sets[sk] = {normalize_box_type_text(v) for v in case_values if str(v).strip()}
    scoped_auto_sets, scoped_case_sets = _build_scoped_override_sets(
        keyword_overrides_root, sport_rule_map.keys()
    )
    aliases_root = load_checklist_aliases()

    # Vectorized category assignment
    df["Normalized Box Type"] = df["Box Type"].apply(normalize_box_type_text)
    df["Category"] = CATEGORY_BASE_OTHER
    sport_series = (
        df["Sport"].astype(str) if "Sport" in df.columns else pd.Series([sport_key] * len(df), index=df.index)
    )
    for sk in sport_series.dropna().astype(str).unique().tolist():
        mask = sport_series == sk
        rules = sport_rule_map.get(sk, category_rules)
        auto_set = auto_override_sets.get(sk, set())
        case_set = case_override_sets.get(sk, set())
        scoped_auto = scoped_auto_sets.get(sk, {})
        scoped_case = scoped_case_sets.get(sk, {})
        local_map = (
            df.loc[mask, ["Normalized Box Type", "Box Type"]]
            .drop_duplicates(subset=["Normalized Box Type"])
            .set_index("Normalized Box Type")["Box Type"]
            .astype(str)
            .to_dict()
        )

        norm_to_category = {}
        for norm_box, raw_box in local_map.items():
            if norm_box in case_set:
                norm_to_category[norm_box] = CATEGORY_CASE_HIT
            elif norm_box in auto_set:
                norm_to_category[norm_box] = CATEGORY_AUTO_MEM
            else:
                norm_to_category[norm_box] = categorize_card(raw_box, rules)

        df.loc[mask, "Category"] = (
            df.loc[mask, "Normalized Box Type"]
            .map(norm_to_category)
            .fillna(CATEGORY_BASE_OTHER)
        )

        if scoped_auto or scoped_case:
            scope_series = (
                df.loc[mask, "checklist_id"].astype(str)
                if "checklist_id" in df.columns
                else df.loc[mask, "File"].astype(str)
                if "File" in df.columns
                else pd.Series([""] * int(mask.sum()), index=df.loc[mask].index)
            )
            scope_series = scope_series.apply(normalize_scope_text)
            norm_series = df.loc[mask, "Normalized Box Type"]
            scoped_case_mask = [
                any(norm in scoped_case.get(normalize_scope_text(alias), set()) for alias in equivalent_checklist_ids(sk, scope, aliases_root) or {scope})
                for scope, norm in zip(scope_series, norm_series)
            ]
            scoped_auto_mask = [
                any(norm in scoped_auto.get(normalize_scope_text(alias), set()) for alias in equivalent_checklist_ids(sk, scope, aliases_root) or {scope})
                for scope, norm in zip(scope_series, norm_series)
            ]
            scoped_case_index = df.loc[mask].index[scoped_case_mask]
            scoped_auto_index = df.loc[mask].index[scoped_auto_mask]
            df.loc[scoped_auto_index, "Category"] = CATEGORY_AUTO_MEM
            df.loc[scoped_case_index, "Category"] = CATEGORY_CASE_HIT
    df.drop(columns=["Normalized Box Type"], inplace=True, errors="ignore")
    df["Rarity Mult"] = df["Numbering"].apply(rarity_multiplier)
    df["Score"] = df["Category"].apply(calculate_score) * df["Rarity Mult"]

    return df


# ---------------------------------------------------------------------------
# Exploded DataFrames (for player/team analysis)
# ---------------------------------------------------------------------------

def build_player_exploded(df):
    """Explode multi-player cards into individual player rows."""
    df_p = df.copy()
    df_p["Player Raw"] = df_p["Player"].astype(str).str.strip()
    df_p["Team Raw"] = df_p["Team"].astype(str).str.strip()
    df_p["Is Multi-Player Card"] = df_p["Player Raw"].str.contains("/", na=False)
    df_p["Player List"] = df_p["Player Raw"].apply(split_slash_values)
    df_p["Team List"] = df_p["Team Raw"].apply(split_slash_values)
    df_p["Player Count"] = df_p["Player List"].apply(len)
    df_p["Team Count"] = df_p["Team List"].apply(len)
    df_p["Is Player-Team Aligned"] = (df_p["Player Count"] == df_p["Team Count"]) & (df_p["Player Count"] > 1)
    df_p = df_p.reset_index(drop=True)
    df_p["Card Row Id"] = df_p.index
    df_p = df_p.explode("Player List")
    df_p["Player Position"] = df_p.groupby("Card Row Id").cumcount()
    df_p["Player"] = df_p["Player List"].astype(str).str.strip()
    df_p = df_p[df_p["Player"] != ""].copy()

    def resolve_player_team(row):
        team_list = row.get("Team List", [])
        player_pos = row.get("Player Position", 0)
        if isinstance(team_list, list) and row.get("Is Player-Team Aligned", False):
            if 0 <= player_pos < len(team_list):
                return str(team_list[player_pos]).strip()
        return row.get("Team Raw", "")

    df_p["Team"] = df_p.apply(resolve_player_team, axis=1)
    return df_p


def build_team_exploded(df):
    """Explode multi-team cards into individual team rows."""
    df_t = df.copy()
    df_t["Team"] = df_t["Team"].astype(str).str.split("/")
    df_t = df_t.explode("Team")
    df_t["Team"] = df_t["Team"].str.strip()
    return df_t


# ---------------------------------------------------------------------------
# Aggregations
# ---------------------------------------------------------------------------

def aggregate_player_stats(df_p):
    """Aggregate hits by player from exploded player dataframe."""
    return (
        df_p.groupby("Player")
        .agg(Hits=("Hits", "sum"))
        .reset_index()
        .sort_values("Hits", ascending=False)
    )


def aggregate_team_stats(df_t):
    """Aggregate hits by team from exploded team dataframe."""
    return (
        df_t.groupby("Team")
        .agg(Hits=("Hits", "sum"))
        .reset_index()
        .sort_values("Hits", ascending=False)
    )


def compute_category_summary(df):
    """Return category counts dict."""
    if df is None or df.empty or "Category" not in df.columns:
        return {}
    counts = df["Category"].value_counts().to_dict()
    return {
        "logoman": int(counts.get(CATEGORY_LOGOMAN, 0)),
        "case_hit": int(counts.get(CATEGORY_CASE_HIT, 0)),
        "auto_mem": int(counts.get(CATEGORY_AUTO_MEM, 0)),
        "base_other": int(counts.get(CATEGORY_BASE_OTHER, 0)),
    }


def compute_enabled_views(sport_profile, category_rules, hype_map, top_rookies_by_year):
    """Determine which views are enabled for the current sport."""
    enabled_views = sport_profile.get("enabled_views", {})
    auto_mem_keywords = category_rules.get("auto_mem", [])
    logoman_keywords = category_rules.get("logoman", [])
    case_hit_keywords = category_rules.get("case_hit", [])

    views = {
        "global": True,
        "autos_patchs": enabled_views.get("autos_patchs", True) and bool(auto_mem_keywords),
        "logoman": enabled_views.get("logoman", True) and bool(logoman_keywords),
        "case_hits": enabled_views.get("case_hits", True) and bool(case_hit_keywords),
        "multi_players": True,
        "value_picks": enabled_views.get("value_picks", True) and bool(hype_map),
        "rookies": enabled_views.get("rookies", bool(top_rookies_by_year)),
        "player_detail": True,
        "team_detail": True,
        "file_analysis": True,
        "detection": True,
        "comparator": True,
        "cost_by_pick": enabled_views.get("cost_by_pick", True),
        "live_mode": enabled_views.get("live_mode", True),
        "break_simulation": True,
        "export": True,
    }
    return views


# ---------------------------------------------------------------------------
# Full analysis pipeline
# ---------------------------------------------------------------------------

def run_analysis(sport_key, checklist_ids, master_key=None, keyword_overrides_root=None):
    """Run the complete analysis pipeline and return structured results.

    Returns dict with:
        df: Enriched DataFrame
        df_p: Player-exploded DataFrame
        df_t: Team-exploded DataFrame
        player_rankings: Top players by hits
        team_rankings: Top teams by hits
        category_summary: Category counts
        enabled_views: Dict of view availability
        metadata: Row count, checklist count, sport info
    """
    # Load data
    df = load_master_data(sport_key, checklist_ids, master_key)

    # Dedup multi-player rows
    df, collapsed_count = dedupe_multiplayer_projection_rows(df)

    # Enrich
    df = enrich_dataframe(df, sport_key, keyword_overrides_root)

    # Build exploded frames
    df_p = build_player_exploded(df)
    df_t = build_team_exploded(df)

    # Aggregations
    player_rankings = aggregate_player_stats(df_p)
    team_rankings = aggregate_team_stats(df_t)
    category_summary = compute_category_summary(df)

    # View availability
    sport_profile = get_sport_profile(sport_key)
    category_rules = sport_profile.get("category_rules", {})
    hype_map = build_hype_map(sport_profile.get("hype_tiers", {}))
    top_rookies_by_year = sport_profile.get("top_rookies_by_year", {})
    enabled_views = compute_enabled_views(sport_profile, category_rules, hype_map, top_rookies_by_year)

    # Metadata
    all_players = set()
    for p in df["Player"].dropna().astype(str):
        for name in split_slash_values(p):
            all_players.add(name)

    metadata = {
        "total_rows": len(df),
        "unique_teams": int(df["Team"].nunique()) if "Team" in df.columns else 0,
        "unique_players": len(all_players),
        "checklists_count": count_distinct_checklists(df),
        "collapsed_multi_rows": collapsed_count,
        "sport_key": sport_key,
        "sport_label": sport_profile.get("label", sport_key),
    }

    return {
        "df": df,
        "df_p": df_p,
        "df_t": df_t,
        "player_rankings": player_rankings,
        "team_rankings": team_rankings,
        "category_summary": category_summary,
        "enabled_views": enabled_views,
        "metadata": metadata,
    }
