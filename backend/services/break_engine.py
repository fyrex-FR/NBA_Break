"""
Break simulation engine.
Extracted from app.py lines 430-795 — zero Streamlit dependency.
"""

import re

import pandas as pd

from .card_logic import CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN
from .data_pipeline import split_slash_values


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SIM_METHOD_LETTER = "letter"
SIM_METHOD_TEAM = "team"
SIM_METHOD_PLAYER = "player"
SIM_METHOD_CUSTOM = "custom"

SIM_METHOD_LABELS = {
    SIM_METHOD_LETTER: "Break par Lettre (A-Z)",
    SIM_METHOD_TEAM: "Break par Équipe",
    SIM_METHOD_PLAYER: "Break par Joueur",
    SIM_METHOD_CUSTOM: "Break Personnalisé",
}

SIM_CARD_TYPE_COLUMNS = [
    "Auto/Memo",
    "Case Hit",
    "Logoman",
]

SIM_SORT_OPTIONS = {
    "Nombre de cartes": "Cartes",
    "Auto/Memo": "Auto/Memo",
    "Case Hit": "Case Hit",
    "Logoman": "Logoman",
    "Nombre de joueurs": "Nombre de joueurs",
    "Alphabétique": "Spot",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _iter_team_player_pairs(player_list, team_list):
    players = _ordered_unique(player_list or [])
    teams = _ordered_unique(team_list or [])
    if not players or not teams:
        return []

    if len(players) > 1 and len(players) == len(teams):
        return [(teams[idx], players[idx]) for idx in range(len(players)) if teams[idx] and players[idx]]

    pairs = []
    for team in teams:
        for player in players:
            if team and player:
                pairs.append((team, player))
    return pairs


# ---------------------------------------------------------------------------
# Pool building
# ---------------------------------------------------------------------------

def build_break_simulation_pool(df):
    if df is None or df.empty:
        return pd.DataFrame()

    work = df.copy().reset_index(drop=True)
    for col in ["Player", "Team", "Box Type", "Category", "Hits"]:
        if col not in work.columns:
            work[col] = ""

    work["Player"] = work["Player"].astype(str).str.strip()
    work["Team"] = work["Team"].astype(str).str.strip()
    work["Box Type"] = work["Box Type"].astype(str).str.strip()
    work["Category"] = work["Category"].astype(str).str.strip()
    work["Hits"] = (
        pd.to_numeric(work["Hits"], errors="coerce")
        .fillna(1)
        .round()
        .clip(lower=1)
        .astype(int)
    )

    work["Player List"] = work["Player"].apply(_clean_list_or_single)
    work["Team List"] = work["Team"].apply(_clean_list_or_single)
    work = work[work["Player List"].apply(len) > 0].copy()
    if work.empty:
        return pd.DataFrame()

    work["Is AutoMemo"] = work["Category"].eq(CATEGORY_AUTO_MEM)
    work["Is CaseHit"] = work["Category"].eq(CATEGORY_CASE_HIT)

    work["Initial List"] = work["Player List"].apply(
        lambda names: [x for x in _ordered_unique(extract_surname_initial(n) for n in names) if x]
    )
    work["Primary Player"] = work["Player List"].apply(lambda items: items[0] if items else "")
    work["Primary Team"] = work["Team List"].apply(lambda items: items[0] if items else "")

    return work


# ---------------------------------------------------------------------------
# Spot generation
# ---------------------------------------------------------------------------

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
    if method == SIM_METHOD_PLAYER:
        players = []
        for values in pool_df["Player List"].tolist():
            players.extend(values)
        return sorted(_ordered_unique(players))
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
            for team, player in _iter_team_player_pairs(players, teams):
                if team not in mapping:
                    mapping[team] = set()
                mapping[team].add(player)
        return mapping

    if method == SIM_METHOD_PLAYER:
        mapping = {}
        for _, row in pool_df.iterrows():
            players = row.get("Player List", [])
            for player in players:
                if player not in mapping:
                    mapping[player] = set()
                mapping[player].add(player)
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
            for team, player in _iter_team_player_pairs(players, teams):
                if team not in team_to_players:
                    team_to_players[team] = set()
                team_to_players[team].add(player)

        for team, spot in custom_map.items():
            if spot not in mapping:
                continue
            for player in team_to_players.get(team, set()):
                mapping[spot].add(player)
        return mapping

    return mapping


# ---------------------------------------------------------------------------
# Deterministic spot summary
# ---------------------------------------------------------------------------

def build_deterministic_spot_summary(
    pool_df,
    method,
    spots,
    custom_scope="teams",
    custom_map=None,
    checklist_hits_guaranteed=None,
):
    if pool_df is None or pool_df.empty or not spots:
        return pd.DataFrame(), {}

    work = pool_df.reset_index(drop=True).copy()
    spot_set = set(spots)
    custom_map = custom_map or {}
    checklist_hits_guaranteed = checklist_hits_guaranteed or {}

    metric_cols = ["Cartes", "Auto/Memo", "Case Hit", "Logoman", "Auto garanties", "Weighted Auto"]
    totals = {spot: {col: 0 for col in metric_cols} for spot in spots}
    checklists_per_spot = {spot: set() for spot in spots}
    teams_solo_per_spot = {spot: {} for spot in spots}
    teams_multi_per_spot = {spot: {} for spot in spots}

    for _, row in work.iterrows():
        player_list = row.get("Player List", [])
        team_list = row.get("Team List", [])
        initial_list = row.get("Initial List", [])
        hits = int(row.get("Hits", 1) or 1)
        checklist_name = str(row.get("checklist_name", "") or "").strip()
        is_multi_player = len(player_list) > 1
        category = str(row.get("Category", "") or "").strip()

        targets = []
        if method == SIM_METHOD_LETTER:
            targets = [s for s in initial_list if s in spot_set]
        elif method == SIM_METHOD_TEAM:
            targets = [s for s in team_list if s in spot_set]
        elif method == SIM_METHOD_PLAYER:
            targets = [s for s in player_list if s in spot_set]
        elif method == SIM_METHOD_CUSTOM:
            if custom_scope == "players":
                targets = [custom_map.get(p, "") for p in player_list]
            else:
                targets = [custom_map.get(t, "") for t in team_list]
            targets = [s for s in targets if s in spot_set]

        targets = _ordered_unique(targets)
        if not targets:
            continue

        checklist_id = str(row.get("checklist_id", "") or "").strip()
        guaranteed = checklist_hits_guaranteed.get(checklist_id, 1)

        for assigned_spot in targets:
            totals[assigned_spot]["Cartes"] += hits
            is_auto = row.get("Is AutoMemo", False)
            totals[assigned_spot]["Auto/Memo"] += hits if is_auto else 0
            totals[assigned_spot]["Case Hit"] += hits if row.get("Is CaseHit", False) else 0
            totals[assigned_spot]["Logoman"] += hits if category == CATEGORY_LOGOMAN else 0
            totals[assigned_spot]["Auto garanties"] += hits if (is_auto and guaranteed > 0) else 0
            totals[assigned_spot]["Weighted Auto"] += hits * guaranteed if is_auto else 0
            if checklist_name:
                checklists_per_spot[assigned_spot].add(checklist_name)
            if method == SIM_METHOD_PLAYER:
                for team in team_list:
                    if team:
                        if is_multi_player:
                            teams_multi_per_spot[assigned_spot][team] = teams_multi_per_spot[assigned_spot].get(team, 0) + hits
                        else:
                            teams_solo_per_spot[assigned_spot][team] = teams_solo_per_spot[assigned_spot].get(team, 0) + hits

    rows = []
    for spot in spots:
        auto_val = totals[spot]["Auto/Memo"]
        case_val = totals[spot]["Case Hit"]
        rarity_signal = auto_val + (2.0 * case_val)
        if rarity_signal < 1.0:
            rarity_label = "Commun"
        elif rarity_signal < 3.0:
            rarity_label = "Peu commun"
        elif rarity_signal < 7.0:
            rarity_label = "Rare"
        else:
            rarity_label = "Ultra-rare"

        solo_data = teams_solo_per_spot[spot]
        multi_data = teams_multi_per_spot[spot]
        teams_parts = []

        if solo_data:
            combined_solo = {}
            for team, count in solo_data.items():
                combined_solo[team] = count + multi_data.get(team, 0)
            sorted_solo = sorted(combined_solo.items(), key=lambda x: (-x[1], x[0]))
            solo_str = ", ".join(f"{team}: {count}" for team, count in sorted_solo)
            teams_parts.append(solo_str)

        multi_only = {team: count for team, count in multi_data.items() if team not in solo_data}
        if multi_only:
            sorted_multi = sorted(multi_only.items(), key=lambda x: (-x[1], x[0]))
            multi_str = "Multi: " + ", ".join(f"{team}: {count}" for team, count in sorted_multi)
            teams_parts.append(multi_str)
        teams_str = " | ".join(teams_parts) if teams_parts else ""

        row = {
            "Spot": spot,
            "Cartes": totals[spot]["Cartes"],
            "Auto/Memo": totals[spot]["Auto/Memo"],
            "Case Hit": totals[spot]["Case Hit"],
            "Logoman": totals[spot]["Logoman"],
            "Auto garanties": totals[spot]["Auto garanties"],
            "Rareté": rarity_label,
            "Équipes": teams_str,
            "Checklists": ", ".join(sorted(checklists_per_spot[spot])),
        }
        rows.append(row)

    result_df = pd.DataFrame(rows)
    if result_df.empty:
        return result_df, {}

    result_df["Break Score"] = (result_df["Weighted Auto"] * 3) + (result_df["Case Hit"] * 5)
    result_df.drop(columns=["Weighted Auto"], inplace=True)

    total_break_score = result_df["Break Score"].sum()
    if total_break_score > 0:
        result_df["Part du break"] = (result_df["Break Score"] / total_break_score * 100).round(1)
    else:
        result_df["Part du break"] = 0.0

    nb_spots = len(result_df)
    fair_share = 100.0 / nb_spots if nb_spots > 0 else 0
    hot_threshold_pct = max(fair_share * 1.5, 0.5)
    result_df["Hot Spot"] = result_df["Part du break"].apply(
        lambda x: "🔥 Hot" if x >= hot_threshold_pct else ""
    )

    for col in ["Cartes", "Auto/Memo", "Case Hit", "Break Score", "Auto garanties"]:
        if col in result_df.columns:
            result_df[col] = result_df[col].astype(int)

    total_cartes = int(result_df["Cartes"].sum())
    summary = {
        "total_cartes": total_cartes,
        "total_break_score": int(total_break_score),
        "hot_spots": int((result_df["Hot Spot"] == "🔥 Hot").sum()),
        "hot_threshold_pct": round(hot_threshold_pct, 1),
    }
    return result_df, summary
