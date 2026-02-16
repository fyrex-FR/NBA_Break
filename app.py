import streamlit as st
import pandas as pd
import os
import plotly.express as px
import re
import json
import importlib
import hashlib
from io import BytesIO
from card_logic import (
    CATEGORY_AUTO_MEM,
    CATEGORY_BASE_OTHER,
    CATEGORY_CASE_HIT,
    CATEGORY_FILTER_OPTIONS,
    CATEGORY_LOGOMAN,
    build_hype_map,
    calculate_score,
    categorize_card,
    get_hype_multiplier,
    normalize_team_name,
    parse_numbering,
    rarity_multiplier,
)
import sports_config as sports_config_module
from r2_storage import (
    get_r2_config,
    is_r2_configured,
    is_r2_uri,
    key_to_r2_uri,
    list_r2_parquet_keys,
    r2_uri_to_key,
    r2_object_exists,
    read_r2_parquet,
    read_r2_json,
    source_filename,
    source_label,
    upload_parquet_dataframe,
    write_r2_json,
)

sports_config_module = importlib.reload(sports_config_module)
DEFAULT_SPORT_KEY = sports_config_module.DEFAULT_SPORT_KEY
detect_sport_from_filename = sports_config_module.detect_sport_from_filename
get_sport_labels = sports_config_module.get_sport_labels
get_sport_profile = sports_config_module.get_sport_profile
sport_key_from_label = sports_config_module.sport_key_from_label

def extract_year(filename, sport_key=DEFAULT_SPORT_KEY):
    base_name = os.path.basename(filename)

    # NFL products are seasoned on a single year (e.g. 2024).
    if sport_key == "nfl":
        match = re.search(r"((?:19|20)\d{2})", base_name)
        return match.group(1) if match else "Inconnue"

    # Default behavior for basketball-like seasons (e.g. 2024-25).
    season_match = re.search(r"((?:19|20)\d{2}-\d{2})", base_name)
    if season_match:
        return season_match.group(1)

    # Fallback to simple year for other sports/files.
    year_match = re.search(r"((?:19|20)\d{2})", base_name)
    return year_match.group(1) if year_match else "Inconnue"

def extract_product(filename):
    name = os.path.splitext(filename)[0]
    name = re.sub(r"\d{4}-\d{2}", "", name)
    name = re.sub(r"checklist", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name)
    return name.strip(" -_")


def split_slash_values(value):
    text = "" if value is None else str(value)
    return [p.strip() for p in text.split("/") if p and p.strip() and p.strip().lower() != "nan"]


def normalize_team_value(value, team_aliases):
    """
    Normalize each team inside slash-separated values.
    Example: "Houston Oilers/Tennessee Titans" -> "Tennessee Titans/Tennessee Titans"
    """
    parts = split_slash_values(value)
    if not parts:
        raw = "" if value is None else str(value).strip()
        return normalize_team_name(raw, team_aliases)

    normalized = [normalize_team_name(team, team_aliases).strip() for team in parts]
    # Keep order while removing exact duplicates.
    deduped = []
    for team in normalized:
        if team and team not in deduped:
            deduped.append(team)
    return "/".join(deduped)


def build_source_entries(sources):
    """
    Build unique display labels for local files and cloud files.
    """
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


def normalize_checklist_columns(df):
    """
    Canonicalize checklist columns and keep the app contract.
    Expected output columns: Player, Team, Box Type, Numbering.
    """
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

    # Keep a single internal name.
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


def read_uploaded_checklist(uploaded_file, sheet_names):
    data = uploaded_file.getvalue()
    xls = pd.ExcelFile(data, engine="openpyxl")
    for sheet_name in sheet_names:
        if sheet_name in xls.sheet_names:
            df = pd.read_excel(data, sheet_name=sheet_name, engine="openpyxl")
            return normalize_checklist_columns(df)
    raise ValueError(f"Aucun onglet compatible trouvé ({', '.join(sheet_names)}).")


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
    """
    Normalize a master parquet dataframe to the app contract.
    """
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


def build_template_xlsx_bytes():
    """
    Build a strict checklist template:
    sheet: Teams_clean
    columns: Player, Team, Card Type, Numbering
    """
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


def dedupe_multiplayer_projection_rows(df):
    """
    Collapse repeated multi-player rows where the same card is listed once per team.
    Example: A/B card appearing as Team=A then Team=B should count once globally.
    """
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


SIM_METHOD_LETTER = "letter"
SIM_METHOD_TEAM = "team"
SIM_METHOD_CUSTOM = "custom"

SIM_METHOD_LABELS = {
    SIM_METHOD_LETTER: "Break par Lettre (A-Z)",
    SIM_METHOD_TEAM: "Break par Équipe",
    SIM_METHOD_CUSTOM: "Break Personnalisé",
}

SIM_CARD_TYPE_COLUMNS = [
    "Cartes de base",
    "Rookies",
    "Inserts",
    "Parallèles",
    "Autographes",
    "Memorabilia/Patchs",
    "Numérotées (/X)",
    "1/1",
]

SIM_SORT_OPTIONS = {
    "Valeur moyenne": "Valeur Moyenne (proxy)",
    "Nombre de hits": "Hits",
    "Nombre de joueurs": "Nombre de joueurs",
    "Alphabétique": "Spot",
}


def _ordered_unique(values):
    seen = set()
    output = []
    for raw in values:
        value = str(raw).strip()
        if value and value not in seen:
            seen.add(value)
            output.append(value)
    return output


def _clean_list_or_single(value):
    parts = split_slash_values(value)
    if parts:
        return _ordered_unique(parts)
    raw = "" if value is None else str(value).strip()
    return [raw] if raw else []


def extract_surname_initial(player_name):
    text = "" if player_name is None else str(player_name).strip()
    if not text:
        return ""
    text = re.sub(r"[^\w\s\-\']", " ", text)
    tokens = [t for t in text.split() if t]
    if not tokens:
        return ""

    suffixes = {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"}
    while tokens and tokens[-1].lower() in suffixes:
        tokens = tokens[:-1]
    if not tokens:
        return ""

    initial = tokens[-1][0].upper()
    return initial if "A" <= initial <= "Z" else ""


def build_break_simulation_pool(df):
    if df is None or df.empty:
        return pd.DataFrame()

    work = df.copy().reset_index(drop=True)
    for col in ["Player", "Team", "Box Type", "Numbering", "Category", "Hits"]:
        if col not in work.columns:
            work[col] = ""

    work["Player"] = work["Player"].astype(str).str.strip()
    work["Team"] = work["Team"].astype(str).str.strip()
    work["Box Type"] = work["Box Type"].astype(str).str.strip()
    work["Numbering"] = work["Numbering"].astype(str).str.strip()
    work["Category"] = work["Category"].astype(str).str.strip()
    work["Hits"] = pd.to_numeric(work["Hits"], errors="coerce").fillna(1).clip(lower=0.1)

    work["Player List"] = work["Player"].apply(_clean_list_or_single)
    work["Team List"] = work["Team"].apply(_clean_list_or_single)
    work = work[work["Player List"].apply(len) > 0].copy()
    if work.empty:
        return pd.DataFrame()

    box_text = work["Box Type"].astype(str).str.lower()
    numbering_values = work["Numbering"].apply(parse_numbering)

    rookie_mask = box_text.str.contains(r"\brc\b|rookie", regex=True, na=False)
    parallel_mask = box_text.str.contains(
        r"parallel|silver|gold|green|blue|red|purple|orange|pink|black|white|mojo|refractor|wave|ice|shimmer|scope|disco|holo|pulsar|laser",
        regex=True,
        na=False,
    )
    insert_mask = box_text.str.contains(
        r"insert|downtown|kaboom|color blast|manga|stained glass|genesis|photon|sublime|night moves|vortex|radiating rookies",
        regex=True,
        na=False,
    ) | work["Category"].isin([CATEGORY_CASE_HIT, CATEGORY_LOGOMAN])
    auto_kw_mask = box_text.str.contains(r"auto|autograph|signature|signed|ink", regex=True, na=False)
    mem_kw_mask = box_text.str.contains(r"patch|relic|jersey|mem|material|booklet|gear", regex=True, na=False)
    auto_mem_mask = work["Category"].eq(CATEGORY_AUTO_MEM)
    auto_mask = auto_mem_mask & (auto_kw_mask | ~mem_kw_mask)
    mem_mask = auto_mem_mask & mem_kw_mask
    case_hit_mask = work["Category"].isin([CATEGORY_CASE_HIT, CATEGORY_LOGOMAN])
    numbered_mask = numbering_values.fillna(0).astype(float) > 0
    one_of_one_mask = numbering_values.fillna(0).astype(float).eq(1) | work["Numbering"].str.contains(r"1/1", na=False)
    base_mask = work["Category"].eq(CATEGORY_BASE_OTHER) & ~(rookie_mask | parallel_mask | insert_mask | auto_mem_mask)

    work["Is Base"] = base_mask
    work["Is Rookie"] = rookie_mask
    work["Is Insert"] = insert_mask
    work["Is Parallel"] = parallel_mask
    work["Is Auto"] = auto_mask
    work["Is Memorabilia"] = mem_mask
    work["Is Numbered"] = numbered_mask
    work["Is OneOfOne"] = one_of_one_mask
    work["Is CaseHit"] = case_hit_mask

    work["Initial List"] = work["Player List"].apply(
        lambda names: [x for x in _ordered_unique(extract_surname_initial(n) for n in names) if x]
    )
    work["Primary Player"] = work["Player List"].apply(lambda items: items[0] if items else "")
    work["Primary Team"] = work["Team List"].apply(lambda items: items[0] if items else "")

    rarity_values = work["Numbering"].apply(rarity_multiplier).astype(float)
    base_score = work["Category"].apply(calculate_score).astype(float)
    rookie_bonus = work["Is Rookie"].map({True: 1.35, False: 1.0}).astype(float)
    auto_bonus = work["Is Auto"].map({True: 2.2, False: 1.0}).astype(float)
    mem_bonus = work["Is Memorabilia"].map({True: 1.9, False: 1.0}).astype(float)
    case_bonus = work["Is CaseHit"].map({True: 2.4, False: 1.0}).astype(float)
    one_bonus = work["Is OneOfOne"].map({True: 8.0, False: 1.0}).astype(float)
    work["Sim Value"] = (base_score * rarity_values * rookie_bonus * auto_bonus * mem_bonus * case_bonus * one_bonus).clip(lower=1.0, upper=50000.0)

    return work


def build_default_spots(pool_df, method):
    if pool_df is None or pool_df.empty:
        return []
    if method == SIM_METHOD_LETTER:
        return list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    if method == SIM_METHOD_TEAM:
        teams = []
        for values in pool_df["Team List"].tolist():
            teams.extend(values)
        return sorted(_ordered_unique(teams))
    return []


def build_spot_player_map(pool_df, method, custom_scope="teams", custom_map=None, custom_spots=None):
    mapping = {}
    if pool_df is None or pool_df.empty:
        return mapping

    if method == SIM_METHOD_LETTER:
        mapping = {letter: set() for letter in list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")}
        for _, row in pool_df.iterrows():
            players = row.get("Player List", [])
            initials = row.get("Initial List", [])
            if not players or not initials:
                continue
            for player in players:
                initial = extract_surname_initial(player)
                if initial in mapping:
                    mapping[initial].add(player)
        return mapping

    if method == SIM_METHOD_TEAM:
        mapping = {}
        for _, row in pool_df.iterrows():
            players = row.get("Player List", [])
            teams = row.get("Team List", [])
            for team in teams:
                if team not in mapping:
                    mapping[team] = set()
                for player in players:
                    mapping[team].add(player)
        return mapping

    if method == SIM_METHOD_CUSTOM:
        custom_map = custom_map or {}
        mapping = {spot: set() for spot in (custom_spots or [])}

        if custom_scope == "players":
            for player, spot in custom_map.items():
                if spot in mapping and str(player).strip():
                    mapping[spot].add(str(player).strip())
            return mapping

        team_to_players = {}
        for _, row in pool_df.iterrows():
            players = row.get("Player List", [])
            teams = row.get("Team List", [])
            for team in teams:
                if team not in team_to_players:
                    team_to_players[team] = set()
                for player in players:
                    team_to_players[team].add(player)

        for team, spot in custom_map.items():
            if spot not in mapping:
                continue
            for player in team_to_players.get(team, set()):
                mapping[spot].add(player)
        return mapping

    return mapping


def build_deterministic_spot_summary(
    pool_df,
    method,
    spots,
    custom_scope="teams",
    custom_map=None,
):
    if pool_df is None or pool_df.empty or not spots:
        return pd.DataFrame(), {}

    work = pool_df.reset_index(drop=True).copy()
    spot_set = set(spots)
    custom_map = custom_map or {}

    metric_cols = [
        "Hits",
        "Cartes de base",
        "Rookies",
        "Inserts",
        "Parallèles",
        "Autographes",
        "Memorabilia/Patchs",
        "Numérotées (/X)",
        "1/1",
    ]
    totals = {spot: {col: 0.0 for col in metric_cols} for spot in spots}
    value_totals = {spot: 0.0 for spot in spots}

    for _, row in work.iterrows():
        player_list = row.get("Player List", [])
        team_list = row.get("Team List", [])
        initial_list = row.get("Initial List", [])
        hits = float(row.get("Hits", 1.0) or 1.0)

        targets = []
        if method == SIM_METHOD_LETTER:
            targets = [s for s in initial_list if s in spot_set]
        elif method == SIM_METHOD_TEAM:
            targets = [s for s in team_list if s in spot_set]
        elif method == SIM_METHOD_CUSTOM:
            if custom_scope == "players":
                targets = [custom_map.get(p, "") for p in player_list]
            else:
                targets = [custom_map.get(t, "") for t in team_list]
            targets = [s for s in targets if s in spot_set]

        targets = _ordered_unique(targets)
        if not targets:
            continue

        share = hits / len(targets)
        for spot in targets:
            totals[spot]["Hits"] += share
            totals[spot]["Cartes de base"] += share if row.get("Is Base", False) else 0.0
            totals[spot]["Rookies"] += share if row.get("Is Rookie", False) else 0.0
            totals[spot]["Inserts"] += share if row.get("Is Insert", False) else 0.0
            totals[spot]["Parallèles"] += share if row.get("Is Parallel", False) else 0.0
            totals[spot]["Autographes"] += share if row.get("Is Auto", False) else 0.0
            totals[spot]["Memorabilia/Patchs"] += share if row.get("Is Memorabilia", False) else 0.0
            totals[spot]["Numérotées (/X)"] += share if row.get("Is Numbered", False) else 0.0
            totals[spot]["1/1"] += share if row.get("Is OneOfOne", False) else 0.0
            value_totals[spot] += float(row.get("Sim Value", 0.0)) * share

    rows = []
    for spot in spots:
        auto_val = totals[spot]["Autographes"]
        mem_val = totals[spot]["Memorabilia/Patchs"]
        case_val = totals[spot]["Inserts"]
        one_val = totals[spot]["1/1"]
        rarity_signal = auto_val + mem_val + (2.0 * case_val) + (5.0 * one_val)
        if rarity_signal < 1.0:
            rarity_label = "Commun"
        elif rarity_signal < 3.0:
            rarity_label = "Peu commun"
        elif rarity_signal < 7.0:
            rarity_label = "Rare"
        else:
            rarity_label = "Ultra-rare"

        spot_value = value_totals[spot]
        row = {
            "Spot": spot,
            "Hits": totals[spot]["Hits"],
            "Cartes de base": totals[spot]["Cartes de base"],
            "Rookies": totals[spot]["Rookies"],
            "Inserts": totals[spot]["Inserts"],
            "Parallèles": totals[spot]["Parallèles"],
            "Autographes": totals[spot]["Autographes"],
            "Memorabilia/Patchs": totals[spot]["Memorabilia/Patchs"],
            "Numérotées (/X)": totals[spot]["Numérotées (/X)"],
            "1/1": totals[spot]["1/1"],
            "Valeur Min (proxy)": spot_value,
            "Valeur Moyenne (proxy)": spot_value,
            "Valeur Max (proxy)": spot_value,
            "Rareté": rarity_label,
        }
        rows.append(row)

    result_df = pd.DataFrame(rows)
    if result_df.empty:
        return result_df, {}

    global_mean_value = float(result_df["Valeur Moyenne (proxy)"].mean()) if not result_df.empty else 0.0
    global_std_value = float(result_df["Valeur Moyenne (proxy)"].std()) if len(result_df) > 1 else 0.0
    cv = (global_std_value / global_mean_value) if global_mean_value > 0 else 0.0

    if cv <= 0.15:
        fairness_label = "Très équilibré"
    elif cv <= 0.30:
        fairness_label = "Acceptable"
    else:
        fairness_label = "Déséquilibré"

    if len(result_df) > 5:
        hot_threshold = float(result_df["Valeur Moyenne (proxy)"].quantile(0.9))
    else:
        hot_threshold = float(result_df["Valeur Moyenne (proxy)"].max())
    result_df["Hot Spot"] = result_df["Valeur Moyenne (proxy)"].apply(lambda x: "🔥 Hot" if x >= hot_threshold else "")

    if global_mean_value > 0:
        result_df["Équilibre Spot"] = result_df["Valeur Moyenne (proxy)"].apply(
            lambda x: "Équitable" if abs((x / global_mean_value) - 1.0) <= 0.15 else "Non équitable"
        )
    else:
        result_df["Équilibre Spot"] = "Équitable"

    fairness_summary = {
        "global_mean_value": global_mean_value,
        "global_std_value": global_std_value,
        "cv": cv,
        "fairness_label": fairness_label,
    }
    return result_df, fairness_summary


def build_spot_export_text(display_df):
    lines = []
    for _, row in display_df.iterrows():
        lines.append(
            f"{row.get('Spot', '')}: {float(row.get('Hits', 0.0)):.1f} hits | "
            f"{float(row.get('Valeur Moyenne (proxy)', 0.0)):.1f} valeur moy (proxy) | "
            f"base {float(row.get('Cartes de base', 0.0)):.1f}, "
            f"rookies {float(row.get('Rookies', 0.0)):.1f}, "
            f"inserts {float(row.get('Inserts', 0.0)):.1f}, "
            f"autos {float(row.get('Autographes', 0.0)):.1f}, "
            f"patchs {float(row.get('Memorabilia/Patchs', 0.0)):.1f}, "
            f"1/1 {float(row.get('1/1', 0.0)):.2f}"
        )
    return "\n".join(lines)

# API Key Config (Removed as requested)
# OPENAI_API_KEY = st.secrets["OPENAI_API_KEY"]

initial_sport_key = st.session_state.get("selected_sport", DEFAULT_SPORT_KEY)
initial_sport_profile = get_sport_profile(initial_sport_key)
st.set_page_config(
    page_title="Check list optimizer",
    page_icon=initial_sport_profile.get("page_icon", "🏀"),
    layout="wide",
)

# --- CSS Styling ---
st.markdown("""
<style>
    .main {
        background-color: #f0f2f6;
    }
    .st-emotion-cache-1v0mbdj {
        width: 100%;
    }
    h1 {
        color: #1f77b4;
    }
    h3 {
        color: #333;
    }
</style>
""", unsafe_allow_html=True)

# --- Sidebar: Configuration ---
st.sidebar.header("📁 Configuration")
if st.sidebar.button("🔄 Recharger (cache)"):
    st.cache_data.clear()
    st.session_state.pop("analysis_payload", None)
    st.session_state["analysis_force_reload"] = True

if "selected_sport" not in st.session_state:
    st.session_state["selected_sport"] = DEFAULT_SPORT_KEY

sport_labels = get_sport_labels()
current_sport_label = get_sport_profile(st.session_state["selected_sport"])["label"]
selected_sport_label = st.sidebar.selectbox(
    "Sport",
    options=sport_labels,
    index=sport_labels.index(current_sport_label) if current_sport_label in sport_labels else 0,
    help="Le sport pilote la normalisation des équipes et les règles de scoring.",
)
selected_sport_key = sport_key_from_label(selected_sport_label)
st.session_state["selected_sport"] = selected_sport_key
sport_profile = get_sport_profile(selected_sport_key)

header_logo_url = sport_profile.get("header_logo_url", "")
header_title = sport_profile.get("header_title", "Check list optimizer")
header_subtitle = sport_profile.get("header_subtitle", "")

if header_logo_url:
    st.markdown(
        f"""
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
            <img src="{header_logo_url}" width="60">
            <h1 style="margin: 0; display: inline-block;">{header_title}</h1>
        </div>
        <div style="text-align: center; margin-bottom: 40px;">
            {header_subtitle}
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f"""
        <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="margin: 0;">{header_title}</h1>
        </div>
        <div style="text-align: center; margin-bottom: 40px;">
            {header_subtitle}
        </div>
        """,
        unsafe_allow_html=True,
    )

# Sidebar data source now uses R2 only.
base_dir = os.getcwd()
presets_path = os.path.join(base_dir, "presets.json")
presets_r2_key = "app/presets.json"
keyword_overrides_path = os.path.join(base_dir, "keyword_overrides.json")
keyword_overrides_r2_key = "app/keyword_overrides.json"

def load_presets(path, r2_enabled, r2_config, sport_key):
    """
    Presets are stored in R2 when available, grouped by sport key.
    Fallback to local presets.json for local/dev use.
    """
    data = {}
    if r2_enabled:
        try:
            data = read_r2_json(r2_config, presets_r2_key)
        except Exception:
            data = {}
    else:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}

    if not isinstance(data, dict):
        return {}

    # Legacy format support: {"preset_name": [...]}.
    if data and all(isinstance(v, list) for v in data.values()):
        return data

    sport_presets = data.get(sport_key, {})
    return sport_presets if isinstance(sport_presets, dict) else {}


def save_presets(path, presets, r2_enabled, r2_config, sport_key):
    if r2_enabled:
        root = {}
        try:
            root = read_r2_json(r2_config, presets_r2_key)
        except Exception:
            root = {}
        if not isinstance(root, dict):
            root = {}

        # Migrate legacy flat format if it exists.
        if root and all(isinstance(v, list) for v in root.values()):
            root = {"legacy": root}

        root[sport_key] = presets
        write_r2_json(r2_config, presets_r2_key, root)
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(presets, f, ensure_ascii=False, indent=2)


def load_keyword_overrides(path, r2_enabled, r2_config):
    data = {}
    if r2_enabled:
        try:
            data = read_r2_json(r2_config, keyword_overrides_r2_key)
        except Exception:
            data = {}
    else:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {}
    return data if isinstance(data, dict) else {}


def save_keyword_overrides(path, data, r2_enabled, r2_config):
    safe_data = data if isinstance(data, dict) else {}
    if r2_enabled:
        write_r2_json(r2_config, keyword_overrides_r2_key, safe_data)
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(safe_data, f, ensure_ascii=False, indent=2)


def normalize_box_type_text(value):
    text = "" if value is None else str(value).strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def build_category_review_by_file(df):
    if df.empty or "Box Type" not in df.columns or "Category" not in df.columns or "File" not in df.columns:
        return pd.DataFrame(columns=["File", "Box Type", "Hits", "Category"])

    grouped = (
        df.groupby(["File", "Box Type"], dropna=False)
        .agg(
            Hits=("Hits", "sum"),
            Category=("Category", lambda x: x.value_counts().idxmax()),
        )
        .reset_index()
    )
    grouped["File"] = grouped["File"].astype(str).str.strip()
    grouped["Box Type"] = grouped["Box Type"].astype(str).str.strip()
    grouped = grouped[(grouped["File"] != "") & (grouped["Box Type"] != "")].copy()
    grouped = grouped.sort_values(["File", "Hits", "Box Type"], ascending=[True, False, True])
    return grouped.reset_index(drop=True)

def checkbox_key_for_token(token):
    token_text = str(token)
    token_hash = hashlib.md5(token_text.encode("utf-8")).hexdigest()[:12]
    return f"chk_cloud_{token_hash}"


def apply_preset(preset_items, all_tokens):
    valid_items = [item for item in preset_items if item in all_tokens]
    st.session_state["selected_cloud_tokens"] = valid_items
    st.session_state["selected_cloud_tokens_multiselect"] = valid_items
    for token in all_tokens:
        st.session_state[checkbox_key_for_token(token)] = token in valid_items


def _r2_config_values(config):
    return (
        config.get("account_id", ""),
        config.get("access_key_id", ""),
        config.get("secret_access_key", ""),
        config.get("bucket", ""),
        config.get("endpoint", ""),
    )


def _build_r2_config(account_id, access_key_id, secret_access_key, bucket, endpoint):
    return {
        "account_id": account_id,
        "access_key_id": access_key_id,
        "secret_access_key": secret_access_key,
        "bucket": bucket,
        "endpoint": endpoint,
    }


@st.cache_data(show_spinner=False, ttl=120)
def list_r2_parquet_keys_cached(
    account_id, access_key_id, secret_access_key, bucket, endpoint, sport_key
):
    cfg = _build_r2_config(account_id, access_key_id, secret_access_key, bucket, endpoint)
    return list_r2_parquet_keys(cfg, sport_key)


@st.cache_data(show_spinner=False, ttl=900)
def read_r2_parquet_cached(
    account_id, access_key_id, secret_access_key, bucket, endpoint, key
):
    cfg = _build_r2_config(account_id, access_key_id, secret_access_key, bucket, endpoint)
    return read_r2_parquet(cfg, key)


# Cloud scan (R2 parquet)
r2_config = get_r2_config(st.secrets)
r2_enabled = is_r2_configured(r2_config)
keyword_overrides_root = load_keyword_overrides(
    keyword_overrides_path,
    r2_enabled=r2_enabled,
    r2_config=r2_config,
)

cloud_error = ""
selected_file_paths = []
selected_master_key = ""
data_source_mode = "legacy"
catalog_entries = []

if r2_enabled:
    selected_master_key = master_parquet_key_for_sport(selected_sport_key)
    master_entries = []
    legacy_entries = []
    try:
        if r2_object_exists(r2_config, selected_master_key):
            master_df_catalog = read_r2_parquet_cached(*_r2_config_values(r2_config), selected_master_key)
            catalog_df = build_master_catalog(master_df_catalog, selected_sport_key)
            if not catalog_df.empty:
                for row in catalog_df.itertuples(index=False):
                    master_entries.append(
                        {
                            "token": str(row.checklist_id),
                            "label": f"{row.checklist_name} ☁️",
                            "filename": str(row.checklist_name),
                            "year": str(row.year),
                            "source": str(row.checklist_id),
                        }
                    )
    except Exception as e:
        cloud_error = str(e)

    try:
        cloud_keys = list_r2_parquet_keys_cached(*_r2_config_values(r2_config), selected_sport_key)
        cloud_files = [key_to_r2_uri(k) for k in cloud_keys]
        file_entries = build_source_entries(cloud_files)
        for entry in file_entries:
            label = entry["label"]
            legacy_entries.append(
                {
                    "token": entry["source"],
                    "label": label,
                    "filename": entry["filename"],
                    "year": extract_year(entry["filename"], selected_sport_key),
                    "source": entry["source"],
                }
            )
    except Exception as e:
        cloud_error = str(e)

    legacy_ids = {normalize_checklist_id(entry["filename"]) for entry in legacy_entries}
    master_ids = {entry["source"] for entry in master_entries}

    # Use master only when it covers legacy inventory.
    if master_entries and (not legacy_entries or legacy_ids.issubset(master_ids)):
        data_source_mode = "master"
        catalog_entries = master_entries
    else:
        data_source_mode = "legacy"
        catalog_entries = legacy_entries

if cloud_error:
    st.sidebar.warning("R2 configuré mais inaccessible. Vérifie les secrets.")

if not r2_enabled:
    st.sidebar.caption("Ajoute les secrets R2 pour activer la sélection.")
elif not catalog_entries:
    st.sidebar.info("Aucune checklist Parquet trouvée sur R2 pour ce sport.")
else:
    token_to_entry = {entry["token"]: entry for entry in catalog_entries}
    all_tokens = [entry["token"] for entry in catalog_entries]
    label_to_token = {entry["label"]: entry["token"] for entry in catalog_entries}
    filename_to_token = {entry["filename"]: entry["token"] for entry in catalog_entries}

    presets = load_presets(
        presets_path,
        r2_enabled=r2_enabled,
        r2_config=r2_config,
        sport_key=selected_sport_key,
    )

    if (
        st.session_state.get("selected_cloud_sport") != selected_sport_key
        or "selected_cloud_tokens" not in st.session_state
    ):
        st.session_state["selected_cloud_sport"] = selected_sport_key
        st.session_state["selected_cloud_tokens"] = []
        st.session_state["selected_cloud_tokens_multiselect"] = []
    else:
        current_tokens = st.session_state.get("selected_cloud_tokens", [])
        st.session_state["selected_cloud_tokens"] = [t for t in current_tokens if t in all_tokens]
        st.session_state["selected_cloud_tokens_multiselect"] = st.session_state["selected_cloud_tokens"]

    # Presets UI
    st.sidebar.markdown("### 💾 Presets")
    storage_label = "R2 Master" if data_source_mode == "master" else ("R2" if r2_enabled else "Local")
    st.sidebar.caption(storage_label)
    preset_names = sorted(presets.keys())
    if "preset_name" not in st.session_state:
        st.session_state["preset_name"] = ""
    if "preset_to_load" not in st.session_state:
        st.session_state["preset_to_load"] = ""

    if st.session_state["preset_to_load"] not in ([""] + preset_names):
        st.session_state["preset_to_load"] = ""

    def normalize_preset_items(values):
        normalized = []
        for v in values if isinstance(values, list) else []:
            if v in token_to_entry:
                normalized.append(v)
            elif v in label_to_token:
                normalized.append(label_to_token[v])
            elif v in filename_to_token:
                normalized.append(filename_to_token[v])
        # Keep order + uniqueness.
        seen = set()
        ordered = []
        for v in normalized:
            if v not in seen:
                seen.add(v)
                ordered.append(v)
        return ordered

    def on_preset_change():
        selected = st.session_state.get("preset_to_load", "")
        if not selected:
            st.session_state["selected_cloud_tokens"] = []
            st.session_state["selected_cloud_tokens_multiselect"] = []
            st.session_state["preset_name"] = ""
            return
        files = normalize_preset_items(presets.get(selected, []))
        apply_preset(files, all_tokens)
        st.session_state["preset_name"] = selected

    st.sidebar.selectbox(
        "Preset",
        options=[""] + preset_names,
        key="preset_to_load",
        on_change=on_preset_change,
        help="Sélectionner un preset l'applique automatiquement.",
    )

    def on_save_preset():
        name = st.session_state.get("preset_name", "").strip()
        if not name:
            return
        current_selection = st.session_state.get("selected_cloud_tokens", [])
        presets[name] = current_selection
        try:
            save_presets(
                presets_path,
                presets,
                r2_enabled=r2_enabled,
                r2_config=r2_config,
                sport_key=selected_sport_key,
            )
            st.session_state["preset_to_load"] = name
        except Exception as e:
            st.sidebar.warning(f"Sauvegarde preset impossible: {e}")

    def on_delete_preset():
        selected = st.session_state.get("preset_to_load", "")
        if not selected:
            return
        if selected in presets:
            del presets[selected]
            try:
                save_presets(
                    presets_path,
                    presets,
                    r2_enabled=r2_enabled,
                    r2_config=r2_config,
                    sport_key=selected_sport_key,
                )
            except Exception as e:
                st.sidebar.warning(f"Suppression preset impossible: {e}")
                return
        st.session_state["preset_to_load"] = ""
        st.session_state["preset_name"] = ""
        st.session_state["selected_cloud_tokens"] = []
        st.session_state["selected_cloud_tokens_multiselect"] = []

    st.sidebar.text_input("Nom", key="preset_name", placeholder="Nom du preset")
    preset_actions_col1, preset_actions_col2 = st.sidebar.columns(2)
    with preset_actions_col1:
        st.button("💾 Sauver", on_click=on_save_preset, use_container_width=True)
    with preset_actions_col2:
        st.button(
            "🗑️ Suppr.",
            on_click=on_delete_preset,
            disabled=not st.session_state.get("preset_to_load"),
            use_container_width=True,
        )

    st.sidebar.markdown("---")
    st.sidebar.markdown("### ☁️ Checklists")
    st.sidebar.caption(f"{len(all_tokens)} checklist(s) cloud disponible(s).")

    all_selected = len(st.session_state.get("selected_cloud_tokens", [])) == len(all_tokens) and len(all_tokens) > 0

    def toggle_select_all_cloud():
        new_selection = [] if all_selected else all_tokens.copy()
        st.session_state["selected_cloud_tokens"] = new_selection
        for token in all_tokens:
            st.session_state[checkbox_key_for_token(token)] = token in new_selection

    st.sidebar.button(
        "Tout désélectionner" if all_selected else "Tout sélectionner",
        on_click=toggle_select_all_cloud,
        key="toggle_select_all_cloud",
    )

    selection_mode = st.sidebar.radio(
        "Mode de sélection",
        ["Par Année (Cases)", "Liste (Multiselect)"],
        index=0,
        key="cloud_selection_mode",
    )

    selected_tokens = []
    if selection_mode == "Liste (Multiselect)":
        if "selected_cloud_tokens_multiselect" not in st.session_state:
            st.session_state["selected_cloud_tokens_multiselect"] = st.session_state.get("selected_cloud_tokens", [])
        selected_tokens = st.sidebar.multiselect(
            "Checklists incluses",
            options=all_tokens,
            default=st.session_state.get("selected_cloud_tokens_multiselect", []),
            format_func=lambda token: token_to_entry[token]["label"],
            key="selected_cloud_tokens_multiselect",
        )
        st.session_state["selected_cloud_tokens"] = selected_tokens
        for token in all_tokens:
            st.session_state[checkbox_key_for_token(token)] = token in selected_tokens
    else:
        files_by_year = {}
        for entry in catalog_entries:
            y = str(entry.get("year", "") or "Inconnue")
            if y not in files_by_year:
                files_by_year[y] = []
            files_by_year[y].append(entry)

        selected_set = set(st.session_state.get("selected_cloud_tokens", []))
        for year in sorted(files_by_year.keys(), reverse=True):
            year_files = files_by_year[year]
            with st.sidebar.expander(f"{year} ({len(year_files)})", expanded=False):
                for entry in year_files:
                    token = entry["token"]
                    label = entry["label"]
                    chk_key = checkbox_key_for_token(token)
                    if chk_key not in st.session_state:
                        st.session_state[chk_key] = token in selected_set
                    if st.checkbox(label, key=chk_key):
                        selected_set.add(token)
                    else:
                        selected_set.discard(token)
        selected_tokens = [token for token in all_tokens if token in selected_set]
        st.session_state["selected_cloud_tokens"] = selected_tokens

    selected_file_paths = [token_to_entry[token]["source"] for token in selected_tokens if token in token_to_entry]
    st.sidebar.caption(f"{len(selected_file_paths)}/{len(all_tokens)} checklist(s) sélectionnée(s).")

# --- CHECKLIST INGESTION ---
st.sidebar.markdown("### ➕ Ajouter une checklist")
if not r2_enabled:
    st.sidebar.caption("Upload indisponible: configuration manquante.")
else:
    st.sidebar.caption(f"Sport sélectionné: **{sport_profile.get('label', selected_sport_key)}**")
    st.sidebar.markdown(
        "Format attendu:\n"
        "- Onglet: `Teams_clean`\n"
        "- Colonnes: `Player`, `Team`, `Card Type`, `Numbering`"
    )
    st.sidebar.download_button(
        "Télécharger le modèle Excel",
        data=build_template_xlsx_bytes(),
        file_name="template-checklist.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        key="download_checklist_template",
    )
    overwrite_r2 = st.sidebar.checkbox(
        "Mettre à jour si le même nom existe déjà",
        value=True,
        key="r2_ingest_overwrite",
    )
    ingest_files = st.sidebar.file_uploader(
        "Fichier(s) Excel",
        type=["xlsx"],
        accept_multiple_files=True,
        key="r2_ingest_uploader",
        help="Ajoute un ou plusieurs fichiers .xlsx.",
    )

    if st.sidebar.button("📤 Ajouter la checklist", key="r2_ingest_button"):
        if not ingest_files:
            st.sidebar.warning("Ajoute au moins un fichier Excel.")
        else:
            uploaded_count = 0
            skipped_count = 0
            uploaded_bytes = 0
            target_sport_key = selected_sport_key
            target_master_key = master_parquet_key_for_sport(target_sport_key)
            profile = get_sport_profile(target_sport_key)
            team_aliases = profile.get("team_aliases", {})
            sheet_names = profile.get("sheet_names", ["Teams_clean"])
            pending_by_checklist_id = {}

            # Load existing master once.
            if r2_object_exists(r2_config, target_master_key):
                try:
                    existing_master = read_r2_parquet_cached(*_r2_config_values(r2_config), target_master_key)
                    existing_master = ensure_master_dataframe_schema(existing_master, target_sport_key)
                except Exception as e:
                    st.sidebar.error(f"Lecture du master impossible: {e}")
                    existing_master = pd.DataFrame(columns=MASTER_COLUMNS)
            else:
                existing_master = pd.DataFrame(columns=MASTER_COLUMNS)

            existing_ids = set(existing_master["checklist_id"].astype(str).tolist()) if not existing_master.empty else set()

            # Reconcile legacy per-checklist parquets into master (missing IDs only).
            try:
                legacy_keys = list_r2_parquet_keys_cached(*_r2_config_values(r2_config), target_sport_key)
                legacy_frames = []
                for legacy_key in legacy_keys:
                    legacy_name = os.path.basename(legacy_key)
                    legacy_id = normalize_checklist_id(legacy_name)
                    if legacy_id in existing_ids:
                        continue
                    legacy_df = read_r2_parquet_cached(*_r2_config_values(r2_config), legacy_key)
                    legacy_df = normalize_checklist_columns(legacy_df)
                    legacy_df["Team"] = legacy_df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))
                    legacy_df["Hits"] = 1
                    legacy_df["File"] = legacy_name
                    legacy_df["Year"] = extract_year(legacy_name, target_sport_key)
                    legacy_df["Product"] = extract_product(legacy_name)
                    legacy_df["Sport"] = target_sport_key
                    legacy_df["checklist_id"] = legacy_id
                    legacy_df["checklist_name"] = legacy_name
                    legacy_frames.append(ensure_master_dataframe_schema(legacy_df, target_sport_key))
                    existing_ids.add(legacy_id)
                if legacy_frames:
                    existing_master = pd.concat([existing_master] + legacy_frames, ignore_index=True)
                    existing_master = ensure_master_dataframe_schema(existing_master, target_sport_key)
            except Exception as e:
                st.sidebar.warning(f"Migration legacy -> master partielle: {e}")

            for f in ingest_files:
                if f.name.startswith("~$"):
                    skipped_count += 1
                    continue

                try:
                    clean_df = read_uploaded_checklist(f, sheet_names)
                    clean_df["Team"] = clean_df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))
                    checklist_name = checklist_name_from_filename(f.name)
                    checklist_id = normalize_checklist_id(checklist_name)

                    if (not overwrite_r2) and (checklist_id in existing_ids or checklist_id in pending_by_checklist_id):
                        st.sidebar.info(f"{f.name}: déjà présent (option remplacement désactivée).")
                        skipped_count += 1
                        continue

                    work = clean_df.copy()
                    work["Hits"] = 1
                    work["File"] = checklist_name
                    work["Year"] = extract_year(checklist_name, target_sport_key)
                    work["Product"] = extract_product(checklist_name)
                    work["Sport"] = target_sport_key
                    work["checklist_id"] = checklist_id
                    work["checklist_name"] = checklist_name
                    work = ensure_master_dataframe_schema(work, target_sport_key)

                    pending_by_checklist_id[checklist_id] = work
                    uploaded_count += 1
                except Exception as e:
                    st.sidebar.warning(f"{f.name}: {e}")
                    skipped_count += 1

            if uploaded_count > 0:
                replaced_ids = set(pending_by_checklist_id.keys())
                if not existing_master.empty and replaced_ids:
                    existing_master = existing_master[
                        ~existing_master["checklist_id"].astype(str).isin(replaced_ids)
                    ].copy()

                new_frames = [existing_master] + list(pending_by_checklist_id.values())
                final_master = pd.concat(new_frames, ignore_index=True) if new_frames else pd.DataFrame(columns=MASTER_COLUMNS)
                final_master = ensure_master_dataframe_schema(final_master, target_sport_key)
                uploaded_bytes = upload_parquet_dataframe(r2_config, target_master_key, final_master)

                st.sidebar.success(
                    f"{uploaded_count} checklist(s) ajoutée(s) dans le master parquet."
                )
                if skipped_count:
                    st.sidebar.caption(f"{skipped_count} fichier(s) ignoré(s).")
                st.sidebar.caption(f"Master: `{target_master_key}` ({uploaded_bytes} bytes)")
                st.cache_data.clear()
                st.session_state.pop("analysis_payload", None)
                st.rerun()
            else:
                st.sidebar.error("Aucun fichier ajouté. Vérifie le format du fichier.")

if st.sidebar.button("🚀 Lancer l'analyse", type="primary"):
    st.session_state['scan_triggered'] = True
    st.session_state['selected_files'] = selected_file_paths
    st.session_state['data_source_mode'] = data_source_mode
    st.session_state['master_key'] = selected_master_key if data_source_mode == "master" else ""
    st.session_state['analysis_force_reload'] = True

# --- Main Logic ---

def load_data(file_list, selected_sport_key, selected_sport_profile, source_mode="legacy", master_key=""):
    if not file_list:
        return None, "Aucun fichier sélectionné.", []

    if source_mode == "master":
        if not master_key:
            return None, "Master parquet introuvable.", []
        if not r2_enabled:
            return None, "R2 non configuré.", []
        try:
            master_df = read_r2_parquet_cached(*_r2_config_values(r2_config), master_key)
            master_df = ensure_master_dataframe_schema(master_df, selected_sport_key)
            team_aliases = selected_sport_profile.get("team_aliases", {})
            master_df["Team"] = master_df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))
            selected_ids = {str(v) for v in file_list if str(v).strip()}
            if selected_ids:
                master_df = master_df[master_df["checklist_id"].astype(str).isin(selected_ids)].copy()
            if master_df.empty:
                return None, "Aucune ligne trouvée pour la sélection.", []
            checklists_count = master_df["checklist_id"].nunique()
            msg = f"{checklists_count} checklist(s) traitée(s) • {len(master_df)} lignes"
            return master_df.reset_index(drop=True), msg, []
        except Exception as e:
            return None, f"Lecture du master impossible: {e}", []

    @st.cache_data
    def read_sheet(path, mtime, sheet_name):
        return pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl")

    combined_data = []
    files_processed = 0
    error_files = []
    
    progress_bar = st.progress(0)
    status_text = st.empty()

    for i, file_obj in enumerate(file_list):
        # Handle difference between Local Path (str) and UploadedFile (object)
        if isinstance(file_obj, str):
            source = file_obj
            filename = source_filename(file_obj) if is_r2_uri(file_obj) else os.path.basename(file_obj)
        else:
            filename = file_obj.name
            source = file_obj # File Object
            
        if filename.startswith("~$"):
            error_files.append((filename, "Fichier temporaire Excel ignoré."))
            continue

        status_text.text(f"Lecture de : {filename}")
        try:
            guessed_sport_key = detect_sport_from_filename(filename, fallback=selected_sport_key)
            if guessed_sport_key != selected_sport_key:
                error_files.append(
                    (
                        filename,
                        f"Ignoré: le fichier semble être '{guessed_sport_key}' alors que le sport actif est '{selected_sport_key}'.",
                    )
                )
                continue

            file_sport_key = selected_sport_key
            file_sport_profile = selected_sport_profile

            team_aliases = file_sport_profile.get("team_aliases", {})
            sheet_names = file_sport_profile.get("sheet_names", ["Teams_clean"])

            # Extract Year from filename (sport-aware).
            box_year = extract_year(filename, selected_sport_key)
            
            try:
                if isinstance(source, str) and is_r2_uri(source):
                    key = r2_uri_to_key(source)
                    if not key.lower().endswith(".parquet"):
                        raise ValueError("Format cloud non supporté (attendu: .parquet)")
                    if not r2_enabled:
                        raise ValueError("R2 non configuré dans les secrets.")
                    df = read_r2_parquet_cached(*_r2_config_values(r2_config), key)
                else:
                    df = None
                    for sheet_name in sheet_names:
                        try:
                            if isinstance(source, str):
                                df = read_sheet(source, os.path.getmtime(source), sheet_name)
                            else:
                                source.seek(0)
                                df = pd.read_excel(source, sheet_name=sheet_name, engine="openpyxl")
                            break
                        except ValueError:
                            continue
                    if df is None:
                        raise ValueError("Sheet not found")

                df = normalize_checklist_columns(df)
            except ValueError as e:
                if isinstance(source, str) and is_r2_uri(source):
                    error_files.append((filename, f"Lecture cloud impossible: {e}"))
                else:
                    st.warning(f"{filename}: aucun onglet compatible trouvé ({', '.join(sheet_names)}).")
                continue
            
            # Team normalization for both local and cloud sources.
            df['Team'] = df['Team'].apply(lambda t: normalize_team_value(t, team_aliases))

            
            # Add metadata
            df['Hits'] = 1
            df['File'] = filename # Track source file
            df['Year'] = box_year
            df['Product'] = extract_product(filename)
            df['Sport'] = file_sport_key
            if 'Numbering' not in df.columns:
                df['Numbering'] = ""
            if 'Box Type' not in df.columns:
                df['Box Type'] = ""

            # Fix older formats where "Box Type" ended up in Numbering
            box_empty = df['Box Type'].astype(str).str.strip().eq("") | df['Box Type'].isna()
            numbering_str = df['Numbering'].astype(str).str.strip()
            non_numeric = ~numbering_str.str.fullmatch(r"\d+(\.\d+)?")
            if box_empty.mean() > 0.8 and non_numeric.mean() > 0.5:
                df.loc[box_empty, 'Box Type'] = df.loc[box_empty, 'Numbering']
                df.loc[non_numeric, 'Numbering'] = ""
            
            combined_data.append(df)
            files_processed += 1
            
        except Exception as e:
            error_files.append((filename, str(e)))
        
        progress_bar.progress((i + 1) / len(file_list))

    status_text.empty()
    progress_bar.empty()
    
    if not combined_data:
        return None, "Aucun onglet 'Teams_clean' trouvé ou données valides extraites.", error_files
        
    df = pd.concat(combined_data, ignore_index=True)
    msg = f"{files_processed} fichiers traités • {len(df)} lignes"
    return df, msg, error_files

# --- Display ---

if 'scan_triggered' in st.session_state and st.session_state['scan_triggered']:
    # Use selected files from session state
    target_files = st.session_state.get('selected_files', [])
    source_mode = st.session_state.get("data_source_mode", "legacy")
    selected_master_key_state = st.session_state.get("master_key", "")
    force_reload = st.session_state.pop("analysis_force_reload", False)
    analysis_signature = (
        selected_sport_key,
        source_mode,
        selected_master_key_state,
        tuple(sorted(str(v) for v in target_files)),
    )
    cached_payload = st.session_state.get("analysis_payload")
    if (
        (not force_reload)
        and isinstance(cached_payload, dict)
        and cached_payload.get("signature") == analysis_signature
    ):
        df = cached_payload.get("df")
        msg = cached_payload.get("msg", "Résultats restaurés depuis le cache local.")
        error_files = cached_payload.get("error_files", [])
    else:
        df, msg, error_files = load_data(
            target_files,
            selected_sport_key=selected_sport_key,
            selected_sport_profile=sport_profile,
            source_mode=source_mode,
            master_key=selected_master_key_state,
        )
        st.session_state["analysis_payload"] = {
            "signature": analysis_signature,
            "df": df,
            "msg": msg,
            "error_files": error_files,
        }
    
    if df is not None:
        st.success(msg)
        st.caption(f"Sport actif pour l'analyse: {sport_profile.get('label', selected_sport_key)}")
        st.sidebar.markdown("---")
        st.sidebar.caption(f"{msg}")
        if error_files:
            st.sidebar.caption(f"{len(error_files)} fichier(s) ignoré(s).")
        if error_files:
            with st.expander(f"{len(error_files)} fichier(s) ignoré(s)"):
                for name, err in error_files:
                    st.write(f"- {name}: {err}")
        
        # --- Navigation State Management ---
        if 'active_view' not in st.session_state:
            st.session_state['active_view'] = "🌍 Vue Globale"
            
        def update_view():
            st.session_state['active_view'] = st.session_state['nav_radio']
            
        def go_to_view(view_name):
            if st.session_state.get('active_view') != view_name:
                st.session_state['pending_view'] = view_name
                st.rerun()

        def get_selected_row(event_obj):
            if event_obj is None:
                return None
            selection = getattr(event_obj, "selection", None)
            if selection is None:
                return None
            rows = getattr(selection, "rows", None)
            if not rows:
                return None
            return rows[0]

        # Navigation Bar
        if 'pending_view' in st.session_state:
            st.session_state['nav_radio'] = st.session_state['pending_view']
            st.session_state['active_view'] = st.session_state['pending_view']
            del st.session_state['pending_view']

        # --- ROI & Hype Logic ---
        category_rules = sport_profile.get("category_rules", {})
        case_hit_keywords = category_rules.get("case_hit", [])
        auto_mem_keywords = category_rules.get("auto_mem", [])
        logoman_keywords = category_rules.get("logoman", [])
        top_rookies_by_year = sport_profile.get("top_rookies_by_year", {})
        hype_map = build_hype_map(sport_profile.get("hype_tiers", {}))
        enabled_views = sport_profile.get("enabled_views", {})

        views = ["🌍 Vue Globale"]
        if enabled_views.get("autos_patchs", True) and auto_mem_keywords:
            views.append("💎 Autos & Patchs")
        if enabled_views.get("logoman", True) and logoman_keywords:
            views.append("🔥 Logoman")
        if enabled_views.get("case_hits", True) and case_hit_keywords:
            views.append("✨ Case Hits")
        views.append("🧪 Détection Auto/Mem")
        views.extend(["👥 Multi-Joueurs", "⚖️ Comparateur Joueurs"])
        if enabled_views.get("value_picks", True) and hype_map:
            views.append("🧠 Value Picks")
        if enabled_views.get("cost_by_pick", True):
            views.append("💸 Cost par Pick")
        if enabled_views.get("rookies", bool(top_rookies_by_year)):
            views.append("🧨 Rookies")
        if enabled_views.get("live_mode", True):
            views.append("⚡ Live Mode")
        views.append("🧩 Simulation de Break")
        views.extend([" Par Fichier", "🔍 Analyse Joueur", "🛡️ Analyse Équipe"])
        
        # Ensure current view is valid
        if st.session_state['active_view'] not in views:
             st.session_state['active_view'] = views[0]
             
        selection = st.radio("", views, index=views.index(st.session_state['active_view']), horizontal=True, key="nav_radio", on_change=update_view, label_visibility="collapsed")
        st.markdown("---")

        # --- Filters ---
        all_products = sorted(df['Product'].dropna().unique().tolist())
        selected_products = st.multiselect("Filtrer par produit :", all_products, default=all_products)
        if selected_products:
            df = df[df['Product'].isin(selected_products)]

        # De-duplicate projected multi-team rows to avoid over-counting multi-player cards.
        df, collapsed_multi_rows = dedupe_multiplayer_projection_rows(df)
        if collapsed_multi_rows > 0:
            st.caption(f"Info: {collapsed_multi_rows} ligne(s) multi-équipe fusionnée(s) pour éviter le surcomptage.")

        # --- Scoring prep ---
        sport_rule_map = {}
        if "Sport" in df.columns:
            for sk in df["Sport"].dropna().astype(str).unique().tolist():
                sport_rule_map[sk] = get_sport_profile(sk).get("category_rules", category_rules)
        if not sport_rule_map:
            sport_rule_map[selected_sport_key] = category_rules

        overrides_by_sport = keyword_overrides_root.get("exact_category_by_sport", {})
        if not isinstance(overrides_by_sport, dict):
            overrides_by_sport = {}
        legacy_auto_by_sport = keyword_overrides_root.get("auto_mem_exact_by_sport", {})
        if not isinstance(legacy_auto_by_sport, dict):
            legacy_auto_by_sport = {}

        auto_override_sets = {}
        case_override_sets = {}
        for sk in sport_rule_map.keys():
            sport_overrides = overrides_by_sport.get(sk, {})
            if not isinstance(sport_overrides, dict):
                sport_overrides = {}

            auto_values = []
            case_values = []

            raw_auto = sport_overrides.get("auto_mem", [])
            if isinstance(raw_auto, list):
                auto_values.extend(raw_auto)
            legacy_raw_auto = legacy_auto_by_sport.get(sk, [])
            if isinstance(legacy_raw_auto, list):
                auto_values.extend(legacy_raw_auto)

            raw_case = sport_overrides.get("case_hit", [])
            if isinstance(raw_case, list):
                case_values.extend(raw_case)

            auto_override_sets[sk] = {normalize_box_type_text(v) for v in auto_values if str(v).strip()}
            case_override_sets[sk] = {normalize_box_type_text(v) for v in case_values if str(v).strip()}

        # Faster category assignment: compute once per unique Box Type per sport.
        df["Normalized Box Type"] = df["Box Type"].apply(normalize_box_type_text)
        df["Category"] = CATEGORY_BASE_OTHER
        sport_series = (
            df["Sport"].astype(str) if "Sport" in df.columns else pd.Series([selected_sport_key] * len(df), index=df.index)
        )
        for sk in sport_series.dropna().astype(str).unique().tolist():
            mask = sport_series == sk
            rules = sport_rule_map.get(sk, category_rules)
            auto_set = auto_override_sets.get(sk, set())
            case_set = case_override_sets.get(sk, set())
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
        df.drop(columns=["Normalized Box Type"], inplace=True, errors="ignore")
        df['Rarity Mult'] = df['Numbering'].apply(rarity_multiplier)
        df['Score'] = df['Category'].apply(calculate_score) * df['Rarity Mult']

        # Rebuild exploded frames after scoring/filtering
        df_p = df.copy()
        df_p['Player Raw'] = df_p['Player'].astype(str).str.strip()
        df_p['Team Raw'] = df_p['Team'].astype(str).str.strip()
        df_p['Is Multi-Player Card'] = df_p['Player Raw'].str.contains('/', na=False)
        df_p['Player List'] = df_p['Player Raw'].apply(split_slash_values)
        df_p['Team List'] = df_p['Team Raw'].apply(split_slash_values)
        df_p['Player Count'] = df_p['Player List'].apply(len)
        df_p['Team Count'] = df_p['Team List'].apply(len)
        df_p['Is Player-Team Aligned'] = (df_p['Player Count'] == df_p['Team Count']) & (df_p['Player Count'] > 1)
        df_p = df_p.reset_index(drop=True)
        df_p['Card Row Id'] = df_p.index
        df_p = df_p.explode('Player List')
        df_p['Player Position'] = df_p.groupby('Card Row Id').cumcount()
        df_p['Player'] = df_p['Player List'].astype(str).str.strip()
        df_p = df_p[df_p['Player'] != ""].copy()

        def resolve_player_team(row):
            team_list = row.get('Team List', [])
            player_pos = row.get('Player Position', 0)
            if isinstance(team_list, list) and row.get('Is Player-Team Aligned', False):
                if 0 <= player_pos < len(team_list):
                    return str(team_list[player_pos]).strip()
            return row.get('Team Raw', '')

        df_p['Team'] = df_p.apply(resolve_player_team, axis=1)

        df_t = df.copy()
        df_t['Team'] = df_t['Team'].astype(str).str.split('/')
        df_t = df_t.explode('Team')
        df_t['Team'] = df_t['Team'].str.strip()

        if selection == "🌍 Vue Globale":
            # --- Aggregation Global ---
            
            # Group by Player using Exploded DF
            player_stats = df_p.groupby('Player').agg({
                'Hits': 'sum'
            }).reset_index()
            
            # Group by Team using Exploded DF
            team_stats = df_t.groupby('Team').agg({
                'Hits': 'sum'
            }).reset_index()
            
            # --- Global Search ---
            all_players_global = sorted(player_stats['Player'].unique().tolist())
            search_player = st.selectbox("🔍 Recherche Rapide Joueur (Tous les joueurs) :", [""] + all_players_global, key="global_search")
            
            if search_player:
                st.session_state['target_player'] = search_player
                go_to_view("🔍 Analyse Joueur")

            # --- Top 15 Logic ---
            col1, col2 = st.columns(2)
            
            with col1:
                st.subheader("🏆 Classement Joueurs (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_players = player_stats.sort_values(by='Hits', ascending=False)
                show_all_players = st.checkbox("Afficher tout", value=False, key="global_players_show_all")
                display_players = sorted_players if show_all_players else sorted_players.head(50)
                
                # Dataframe with selection
                event_p = st.dataframe(
                    display_players, 
                    use_container_width=True, 
                    selection_mode="single-row",
                    on_select="rerun",
                    key="global_players_table"
                )
                
                # Handle Selection
                row_idx = get_selected_row(event_p)
                if row_idx is not None:
                    selected_player_name = sorted_players.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")

                # Top 15 for Chart
                fig_p = px.bar(sorted_players.head(15), x='Player', y='Hits', title="Top 15 Joueurs", color='Hits')
                st.plotly_chart(fig_p, use_container_width=True)

            with col2:
                st.subheader("🛡️ Classement Équipes (Global)")
                st.markdown("*(Cliquez sur une ligne pour voir le détail)*")
                
                # Full sorted list for Table
                sorted_teams = team_stats.sort_values(by='Hits', ascending=False)
                show_all_teams = st.checkbox("Afficher tout", value=False, key="global_teams_show_all")
                display_teams = sorted_teams if show_all_teams else sorted_teams.head(50)
                
                # Dataframe with selection
                event_t = st.dataframe(
                    display_teams, 
                    use_container_width=True, 
                    selection_mode="single-row",
                    on_select="rerun",
                    key="global_teams_table"
                )

                # Handle Selection
                row_idx = get_selected_row(event_t)
                if row_idx is not None:
                    selected_team_name = sorted_teams.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                
                # Top 15 for Chart
                fig_t = px.bar(sorted_teams.head(15), x='Team', y='Hits', title="Top 15 Équipes", color='Hits')
                st.plotly_chart(fig_t, use_container_width=True)

        elif selection == "💎 Autos & Patchs":
            st.subheader("Analyse Autographes & Memorabilia")
            st.info("Filtre sur les mots clés du sport sélectionné (auto/mem).")
            
            # Filter Dataframes
            df_p_filtered = df_p[df_p['Category'] == CATEGORY_AUTO_MEM]
            df_t_filtered = df_t[df_t['Category'] == CATEGORY_AUTO_MEM]
            
            # Group by Player
            player_stats_f = df_p_filtered.groupby('Player').agg({'Hits': 'sum'}).reset_index()
            # Group by Team
            team_stats_f = df_t_filtered.groupby('Team').agg({'Hits': 'sum'}).reset_index()
            
            col_f1, col_f2 = st.columns(2)
            
            with col_f1:
                st.subheader("✒️ Classement Joueurs (Autos/Mem)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_f = player_stats_f.sort_values(by='Hits', ascending=False)
                
                event_pf = st.dataframe(
                    sorted_players_f,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="auto_players_table"
                )
                
                row_idx = get_selected_row(event_pf)
                if row_idx is not None:
                    selected_player_name = sorted_players_f.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                fig_pf = px.bar(sorted_players_f.head(15), x='Player', y='Hits', color='Hits')
                st.plotly_chart(fig_pf, use_container_width=True)
                
            with col_f2:
                st.subheader("🛡️ Classement Équipes (Autos/Mem)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_f = team_stats_f.sort_values(by='Hits', ascending=False)
                
                event_tf = st.dataframe(
                    sorted_teams_f,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="auto_teams_table"
                )
                
                row_idx = get_selected_row(event_tf)
                if row_idx is not None:
                    selected_team_name = sorted_teams_f.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                fig_tf = px.bar(sorted_teams_f.head(15), x='Team', y='Hits', color='Hits')
                st.plotly_chart(fig_tf, use_container_width=True)

        elif selection == "🔥 Logoman":
            st.subheader("🔥 Analyse Logoman")
            st.info("Filtre sur les mots-clés logoman/logo patch du sport sélectionné.")
            
            # Filter Dataframes
            df_p_logoman = df_p[df_p['Category'] == CATEGORY_LOGOMAN]
            df_t_logoman = df_t[df_t['Category'] == CATEGORY_LOGOMAN]
            
            # Group by Player
            player_stats_l = df_p_logoman.groupby('Player').agg({'Hits': 'sum'}).reset_index()
            # Group by Team
            team_stats_l = df_t_logoman.groupby('Team').agg({'Hits': 'sum'}).reset_index()
            
            col_l1, col_l2 = st.columns(2)
            
            with col_l1:
                st.subheader("🔥 Classement Joueurs (Logoman)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_l = player_stats_l.sort_values(by='Hits', ascending=False)
                
                event_pl = st.dataframe(
                    sorted_players_l,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="logoman_players_table"
                )
                
                row_idx = get_selected_row(event_pl)
                if row_idx is not None:
                    selected_player_name = sorted_players_l.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                fig_pl = px.bar(sorted_players_l.head(15), x='Player', y='Hits', color='Hits')
                st.plotly_chart(fig_pl, use_container_width=True)
                
            with col_l2:
                st.subheader("🔥 Classement Équipes (Logoman)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_l = team_stats_l.sort_values(by='Hits', ascending=False)
                
                event_tl = st.dataframe(
                    sorted_teams_l,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="logoman_teams_table"
                )
                
                row_idx = get_selected_row(event_tl)
                if row_idx is not None:
                    selected_team_name = sorted_teams_l.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                fig_tl = px.bar(sorted_teams_l.head(15), x='Team', y='Hits', color='Hits')
                st.plotly_chart(fig_tl, use_container_width=True)

        elif selection == "✨ Case Hits":
            st.subheader("✨ Analyse Case Hits (Downtown, Kaboom, Color Blast, Manga...)")
            # Keywords display
            st.info("Filtre sur les mots-clés Case Hits configurés pour le sport sélectionné.")

            df_p_ch = df_p[df_p['Category'] == CATEGORY_CASE_HIT]
            df_t_ch = df_t[df_t['Category'] == CATEGORY_CASE_HIT]
            
            # Group by Player with details
            player_stats_ch = df_p_ch.groupby('Player').agg({
                'Hits': 'sum',
                'Box Type': lambda x: ', '.join(sorted(list(set(str(v) for v in x)))),
                'File': lambda x: ', '.join(sorted(list(set(str(v) for v in x))))
            }).reset_index()
            player_stats_ch.rename(columns={'Box Type': 'Variantes', 'File': 'Box / Checklist'}, inplace=True)
            
            # Group by Team with details
            team_stats_ch = df_t_ch.groupby('Team').agg({
                'Hits': 'sum',
                'Box Type': lambda x: ', '.join(sorted(list(set(str(v) for v in x)))),
                'File': lambda x: ', '.join(sorted(list(set(str(v) for v in x))))
            }).reset_index()
            team_stats_ch.rename(columns={'Box Type': 'Variantes', 'File': 'Box / Checklist'}, inplace=True)
            
            col_ch1, col_ch2 = st.columns(2)
            
            with col_ch1:
                st.subheader("✨ Classement Joueurs (Case Hits)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_players_ch = player_stats_ch.sort_values(by='Hits', ascending=False)
                
                event_pch = st.dataframe(
                    sorted_players_ch,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="ch_players_table"
                )
                
                row_idx = get_selected_row(event_pch)
                if row_idx is not None:
                    selected_player_name = sorted_players_ch.iloc[row_idx]['Player']
                    st.session_state['target_player'] = selected_player_name
                    go_to_view("🔍 Analyse Joueur")
                    
                if not sorted_players_ch.empty:
                    fig_pch = px.bar(sorted_players_ch.head(15), x='Player', y='Hits', color='Hits', title="Top Players - Case Hits")
                    st.plotly_chart(fig_pch, use_container_width=True)
                else:
                    st.info("Aucun Case Hit trouvé pour les joueurs.")
                
            with col_ch2:
                st.subheader("✨ Classement Équipes (Case Hits)")
                st.markdown("*(Cliquez pour le détail)*")
                sorted_teams_ch = team_stats_ch.sort_values(by='Hits', ascending=False)
                
                event_tch = st.dataframe(
                    sorted_teams_ch,
                    use_container_width=True,
                    selection_mode="single-row",
                    on_select="rerun",
                    key="ch_teams_table"
                )
                
                row_idx = get_selected_row(event_tch)
                if row_idx is not None:
                    selected_team_name = sorted_teams_ch.iloc[row_idx]['Team']
                    st.session_state['target_team'] = selected_team_name
                    go_to_view("🛡️ Analyse Équipe")
                    
                if not sorted_teams_ch.empty:
                    fig_tch = px.bar(sorted_teams_ch.head(15), x='Team', y='Hits', color='Hits', title="Top Teams - Case Hits")
                    st.plotly_chart(fig_tch, use_container_width=True)
                else:
                    st.info("Aucun Case Hit trouvé pour les équipes.")

        elif selection == "🧪 Détection Auto/Mem":
            st.subheader("🧪 Détection Auto/Mem + Case Hit (par checklist)")
            st.caption("Coche Auto/Mem et/ou Case Hit pour chaque Card Type, puis enregistre.")

            sport_overrides = overrides_by_sport.get(selected_sport_key, {})
            if not isinstance(sport_overrides, dict):
                sport_overrides = {}
            current_auto_overrides = sport_overrides.get("auto_mem", [])
            current_case_overrides = sport_overrides.get("case_hit", [])
            if not isinstance(current_auto_overrides, list):
                current_auto_overrides = []
            if not isinstance(current_case_overrides, list):
                current_case_overrides = []

            # Migrate/display legacy auto overrides if still present.
            legacy_auto = keyword_overrides_root.get("auto_mem_exact_by_sport", {})
            if isinstance(legacy_auto, dict):
                legacy_values = legacy_auto.get(selected_sport_key, [])
                if isinstance(legacy_values, list):
                    current_auto_overrides = sorted(set(current_auto_overrides + legacy_values))

            current_auto_set = {normalize_box_type_text(v) for v in current_auto_overrides}
            current_case_set = {normalize_box_type_text(v) for v in current_case_overrides}

            review_df = build_category_review_by_file(df)
            if review_df.empty:
                st.info("Aucune donnée exploitable pour cette détection.")
            else:
                review_df["Norm"] = review_df["Box Type"].apply(normalize_box_type_text)
                candidate_mask = (
                    (review_df["Category"] == CATEGORY_BASE_OTHER)
                    | (review_df["Norm"].isin(current_auto_set))
                    | (review_df["Norm"].isin(current_case_set))
                )
                candidate_df = review_df[candidate_mask].copy()

                if candidate_df.empty:
                    st.info("Aucun Card Type à corriger pour l'instant.")
                else:
                    checklist_names = sorted(candidate_df["File"].unique().tolist())
                    selected_checklists = st.multiselect(
                        "Filtrer les checklists",
                        options=checklist_names,
                        default=checklist_names,
                        key=f"category_review_files_{selected_sport_key}",
                    )
                    working_df = candidate_df[candidate_df["File"].isin(selected_checklists)].copy()

                    text_filter = st.text_input(
                        "Filtrer les Card Type (texte)",
                        value="",
                        key=f"category_review_filter_{selected_sport_key}",
                    ).strip().lower()
                    if text_filter:
                        working_df = working_df[
                            working_df["Box Type"].astype(str).str.lower().str.contains(re.escape(text_filter), na=False)
                        ]

                    def checkbox_keys(file_name, box_type):
                        key_hash = hashlib.md5(
                            f"{selected_sport_key}|{file_name}|{box_type}".encode("utf-8")
                        ).hexdigest()[:12]
                        return f"cat_auto_chk_{key_hash}", f"cat_case_chk_{key_hash}"

                    # Initialize checkbox states for all candidates, not only filtered rows.
                    for _, row in candidate_df.iterrows():
                        file_name = str(row["File"])
                        box_type = str(row["Box Type"])
                        norm_box = normalize_box_type_text(box_type)
                        auto_key, case_key = checkbox_keys(file_name, box_type)
                        if auto_key not in st.session_state:
                            st.session_state[auto_key] = norm_box in current_auto_set
                        if case_key not in st.session_state:
                            st.session_state[case_key] = norm_box in current_case_set

                    if st.button("Recharger les cases depuis la config", key=f"category_review_reload_{selected_sport_key}"):
                        for _, row in candidate_df.iterrows():
                            file_name = str(row["File"])
                            box_type = str(row["Box Type"])
                            norm_box = normalize_box_type_text(box_type)
                            auto_key, case_key = checkbox_keys(file_name, box_type)
                            st.session_state[auto_key] = norm_box in current_auto_set
                            st.session_state[case_key] = norm_box in current_case_set
                        st.rerun()

                    for checklist in sorted(working_df["File"].unique().tolist()):
                        file_rows = working_df[working_df["File"] == checklist].copy()
                        with st.expander(f"{checklist} ({len(file_rows)})", expanded=False):
                            for _, row in file_rows.iterrows():
                                box_type = str(row["Box Type"])
                                hits = int(row["Hits"])
                                auto_key, case_key = checkbox_keys(checklist, box_type)
                                c1, c2, c3 = st.columns([6, 2, 2])
                                with c1:
                                    st.write(f"{box_type} • {hits} hit(s)")
                                with c2:
                                    st.checkbox("Auto/Mem", key=auto_key)
                                with c3:
                                    st.checkbox("Case Hit", key=case_key)

                    checked_auto = set()
                    checked_case = set()
                    for _, row in candidate_df.iterrows():
                        file_name = str(row["File"])
                        box_type = str(row["Box Type"])
                        auto_key, case_key = checkbox_keys(file_name, box_type)
                        if st.session_state.get(auto_key, False):
                            checked_auto.add(box_type)
                        if st.session_state.get(case_key, False):
                            checked_case.add(box_type)

                    overlap_count = len({normalize_box_type_text(v) for v in checked_auto} & {normalize_box_type_text(v) for v in checked_case})
                    if overlap_count > 0:
                        st.caption(
                            f"{overlap_count} Card Type cochés dans les deux colonnes (priorité Case Hit)."
                        )
                    st.caption(
                        f"{len(checked_auto)} Auto/Mem cochés • {len(checked_case)} Case Hit cochés."
                    )

                    if st.button("💾 Enregistrer la sélection", key=f"category_review_save_{selected_sport_key}"):
                        # If same text appears in both, keep Case Hit priority.
                        case_norm = {normalize_box_type_text(v) for v in checked_case}
                        final_auto = sorted(v for v in checked_auto if normalize_box_type_text(v) not in case_norm)
                        final_case = sorted(checked_case)

                        new_root = dict(keyword_overrides_root)
                        by_sport = new_root.get("exact_category_by_sport", {})
                        if not isinstance(by_sport, dict):
                            by_sport = {}
                        by_sport[selected_sport_key] = {
                            "auto_mem": final_auto,
                            "case_hit": final_case,
                        }
                        new_root["exact_category_by_sport"] = by_sport

                        # Cleanup migrated legacy key for this sport.
                        legacy = new_root.get("auto_mem_exact_by_sport", {})
                        if isinstance(legacy, dict) and selected_sport_key in legacy:
                            del legacy[selected_sport_key]
                            new_root["auto_mem_exact_by_sport"] = legacy

                        try:
                            save_keyword_overrides(
                                keyword_overrides_path,
                                new_root,
                                r2_enabled=r2_enabled,
                                r2_config=r2_config,
                            )
                            st.success(
                                f"Configuration enregistrée ({len(final_auto)} Auto/Mem, {len(final_case)} Case Hit)."
                            )
                            st.cache_data.clear()
                            st.rerun()
                        except Exception as e:
                            st.error(f"Sauvegarde impossible: {e}")

        elif selection == "👥 Multi-Joueurs":
            st.subheader("👥 Analyse Multi-Joueurs / Dual / Triple")
            st.info("Liste des cartes comportant plusieurs joueurs (séparés par un '/')")
            
            # Filter original df for '/'
            multi_player_df = df[df['Player'].astype(str).str.contains('/', na=False)]
            
            # Extract unique players involved in these cards for the filter
            unique_multi_players = sorted(list(set([p.strip() for sublist in multi_player_df['Player'].str.split('/') for p in sublist])))
            
            # Filter Box
            selected_multi_player = st.selectbox("Filtrer par joueur inclus :", ["Tous"] + unique_multi_players)
            
            if selected_multi_player != "Tous":
                 # Filter rows where the selected player is present in the split list
                 multi_player_df = multi_player_df[multi_player_df['Player'].apply(lambda x: selected_multi_player in [p.strip() for p in x.split('/')])]

            st.markdown(f"**Nombre de cartes :** {len(multi_player_df)}")
            
            col_m1, col_m2 = st.columns([2, 1])
            
            with col_m1:
                st.dataframe(multi_player_df, use_container_width=True)
                
            with col_m2:
                st.markdown("#### Stats Rapides")
                # Count pairs/groups
                top_combinations = multi_player_df['Player'].value_counts().reset_index()
                top_combinations.columns = ['Combinaison', 'Hits']
                st.dataframe(top_combinations, use_container_width=True)
                
        elif selection == "⚖️ Comparateur Joueurs":
            st.subheader("⚖️ Comparateur de Joueurs")
            st.info("Sélectionnez plusieurs joueurs pour comparer leurs stats.")
            
            # Get list of players
            all_players_comp = sorted(df_p['Player'].unique().tolist())

            def parse_player_list(raw_text):
                if not raw_text:
                    return []
                parts = re.split(r"[,\n;]+", raw_text)
                return [p.strip() for p in parts if p.strip()]

            if "compare_list_active" not in st.session_state:
                st.session_state.compare_list_active = False
            if "compare_list_players" not in st.session_state:
                st.session_state.compare_list_players = []

            st.markdown("##### Comparer une liste")
            raw_list = st.text_area(
                "Colle ta liste (1 par ligne ou séparé par virgule)",
                key="compare_list_text"
            )
            col_cmp1, col_cmp2 = st.columns([1, 1])
            with col_cmp1:
                if st.button("Comparer la liste", key="compare_list_btn"):
                    parsed = parse_player_list(raw_list)
                    st.session_state.compare_list_players = parsed
                    st.session_state.compare_list_active = True
            with col_cmp2:
                if st.button("Revenir à la sélection", key="compare_list_reset"):
                    st.session_state.compare_list_active = False

            if st.session_state.compare_list_active:
                selected_players_comp = st.session_state.compare_list_players
                st.caption(f"{len(selected_players_comp)} joueur(s) collé(s).")
            else:
                selected_players_comp = st.multiselect("Choix des joueurs :", all_players_comp)

            if selected_players_comp:
                comparison_data = []
                
                for p in selected_players_comp:
                    # Filter data
                    p_data = df_p[df_p['Player'] == p].copy()
                    p_data['Rarity Mult'] = p_data['Numbering'].apply(rarity_multiplier)
                    
                    total = p_data['Hits'].sum()
                    cat_counts = p_data['Category'].value_counts()
                    logo = cat_counts.get("🔥 Logoman", 0)
                    case_hit = cat_counts.get("✨ Case Hit", 0)
                    auto = cat_counts.get("💎 Auto/Mem", 0)
                    base = cat_counts.get("📄 Base/Autre", 0)
                    score = (p_data['Category'].apply(calculate_score) * p_data['Rarity Mult']).sum()
                    
                    comparison_data.append({
                        "Joueur": p,
                        "Total Cartes": total,
                        "Score": round(score, 2),
                        "🔥 Logoman": logo,
                        "✨ Case Hit": case_hit,
                        "💎 Auto/Mem": auto,
                        "📄 Base/Autre": base
                    })
                
                comp_df = pd.DataFrame(comparison_data)
                
                # Sorting option? Default by Score
                st.dataframe(comp_df.sort_values(by="Score", ascending=False), use_container_width=True)
                
                total_row = {
                    "Joueur": "TOTAL",
                    "Total Cartes": comp_df["Total Cartes"].sum(),
                    "Score": round(comp_df["Score"].sum(), 2),
                    "🔥 Logoman": comp_df["🔥 Logoman"].sum(),
                    "✨ Case Hit": comp_df["✨ Case Hit"].sum(),
                    "💎 Auto/Mem": comp_df["💎 Auto/Mem"].sum(),
                    "📄 Base/Autre": comp_df["📄 Base/Autre"].sum(),
                }
                st.markdown("##### Total global")
                st.dataframe(pd.DataFrame([total_row]), use_container_width=True)
                col_tot1, col_tot2, col_tot3, col_tot4, col_tot5, col_tot6 = st.columns(6)
                col_tot1.metric("Total Cartes", total_row["Total Cartes"])
                col_tot2.metric("Score", total_row["Score"])
                col_tot3.metric("🔥 Logoman", total_row["🔥 Logoman"])
                col_tot4.metric("✨ Case Hit", total_row["✨ Case Hit"])
                col_tot5.metric("💎 Auto/Mem", total_row["💎 Auto/Mem"])
                col_tot6.metric("📄 Base/Autre", total_row["📄 Base/Autre"])

                missing = [p for p in selected_players_comp if p not in all_players_comp]
                if missing:
                    st.warning(f"Introuvable(s) dans les données: {', '.join(missing)}")

                # Chart
                fig_comp = px.bar(comp_df, x="Joueur", y=["🔥 Logoman", "✨ Case Hit", "💎 Auto/Mem", "📄 Base/Autre"], title="Comparaison Visuelle", barmode='stack')
                st.plotly_chart(fig_comp, use_container_width=True)


        elif selection == "🧠 Value Picks":
            st.subheader("🧠 Value Picks")
            st.info(
                "La note combine le type de carte (Logoman > Case Hit > Auto/Mem > Base) "
                "et la rareté (numérotation faible = bonus). "
                "Le Value Index = Score / Hype (moins hype = meilleur value)."
            )

            player_scores = df.groupby("Player").agg({
                "Hits": "sum",
                "Score": "sum",
            }).reset_index()
            player_scores["Hype"] = player_scores["Player"].apply(lambda x: get_hype_multiplier(x, hype_map))
            player_scores["Value Index"] = player_scores["Score"] / player_scores["Hype"].replace(0, 1)

            player_scores = player_scores.sort_values(by="Value Index", ascending=False)
            st.dataframe(player_scores.head(50), use_container_width=True)

            top20 = player_scores.head(20)
            csv_data = top20.to_csv(index=False).encode("utf-8")
            st.download_button("Exporter Top 20 (CSV)", data=csv_data, file_name="top20_value_picks.csv", mime="text/csv")

        elif selection == "💸 Cost par Pick":
            st.subheader("💸 Cost par Pick")
            st.info(
                "Renseigne le coût par équipe pour obtenir le meilleur rapport qualité/prix."
            )

            default_cost = st.number_input("Coût par spot (par équipe)", min_value=0.0, value=25.0, step=0.5)

            teams = sorted(df['Team'].dropna().unique().tolist())
            if "cost_by_team" not in st.session_state:
                st.session_state.cost_by_team = pd.DataFrame({
                    "Team": teams,
                    "Cost per spot": [default_cost] * len(teams),
                })
            else:
                for t in teams:
                    if t not in st.session_state.cost_by_team["Team"].tolist():
                        st.session_state.cost_by_team = pd.concat(
                            [
                                st.session_state.cost_by_team,
                                pd.DataFrame({"Team": [t], "Cost per spot": [default_cost]}),
                            ],
                            ignore_index=True,
                        )

            cost_df = st.data_editor(
                st.session_state.cost_by_team,
                use_container_width=True,
                hide_index=True,
                num_rows="fixed",
            )
            st.session_state.cost_by_team = cost_df

            cost_map = dict(zip(
                st.session_state.cost_by_team["Team"],
                st.session_state.cost_by_team["Cost per spot"],
            ))

            df_cost = df.copy()
            df_cost["Cost"] = df_cost["Team"].map(cost_map).fillna(default_cost)
            df_cost["Value per Cost"] = df_cost["Score"] / df_cost["Cost"].replace(0, 1)

            team_cost = df_cost.groupby("Team").agg({
                "Hits": "sum",
                "Score": "sum",
                "Cost": "sum",
            }).reset_index()
            team_cost["Value/€"] = team_cost["Score"] / team_cost["Cost"].replace(0, 1)
            team_cost = team_cost.sort_values(by="Value/€", ascending=False)
            st.subheader("🛡️ Équipes (meilleur value)")
            st.dataframe(team_cost.head(50), use_container_width=True)

        elif selection == "🧨 Rookies":
            st.subheader("🧨 Rookies en vue")
            st.info("Détection via 'RC' ou 'Rookie' dans le type de carte.")

            st.markdown("#### Top rookies hype par annee (draft)")
            if top_rookies_by_year:
                rookie_rows = [
                    {"Annee": year, "Top 6": ", ".join(names)}
                    for year, names in sorted(top_rookies_by_year.items())
                ]
                st.dataframe(pd.DataFrame(rookie_rows), use_container_width=True)
            else:
                st.caption("Pas de liste rookies configurée pour ce sport.")

            df_rookie = df[df['Box Type'].astype(str).str.contains(r"\brc\b|rookie", case=False, na=False)]
            if df_rookie.empty:
                st.info("Aucun rookie détecté sur ce filtre.")
            else:
                rookies = df_rookie.groupby("Player").agg({
                    "Hits": "sum",
                    "Score": "sum",
                }).reset_index()
                rookies = rookies.sort_values(by="Score", ascending=False)
                st.dataframe(rookies.head(50), use_container_width=True)

        elif selection == "⚡ Live Mode":
            st.subheader("⚡ Live Mode (Pick rapide)")
            st.info("Top picks instantanés basés sur le score.")

            player_scores = df.groupby("Player").agg({"Score": "sum"}).reset_index()
            team_scores = df.groupby("Team").agg({"Score": "sum"}).reset_index()
            top_players = player_scores.sort_values(by="Score", ascending=False).head(5)
            top_teams = team_scores.sort_values(by="Score", ascending=False).head(5)

            col_lp, col_lt = st.columns(2)
            with col_lp:
                st.markdown("#### Top 5 Joueurs")
                for _, row in top_players.iterrows():
                    st.metric(row["Player"], f"{row['Score']:.1f}")
            with col_lt:
                st.markdown("#### Top 5 Équipes")
                for _, row in top_teams.iterrows():
                    st.metric(row["Team"], f"{row['Score']:.1f}")

        elif selection == "🧩 Simulation de Break":
            st.subheader("🧩 Simulation de Break")
            st.caption("Vue déterministe basée sur la checklist (sans Monte Carlo).")

            available_products = sorted(df["Product"].dropna().astype(str).str.strip().unique().tolist())
            available_products = [p for p in available_products if p]
            if not available_products:
                st.info("Aucun produit disponible pour la simulation.")
            else:
                method_label_to_key = {v: k for k, v in SIM_METHOD_LABELS.items()}
                method_labels = list(SIM_METHOD_LABELS.values())

                cfg_col1, cfg_col2 = st.columns(2)
                with cfg_col1:
                    selected_method_label = st.selectbox("Méthode de break", method_labels, key="sim_method_label")
                with cfg_col2:
                    selected_product = st.selectbox("Produit (box/case)", available_products, key="sim_product")

                selected_method = method_label_to_key[selected_method_label]

                sim_df = df[df["Product"] == selected_product].copy()
                sim_pool = build_break_simulation_pool(sim_df)
                if sim_pool.empty:
                    st.warning("Le produit sélectionné n'a pas de données exploitables pour la simulation.")
                else:
                    st.caption(
                        f"Checklist chargée: {len(sim_pool)} lignes • "
                        f"{sim_pool['Player'].nunique()} joueurs • {sim_pool['Team'].nunique()} équipes"
                    )

                    custom_scope = "teams"
                    custom_spots = []
                    custom_map = {}
                    if selected_method == SIM_METHOD_CUSTOM:
                        st.markdown("#### Configuration break personnalisé")
                        custom_scope_label = st.radio(
                            "Construire les spots à partir de",
                            options=["Équipes", "Joueurs"],
                            horizontal=True,
                            key="sim_custom_scope_label",
                        )
                        custom_scope = "players" if custom_scope_label == "Joueurs" else "teams"
                        source_entities = []
                        if custom_scope == "players":
                            for values in sim_pool["Player List"].tolist():
                                source_entities.extend(values)
                        else:
                            for values in sim_pool["Team List"].tolist():
                                source_entities.extend(values)
                        source_entities = sorted(_ordered_unique(source_entities))

                        suggested_spot_count = min(24, max(2, len(source_entities) // 3 if source_entities else 2))
                        spot_count = int(
                            st.number_input(
                                "Nombre de spots personnalisés",
                                min_value=2,
                                max_value=100,
                                value=suggested_spot_count,
                                step=1,
                                key="sim_custom_spot_count",
                            )
                        )
                        default_spot_names = "\n".join([f"Spot {i+1}" for i in range(spot_count)])
                        spot_names_text = st.text_area(
                            "Noms des spots (1 par ligne)",
                            value=default_spot_names,
                            key="sim_custom_spot_names_text",
                            height=160,
                        )
                        parsed_spots = [line.strip() for line in spot_names_text.splitlines() if line.strip()]
                        custom_spots = _ordered_unique(parsed_spots)[:100]

                        if not custom_spots:
                            st.warning("Ajoute au moins un spot personnalisé.")
                        else:
                            assign_df = pd.DataFrame({"Entité": source_entities, "Spot": [""] * len(source_entities)})
                            assign_state_key = f"sim_custom_assign_{selected_sport_key}_{selected_product}_{custom_scope}"
                            previous_assign = st.session_state.get(assign_state_key, pd.DataFrame())
                            if (
                                isinstance(previous_assign, pd.DataFrame)
                                and not previous_assign.empty
                                and set(previous_assign.columns) >= {"Entité", "Spot"}
                            ):
                                previous_map = dict(
                                    zip(
                                        previous_assign["Entité"].astype(str).tolist(),
                                        previous_assign["Spot"].astype(str).tolist(),
                                    )
                                )
                                assign_df["Spot"] = assign_df["Entité"].map(previous_map).fillna("")

                            st.caption("Affectation manuelle des entités aux spots (style drag-and-drop via éditeur).")
                            edited_assign = st.data_editor(
                                assign_df,
                                key=assign_state_key,
                                use_container_width=True,
                                hide_index=True,
                                column_config={
                                    "Entité": st.column_config.TextColumn("Entité", disabled=True),
                                    "Spot": st.column_config.SelectboxColumn("Spot", options=[""] + custom_spots),
                                },
                            )
                            custom_map = {
                                str(row["Entité"]).strip(): str(row["Spot"]).strip()
                                for _, row in edited_assign.iterrows()
                                if str(row.get("Spot", "")).strip() in custom_spots
                            }

                    compare_mode = st.checkbox("Mode comparaison (2 méthodes côte à côte)", value=False, key="sim_compare_mode")
                    compare_method = None
                    if compare_mode:
                        compare_candidates = [SIM_METHOD_LETTER, SIM_METHOD_TEAM]
                        compare_candidates = [m for m in compare_candidates if m != selected_method]
                        compare_method = st.selectbox(
                            "Méthode à comparer",
                            options=compare_candidates,
                            format_func=lambda m: SIM_METHOD_LABELS[m],
                            key="sim_compare_method",
                        )

                    spots = custom_spots if selected_method == SIM_METHOD_CUSTOM else build_default_spots(sim_pool, selected_method)

                    if len(spots) == 0:
                        st.error("Aucun spot disponible pour la simulation.")
                    elif len(spots) > 100:
                        st.error("Limite dépassée: maximum 100 spots.")
                    else:
                        result_df, fairness_summary = build_deterministic_spot_summary(
                            pool_df=sim_pool,
                            method=selected_method,
                            spots=spots,
                            custom_scope=custom_scope,
                            custom_map=custom_map,
                        )
                        player_map = build_spot_player_map(
                            sim_pool,
                            selected_method,
                            custom_scope=custom_scope,
                            custom_map=custom_map,
                            custom_spots=spots,
                        )
                        result_df["Nombre de joueurs"] = result_df["Spot"].apply(lambda s: len(player_map.get(s, set())))
                        result_df["Joueurs (aperçu)"] = result_df["Spot"].apply(
                            lambda s: ", ".join(sorted(list(player_map.get(s, set())))[:8])
                        )

                        st.markdown("#### Résultats de simulation")
                        c_metric1, c_metric2, c_metric3, c_metric4 = st.columns(4)
                        c_metric1.metric("Méthode", SIM_METHOD_LABELS[selected_method])
                        c_metric2.metric("Spots", len(result_df))
                        c_metric3.metric("Valeur moyenne globale", f"{fairness_summary.get('global_mean_value', 0.0):.1f}")
                        c_metric4.metric("Équilibre global", fairness_summary.get("fairness_label", "-"))

                        st.markdown("#### Filtres & vues")
                        filter_col1, filter_col2, filter_col3, filter_col4 = st.columns(4)
                        with filter_col1:
                            visible_types = st.multiselect(
                                "Types de cartes visibles",
                                options=SIM_CARD_TYPE_COLUMNS,
                                default=SIM_CARD_TYPE_COLUMNS,
                                key="sim_visible_types",
                            )
                        with filter_col2:
                            sort_label = st.selectbox(
                                "Tri des spots",
                                options=list(SIM_SORT_OPTIONS.keys()),
                                key="sim_sort_label",
                            )
                        with filter_col3:
                            hot_only = st.checkbox("Hot spots uniquement", value=False, key="sim_hot_only")
                        with filter_col4:
                            player_search = st.text_input("Recherche joueur", value="", key="sim_player_search").strip().lower()

                        display_df = result_df.copy()
                        if hot_only:
                            display_df = display_df[display_df["Hot Spot"] == "🔥 Hot"]
                        if player_search:
                            display_df = display_df[
                                display_df["Joueurs (aperçu)"].astype(str).str.lower().str.contains(re.escape(player_search), na=False)
                            ]

                        sort_col = SIM_SORT_OPTIONS.get(sort_label, "Valeur Moyenne (proxy)")
                        sort_ascending = sort_col == "Spot"
                        display_df = display_df.sort_values(by=sort_col, ascending=sort_ascending).reset_index(drop=True)

                        rounded_cols = [
                            "Hits",
                            "Cartes de base",
                            "Rookies",
                            "Inserts",
                            "Parallèles",
                            "Autographes",
                            "Memorabilia/Patchs",
                            "Numérotées (/X)",
                            "1/1",
                            "Valeur Min (proxy)",
                            "Valeur Moyenne (proxy)",
                            "Valeur Max (proxy)",
                        ]
                        for col in rounded_cols:
                            if col in display_df.columns:
                                display_df[col] = display_df[col].round(2)

                        base_cols = [
                            "Spot",
                            "Nombre de joueurs",
                            "Hits",
                            "Valeur Min (proxy)",
                            "Valeur Moyenne (proxy)",
                            "Valeur Max (proxy)",
                            "Rareté",
                            "Hot Spot",
                            "Équilibre Spot",
                        ]
                        selected_cols = ["Spot", "Nombre de joueurs"]
                        selected_cols.extend([c for c in visible_types if c in display_df.columns])
                        selected_cols.extend(
                            [c for c in ["Valeur Min (proxy)", "Valeur Moyenne (proxy)", "Valeur Max (proxy)", "Rareté", "Hot Spot", "Équilibre Spot", "Joueurs (aperçu)"] if c in display_df.columns]
                        )
                        if not visible_types:
                            selected_cols = [c for c in base_cols + ["Joueurs (aperçu)"] if c in display_df.columns]

                        st.dataframe(display_df[selected_cols], use_container_width=True)

                        top_chart_df = display_df.head(25).copy()
                        if not top_chart_df.empty:
                            fig_sim = px.bar(
                                top_chart_df,
                                x="Spot",
                                y="Valeur Moyenne (proxy)",
                                color="Hot Spot",
                                hover_data=["Nombre de joueurs", "Hits", "Rareté"],
                                title="Valeur estimée par spot (proxy)",
                            )
                            st.plotly_chart(fig_sim, use_container_width=True)

                        if compare_mode and compare_method:
                            compare_spots = build_default_spots(sim_pool, compare_method)
                            compare_df, _ = build_deterministic_spot_summary(
                                pool_df=sim_pool,
                                method=compare_method,
                                spots=compare_spots,
                            )
                            compare_label = SIM_METHOD_LABELS.get(compare_method, "Méthode 2")
                            st.markdown("#### Mode comparaison")
                            cmp_col1, cmp_col2 = st.columns(2)
                            with cmp_col1:
                                st.caption(SIM_METHOD_LABELS[selected_method])
                                st.dataframe(
                                    display_df[["Spot", "Valeur Moyenne (proxy)", "Hits", "Hot Spot"]].head(20),
                                    use_container_width=True,
                                )
                            with cmp_col2:
                                st.caption(compare_label)
                                if compare_df.empty:
                                    st.info("Aucun résultat pour la méthode comparée.")
                                else:
                                    compare_df = compare_df.sort_values("Valeur Moyenne (proxy)", ascending=False).head(20)
                                    st.dataframe(
                                        compare_df[["Spot", "Valeur Moyenne (proxy)", "Hits", "Hot Spot"]],
                                        use_container_width=True,
                                    )

                        st.markdown("#### Export")
                        export_col1, export_col2 = st.columns(2)
                        with export_col1:
                            csv_data = display_df.to_csv(index=False).encode("utf-8")
                            st.download_button(
                                "Exporter CSV",
                                data=csv_data,
                                file_name=f"simulation_break_{selected_sport_key}.csv",
                                mime="text/csv",
                                key="sim_export_csv",
                            )
                        with export_col2:
                            json_payload = {
                                "config": {
                                    "method": selected_method,
                                    "method_label": SIM_METHOD_LABELS[selected_method],
                                    "product": selected_product,
                                    "custom_scope": custom_scope,
                                    "spots": spots,
                                },
                                "fairness": fairness_summary,
                                "rows": result_df.to_dict(orient="records"),
                            }
                            st.download_button(
                                "Exporter JSON",
                                data=json.dumps(json_payload, ensure_ascii=False, indent=2).encode("utf-8"),
                                file_name=f"simulation_break_{selected_sport_key}.json",
                                mime="application/json",
                                key="sim_export_json",
                            )

                        spot_copy_text = build_spot_export_text(display_df)
                        st.text_area(
                            "Liste des spots (copier/coller)",
                            value=spot_copy_text,
                            height=180,
                            key="sim_spot_copy_text",
                        )

        elif selection == " Par Fichier":
            st.subheader("Analyse par Fichier")
            
            all_files = sorted(df['File'].unique().tolist())
            selected_file = st.selectbox("Choisir une checklist :", all_files)
            
            if selected_file:
                file_df = df[df['File'] == selected_file].copy()
                
                total_hits = file_df['Hits'].sum()
                cat_counts = file_df['Category'].value_counts()
                
                col_fa1, col_fa2, col_fa3, col_fa4, col_fa5 = st.columns(5)
                col_fa1.metric("Total Cartes", total_hits)
                col_fa2.metric("🔥 Logoman", cat_counts.get("🔥 Logoman", 0))
                col_fa3.metric("✨ Case Hit", cat_counts.get("✨ Case Hit", 0))
                col_fa4.metric("💎 Auto/Mem", cat_counts.get("💎 Auto/Mem", 0))
                col_fa5.metric("📄 Base/Autre", cat_counts.get("📄 Base/Autre", 0))
                
                st.markdown("---")
                
                col_fa6, col_fa7 = st.columns(2)
                with col_fa6:
                    player_stats_file = file_df.groupby('Player').agg({'Hits': 'sum'}).reset_index()
                    player_stats_file = player_stats_file.sort_values(by='Hits', ascending=False)
                    st.subheader("🏆 Joueurs (Fichier)")
                    st.dataframe(player_stats_file, use_container_width=True)
                
                with col_fa7:
                    team_stats_file = file_df.groupby('Team').agg({'Hits': 'sum'}).reset_index()
                    team_stats_file = team_stats_file.sort_values(by='Hits', ascending=False)
                    st.subheader("🛡️ Équipes (Fichier)")
                    st.dataframe(team_stats_file, use_container_width=True)
                
                st.markdown("---")
                st.subheader("Détail des cartes")
                max_serial = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="file_serial")
                display_file_df = file_df.copy()
                if max_serial > 0:
                    display_file_df = display_file_df[
                        display_file_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial
                    ]
                st.dataframe(display_file_df[['Player', 'Team', 'Box Type', 'Numbering', 'Category', 'Hits']], use_container_width=True)

        elif selection == "🔍 Analyse Joueur":
            st.subheader("Analyse détaillée par Joueur")
            
            # Get list of players from Exploded DF
            all_players = df_p['Player'].value_counts().index.tolist()
            
            # Check for pre-selected player from navigation
            default_index = 0
            if 'target_player' in st.session_state and st.session_state['target_player'] in all_players:
                default_index = all_players.index(st.session_state['target_player'])
            
            selected_player = st.selectbox("Rechercher un joueur :", all_players, index=default_index, key="player_selector")
            
            if selected_player:
                # Filter data for this player
                player_data = df_p[df_p['Player'] == selected_player]
                
                # Metrics
                total_hits = player_data['Hits'].sum()
                multi_hits = player_data.loc[player_data['Is Multi-Player Card'].fillna(False), 'Hits'].sum()
                
                # Breakdown counts
                cat_counts = player_data['Category'].value_counts()
                count_logoman = cat_counts.get("🔥 Logoman", 0)
                count_casehit = cat_counts.get("✨ Case Hit", 0)
                count_auto = cat_counts.get("💎 Auto/Mem", 0)
                count_base = cat_counts.get("📄 Base/Autre", 0)

                col1, col2, col3, col4, col5 = st.columns(5)
                col1.metric("Total Cartes", total_hits)
                col2.metric("🔥 Logoman", count_logoman)
                col3.metric("✨ Case Hit", count_casehit)
                col4.metric("💎 Auto/Mem", count_auto)
                col5.metric("📄 Base/Autre", count_base)
                if multi_hits > 0:
                    st.caption(f"Info: {int(multi_hits)} carte(s) proviennent de combos multi-joueurs.")
                
                st.markdown("---")
                
                # --- Charts & Filter ---
                col_c1, col_c2 = st.columns(2)
                
                with col_c1:
                    st.subheader("Répartition par Type")
                    fig_cat = px.pie(player_data, names='Category', values='Hits', title=f"Types de cartes : {selected_player}", hole=0.3)
                    st.plotly_chart(fig_cat, use_container_width=True)
                    
                with col_c2:
                    st.subheader("Répartition par Fichier")
                    # Group by File
                    file_dist = player_data.groupby('File').agg({'Hits': 'sum'}).reset_index()
                    fig_dist = px.pie(file_dist, names='File', values='Hits', title=f"Répartition par Checklist : {selected_player}")
                    st.plotly_chart(fig_dist, use_container_width=True)
                
                st.markdown("---")
                st.subheader("Détail des cartes")
                
                # Filter by Category for the table
                filter_cat = st.radio("Filtrer le tableau par type :", CATEGORY_FILTER_OPTIONS, horizontal=True)
                max_serial_p = st.number_input("Filtre numérotation (<= /xx)", min_value=0, value=0, step=1, key="player_serial")
                
                if filter_cat != "Tous":
                    display_df = player_data[player_data['Category'] == filter_cat]
                else:
                    display_df = player_data
                if max_serial_p > 0:
                    display_df = display_df[
                        display_df['Numbering'].apply(parse_numbering).fillna(0) <= max_serial_p
                    ]

                display_df_view = display_df.copy()
                display_df_view['Multi-Joueurs'] = display_df_view['Is Multi-Player Card'].fillna(False).map({True: "Oui", False: ""})
                display_df_view['Combo Joueurs'] = display_df_view['Player Raw'].where(display_df_view['Is Multi-Player Card'].fillna(False), "")

                st.dataframe(
                    display_df_view[['Category', 'Box Type', 'Multi-Joueurs', 'Combo Joueurs', 'Numbering', 'Team', 'Hits', 'File']],
                    use_container_width=True,
                )

        elif selection == "🛡️ Analyse Équipe":
            st.subheader("Analyse détaillée par Équipe")

            all_teams = df_t['Team'].dropna().astype(str).str.strip()
            all_teams = [t for t in all_teams.unique().tolist() if t]
            all_teams = sorted(all_teams)

            if not all_teams:
                st.info("Aucune équipe trouvée dans la sélection actuelle.")
            else:
                default_index_t = 0
                if 'target_team' in st.session_state and st.session_state['target_team'] in all_teams:
                    default_index_t = all_teams.index(st.session_state['target_team'])

                selected_team = st.selectbox(
                    "Rechercher une équipe :",
                    all_teams,
                    index=default_index_t,
                    key="team_selector",
                )

                if selected_team:
                    team_cards = df_t[df_t['Team'] == selected_team].copy()
                    team_players = df_p[df_p['Team'] == selected_team].copy()

                    if team_cards.empty:
                        st.info("Aucune carte pour cette équipe.")
                    else:
                        total_hits_t = int(team_cards['Hits'].sum())
                        unique_players_t = int(team_players['Player'].nunique()) if not team_players.empty else 0
                        unique_files_t = int(team_cards['File'].nunique())
                        cat_counts_t = team_cards['Category'].value_counts()
                        count_logoman_t = int(cat_counts_t.get(CATEGORY_LOGOMAN, 0))
                        count_case_t = int(cat_counts_t.get(CATEGORY_CASE_HIT, 0))
                        count_auto_t = int(cat_counts_t.get(CATEGORY_AUTO_MEM, 0))
                        count_base_t = int(cat_counts_t.get(CATEGORY_BASE_OTHER, 0))

                        st.markdown(f"### {selected_team}")

                        kpi1, kpi2, kpi3 = st.columns(3)
                        kpi1.metric("🎯 Cartes", total_hits_t)
                        kpi2.metric("👥 Joueurs uniques", unique_players_t)
                        kpi3.metric("📁 Checklists", unique_files_t)

                        kpi6, kpi7, kpi8, kpi9 = st.columns(4)
                        kpi6.metric("🔥 Logoman", count_logoman_t)
                        kpi7.metric("✨ Case Hit", count_case_t)
                        kpi8.metric("💎 Auto/Mem", count_auto_t)
                        kpi9.metric("📄 Base/Autre", count_base_t)

                        col_t1, col_t2 = st.columns(2)
                        with col_t1:
                            if not team_players.empty:
                                st.markdown("#### Top joueurs de l'équipe")
                                top_players_t = (
                                    team_players.groupby('Player', as_index=False)['Hits']
                                    .sum()
                                    .sort_values('Hits', ascending=False)
                                )
                                st.dataframe(top_players_t.head(20), use_container_width=True)
                            else:
                                st.info("Aucun joueur à afficher pour cette équipe.")

                        with col_t2:
                            st.markdown("#### Répartition par checklist")
                            file_counts_t = (
                                team_cards.groupby('File', as_index=False)['Hits']
                                .sum()
                                .sort_values('Hits', ascending=False)
                            )
                            fig_file_t = px.bar(
                                file_counts_t.head(12),
                                x='Hits',
                                y='File',
                                orientation='h',
                                color='Hits',
                            )
                            fig_file_t.update_layout(yaxis={'categoryorder': 'total ascending'})
                            st.plotly_chart(fig_file_t, use_container_width=True)

                        st.markdown("---")
                        st.subheader("Liste des cartes")

                        filter_cat_t = st.radio(
                            "Filtrer par type :",
                            CATEGORY_FILTER_OPTIONS,
                            horizontal=True,
                            key="team_filter_cat",
                        )
                        box_search_t = st.text_input(
                            "Recherche Card Type / Joueur",
                            value="",
                            key="team_search",
                        ).strip().lower()

                        available_files_t = sorted(team_cards['File'].dropna().astype(str).unique().tolist())
                        selected_files_t = st.multiselect(
                            "Filtrer les checklists",
                            options=available_files_t,
                            default=available_files_t,
                            key="team_files_filter",
                        )

                        display_team_df = team_cards.copy()
                        if filter_cat_t != "Tous":
                            display_team_df = display_team_df[display_team_df['Category'] == filter_cat_t]
                        if selected_files_t:
                            display_team_df = display_team_df[display_team_df['File'].isin(selected_files_t)]
                        if box_search_t:
                            search_mask = (
                                display_team_df['Box Type'].astype(str).str.lower().str.contains(box_search_t, na=False)
                                | display_team_df['Player'].astype(str).str.lower().str.contains(box_search_t, na=False)
                            )
                            display_team_df = display_team_df[search_mask]

                        display_team_df = display_team_df.sort_values(['Player', 'Category', 'Hits'], ascending=[True, True, False])

                        if display_team_df.empty:
                            st.info("Aucune carte ne correspond aux filtres.")
                        else:
                            display_team_view = display_team_df.copy()
                            display_team_view['Multi-Joueurs'] = (
                                display_team_view['Player']
                                .astype(str)
                                .str.contains('/', na=False)
                                .map({True: "Oui", False: ""})
                            )
                            cols_team_view = ['Category', 'Player', 'Box Type', 'Multi-Joueurs', 'Hits', 'File']
                            st.dataframe(display_team_view[cols_team_view], use_container_width=True)


            
    else:
        st.error(msg)
        if error_files:
            with st.expander(f"{len(error_files)} fichier(s) ignoré(s)"):
                for name, err in error_files:
                    st.write(f"- {name}: {err}")

else:
    st.info("👈 Sélectionnez vos fichiers et cliquez sur 'Lancer l'analyse' pour commencer.")
    
    # Tutorial / Placeholder
    st.markdown("### Comment ça marche ?")
    st.markdown("""
    1.  Choisissez un sport dans la barre latérale (par défaut: **NBA/Basket**).
    2.  Placez vos fichiers par sport dans `checklists_clean/nba`, `checklists_clean/nfl`, `checklists_clean/soccer`.
    3.  Colonnes attendues : **Player**, **Team**, **Card Type**, **Numbering**.
    4.  Les alias équipes et règles de scoring s'adaptent au sport sélectionné.
    5.  Vous pouvez déposer des fichiers via l'upload cloud ou les mettre dans le dossier local.
    6.  Cliquez sur **Lancer l'analyse** pour voir les stats.
    """)
