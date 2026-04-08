#!/usr/bin/env python3
"""
Génère nba_rookies.parquet en interrogeant l'API officielle NBA via nba_api.

Pour chaque joueur unique du master nba.parquet :
  1. Cherche le joueur dans la base NBA
  2. Récupère FROM_YEAR (= année de sa saison rookie)
  3. Calcule year_start / year_end (ex: 2003 → 2003/2004)
  4. Récupère équipe de draft + numéro de pick

Puis pousse parquet_master/nba_rookies.parquet sur R2.

Usage:
    python scripts/generate_rookies_nba_api.py [--dry-run] [--resume]

Options:
    --dry-run   Génère nba_rookies_preview.parquet en local, ne pousse pas sur R2
    --resume    Reprend depuis le dernier checkpoint (scripts/rookies_checkpoint.json)
"""

import argparse
import json
import os
import sys
import time
import unicodedata
import re
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
ROOKIES_KEY = f"parquet_master/{SPORT_KEY}_rookies.parquet"
CHECKPOINT_FILE = Path(__file__).parent / "rookies_checkpoint.json"

# Pause entre chaque appel API (NBA.com rate limit ~600 req/min en pratique)
API_DELAY = 0.65  # secondes


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def load_master(client) -> pd.DataFrame:
    bucket = os.environ["R2_BUCKET"]
    print(f"📥 Chargement de {MASTER_KEY}...")
    resp = client.get_object(Bucket=bucket, Key=MASTER_KEY)
    return pd.read_parquet(BytesIO(resp["Body"].read()))


def push_rookies(client, df: pd.DataFrame):
    bucket = os.environ["R2_BUCKET"]
    buf = BytesIO()
    df.to_parquet(buf, index=False)
    data = buf.getvalue()
    client.put_object(
        Bucket=bucket,
        Key=ROOKIES_KEY,
        Body=data,
        ContentType="application/octet-stream",
    )
    print(f"✅ Poussé {ROOKIES_KEY} ({len(data):,} bytes, {len(df)} rookies)")


def extract_players(df: pd.DataFrame) -> list[str]:
    names = set()
    for raw in df["Player"].dropna().unique():
        for part in str(raw).split("/"):
            name = part.strip()
            if name:
                names.add(name)
    return sorted(names)


# ── Checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint() -> dict:
    if CHECKPOINT_FILE.exists():
        return json.loads(CHECKPOINT_FILE.read_text())
    return {"processed": {}, "not_found": []}


def save_checkpoint(data: dict):
    CHECKPOINT_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


# ── NBA API lookup ────────────────────────────────────────────────────────────

def find_player(name: str, all_players: list):
    norm = normalize(name)

    # 1. Correspondance exacte normalisée
    for p in all_players:
        if normalize(p["full_name"]) == norm:
            return p

    # 2. Nom inversé "Nom, Prénom"
    parts = name.split(",")
    if len(parts) == 2:
        flipped = f"{parts[1].strip()} {parts[0].strip()}"
        norm_flip = normalize(flipped)
        for p in all_players:
            if normalize(p["full_name"]) == norm_flip:
                return p

    return None


def get_player_info(player_id: int):
    from nba_api.stats.endpoints import commonplayerinfo
    try:
        info = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=15)
        data = info.get_normalized_dict().get("CommonPlayerInfo", [])
        return data[0] if data else None
    except Exception as e:
        print(f"    ⚠️  API error: {e}")
        return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true", help="Reprendre depuis le checkpoint")
    args = parser.parse_args()

    missing = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"❌ Variables manquantes : {', '.join(missing)}")
        sys.exit(1)

    from nba_api.stats.static import players as nba_players
    all_players = nba_players.get_players()
    print(f"📚 {len(all_players)} joueurs dans la base NBA statique")

    r2 = get_r2_client()
    master_df = load_master(r2)
    player_names = extract_players(master_df)
    print(f"🎴 {len(player_names)} joueurs uniques dans le master")

    # Checkpoint
    checkpoint = load_checkpoint() if args.resume else {"processed": {}, "not_found": []}
    processed = checkpoint["processed"]  # name → row dict ou None
    not_found = checkpoint["not_found"]

    already_done = len(processed)
    if already_done > 0:
        print(f"⏩ Reprise : {already_done} joueurs déjà traités")

    todo = [n for n in player_names if n not in processed]
    total = len(todo)
    print(f"🔍 {total} joueurs à interroger\n")

    for i, name in enumerate(todo, 1):
        player_info = find_player(name, all_players)

        if not player_info:
            print(f"[{i}/{total}] ❓ Introuvable : {name}")
            processed[name] = None
            not_found.append(name)
            if i % 50 == 0:
                save_checkpoint({"processed": processed, "not_found": not_found})
            continue

        time.sleep(API_DELAY)
        bio = get_player_info(player_info["id"])

        if not bio:
            print(f"[{i}/{total}] ⚠️  API sans réponse : {name}")
            processed[name] = None
            if i % 50 == 0:
                save_checkpoint({"processed": processed, "not_found": not_found})
            continue

        from_year_raw = bio.get("FROM_YEAR")
        draft_year_raw = bio.get("DRAFT_YEAR", "")
        draft_pick_raw = bio.get("DRAFT_NUMBER", "")
        team = bio.get("TEAM_NAME", "") or bio.get("SCHOOL", "")

        # Année rookie = FROM_YEAR (première saison NBA)
        try:
            from_year = int(from_year_raw)
        except (TypeError, ValueError):
            print(f"[{i}/{total}] ⚠️  FROM_YEAR invalide ({from_year_raw}) : {name}")
            processed[name] = None
            continue

        # draft_pick
        try:
            draft_pick = int(draft_pick_raw) if draft_pick_raw and draft_pick_raw != "Undrafted" else None
        except (TypeError, ValueError):
            draft_pick = None

        row = {
            "player_name": player_info["full_name"],
            "year_start": from_year,
            "year_end": from_year + 1,
            "team": team,
            "draft_pick": draft_pick,
        }
        processed[name] = row
        print(f"[{i}/{total}] ✅ {player_info['full_name']} — rookie {from_year}-{from_year+1}, pick={draft_pick}")

        # Checkpoint toutes les 50 entrées
        if i % 50 == 0:
            save_checkpoint({"processed": processed, "not_found": not_found})
            print(f"  💾 Checkpoint sauvegardé ({i}/{total})\n")

    # Sauvegarde finale du checkpoint
    save_checkpoint({"processed": processed, "not_found": not_found})

    # Construire le DataFrame final
    rows = [v for v in processed.values() if v is not None]
    df = pd.DataFrame(rows)
    df["year_start"] = df["year_start"].astype("Int64")
    df["year_end"] = df["year_end"].astype("Int64")
    df["draft_pick"] = pd.to_numeric(df["draft_pick"], errors="coerce").astype("Int64")
    df = df.drop_duplicates(subset=["player_name"]).sort_values(["year_start", "draft_pick"]).reset_index(drop=True)

    print(f"\n🏆 {len(df)} joueurs traités au total")
    print(f"❓ {len(not_found)} introuvables : {not_found[:10]}{'...' if len(not_found) > 10 else ''}")
    print(df.head(10).to_string(index=False))

    if args.dry_run:
        out = Path(__file__).parent / "nba_rookies_preview.parquet"
        df.to_parquet(out, index=False)
        print(f"\n🔍 Dry-run — fichier local : {out}")
    else:
        push_rookies(r2, df)


if __name__ == "__main__":
    main()
