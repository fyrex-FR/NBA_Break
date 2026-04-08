#!/usr/bin/env python3
"""
Corrige les noms de joueurs dans parquet_master/nba.parquet sur R2 :
  1. Strip suffixes équipe  : "Gary Payton - Seattle Supersonics" → "Gary Payton"
  2. Normalise accents       : "Nené" → "Nene"
  3. Corrige multi-joueurs   : "Dejounte Murray Trae Young" → "Dejounte Murray / Trae Young"

Usage:
    python scripts/fix_master_players.py [--dry-run]
"""

import argparse
import os
import re
import sys
import unicodedata
from io import BytesIO
from pathlib import Path

root = Path(__file__).parent.parent
env_file = root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

import boto3
import pandas as pd

MASTER_KEY = "parquet_master/nba.parquet"

# Corrections manuelles connues
MANUAL_FIXES = {
    "Dejounte Murray Trae Young": "Dejounte Murray / Trae Young",
    "Luc Richard Mbah A Moute": "Luc Mbah a Moute",
    "Nené": "Nene",
}

def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

def fix_player_name(name: str) -> str:
    if not isinstance(name, str):
        return name

    # 1. Corrections manuelles
    if name in MANUAL_FIXES:
        return MANUAL_FIXES[name]

    # 2. Strip suffixe équipe " - Nom Équipe"
    fixed = re.sub(r'\s+-\s+.+$', '', name).strip()

    return fixed

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Affiche les changements sans pousser sur R2")
    args = parser.parse_args()

    missing = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"❌ Variables manquantes : {', '.join(missing)}")
        sys.exit(1)

    r2 = get_r2_client()
    bucket = os.environ["R2_BUCKET"]

    print(f"📥 Chargement de {MASTER_KEY}...")
    resp = r2.get_object(Bucket=bucket, Key=MASTER_KEY)
    df = pd.read_parquet(BytesIO(resp["Body"].read()))
    print(f"   {len(df):,} lignes, {df['Player'].nunique()} joueurs uniques")

    # Appliquer les corrections
    df["Player_fixed"] = df["Player"].apply(fix_player_name)

    # Rapport des changements
    changed = df[df["Player"] != df["Player_fixed"]][["Player", "Player_fixed"]].drop_duplicates()
    print(f"\n✏️  {len(changed)} corrections :")
    for _, row in changed.iterrows():
        count = (df["Player"] == row["Player"]).sum()
        print(f"   '{row['Player']}' → '{row['Player_fixed']}' ({count} lignes)")

    if args.dry_run:
        print("\n🔍 Dry-run — aucun changement poussé")
        return

    # Appliquer
    df["Player"] = df["Player_fixed"]
    df = df.drop(columns=["Player_fixed"])

    # Push sur R2
    buf = BytesIO()
    df.to_parquet(buf, index=False)
    data = buf.getvalue()
    r2.put_object(Bucket=bucket, Key=MASTER_KEY, Body=data, ContentType="application/octet-stream")
    print(f"\n✅ {MASTER_KEY} mis à jour ({len(data):,} bytes)")

if __name__ == "__main__":
    main()
