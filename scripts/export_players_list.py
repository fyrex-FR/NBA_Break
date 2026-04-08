#!/usr/bin/env python3
"""
Extrait la liste des joueurs uniques du master NBA et génère :
- players_list.txt  : un joueur par ligne (pour coller dans une IA)
- players_list.csv  : avec colonne player_name (pour Excel)

Usage:
    python scripts/export_players_list.py
"""

import os
import sys
from io import BytesIO
from pathlib import Path

root = Path(__file__).parent.parent
env_file = root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

import boto3
import pandas as pd

SPORT_KEY = "nba"
MASTER_KEY = f"parquet_master/{SPORT_KEY}.parquet"

def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

def main():
    missing = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"❌ Variables manquantes : {', '.join(missing)}")
        sys.exit(1)

    r2 = get_r2_client()
    print(f"📥 Chargement de {MASTER_KEY}...")
    resp = r2.get_object(Bucket=os.environ["R2_BUCKET"], Key=MASTER_KEY)
    df = pd.read_parquet(BytesIO(resp["Body"].read()))

    names = set()
    for raw in df["Player"].dropna().unique():
        for part in str(raw).split("/"):
            name = part.strip()
            if name:
                names.add(name)

    players = sorted(names)
    print(f"🎴 {len(players)} joueurs uniques trouvés")

    # TXT — un par ligne
    txt_path = root / "scripts" / "players_list.txt"
    txt_path.write_text("\n".join(players), encoding="utf-8")
    print(f"✅ {txt_path}")

    # CSV
    csv_path = root / "scripts" / "players_list.csv"
    pd.DataFrame({"player_name": players}).to_csv(csv_path, index=False)
    print(f"✅ {csv_path}")

if __name__ == "__main__":
    main()
