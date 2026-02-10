import argparse
import os
from pathlib import Path

import pandas as pd

from sports_config import detect_sport_from_filename, get_sport_profile


KNOWN_SPORT_DIRS = {"nba", "nfl", "soccer", "tennis"}


def normalize_columns(df):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    lower_map = {c.lower(): c for c in df.columns}

    if "box type" in lower_map:
        df = df.rename(columns={lower_map["box type"]: "Box Type"})
    elif "card type" in lower_map:
        df = df.rename(columns={lower_map["card type"]: "Box Type"})
    elif "boxtype" in lower_map:
        df = df.rename(columns={lower_map["boxtype"]: "Box Type"})

    if "player" in lower_map and "Player" not in df.columns:
        df = df.rename(columns={lower_map["player"]: "Player"})
    if "team" in lower_map and "Team" not in df.columns:
        df = df.rename(columns={lower_map["team"]: "Team"})

    if "Box Type" not in df.columns:
        df["Box Type"] = ""
    if "Numbering" not in df.columns:
        df["Numbering"] = ""

    required = ["Player", "Team", "Box Type", "Numbering"]
    if not all(c in df.columns for c in required):
        missing = [c for c in required if c not in df.columns]
        raise ValueError(f"Missing required columns: {missing}")

    df = df[required].copy()
    df["Player"] = df["Player"].astype(str).str.strip()
    df["Team"] = df["Team"].astype(str).str.strip()
    df["Box Type"] = df["Box Type"].astype(str).str.strip()
    df["Numbering"] = df["Numbering"].astype(str).str.strip()
    return df


def infer_sport_from_path(path):
    parts = [p.lower() for p in path.parts]
    for part in parts:
        if part in KNOWN_SPORT_DIRS:
            return part
    return detect_sport_from_filename(path.name)


def read_teams_clean(xlsx_path, sport_key):
    profile = get_sport_profile(sport_key)
    sheet_names = profile.get("sheet_names", ["Teams_clean"])
    for sheet_name in sheet_names:
        try:
            df = pd.read_excel(xlsx_path, sheet_name=sheet_name, engine="openpyxl")
            return normalize_columns(df)
        except ValueError:
            continue
    raise ValueError(f"No compatible sheet found in {xlsx_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert cleaned checklist Excel files to Parquet.")
    parser.add_argument("--input-dir", default="checklists_clean", help="Root folder containing cleaned xlsx files.")
    parser.add_argument("--output-dir", default="checklists_parquet", help="Output root folder for parquet files.")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    xlsx_files = sorted(input_dir.rglob("*.xlsx"))
    converted = 0
    skipped = 0

    for xlsx_path in xlsx_files:
        if xlsx_path.name.startswith("~$"):
            skipped += 1
            continue

        sport_key = infer_sport_from_path(xlsx_path)
        try:
            df = read_teams_clean(str(xlsx_path), sport_key)
        except Exception as e:
            print(f"SKIP {xlsx_path}: {e}")
            skipped += 1
            continue

        sport_output_dir = output_dir / sport_key
        sport_output_dir.mkdir(parents=True, exist_ok=True)
        parquet_name = f"{xlsx_path.stem}.parquet"
        parquet_path = sport_output_dir / parquet_name

        df.to_parquet(parquet_path, index=False)
        converted += 1
        print(f"OK   {xlsx_path} -> {parquet_path} ({len(df)} rows)")

    print(f"\nDone. Converted: {converted} | Skipped: {skipped}")


if __name__ == "__main__":
    main()
