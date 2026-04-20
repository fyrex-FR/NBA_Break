"""
Parser for Topps Disney checklist Excel files.

Expected format: single "Full Checklist" sheet with section headers followed by data rows.
- Section header: col0 = category name (text), col1/col2 = NaN
- Data row: col0 = number or card code, col1 = character, col2 = film/franchise

Output columns: Player, Team, Box Type, Numbering, Hits
- Player     = Disney character name
- Team       = Film / Franchise
- Box Type   = Section name (Base Set, Autographs, Relics, insert set name…)
- Numbering  = card numbering if present (e.g. /87), else ""
- Hits       = 1 always (category auto_mem handles hit classification)
"""

import re
import io
from collections import Counter

import pandas as pd


# Sections to skip entirely (sketch cards = artist names, not characters)
_SKIP_SECTION_KEYWORDS = ["sketch card"]

# Characters whose names contain hyphens and must not be split
# (used in auto parsing where col2 = "(Character-Film)")
_HYPHEN_CHARACTERS = {
    "G2-4T", "R2-D2", "C-3PO", "BB-8", "D-O", "R5-D4", "K-2SO",
    "AT-AT", "RX-24", "M-O",
}

_SECTION_TEAM_FALLBACKS = {
    "Snack Time": "Disneyland",
    "Posters": "Disneyland Attractions",
    "The Lands": "Disneyland Lands",
    "1977 Topps Star Tours Chrome": "Star Tours",
    "A Pirate's Life Chrome": "Pirates of the Caribbean",
    "Eighth Wonder Chrome": "Jungle Cruise",
    "Entrance To Magic Chrome": "Disneyland",
    "Greetings From The Tiki Room Chrome": "Walt Disney's Enchanted Tiki Room",
    "It's A Small World Chrome": "it's a small world",
    "Tomorrowland Cosmic Chrome": "Tomorrowland",
    "Welcome Foolish Mortals": "Haunted Mansion",
    "Character Nametags": "Disneyland Attractions",
    "The One And Only Partners Superfractor": "Disneyland",
    "Magic Carpet Ride": "Aladdin",
    "Phineas and Ferb": "Phineas and Ferb",
    "Phineas and Ferb Auto Variation": "Phineas and Ferb",
    "A Goofy Movie": "A Goofy Movie",
    "A Goofy Movie 30th Anniversary Auto Variation": "A Goofy Movie",
    "Mickey Shorts Short Prints": "Mickey Shorts",
    "Mickey Shorts Short Prints Auto Variation": "Mickey Shorts",
    "Mickey Shorts Short Prints Dual Auto Variation": "Mickey Shorts",
    "Triple Booklet Superfractor": "Mickey Shorts",
    "Epic Mickey": "Epic Mickey",
    "The Muppets Puzzle": "The Muppets",
    "Neon Villains": "Disney Villains",
    "Neon Lights (PETG)": "Disney",
    "Family First Rivals Variations": "Disney Rivals",
}

_PLAYER_TEAM_OVERRIDES = {
    "bo peep": "Toy Story",
    "rex": "Toy Story",
    "lightning mcqueen": "Cars",
}

_PREFER_SECTION_FALLBACK = {
    "Snack Time",
    "Posters",
    "The Lands",
    "1977 Topps Star Tours Chrome",
    "A Pirate's Life Chrome",
    "Eighth Wonder Chrome",
    "Entrance To Magic Chrome",
    "Greetings From The Tiki Room Chrome",
    "It's A Small World Chrome",
    "Tomorrowland Cosmic Chrome",
    "Welcome Foolish Mortals",
    "Character Nametags",
    "The One And Only Partners Superfractor",
    "Magic Carpet Ride",
    "Phineas and Ferb",
    "Phineas and Ferb Auto Variation",
    "A Goofy Movie",
    "A Goofy Movie 30th Anniversary Auto Variation",
    "Mickey Shorts Short Prints",
    "Mickey Shorts Short Prints Auto Variation",
    "Mickey Shorts Short Prints Dual Auto Variation",
    "Triple Booklet Superfractor",
    "Epic Mickey",
    "The Muppets Puzzle",
    "Neon Villains",
}


def _is_data_row(c0: str) -> bool:
    """True if col0 looks like a card number or card code."""
    return bool(re.match(r"^\d+$", c0)) or bool(re.match(r"^[A-Z0-9&]{1,8}-[A-Z0-9]{1,8}$", c0))


def _clean(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return re.sub(r",\s*$", "", str(val).strip())


def _skip_section(section: str) -> bool:
    lower = section.lower()
    return any(k in lower for k in _SKIP_SECTION_KEYWORDS)


def _is_numbering(s: str) -> bool:
    """True if s looks like a card numbering (e.g. /87, /25)."""
    return bool(re.match(r"^/\d+$", s.strip()))


def _parse_auto_col2(c2: str):
    """Parse '(Character-Film)' from auto col2.

    Handles hyphenated character names like G2-4T, R2-D2 by checking
    known hyphen characters first, then splitting on last '-' that is
    not part of a known character name.
    """
    inner = re.sub(r"^\(|\)$", "", c2.strip())
    if not inner:
        return "", ""

    # Try each known hyphen character first
    for char in sorted(_HYPHEN_CHARACTERS, key=len, reverse=True):
        if inner.startswith(char + "-"):
            rest = inner[len(char) + 1:]
            return char, rest.strip()

    # Generic: split on first '-'
    if "-" in inner:
        idx = inner.index("-")
        return inner[:idx].strip(), inner[idx + 1:].strip()

    return inner.strip(), ""


def _parse_multi_auto_entry(text: str):
    """Parse a dual/triple auto cell into slash-separated characters and franchises."""
    parts = [part.strip() for part in text.split("/") if part and part.strip()]
    if not parts:
        return "", ""

    players = []
    teams = []
    for part in parts:
        match = re.search(r"\((.*?)\)\s*$", part)
        inner = match.group(1).strip() if match else part
        player, team = _parse_auto_col2(f"({inner})")
        if player:
            players.append(player)
        if team and team not in teams:
            teams.append(team)

    return "/".join(players), "/".join(teams)


def _parse_relic_entry(text: str):
    """Parse relic rows that often only expose a memorabilia label."""
    clean = text.strip()
    if not clean:
        return "", ""

    return clean, "Disneyland"


def _split_values(text: str):
    return [part.strip() for part in str(text or "").split("/") if part and part.strip()]


def _build_player_team_map(df: pd.DataFrame) -> dict[str, str]:
    candidates = df.copy()
    candidates["Player"] = candidates["Player"].astype(str).str.strip()
    candidates["Team"] = candidates["Team"].astype(str).str.strip()
    candidates = candidates[(candidates["Player"] != "") & (candidates["Team"] != "")]

    counts: dict[str, Counter] = {}
    for _, row in candidates.iterrows():
        player = row["Player"]
        team = row["Team"]
        if "/" in player:
            continue
        counts.setdefault(player, Counter())[team] += 1

    resolved = {}
    for player, team_counts in counts.items():
        if not team_counts:
            continue
        ordered = team_counts.most_common()
        if len(ordered) == 1 or ordered[0][1] > ordered[1][1]:
            resolved[player] = ordered[0][0]

    for player, team in list(resolved.items()):
        resolved.setdefault(player.lower(), team)
    resolved.update(_PLAYER_TEAM_OVERRIDES)
    return resolved


def _infer_team_for_players(players: list[str], player_team_map: dict[str, str]) -> str:
    inferred = []
    for player in players:
        team = player_team_map.get(player, "") or player_team_map.get(player.lower(), "")
        if team and team not in inferred:
            inferred.append(team)
    return "/".join(inferred)


def _fill_missing_teams(df: pd.DataFrame) -> pd.DataFrame:
    work = df.copy()
    work["Player"] = work["Player"].astype(str).str.strip()
    work["Team"] = work["Team"].astype(str).str.strip()
    work["Box Type"] = work["Box Type"].astype(str).str.strip()

    player_team_map = _build_player_team_map(work)

    for idx, row in work[work["Team"] == ""].iterrows():
        box_type = row["Box Type"]
        fallback_team = _SECTION_TEAM_FALLBACKS.get(box_type, "")
        if fallback_team and box_type in _PREFER_SECTION_FALLBACK:
            work.at[idx, "Team"] = fallback_team
            continue

        players = _split_values(row["Player"])
        inferred_team = _infer_team_for_players(players, player_team_map)

        if inferred_team:
            work.at[idx, "Team"] = inferred_team
            continue

        if fallback_team:
            work.at[idx, "Team"] = fallback_team

    return work


def clean_disney_master_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Apply one more normalization pass on the consolidated Disney master."""
    work = _fill_missing_teams(df)
    player_team_map = _build_player_team_map(work)

    generic_teams = {"Disney", "Disney Rivals"}
    revisit_mask = work["Team"].astype(str).str.strip().isin(generic_teams)
    for idx, row in work[revisit_mask].iterrows():
        inferred_team = _infer_team_for_players(_split_values(row["Player"]), player_team_map)
        if inferred_team:
            work.at[idx, "Team"] = inferred_team

    return work


def parse_disney_checklist(file_data: bytes) -> pd.DataFrame:
    """Parse a Topps Disney Excel checklist.

    Returns a DataFrame with columns: Player, Team, Box Type, Numbering, Hits.
    """
    buf = io.BytesIO(file_data)
    xls = pd.ExcelFile(buf, engine="openpyxl")

    if "Full Checklist" not in xls.sheet_names:
        raise ValueError(
            f"Onglet 'Full Checklist' introuvable. Onglets disponibles: {xls.sheet_names}"
        )

    buf.seek(0)
    df_raw = pd.read_excel(buf, sheet_name="Full Checklist", header=None, engine="openpyxl")

    # Detect pre-formatted files (header row: Player, Team, Box Type, Numbering, Hits)
    first_row = [str(v).strip() for v in df_raw.iloc[0]]
    if "Player" in first_row and "Box Type" in first_row:
        buf.seek(0)
        df_clean = pd.read_excel(buf, sheet_name="Full Checklist", header=0, engine="openpyxl")
        df_clean.columns = [str(c).strip() for c in df_clean.columns]
        df_clean = df_clean[["Player", "Team", "Box Type", "Numbering", "Hits"]].copy()
        df_clean["Player"] = df_clean["Player"].astype(str).str.strip()
        df_clean["Team"] = df_clean["Team"].fillna("").astype(str).str.strip()
        df_clean["Box Type"] = df_clean["Box Type"].astype(str).str.strip()
        df_clean["Numbering"] = df_clean["Numbering"].fillna("").astype(str).str.strip()
        df_clean["Hits"] = 1
        df_clean = _fill_missing_teams(df_clean)
        df_clean = df_clean.drop_duplicates(subset=["Player", "Team", "Box Type", "Numbering"]).reset_index(drop=True)
        df_clean = df_clean[df_clean["Player"].str.len() > 0].copy()
        return df_clean

    ncols = df_raw.shape[1]

    rows: list[dict] = []
    current_section = "Base Set"
    skip = False
    is_auto_section = False
    is_relic_section = False
    in_sketch_cards = False

    for _, row in df_raw.iterrows():
        c0 = _clean(row.iloc[0])
        c1 = _clean(row.iloc[1]) if ncols > 1 else ""
        c2 = _clean(row.iloc[2]) if ncols > 2 else ""

        if not c0:
            continue

        if not _is_data_row(c0):
            # Section header
            lower = c0.lower()
            if "sketch card" in lower:
                in_sketch_cards = True
            # After sketch cards, any header that looks like a person name (no Disney keywords)
            # is still a sketch card artist — keep skipping
            if in_sketch_cards and not any(k in lower for k in [
                "base", "insert", "auto", "relic", "chrome", "topps", "foil",
                "die cut", "sticker", "poster", "land", "castle", "tapest",
            ]):
                skip = True
            else:
                in_sketch_cards = False
                skip = _skip_section(c0)
            current_section = c0
            is_auto_section = any(k in lower for k in ["autograph", "auto", "cut sig"])
            is_relic_section = any(k in lower for k in ["relic", "pin"])
            continue

        if skip or not c1:
            continue

        # Skip sketch card artist rows where col0 == col1 (artist name repeated)
        if in_sketch_cards and c0 == c1:
            continue

        numbering = ""

        if "(" in c1 and "/" in c1 and not c2:
            player, team = _parse_multi_auto_entry(c1)
        elif is_auto_section and c2.startswith("("):
            # Auto format: col1=actor (ignored), col2='(Character-Film)'
            player, team = _parse_auto_col2(c2)
        elif ncols >= 5 and _clean(row.iloc[3] if ncols > 3 else None):
            # 2026 auto format: col3=character, col4=film
            c3 = _clean(row.iloc[3])
            c4 = _clean(row.iloc[4]) if ncols > 4 else ""
            player = c3
            team = re.sub(r"^\(|\)$", "", c4).strip()
        elif is_relic_section and not c2:
            player, team = _parse_relic_entry(c1)
        else:
            # Base / insert: col1=character, col2=film (or numbering)
            player = _clean(c1)
            if _is_numbering(c2):
                # col2 is a numbering (e.g. /87), no team
                numbering = c2.strip()
                team = "Disneyland" if is_relic_section else ""
            else:
                # Strip "(THEN-Land)" / "(NOW-Land)" — keep THEN/NOW in player name for dedup
                if re.match(r"^\((?:THEN|NOW)-", c2):
                    variant = re.match(r"^\((THEN|NOW)-", c2).group(1)
                    player = f"{player} ({variant})"
                    team = re.sub(r"^\((?:THEN|NOW)-", "", c2)
                    team = re.sub(r"\)$", "", team).strip()
                else:
                    team = re.sub(r"^\(|\)$", "", c2).strip()

        if not player:
            continue

        rows.append({
            "Player": player,
            "Team": team,
            "Box Type": current_section,
            "Numbering": numbering,
            "Hits": 1,
        })

    if not rows:
        raise ValueError("Aucune carte extraite du fichier Disney.")

    df = pd.DataFrame(rows, columns=["Player", "Team", "Box Type", "Numbering", "Hits"])
    df = _fill_missing_teams(df)

    # Deduplicate only exact logical duplicates, not distinct cards from the same section.
    df = df.drop_duplicates(subset=["Player", "Team", "Box Type", "Numbering"]).reset_index(drop=True)
    df = df[df["Player"].str.len() > 0].copy()

    return df
