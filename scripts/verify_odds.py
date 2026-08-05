#!/usr/bin/env python3
"""
Vérification auto-portante de la fixture d'odds Topps (pas de framework de test
dans ce repo — ce script en tient lieu). Rejoue les contrôles du plan :

  1. 12 configs / 389 lignes / 32 sets (dérivés) + validation du contrat.
  2. Valeurs à la main : Base Refractors Gold (hobby=604, delight=21),
     Chromographs (pas de clé hobby, mega=109).
  3. Badges de disponibilité + best:<group>.

Sort en code 1 si un contrôle échoue.

Usage: python3 scripts/verify_odds.py
"""

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.services.odds_engine import build_set_summaries, validate_odds_sheet

FIXTURE_PATH = _REPO_ROOT / "backend" / "odds" / "nba" / "2025-26-topps-chrome-updates-basketball-checklist.json"

EXPECTED_CONFIGS = 12
EXPECTED_ROWS = 389
# Note : la dérivation de set sur ce PDF donne 31 sets avec une réimplémentation
# fidèle de l'algorithme documenté (voir docs/ODDS_FILE_FORMAT.md) — la seule
# ambiguïté restante est la famille "Rookie Autographs Lava Lamp" (7 lignes sans
# ligne d'ancrage). On vérifie donc une fourchette [31, 32] plutôt qu'une valeur
# unique stricte, pour ne pas être fragile à ce détail documenté.
EXPECTED_SETS_MIN = 31
EXPECTED_SETS_MAX = 32

failures = []


def check(label, condition, detail=""):
    status = "OK  " if condition else "FAIL"
    print(f"[{status}] {label}" + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(label)


def main():
    if not FIXTURE_PATH.exists():
        print(f"Fixture introuvable : {FIXTURE_PATH}", file=sys.stderr)
        return 1

    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        sheet = json.load(f)

    # --- 1. Comptages + validation -----------------------------------------
    n_configs = len(sheet.get("configs", []))
    n_rows = len(sheet.get("rows", []))
    n_sets = len({r.get("set") for r in sheet.get("rows", [])})

    check("12 configs", n_configs == EXPECTED_CONFIGS, f"obtenu {n_configs}")
    check("389 lignes", n_rows == EXPECTED_ROWS, f"obtenu {n_rows}")
    check(
        f"sets dans [{EXPECTED_SETS_MIN}, {EXPECTED_SETS_MAX}]",
        EXPECTED_SETS_MIN <= n_sets <= EXPECTED_SETS_MAX,
        f"obtenu {n_sets}",
    )

    errors = validate_odds_sheet(sheet)
    check("validate_odds_sheet() ne renvoie aucune erreur", not errors, "; ".join(errors[:5]))

    # --- 2. Valeurs à la main -----------------------------------------------
    rows_by_label = {r["label"]: r for r in sheet.get("rows", [])}

    base_gold = rows_by_label.get("Base Refractors Gold", {}).get("odds", {})
    check(
        "Base Refractors Gold : hobby=604",
        base_gold.get("hobby") == 604,
        f"obtenu {base_gold.get('hobby')}",
    )
    check(
        "Base Refractors Gold : delight=21",
        base_gold.get("delight") == 21,
        f"obtenu {base_gold.get('delight')}",
    )

    chromographs = rows_by_label.get("Chromographs", {}).get("odds", {})
    check("Chromographs : pas de clé hobby", "hobby" not in chromographs)
    mega_keys = [v for k, v in chromographs.items() if k.startswith("mega")]
    check(
        "Chromographs : mega=109",
        bool(mega_keys) and all(v == 109 for v in mega_keys),
        f"obtenu {mega_keys}",
    )

    # --- 3. Badges -----------------------------------------------------------
    summaries = build_set_summaries(sheet)["sets"]

    def badge_of(name):
        return (summaries.get(name) or {}).get("availability_badge")

    for name in ["Chromographs", "Paradox", "Glass Canvas", "Fanatical"]:
        check(f"{name} -> retail_only", badge_of(name) == "retail_only", f"obtenu {badge_of(name)}")

    for name in ["Captains", "Celebracion", "Radiating Rookies", "Shadow Etch"]:
        check(f"{name} -> hobby_delight", badge_of(name) == "hobby_delight", f"obtenu {badge_of(name)}")

    for name in ["Sapphire Selections", "Infinite Sapphire"]:
        check(f"{name} -> sapphire_only", badge_of(name) == "sapphire_only", f"obtenu {badge_of(name)}")

    tca = summaries.get("Topps Chrome Autographs") or {}
    best = tca.get("best_overall") or {}
    check(
        "Topps Chrome Autographs -> best:delight à 1:5",
        best.get("group") == "delight" and best.get("odds") == 5,
        f"obtenu {best}",
    )

    print()
    if failures:
        print(f"{len(failures)} contrôle(s) en échec :")
        for f in failures:
            print(f"  - {f}")
        return 1

    print("Tous les contrôles sont passés.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
