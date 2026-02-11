#!/usr/bin/env python3
import argparse
import os
import re
import sys

import pandas as pd

from card_logic import normalize_team_name
from r2_storage import (
    get_r2_config,
    is_r2_configured,
    list_r2_parquet_keys,
    r2_object_exists,
    read_r2_parquet,
    upload_parquet_dataframe,
)
from sports_config import SPORT_PROFILES, get_sport_profile


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


def extract_year(filename, sport_key):
    base_name = os.path.basename(str(filename))
    if sport_key == "nfl":
        match = re.search(r"((?:19|20)\d{2})", base_name)
        return match.group(1) if match else "Inconnue"
    season_match = re.search(r"((?:19|20)\d{2}-\d{2})", base_name)
    if season_match:
        return season_match.group(1)
    year_match = re.search(r"((?:19|20)\d{2})", base_name)
    return year_match.group(1) if year_match else "Inconnue"


def extract_product(filename):
    name = os.path.splitext(os.path.basename(str(filename)))[0]
    name = re.sub(r"\d{4}-\d{2}", "", name)
    name = re.sub(r"checklist", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+", " ", name)
    return name.strip(" -_")


def split_slash_values(value):
    text = "" if value is None else str(value)
    return [p.strip() for p in text.split("/") if p and p.strip() and p.strip().lower() != "nan"]


def normalize_team_value(value, team_aliases):
    parts = split_slash_values(value)
    if not parts:
        raw = "" if value is None else str(value).strip()
        return normalize_team_name(raw, team_aliases)
    normalized = [normalize_team_name(team, team_aliases).strip() for team in parts]
    deduped = []
    for team in normalized:
        if team and team not in deduped:
            deduped.append(team)
    return "/".join(deduped)


def checklist_name_from_filename(original_filename):
    stem = os.path.splitext(os.path.basename(str(original_filename)))[0]
    safe_stem = re.sub(r"[^\w\-\. ]+", "-", stem).strip().replace(" ", "-")
    safe_stem = re.sub(r"-{2,}", "-", safe_stem).strip("-")
    return f"{safe_stem}.parquet" if safe_stem else "checklist.parquet"


def normalize_checklist_id(value):
    text = os.path.splitext(os.path.basename(str(value or "")))[0].lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text if text else "checklist"


def normalize_checklist_columns(df):
    work = df.copy()
    work.columns = [str(c).strip() for c in work.columns]
    cols = list(work.columns)
    has_required_base = all(c in cols for c in ["Player", "Team", "Numbering"])
    has_card_type = "Card Type" in cols
    has_box_type = "Box Type" in cols
    if not has_required_base or (not has_card_type and not has_box_type):
        raise ValueError(
            "Format invalide. Colonnes attendues: Player, Team, Card Type/Box Type, Numbering."
        )
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


def ensure_master_dataframe_schema(df, sport_key):
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
    if "Year" not in work.columns:
        work["Year"] = work["checklist_name"].apply(lambda n: extract_year(n, sport_key))
    if "Product" not in work.columns:
        work["Product"] = work["checklist_name"].apply(extract_product)
    if "Sport" not in work.columns:
        work["Sport"] = sport_key
    else:
        work["Sport"] = work["Sport"].astype(str).str.strip().replace("", sport_key).fillna(sport_key)
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


def master_parquet_key_for_sport(sport_key):
    return f"{MASTER_PARQUET_PREFIX}/{sport_key}.parquet"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Migrate legacy R2 parquet/<sport> checklists into parquet_master/<sport>.parquet"
    )
    parser.add_argument(
        "--sports",
        default="all",
        help="Comma-separated sport keys (ex: nba,nfl,tennis) or 'all' (default).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute and print migration stats without writing to R2.",
    )
    parser.add_argument(
        "--replace-master",
        action="store_true",
        help="Ignore existing master content and rebuild from legacy files only.",
    )
    return parser.parse_args()


def resolve_sports(value):
    available = sorted(SPORT_PROFILES.keys())
    if value.strip().lower() == "all":
        return available
    requested = [v.strip().lower() for v in value.split(",") if v.strip()]
    valid = [k for k in requested if k in SPORT_PROFILES]
    invalid = [k for k in requested if k not in SPORT_PROFILES]
    if invalid:
        print(f"[warn] sports inconnus ignorés: {', '.join(invalid)}")
    return valid


def migrate_sport(config, sport_key, dry_run=False, replace_master=False):
    profile = get_sport_profile(sport_key)
    team_aliases = profile.get("team_aliases", {})
    legacy_keys = list_r2_parquet_keys(config, sport_key)
    master_key = master_parquet_key_for_sport(sport_key)

    if not legacy_keys:
        print(f"[{sport_key}] aucun parquet legacy trouvé.")
        return

    if (not replace_master) and r2_object_exists(config, master_key):
        try:
            existing_master = read_r2_parquet(config, master_key)
            existing_master = ensure_master_dataframe_schema(existing_master, sport_key)
        except Exception as exc:
            print(f"[{sport_key}] lecture master existant impossible, départ à vide: {exc}")
            existing_master = pd.DataFrame(columns=MASTER_COLUMNS)
    else:
        existing_master = pd.DataFrame(columns=MASTER_COLUMNS)

    migrated_frames = []
    migrated_ids = set()
    failed_files = []
    migrated_rows = 0

    for key in legacy_keys:
        filename = os.path.basename(key)
        checklist_name = checklist_name_from_filename(filename)
        checklist_id = normalize_checklist_id(checklist_name)
        try:
            df = read_r2_parquet(config, key)
            df = normalize_checklist_columns(df)
            df["Team"] = df["Team"].apply(lambda t: normalize_team_value(t, team_aliases))
            df["Hits"] = 1
            df["File"] = checklist_name
            df["Year"] = extract_year(checklist_name, sport_key)
            df["Product"] = extract_product(checklist_name)
            df["Sport"] = sport_key
            df["checklist_id"] = checklist_id
            df["checklist_name"] = checklist_name
            df = ensure_master_dataframe_schema(df, sport_key)
            migrated_frames.append(df)
            migrated_ids.add(checklist_id)
            migrated_rows += len(df)
        except Exception as exc:
            failed_files.append((key, str(exc)))

    if not migrated_frames and existing_master.empty:
        print(f"[{sport_key}] rien à migrer.")
        if failed_files:
            for k, err in failed_files:
                print(f"  - fail {k}: {err}")
        return

    base_master = existing_master
    if not base_master.empty and migrated_ids:
        base_master = base_master[~base_master["checklist_id"].astype(str).isin(migrated_ids)].copy()

    final_master = pd.concat([base_master] + migrated_frames, ignore_index=True) if migrated_frames else base_master
    final_master = ensure_master_dataframe_schema(final_master, sport_key)

    print(
        f"[{sport_key}] legacy_files={len(legacy_keys)} migrated_files={len(migrated_frames)} "
        f"failed={len(failed_files)} migrated_rows={migrated_rows} final_rows={len(final_master)} "
        f"target={master_key}"
    )
    if failed_files:
        for k, err in failed_files[:10]:
            print(f"  - fail {k}: {err}")
        if len(failed_files) > 10:
            print(f"  ... {len(failed_files) - 10} erreurs supplémentaires")

    if dry_run:
        return

    size = upload_parquet_dataframe(config, master_key, final_master)
    print(f"[{sport_key}] master écrit ({size} bytes)")


def main():
    args = parse_args()
    config = get_r2_config()
    if not is_r2_configured(config):
        print("R2 non configuré. Définis R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET et R2_ENDPOINT.")
        return 1

    sports = resolve_sports(args.sports)
    if not sports:
        print("Aucun sport valide à migrer.")
        return 1

    print(f"Sports: {', '.join(sports)}")
    print(f"Mode: {'DRY RUN' if args.dry_run else 'WRITE'}")
    if args.replace_master:
        print("Option: replace-master activée")

    for sport_key in sports:
        migrate_sport(
            config=config,
            sport_key=sport_key,
            dry_run=args.dry_run,
            replace_master=args.replace_master,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
