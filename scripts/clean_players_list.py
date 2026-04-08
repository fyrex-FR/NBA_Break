#!/usr/bin/env python3
"""
Nettoie players_list.csv avant de l'envoyer à une IA pour identification des rookies.

Corrections automatiques :
  - Supprime le suffixe " - Équipe" (ex: "Gary Payton - Seattle Supersonics")
  - Déduplique après normalisation (ex: "Schroder" == "Schroeder" → garde le plus fréquent)
  - Signale les entrées suspectes dans un rapport

Usage:
    python scripts/clean_players_list.py
    → génère scripts/players_list_clean.txt + scripts/players_list_report.txt
"""

import re
import unicodedata
from collections import Counter
from pathlib import Path
from io import BytesIO
import os
import sys

root = Path(__file__).parent.parent
env_file = root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

import boto3
import pandas as pd

SPORT_KEY = "nba"
MASTER_KEY = f"parquet_master/{SPORT_KEY}.parquet"

# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()

def strip_team_suffix(name: str) -> str:
    """'Gary Payton - Seattle Supersonics' → 'Gary Payton'
    Ne touche pas aux noms composés comme 'Shai Gilgeous-Alexander' (pas d'espace avant le tiret).
    """
    return re.sub(r'\s+-\s+.+$', '', name).strip()

def looks_like_multi_player(name: str) -> bool:
    """Détecte les noms probablement multi-joueurs sans '/'."""
    words = name.split()
    # Plus de 4 mots sans / → suspect
    return len(words) >= 4

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    missing = [k for k in ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(k)]
    if missing:
        print(f"❌ Variables manquantes : {', '.join(missing)}")
        sys.exit(1)

    r2 = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

    print(f"📥 Chargement du master...")
    resp = r2.get_object(Bucket=os.environ["R2_BUCKET"], Key=MASTER_KEY)
    df = pd.read_parquet(BytesIO(resp["Body"].read()))

    # Compter les occurrences de chaque nom brut (pour choisir la variante la plus fréquente)
    raw_counts: Counter = Counter()
    raw_players = set()
    for raw in df["Player"].dropna():
        for part in str(raw).split("/"):
            name = part.strip()
            if name:
                raw_players.add(name)
                raw_counts[name] += 1

    print(f"🎴 {len(raw_players)} noms bruts")

    cleaned = {}       # norm → nom retenu
    team_stripped = [] # noms corrigés automatiquement
    suspects_multi = []
    suspects_short = []

    for name in sorted(raw_players):
        # 1. Supprimer le suffixe équipe
        cleaned_name = strip_team_suffix(name)
        was_stripped = cleaned_name != name

        # 2. Normaliser pour dédup
        norm = normalize(cleaned_name)

        if norm not in cleaned:
            cleaned[norm] = cleaned_name
        else:
            # Garder la variante la plus fréquente dans le parquet
            existing = cleaned[norm]
            if raw_counts[cleaned_name] > raw_counts[existing]:
                cleaned[norm] = cleaned_name

        if was_stripped:
            team_stripped.append(f"  '{name}' → '{cleaned_name}'")

        # 3. Signaler les suspects
        if looks_like_multi_player(cleaned_name):
            suspects_multi.append(cleaned_name)
        elif len(cleaned_name.split()) < 2:
            suspects_short.append(cleaned_name)

    final_players = sorted(set(cleaned.values()))
    print(f"✅ {len(final_players)} joueurs après nettoyage")

    # ── Écriture des fichiers ──────────────────────────────────────────────────

    out_dir = root / "scripts"

    # Liste propre pour l'IA
    clean_txt = out_dir / "players_list_clean.txt"
    clean_txt.write_text("\n".join(final_players), encoding="utf-8")
    print(f"📄 {clean_txt}")

    # Rapport
    report_lines = []
    report_lines.append(f"=== RAPPORT NETTOYAGE JOUEURS NBA ===\n")
    report_lines.append(f"Noms bruts    : {len(raw_players)}")
    report_lines.append(f"Après nettoyage : {len(final_players)}\n")

    report_lines.append(f"\n--- Suffixes équipe supprimés ({len(team_stripped)}) ---")
    report_lines.extend(team_stripped or ["  (aucun)"])

    report_lines.append(f"\n--- Suspects multi-joueurs sans '/' ({len(suspects_multi)}) ---")
    report_lines.extend(f"  {n}" for n in suspects_multi or ["(aucun)"])

    report_lines.append(f"\n--- Noms trop courts / suspects ({len(suspects_short)}) ---")
    report_lines.extend(f"  {n}" for n in suspects_short or ["(aucun)"])

    report_path = out_dir / "players_list_report.txt"
    report_path.write_text("\n".join(report_lines), encoding="utf-8")
    print(f"📋 {report_path}")

    # Affiche un résumé du rapport
    print("\n" + "\n".join(report_lines[:40]))

if __name__ == "__main__":
    main()
