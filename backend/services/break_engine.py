"""
Break simulation engine.
Extracted from app.py lines 430-795 — zero Streamlit dependency.
"""

import re
import unicodedata

import pandas as pd

from .card_logic import CATEGORY_AUTO_MEM, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN
from .data_pipeline import split_slash_values


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SIM_METHOD_LETTER = "letter"
SIM_METHOD_TEAM = "team"
SIM_METHOD_PLAYER = "player"
SIM_METHOD_PLAYER_LETTER = "player_letter"
SIM_METHOD_CUSTOM = "custom"

SIM_METHOD_LABELS = {
    SIM_METHOD_LETTER: "Break par Lettre (A-Z)",
    SIM_METHOD_TEAM: "Break par Équipe",
    SIM_METHOD_PLAYER: "Break par Joueur",
    SIM_METHOD_PLAYER_LETTER: "Break par Joueur et Lettre (Mixte)",
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


# Prefixes treated as articles/titles → their own initial is used (The Rock → T, El Hijo → E)
_PREFIX_KEEP_INITIAL = {
    "the", "le", "la", "les", "el", "los", "las", "l'", "al",
    "von", "van", "de", "del", "della", "des", "du", "di",
    "sir", "mr", "dr",
}

# Common first names: if first token is in this set → use LAST token as initial (surname)
# Generated from WWE parquet + NBA common first names
_FIRST_NAMES = {
    # A
    "aaron", "adam", "adriana", "adrianna", "akira", "alba", "aleah", "aleister",
    "alex", "alexa", "alexander", "alexis", "ali", "alicia", "aliyah", "alundra",
    "amale", "amari", "andrade", "andre", "angel", "angelo", "anthony", "aoife",
    "apollo", "arianna", "ashante", "asuka", "austin",
    # B
    "bam", "baron", "batista", "bayley", "becky", "ben", "berto", "beth",
    "bianca", "billie", "billy", "blair", "blake", "bo", "bobby", "bodhi",
    "booker", "brandi", "braun", "bray", "bret", "brian", "brie", "brinley",
    "brock", "bron", "bronco", "bronson", "brook", "brooks", "brother", "bruno",
    "brutus", "bubba", "byron",
    # C
    "cactus", "cameron", "candice", "carlee", "carmella", "carmelo", "cathy",
    "cedric", "cesaro", "cezar", "chad", "channing", "charlie", "charlotte",
    "chelsea", "chris", "cody", "cora", "corey", "cruz",
    # D
    "dakota", "damian", "damon", "dana", "dani", "daniel", "danny", "dante",
    "dash", "dave", "david", "dean", "devin", "dexter", "diamond", "dion",
    "dolph", "dominik", "don", "donovan", "dory", "draymond", "drew", "duke",
    "dusty",
    # E
    "eddie", "eddy", "edge", "edris", "elektra", "elton", "ember", "emilia",
    "eric", "erick", "ethan", "eugene", "eva", "evolution", "ezekiel",
    # F
    "fabian", "fallon", "finn", "flash", "floyd", "fred", "freddie",
    # G
    "gable", "gene", "george", "giannis", "gigi", "giovanni", "giulia",
    "goldberg", "gorilla", "grayson", "greg",
    # H
    "hakeem", "hank", "happy", "harley", "heath", "hideo", "hulk", "humberto",
    "hunter",
    # I
    "ikemen", "ilja", "indi", "io", "isaac", "isiah", "isaiah", "isla", "ivy",
    "iyo", "izzi",
    # J
    "jack", "jacob", "jacy", "jade", "jagger", "jaida", "jakara", "jake",
    "james", "jason", "javier", "jaxson", "jazmyn", "jeff", "jerry", "jey",
    "jim", "jimmy", "jinder", "joaquin", "joe", "joel", "john", "johnny",
    "jonathan", "jordan", "jordynne", "joseph", "josh", "julius", "jrue", "juri",
    # K
    "kacy", "kairi", "kama", "karl", "kareem", "karmen", "karrion", "kassius",
    "katana", "kawhi", "kay", "kayden", "keith", "kelani", "kelly", "kemba",
    "ken", "kendal", "kenny", "kevin", "khris", "kiana", "killian", "kit",
    "klay", "kofi", "koko", "kona", "kurt", "kyrie", "kyle",
    # L
    "lacey", "lainey", "lana", "larry", "lash", "lebron", "lewis", "lex",
    "lexis", "lilian", "lince", "lita", "liv", "lola", "luca", "lucien",
    "ludwig", "luke", "luka", "lyra",
    # M
    "madcap", "magic", "malcolm", "malik", "mandy", "mankind", "mansoor",
    "marcel", "marcus", "maria", "mark", "matt", "max", "maxxine", "meiko",
    "mia", "michael", "michelle", "mick", "mickie", "mike", "molly", "montez",
    "mustafa", "myles",
    # N
    "naomi", "nash", "nathan", "natalya", "nia", "nick", "nikki", "nikkita",
    "nikolai", "nikola", "noam",
    # O
    "oba", "odyssey", "oliver", "oney", "oro", "oscar", "osiris", "otis",
    # P
    "pascal", "pat", "patrick", "paul", "persia", "pete", "peyton", "piper",
    # R
    "rampage", "randy", "raquel", "raul", "razor", "reggie", "rey", "rhea",
    "rhyno", "ric", "rick", "ricky", "riddick", "ridge", "riley", "rob",
    "robert", "roderick", "roman", "ron", "ronda", "roxanne", "ruby", "russell",
    # S
    "sam", "sami", "samir", "samoa", "santana", "santos", "saquon", "sarah",
    "sasha", "scott", "scottie", "seth", "shane", "shaquille", "shawn", "shayna",
    "sheamus", "shelton", "shinsuke", "shotzi", "sika", "sol", "solo", "sonya",
    "stacy", "stephen", "stephanie", "stevie", "sunil",
    # T
    "tama", "tanga", "tamina", "tatum", "tavion", "taynara", "teddy", "tegan",
    "terra", "terrence", "terry", "thea", "tiffany", "tim", "timothy", "tino",
    "titus", "tobias", "tommaso", "tonga", "toni", "tony", "torrie", "trae",
    "trent", "trick", "trish", "tucker", "tye", "tyler", "tyra", "tyriek",
    "tyson",
    # U
    "umaga",
    # V
    "valentina", "vanessa", "veer", "velveteen", "vic", "vinny",
    # W
    "wade", "wendi", "wendy", "wes", "william", "wilt", "wren", "wyatt",
    # X
    "xavier", "xia", "xyon",
    # Y
    "yulisa",
    # Z
    "zack", "zelina", "zion", "zoey",
}


def extract_surname_initial(player_name):
    """Return the 'letter slot' initial for a player name.

    Rules (applied in order):
    1. Strip suffixes (Jr., Sr., II, III, IV, V)
    2. If first token (lowercased) is a known article/title prefix → use first token's initial
       (The Rock → T, El Hijo → E, Von Erich → V)
    3. If first token (lowercased) is a known first name → use last token's initial
       (Shinsuke Nakamura → N, Brock Lesnar → L)
    4. Otherwise → use first token's initial
       (CM Punk → C, AJ Styles → A, RVD → R, Goldberg → G)
    """
    text = "" if player_name is None else str(player_name).strip()
    if not text:
        return ""
    # Strip leading quoted nickname: "The American Nightmare" Cody Rhodes → Cody Rhodes
    text = re.sub(r'^["\u201c\u201d][^"\u201c\u201d]+["\u201c\u201d]\s*', '', text).strip()
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

    first_lower = tokens[0].lower()
    first_token = tokens[0]

    # Rule 2 – article/title prefix → its own initial
    if first_lower in _PREFIX_KEEP_INITIAL:
        initial = first_token[0].upper()
        return initial if "A" <= initial <= "Z" else ""

    # Rule 2b – all-caps short token (CM, AJ, RVD, DX...) → first token directly
    if first_token.isupper() and len(first_token) <= 3:
        initial = first_token[0].upper()
        return initial if "A" <= initial <= "Z" else ""

    # Rule 3 – known first name → last token (surname)
    if first_lower in _FIRST_NAMES and len(tokens) > 1:
        initial = tokens[-1][0].upper()
        return initial if "A" <= initial <= "Z" else ""

    # Rule 4 – fallback: first token
    initial = first_token[0].upper()
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
def build_default_spots(pool_df, method, extracted_players=None):
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
    if method == SIM_METHOD_PLAYER_LETTER:
        return list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + (extracted_players or [])
    return []


def build_spot_player_map(pool_df, method, custom_scope="teams", custom_map=None, custom_spots=None, extracted_players=None):
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

    if method == SIM_METHOD_PLAYER_LETTER:
        mapping = {letter: set() for letter in list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")}
        extracted_set = set(extracted_players or [])
        for spot in extracted_set:
            mapping[spot] = set()

        for _, row in pool_df.iterrows():
            players = row.get("Player List", [])
            for player in players:
                if player in extracted_set:
                    mapping[player].add(player)
                else:
                    initial = extract_surname_initial(player)
                    if initial in mapping:
                        mapping[initial].add(player)
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
    extracted_players=None,
    rookie_year_map=None,
):
    if pool_df is None or pool_df.empty or not spots:
        return pd.DataFrame(), {}

    work = pool_df.reset_index(drop=True).copy()
    spot_set = set(spots)
    custom_map = custom_map or {}
    guaranteed_mode = bool(checklist_hits_guaranteed)
    guaranteed_map = checklist_hits_guaranteed or {}
    # En mode garantie : défaut 0 (ne contribue pas). Sans config : défaut 1 (comportement original).
    guaranteed_default = 0 if guaranteed_mode else 1

    rookie_year_map = rookie_year_map or {}  # {player_lower: "2024-25"}

    metric_cols = ["Cartes", "Auto/Memo", "Case Hit", "Logoman", "Auto garanties", "Weighted Auto",
                   "Cartes RC", "Auto/Memo RC", "Case Hit RC", "Logoman RC"]
    totals = {spot: {col: 0 for col in metric_cols} for spot in spots}
    checklists_per_spot = {spot: set() for spot in spots}
    players_per_spot = {spot: set() for spot in spots}
    # player → set of ALL checklist names across the entire pool (not per spot)
    player_all_checklists: dict[str, set] = {}
    teams_solo_per_spot = {spot: {} for spot in spots}
    teams_multi_per_spot = {spot: {} for spot in spots}

    extracted_set = set(extracted_players or [])
    # Pour les spots-joueurs (player_letter) : co-joueurs des cartes multi
    multi_partners_per_spot = {spot: set() for spot in spots}
    card_details = []

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
            # Une carte = un seul spot : première lettre du premier joueur
            first_initial = initial_list[0] if initial_list else ""
            if first_initial in spot_set:
                targets = [first_initial]
        elif method == SIM_METHOD_TEAM:
            targets = [s for s in team_list if s in spot_set]
        elif method == SIM_METHOD_PLAYER:
            targets = [s for s in player_list if s in spot_set]
        elif method == SIM_METHOD_PLAYER_LETTER:
            # Une carte = un seul spot : premier joueur extrait ou première lettre du premier joueur
            first_player = player_list[0] if player_list else ""
            if first_player:
                if first_player in extracted_set:
                    target = first_player
                else:
                    target = extract_surname_initial(first_player)
                if target in spot_set:
                    targets = [target]
        elif method == SIM_METHOD_CUSTOM:
            if custom_scope == "players":
                targets = [custom_map.get(p, "") for p in player_list]
            else:
                targets = [custom_map.get(t, "") for t in team_list]
            targets = [s for s in targets if s in spot_set]

        targets = _ordered_unique(targets)

        # Track checklists pour tous les joueurs de la carte, même hors-spot
        if checklist_name:
            for p in player_list:
                player_all_checklists.setdefault(p, set()).add(checklist_name)

        if not targets:
            continue

        checklist_id = str(row.get("checklist_id", "") or "").strip()
        guaranteed = guaranteed_map.get(checklist_id, guaranteed_default)

        base_card = {
            "Player": str(row.get("Player", "") or "").strip(),
            "Team": str(row.get("Team", "") or "").strip(),
            "Box Type": str(row.get("Box Type", "") or "").strip(),
            "Numbering": str(row.get("Numbering", "") or "").strip(),
            "Category": category,
            "Checklist": checklist_name,
            "is_multi_ref": False,
        }

        for assigned_spot in targets:
            card_details.append({"Spot": assigned_spot, **base_card})

        # Références croisées pour mode player_letter : carte multi visible dans les autres spots concernés
        if method == SIM_METHOD_PLAYER_LETTER and is_multi_player:
            assigned_spot = targets[0] if targets else None
            for other_player in player_list:
                if other_player == (player_list[0] if player_list else ""):
                    continue  # déjà dans le spot principal
                # Déterminer le spot de ce co-joueur
                if other_player in extracted_set:
                    other_spot = other_player
                else:
                    other_spot = extract_surname_initial(other_player)
                if other_spot and other_spot in spot_set and other_spot != assigned_spot:
                    card_details.append({"Spot": other_spot, **base_card, "is_multi_ref": True})

        card_year = str(row.get("Year", "") or "").strip()  # ex: "2024-25"

        for assigned_spot in targets:
            totals[assigned_spot]["Cartes"] += hits
            is_auto = row.get("Is AutoMemo", False)
            is_case = row.get("Is CaseHit", False)
            is_logoman = category == CATEGORY_LOGOMAN
            totals[assigned_spot]["Auto/Memo"] += hits if is_auto else 0
            totals[assigned_spot]["Case Hit"] += hits if is_case else 0
            totals[assigned_spot]["Logoman"] += hits if is_logoman else 0
            totals[assigned_spot]["Auto garanties"] += hits if (is_auto and guaranteed > 0) else 0
            totals[assigned_spot]["Weighted Auto"] += hits * guaranteed if is_auto else 0
            # RC : le spot lui-même doit être rookie ET la carte dans son année rookie
            _nfd = unicodedata.normalize("NFD", assigned_spot)
            _spot_key = "".join(c for c in _nfd if unicodedata.category(c) != "Mn").lower().strip()
            spot_rc_year = rookie_year_map.get(_spot_key) if rookie_year_map else None
            if spot_rc_year and spot_rc_year == card_year:
                totals[assigned_spot]["Cartes RC"] += hits
                totals[assigned_spot]["Auto/Memo RC"] += hits if is_auto else 0
                totals[assigned_spot]["Case Hit RC"] += hits if is_case else 0
                totals[assigned_spot]["Logoman RC"] += hits if is_logoman else 0
            if checklist_name:
                checklists_per_spot[assigned_spot].add(checklist_name)
            for p in player_list:
                players_per_spot[assigned_spot].add(p)
            # Tracker les co-joueurs multi pour les spots-joueurs extraits
            if method == SIM_METHOD_PLAYER_LETTER and assigned_spot in extracted_set and is_multi_player:
                for p in player_list:
                    if p != assigned_spot:
                        multi_partners_per_spot[assigned_spot].add(p)
            if method == SIM_METHOD_PLAYER or method == SIM_METHOD_PLAYER_LETTER:
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

        players_list = sorted(players_per_spot[spot])
        # Pour un break par joueur, le spot EST le joueur — on check uniquement lui.
        # Pour les autres méthodes, on check tous les joueurs du spot.
        if method in (SIM_METHOD_PLAYER, SIM_METHOD_PLAYER_LETTER):
            _immacu_candidates = [spot]
        else:
            _immacu_candidates = list(players_per_spot[spot])
        immaculate_only = sum(
            1 for p in _immacu_candidates
            if player_all_checklists.get(p)
            and all("immaculate" in cl.lower() for cl in player_all_checklists[p])
        )
        # Formatage colonne Joueurs : différent selon spot-joueur extrait ou spot-lettre
        if method == SIM_METHOD_PLAYER_LETTER and spot in extracted_set:
            partners = sorted(multi_partners_per_spot[spot])
            if partners:
                joueurs_str = f"{spot} ; Multi: {', '.join(partners)}"
            else:
                joueurs_str = spot
        else:
            joueurs_str = ", ".join(players_list)

        row = {
            "Spot": spot,
            "Cartes": totals[spot]["Cartes"],
            "Cartes RC": totals[spot]["Cartes RC"],
            "Auto/Memo": totals[spot]["Auto/Memo"],
            "Auto/Memo RC": totals[spot]["Auto/Memo RC"],
            "Case Hit": totals[spot]["Case Hit"],
            "Case Hit RC": totals[spot]["Case Hit RC"],
            "Logoman": totals[spot]["Logoman"],
            "Logoman RC": totals[spot]["Logoman RC"],
            "Auto garanties": totals[spot]["Auto garanties"],
            "Weighted Auto": totals[spot]["Weighted Auto"],
            "Rareté": rarity_label,
            "Équipes": teams_str,
            "Nb Joueurs": len(players_list),
            "Immaculate Only": immaculate_only,
            "Joueurs": joueurs_str,
            "Checklists": ", ".join(sorted(checklists_per_spot[spot])),
        }
        rows.append(row)

    result_df = pd.DataFrame(rows)
    if result_df.empty:
        return result_df, {}

    result_df["Break Score"] = (result_df["Weighted Auto"] * 3) + (result_df["Case Hit"] * 5) + (result_df["Logoman"] * 8)
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

    for col in ["Cartes", "Cartes RC", "Auto/Memo", "Auto/Memo RC", "Case Hit", "Case Hit RC", "Logoman RC", "Break Score", "Auto garanties"]:
        if col in result_df.columns:
            result_df[col] = result_df[col].astype(int)

    total_cartes = int(result_df["Cartes"].sum())
    summary = {
        "total_cartes": total_cartes,
        "total_break_score": int(total_break_score),
        "hot_spots": int((result_df["Hot Spot"] == "🔥 Hot").sum()),
        "hot_threshold_pct": round(hot_threshold_pct, 1),
    }
    return result_df, summary, card_details
