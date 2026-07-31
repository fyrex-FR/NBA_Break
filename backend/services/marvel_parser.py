"""Parser for Marvel and superhero entertainment checklists.

The app keeps its master schema sport-shaped: Player, Team, Box Type, Numbering.
For Marvel, Player is the character/subject and Team is the collecting lane:
franchise, team-up, title, or universe when a tighter lane is unavailable.
"""

from __future__ import annotations

import io
import os
import re
from collections import Counter

import pandas as pd


_SKIP_SHEET_KEYWORDS = ["parallel", "odds"]
_SKIP_SECTION_KEYWORDS = ["artist sketch", "sketch artist checklist"]

_KNOWN_FRANCHISES = [
    "Avengers",
    "X-Men",
    "Spider-Man",
    "Deadpool",
    "Fantastic Four",
    "Guardians of the Galaxy",
    "Thunderbolts",
    "Eternals",
    "Agatha All Along",
    "Ant-Man",
    "Black Panther",
    "Captain America",
    "Iron Man",
    "Thor",
    "Hulk",
    "Doctor Strange",
    "Daredevil",
    "Wolverine",
    "Venom",
    "Marvel Studios",
    "Marvel Comics",
]

_CHARACTER_FRANCHISE_HINTS = {
    "deadpool": "Deadpool",
    "wade wilson": "Deadpool",
    "cable": "Deadpool",
    "domino": "Deadpool",
    "negasonic teenage warhead": "Deadpool",
    "spider-man": "Spider-Man",
    "peter parker": "Spider-Man",
    "miles morales": "Spider-Man",
    "venom": "Spider-Man",
    "wolverine": "X-Men",
    "logan": "X-Men",
    "cyclops": "X-Men",
    "storm": "X-Men",
    "magneto": "X-Men",
    "jean grey": "X-Men",
    "captain america": "Avengers",
    "iron man": "Avengers",
    "tony stark": "Avengers",
    "thor": "Avengers",
    "hulk": "Avengers",
    "bruce banner": "Avengers",
    "black widow": "Avengers",
    "hawkeye": "Avengers",
    "black panther": "Black Panther",
    "doctor strange": "Doctor Strange",
    "daredevil": "Daredevil",
    "punisher": "Daredevil",
    "frank castle": "Daredevil",
    "bullseye": "Daredevil",
    "mr. fantastic": "Fantastic Four",
    "mister fantastic": "Fantastic Four",
    "invisible woman": "Fantastic Four",
    "human torch": "Fantastic Four",
    "the thing": "Fantastic Four",
    "galactus": "Fantastic Four",
    "star-lord": "Guardians of the Galaxy",
    "groot": "Guardians of the Galaxy",
    "gamora": "Guardians of the Galaxy",
    "rocket": "Guardians of the Galaxy",
    "sentry": "Thunderbolts",
    "john f. walker": "Thunderbolts",
    "maya lopez": "Daredevil",
    "agatha harkness": "Agatha All Along",
    "billy maximoff": "Agatha All Along",
    "ant-man": "Ant-Man",
    "the wasp": "Ant-Man",
}


def _clean(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _is_data_code(value: str) -> bool:
    text = _clean(value)
    return bool(re.fullmatch(r"\d+", text)) or bool(re.fullmatch(r"[A-Z0-9]{1,8}(?:-[A-Z0-9]{1,12})+", text))


def _clean_numbering(value) -> str:
    text = _clean(value)
    if not text:
        return ""
    if re.fullmatch(r"1/1", text):
        return "1/1"
    if re.fullmatch(r"/\d{1,5}", text):
        return text
    if re.fullmatch(r"\d{1,5}", text):
        return f"/{text}"
    return ""


def _subject_from_text(text: str) -> str:
    clean = _clean(text)
    if not clean:
        return ""
    match = re.search(r"\(([^()]*)\)\s*$", clean)
    if match:
        subject = match.group(1).strip()
        if subject:
            return subject
    return re.sub(r"\s*\([^)]*\)\s*$", "", clean).strip()


def _character_from_parenthetical(value: str) -> str:
    text = _clean(value)
    if not text:
        return ""
    characters = []
    for match in re.finditer(r"\(([^()]*)\)", text):
        inside = match.group(1).strip()
        if not inside:
            continue
        if re.fullmatch(r"\d{4}", inside):
            continue
        character = re.split(r"\s+-\s+|-(?=[A-Za-z])", inside, maxsplit=1)[0].strip()
        if character:
            characters.append(character)
    return "/".join(dict.fromkeys(characters))


def _subject_for_break(raw: str, section: str = "") -> str:
    """Return the claimable break subject, not the signer/artist when both exist."""
    clean = _clean(raw)
    if not clean:
        return ""

    character = _character_from_parenthetical(clean)
    if character:
        return character

    as_match = re.search(r"\bas\s+(.+)$", clean, flags=re.IGNORECASE)
    if as_match:
        return as_match.group(1).strip()

    subject = _subject_from_text(clean)
    lower_section = section.lower()
    if "autographed comic clippings" in lower_section and " - " in subject:
        title = subject.split(" - ", 1)[1].strip()
        title = re.sub(r"\s*\([^)]*\).*", "", title).strip()
        title = re.sub(r"\s+#\S+.*", "", title).strip()
        if title:
            return title
    if ("artist auto" in lower_section or "animation cels" in lower_section) and " - " in subject:
        return subject.split(" - ", 1)[0].strip()
    return subject


def _infer_team(subject: str, section: str, product_hint: str) -> str:
    haystacks = [section, subject, product_hint]
    for hay in haystacks:
        lower = hay.lower()
        for franchise in _KNOWN_FRANCHISES:
            if franchise.lower() in lower:
                return franchise

    subject_key = subject.lower()
    for token, franchise in _CHARACTER_FRANCHISE_HINTS.items():
        if token in subject_key:
            return franchise

    if "studios" in product_hint.lower():
        return "Marvel Studios"
    if "comic" in product_hint.lower():
        return "Marvel Comics"
    return "Marvel"


def _is_skip_sheet(sheet_name: str) -> bool:
    lower = sheet_name.lower()
    return any(k in lower for k in _SKIP_SHEET_KEYWORDS)


def _is_skip_section(section: str) -> bool:
    lower = section.lower()
    return any(k in lower for k in _SKIP_SECTION_KEYWORDS)


def _parse_headered_sheet(df: pd.DataFrame, product_hint: str) -> list[dict]:
    work = df.dropna(how="all").reset_index(drop=True)
    if work.empty:
        return []

    header_idx = None
    for idx, row in work.head(10).iterrows():
        cells = [_clean(v).lower() for v in row.tolist()]
        has_subject = any(c in cells for c in ["player", "character", "subject", "name", "description"])
        has_set = any(
            c in cells for c in ["box type", "card type", "set", "subset"]
        ) or "set name" in cells
        if has_subject and has_set:
            header_idx = idx
            break
    if header_idx is None:
        return []

    headers = [_clean(v).lower() for v in work.iloc[header_idx].tolist()]

    def find(*names: str) -> int | None:
        for name in names:
            if name in headers:
                return headers.index(name)
        return None

    player_col = find("player", "character", "subject", "name")
    team_col = find("team", "franchise", "universe", "title", "movie")
    box_col = find("box type", "card type", "set", "subset")
    numbering_col = find("numbering", "seq", "serial")

    if player_col is None and "description" in headers:
        player_col = headers.index("description")
    if box_col is None and "set name" in headers:
        box_col = headers.index("set name")
    if numbering_col is None and "serial #'d" in headers:
        numbering_col = headers.index("serial #'d")

    if player_col is None:
        return []

    rows = []
    for _, row in work.iloc[header_idx + 1:].iterrows():
        box_type = _clean(row.iloc[box_col] if box_col is not None and box_col < work.shape[1] else "")
        raw_subject = _clean(row.iloc[player_col] if player_col < work.shape[1] else "")
        subject = _subject_for_break(raw_subject, box_type)
        if not subject:
            continue
        team = _clean(row.iloc[team_col] if team_col is not None and team_col < work.shape[1] else "")
        if not team:
            team = _infer_team(subject, box_type, product_hint)
        numbering = _clean_numbering(row.iloc[numbering_col]) if numbering_col is not None and numbering_col < work.shape[1] else ""
        rows.append({
            "Player": subject,
            "Team": team,
            "Box Type": box_type or "Base",
            "Numbering": numbering,
            "Hits": 1,
            "_raw_subject": raw_subject,
        })
    return rows


def _parse_section_sheet(df: pd.DataFrame, sheet_name: str, product_hint: str) -> list[dict]:
    work = df.dropna(how="all").reset_index(drop=True)
    if work.empty:
        return []

    rows = []
    current_section = sheet_name
    skip_section = False

    for _, row in work.iterrows():
        c0 = _clean(row.iloc[0] if work.shape[1] > 0 else "")
        c1 = _clean(row.iloc[1] if work.shape[1] > 1 else "")
        c2 = _clean(row.iloc[2] if work.shape[1] > 2 else "")
        c3 = _clean(row.iloc[3] if work.shape[1] > 3 else "")

        if not c0:
            continue

        if not _is_data_code(c0):
            if not re.fullmatch(r"\d+\s+cards?", c0, flags=re.IGNORECASE):
                current_section = c0
                skip_section = _is_skip_section(current_section)
            continue

        if skip_section or not c1:
            continue

        raw_subject = c3 if c3.startswith("(") else c2 if c2.startswith("(") else c1
        context = " ".join(part for part in [current_section, c1, c2, c3] if part)
        subject = _subject_for_break(raw_subject, current_section)
        if not subject:
            continue

        team = _infer_team(subject, context, product_hint)
        numbering = _clean_numbering(c2) or _clean_numbering(c3)
        rows.append({
            "Player": subject,
            "Team": team,
            "Box Type": current_section or sheet_name,
            "Numbering": numbering,
            "Hits": 1,
            "_raw_subject": raw_subject,
        })

    return rows


def _fill_generic_teams(rows: list[dict]) -> list[dict]:
    counts: dict[str, Counter] = {}
    for row in rows:
        player = row.get("Player", "")
        team = row.get("Team", "")
        if player and team and team != "Marvel":
            counts.setdefault(player.lower(), Counter())[team] += 1

    resolved = {
        player: team_counts.most_common(1)[0][0]
        for player, team_counts in counts.items()
        if team_counts
    }
    for row in rows:
        if row.get("Team") == "Marvel":
            row["Team"] = resolved.get(row.get("Player", "").lower(), row["Team"])
    return rows


def _dedup(rows: list[dict]) -> list[dict]:
    by_key = {}
    out = []
    for row in rows:
        key = (
            row.get("Player", "").lower(),
            row.get("Team", "").lower(),
            row.get("Box Type", "").lower(),
            row.get("Numbering", ""),
        )
        if key in by_key:
            existing_raw = _clean(by_key[key].get("_raw_subject", "")).lower()
            current_raw = _clean(row.get("_raw_subject", "")).lower()
            if current_raw and current_raw != existing_raw:
                by_key[key]["Hits"] = int(by_key[key].get("Hits", 1) or 1) + int(row.get("Hits", 1) or 1)
            continue
        by_key[key] = row
        out.append(row)
    return out


def parse_marvel_checklist(file_data: bytes, filename: str = "marvel-checklist.xlsx") -> pd.DataFrame:
    buf = io.BytesIO(file_data)
    xls = pd.ExcelFile(buf, engine="openpyxl")
    product_hint = os.path.splitext(os.path.basename(filename))[0].replace("-", " ")

    all_rows: list[dict] = []
    sheets_lower = {name.lower().strip(): name for name in xls.sheet_names}
    if "master" in sheets_lower:
        buf.seek(0)
        master_df = pd.read_excel(buf, sheet_name=sheets_lower["master"], header=None, engine="openpyxl")
        master_rows = _parse_headered_sheet(master_df, product_hint)
        if master_rows:
            all_rows = _dedup(_fill_generic_teams(master_rows))
            return pd.DataFrame(all_rows, columns=["Player", "Team", "Box Type", "Numbering", "Hits"])

    for sheet_name in xls.sheet_names:
        if _is_skip_sheet(sheet_name):
            continue
        buf.seek(0)
        df = pd.read_excel(buf, sheet_name=sheet_name, header=None, engine="openpyxl")
        all_rows.extend(_parse_headered_sheet(df, product_hint))
        all_rows.extend(_parse_section_sheet(df, sheet_name, product_hint))

    all_rows = _dedup(_fill_generic_teams(all_rows))
    if not all_rows:
        raise ValueError("Aucune carte extraite du fichier Marvel.")

    return pd.DataFrame(all_rows, columns=["Player", "Team", "Box Type", "Numbering", "Hits"])
