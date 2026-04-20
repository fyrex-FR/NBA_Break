"""
Parser for Topps Disney checklist Excel files.

Expected format: single "Full Checklist" sheet with section headers followed by data rows.
- Section header: col0 = category name (text), col1/col2 = NaN
- Data row: col0 = number or card code, col1 = character, col2 = film/franchise

Output columns: Player, Team, Box Type, Numbering, Hits
- Player     = Disney character name
- Team       = Film / Franchise
- Box Type   = Section name (Base Set, Autographs, Relics, insert set name…)
- Numbering  = "" (parallels ignored)
- Hits       = 1 for Autographs/Relics, 0 for Base/Inserts
"""

import re
import io

import pandas as pd


# Hits is always 1 (card count per slot) — the category (auto_mem) handles hit classification
# We keep this list only for future use if needed
_AUTO_RELIC_KEYWORDS = ["autograph", "auto", "relic", "memorabilia", "cut sig", "comic cuts"]

# Sections to skip entirely (sketch cards = artist names, not characters)
_SKIP_SECTION_KEYWORDS = ["sketch card"]


def _is_data_row(c0: str) -> bool:
    """True if col0 looks like a card number or card code."""
    return bool(re.match(r"^\d+$", c0)) or bool(re.match(r"^[A-Z0-9&]+-[A-Z0-9]+$", c0, re.IGNORECASE))


def _clean(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return re.sub(r",\s*$", "", str(val).strip())


def _hits_for_section(section: str) -> int:
    return 1


def _skip_section(section: str) -> bool:
    lower = section.lower()
    return any(k in lower for k in _SKIP_SECTION_KEYWORDS)


def _parse_2025_auto(c1: str, c2: str):
    """2025 format: col1=actor, col2='(Character-Film)' → return (character, film)."""
    inner = re.sub(r"^\(|\)$", "", c2.strip())
    if "-" in inner:
        parts = inner.split("-", 1)
        return _clean(parts[0]), _clean(parts[1])
    return _clean(inner), ""


def _parse_2026_auto(row, ncols: int):
    """2026 format: col3=character, col4=film."""
    c3 = _clean(row.iloc[3]) if ncols > 3 else ""
    c4 = _clean(row.iloc[4]) if ncols > 4 else ""
    film = re.sub(r"^\(|\)$", "", c4).strip()
    return c3, film


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
        df_clean = df_clean.drop_duplicates(subset=["Player", "Box Type"]).reset_index(drop=True)
        df_clean = df_clean[df_clean["Player"].str.len() > 0].copy()
        return df_clean

    ncols = df_raw.shape[1]

    rows: list[dict] = []
    current_section = "Base Set"
    skip = False

    for _, row in df_raw.iterrows():
        c0 = _clean(row.iloc[0])
        c1 = _clean(row.iloc[1]) if ncols > 1 else ""
        c2 = _clean(row.iloc[2]) if ncols > 2 else ""

        if not c0:
            continue

        if not _is_data_row(c0):
            # Section header
            current_section = c0
            skip = _skip_section(c0)
            continue

        if skip or not c1:
            continue

        hits = _hits_for_section(current_section)

        if hits == 1 and c2.startswith("("):
            # 2025 auto format: col2 = "(Character-Film)"
            player, team = _parse_2025_auto(c1, c2)
        elif hits == 1 and ncols >= 5 and _clean(row.iloc[3] if ncols > 3 else None):
            # 2026 auto format: col3=character, col4=film
            player, team = _parse_2026_auto(row, ncols)
        else:
            # Base / insert: col1=character, col2=film
            player = _clean(c1)
            # Strip "(THEN-Land)" / "(NOW-Land)" format
            team = re.sub(r"^\((?:THEN|NOW)-", "", c2)
            team = re.sub(r"\)$", "", team).strip()

        if not player:
            continue

        rows.append({
            "Player": player,
            "Team": team,
            "Box Type": current_section,
            "Numbering": "",
            "Hits": hits,
        })

    if not rows:
        raise ValueError("Aucune carte extraite du fichier Disney.")

    df = pd.DataFrame(rows, columns=["Player", "Team", "Box Type", "Numbering", "Hits"])

    # Deduplicate: keep first occurrence per (Player, Box Type)
    df = df.drop_duplicates(subset=["Player", "Box Type"]).reset_index(drop=True)
    df = df[df["Player"].str.len() > 0].copy()

    return df
