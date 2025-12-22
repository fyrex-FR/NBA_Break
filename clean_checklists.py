import os
import re
import shutil

import pandas as pd
from openpyxl import load_workbook


TEAM_MAP = {
    "atlanta": "Atlanta Hawks",
    "atlanta hawks": "Atlanta Hawks",
    "boston": "Boston Celtics",
    "boston celtics": "Boston Celtics",
    "brooklyn": "Brooklyn Nets",
    "brooklyn nets": "Brooklyn Nets",
    "charlotte": "Charlotte Hornets",
    "charlotte hornets": "Charlotte Hornets",
    "chicago": "Chicago Bulls",
    "chicago bulls": "Chicago Bulls",
    "cleveland": "Cleveland Cavaliers",
    "cleveland cavaliers": "Cleveland Cavaliers",
    "dallas": "Dallas Mavericks",
    "dallas mavericks": "Dallas Mavericks",
    "denver": "Denver Nuggets",
    "denver nuggets": "Denver Nuggets",
    "detroit": "Detroit Pistons",
    "detroit pistons": "Detroit Pistons",
    "golden state": "Golden State Warriors",
    "golden state warriors": "Golden State Warriors",
    "houston": "Houston Rockets",
    "houston rockets": "Houston Rockets",
    "indiana": "Indiana Pacers",
    "indiana pacers": "Indiana Pacers",
    "la clippers": "Los Angeles Clippers",
    "clippers": "Los Angeles Clippers",
    "los angeles clippers": "Los Angeles Clippers",
    "la lakers": "Los Angeles Lakers",
    "lakers": "Los Angeles Lakers",
    "los angeles lakers": "Los Angeles Lakers",
    "memphis": "Memphis Grizzlies",
    "memphis grizzlies": "Memphis Grizzlies",
    "miami": "Miami Heat",
    "miami heat": "Miami Heat",
    "milwaukee": "Milwaukee Bucks",
    "milwaukee bucks": "Milwaukee Bucks",
    "minnesota": "Minnesota Timberwolves",
    "minnesota timberwolves": "Minnesota Timberwolves",
    "new orleans": "New Orleans Pelicans",
    "new orleans pelicans": "New Orleans Pelicans",
    "new york": "New York Knicks",
    "new york knicks": "New York Knicks",
    "oklahoma city": "Oklahoma City Thunder",
    "oklahoma city thunder": "Oklahoma City Thunder",
    "orlando": "Orlando Magic",
    "orlando magic": "Orlando Magic",
    "philadelphia": "Philadelphia 76ers",
    "philadelphia 76ers": "Philadelphia 76ers",
    "phoenix": "Phoenix Suns",
    "phoenix suns": "Phoenix Suns",
    "portland": "Portland Trail Blazers",
    "portland trail blazers": "Portland Trail Blazers",
    "sacramento": "Sacramento Kings",
    "sacramento kings": "Sacramento Kings",
    "san antonio": "San Antonio Spurs",
    "san antonio spurs": "San Antonio Spurs",
    "toronto": "Toronto Raptors",
    "toronto raptors": "Toronto Raptors",
    "utah": "Utah Jazz",
    "utah jazz": "Utah Jazz",
    "washington": "Washington Wizards",
    "washington wizards": "Washington Wizards",
}

BOX_KEYWORDS = [
    "base", "set", "auto", "autograph", "signature", "patch", "relic",
    "mem", "jersey", "logoman", "rookie", "insert", "variation", "parallel",
]


def normalize(value):
    return str(value).strip().lower()


def normalize_team(value):
    key = normalize(value)
    return TEAM_MAP.get(key, str(value).strip())


def is_header_row(row):
    joined = " ".join(normalize(v) for v in row if isinstance(v, str))
    return "player" in joined or "team" in joined


def infer_columns(df_raw):
    team_col = None
    best_ratio = 0
    for col in df_raw.columns:
        col_values = df_raw[col].dropna().tolist()
        if not col_values:
            continue
        matches = sum(1 for v in col_values if normalize(v) in TEAM_MAP)
        ratio = matches / max(len(col_values), 1)
        if ratio > best_ratio:
            best_ratio = ratio
            team_col = col

    player_col = None
    if team_col is not None:
        if team_col - 1 in df_raw.columns:
            player_col = team_col - 1
        elif team_col + 1 in df_raw.columns:
            player_col = team_col + 1

    box_col = None
    best_score = 0
    for col in df_raw.columns:
        if col in (player_col, team_col):
            continue
        col_values = df_raw[col].dropna().tolist()
        if not col_values:
            continue
        score = sum(
            1 for v in col_values
            if isinstance(v, str) and any(k in normalize(v) for k in BOX_KEYWORDS)
        )
        if score > best_score:
            best_score = score
            box_col = col

    if team_col is None:
        team_col = df_raw.columns[-1]
    if player_col is None:
        player_col = df_raw.columns[-2] if len(df_raw.columns) >= 2 else df_raw.columns[0]
    if box_col is None:
        box_col = df_raw.columns[0]

    return player_col, team_col, box_col


def extract_numbering(row):
    # Look for explicit "/ 99" patterns or a '/' cell with neighbor numeric value.
    for cell in row:
        if isinstance(cell, str):
            match = re.search(r"/\s*(\d+)", cell)
            if match:
                return match.group(1)

    for idx, cell in enumerate(row):
        if isinstance(cell, str) and cell.strip() == "/":
            neighbors = []
            if idx - 1 >= 0:
                neighbors.append(row[idx - 1])
            if idx + 1 < len(row):
                neighbors.append(row[idx + 1])
            for n in neighbors:
                if isinstance(n, (int, float)) and not pd.isna(n):
                    return str(int(n))

    return ""


def process_file(src_path, dst_path):
    df_raw = pd.read_excel(src_path, sheet_name="Teams", header=None, engine="openpyxl")
    df_raw = df_raw.dropna(axis=1, how="all")

    if df_raw.empty:
        return 0

    if is_header_row(df_raw.iloc[0].tolist()):
        df_raw = df_raw.iloc[1:].reset_index(drop=True)

    player_col, team_col, box_col = infer_columns(df_raw)

    cleaned_rows = []
    for _, row in df_raw.iterrows():
        player = row.get(player_col)
        team = row.get(team_col)
        card_type = row.get(box_col)

        if pd.isna(player) or pd.isna(team):
            continue

        player_str = str(player).strip().rstrip(",")
        team_str = normalize_team(team)
        card_str = "" if pd.isna(card_type) else str(card_type).strip()
        numbering = extract_numbering(row.tolist())

        cleaned_rows.append([player_str, team_str, card_str, numbering])

    wb = load_workbook(dst_path)
    if "Teams_clean" in wb.sheetnames:
        del wb["Teams_clean"]
    ws = wb.create_sheet("Teams_clean")
    ws.append(["Player", "Team", "Card Type", "Numbering"])
    for r in cleaned_rows:
        ws.append(r)
    wb.save(dst_path)

    return len(cleaned_rows)


def main():
    src_dir = "/Users/fyrex/antiGravityCode/checklists"
    dst_dir = "/Users/fyrex/antiGravityCode/checklists_clean"

    os.makedirs(dst_dir, exist_ok=True)

    files = [f for f in os.listdir(src_dir) if f.endswith(".xlsx")]
    total_rows = 0

    for fname in sorted(files):
        src_path = os.path.join(src_dir, fname)
        dst_path = os.path.join(dst_dir, fname)
        shutil.copy2(src_path, dst_path)
        rows = process_file(src_path, dst_path)
        total_rows += rows
        print(f"{fname}: {rows} lignes")

    print(f"Fichiers traites: {len(files)}")
    print(f"Total lignes: {total_rows}")


if __name__ == "__main__":
    main()
