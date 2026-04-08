#!/usr/bin/env python3
"""
Génère nba_rookies.parquet en interrogeant Claude API sur chaque joueur unique du master.

Usage:
    pip install anthropic pandas pyarrow boto3 python-dotenv
    python scripts/generate_rookies.py [--dry-run] [--batch-size 50]

Le script :
1. Charge parquet_master/nba.parquet depuis R2
2. Extrait tous les noms de joueurs uniques (gère les "Joueur A / Joueur B")
3. Envoie par batches à Claude pour identifier les rookies (année, équipe, draft pick)
4. Génère un DataFrame et le pousse sur R2 → parquet_master/nba_rookies.parquet
"""

import argparse
import json
import os
import sys
import re
import unicodedata
from io import BytesIO
from pathlib import Path

# Load .env from project root
root = Path(__file__).parent.parent
env_file = root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

import boto3
import pandas as pd
import anthropic

# ── Config ──────────────────────────────────────────────────────────────────

SPORT_KEY = "nba"
MASTER_KEY = f"parquet_master/{SPORT_KEY}.parquet"
ROOKIES_KEY = f"parquet_master/{SPORT_KEY}_rookies.parquet"

CLAUDE_MODEL = "claude-opus-4-6"

SYSTEM_PROMPT = """Tu es un expert NBA. Pour chaque joueur fourni, détermine s'il a eu une saison rookie en NBA.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, avec ce format exact :
{
  "players": [
    {
      "player_name": "Nom exact fourni",
      "is_rookie": true,
      "year_start": 2024,
      "year_end": 2025,
      "team": "Atlanta Hawks",
      "draft_pick": 1
    },
    {
      "player_name": "Nom exact fourni",
      "is_rookie": false
    }
  ]
}

Règles :
- is_rookie: true si le joueur a eu une saison rookie NBA (peu importe l'année)
- year_start / year_end: année civile de début et fin de la saison rookie (ex: 2024 et 2025 pour 2024-25)
- team: équipe lors de sa saison rookie (nom complet en anglais)
- draft_pick: numéro de pick global de draft (entier), null si undrafted ou inconnu
- Si tu n'es pas sûr du joueur (inconnu, fictif, non-NBA), mettre is_rookie: false
- Ne jamais inventer des informations incertaines — préfère is_rookie: false"""

USER_PROMPT_TEMPLATE = """Voici une liste de joueurs NBA. Pour chacun, dis-moi s'il a eu une saison rookie NBA :

{players}

Réponds avec le JSON demandé."""


# ── R2 helpers ───────────────────────────────────────────────────────────────

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
    print(f"📥 Chargement de {MASTER_KEY} depuis R2...")
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


# ── Normalisation ─────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Lowercase, sans accents."""
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()

def extract_players(df: pd.DataFrame) -> list[str]:
    """Extrait les noms uniques depuis la colonne Player (gère 'A / B')."""
    names = set()
    for raw in df["Player"].dropna().unique():
        for part in str(raw).split("/"):
            name = part.strip()
            if name:
                names.add(name)
    return sorted(names)


# ── Claude API ────────────────────────────────────────────────────────────────

def query_claude(client: anthropic.Anthropic, players: list[str]) -> list[dict]:
    """Interroge Claude pour un batch de joueurs. Retourne la liste parsée."""
    players_text = "\n".join(f"- {p}" for p in players)
    prompt = USER_PROMPT_TEMPLATE.format(players=players_text)

    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Extraire le JSON si Claude a ajouté du texte autour
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if not match:
        print(f"  ⚠️  Réponse non parseable : {raw[:200]}")
        return []

    try:
        data = json.loads(match.group())
        return data.get("players", [])
    except json.JSONDecodeError as e:
        print(f"  ⚠️  JSON invalide : {e}")
        return []


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Génère nba_rookies.parquet via Claude API")
    parser.add_argument("--dry-run", action="store_true", help="Ne pousse pas sur R2")
    parser.add_argument("--batch-size", type=int, default=50, help="Joueurs par appel API (défaut: 50)")
    args = parser.parse_args()

    # Vérification des variables d'env
    missing = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"❌ Variables manquantes : {', '.join(missing)}")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ ANTHROPIC_API_KEY manquante")
        sys.exit(1)

    r2 = get_r2_client()
    claude = anthropic.Anthropic()

    # 1. Charger le master
    master_df = load_master(r2)
    all_players = extract_players(master_df)
    print(f"🎴 {len(all_players)} joueurs uniques trouvés dans le master")

    # 2. Interroger Claude par batches
    all_results = []
    batch_size = args.batch_size
    total_batches = (len(all_players) + batch_size - 1) // batch_size

    for i in range(0, len(all_players), batch_size):
        batch = all_players[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"🤖 Batch {batch_num}/{total_batches} ({len(batch)} joueurs)...")

        results = query_claude(claude, batch)
        rookies_in_batch = sum(1 for r in results if r.get("is_rookie"))
        print(f"   → {rookies_in_batch} rookies identifiés")
        all_results.extend(results)

    # 3. Filtrer et construire le DataFrame
    rookies = [r for r in all_results if r.get("is_rookie")]
    print(f"\n🏆 Total : {len(rookies)} rookies sur {len(all_players)} joueurs")

    if not rookies:
        print("❌ Aucun rookie trouvé, abandon.")
        sys.exit(1)

    rows = []
    for r in rookies:
        rows.append({
            "player_name": r.get("player_name", ""),
            "year_start": r.get("year_start"),
            "year_end": r.get("year_end"),
            "team": r.get("team", ""),
            "draft_pick": r.get("draft_pick"),
        })

    df = pd.DataFrame(rows)
    df["year_start"] = pd.to_numeric(df["year_start"], errors="coerce").astype("Int64")
    df["year_end"] = pd.to_numeric(df["year_end"], errors="coerce").astype("Int64")
    df["draft_pick"] = pd.to_numeric(df["draft_pick"], errors="coerce").astype("Int64")
    df = df.sort_values(["year_start", "draft_pick"]).reset_index(drop=True)

    print(df.to_string(index=False))

    # 4. Push sur R2
    if args.dry_run:
        print("\n🔍 Dry-run — pas de push R2")
        df.to_parquet("nba_rookies_preview.parquet", index=False)
        print("   Fichier local : nba_rookies_preview.parquet")
    else:
        push_rookies(r2, df)


if __name__ == "__main__":
    main()
