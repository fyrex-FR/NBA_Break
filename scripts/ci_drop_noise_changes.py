#!/usr/bin/env python3
"""
Annule les modifications « de forme » laissées par les imports : un fichier JSON
dont seule la date d'import change (`_imported_at`, `updated_at`) est remis dans
son état committé. Ainsi la mise à jour hebdomadaire n'ouvre une PR que si les
données ont vraiment changé.

Usage (dans le dépôt, après les imports) : python3 scripts/ci_drop_noise_changes.py
"""

from __future__ import annotations

import json
import subprocess
import sys

NOISE_KEYS = {"_imported_at", "updated_at"}


def strip(value):
    if isinstance(value, dict):
        return {k: strip(v) for k, v in value.items() if k not in NOISE_KEYS}
    if isinstance(value, list):
        return [strip(v) for v in value]
    return value


def main() -> int:
    changed = subprocess.run(["git", "diff", "--name-only"], capture_output=True, text=True, check=True).stdout.split()
    reverted = kept = 0
    for path in changed:
        if not path.endswith(".json"):
            kept += 1
            continue
        old = subprocess.run(["git", "show", f"HEAD:{path}"], capture_output=True, text=True)
        if old.returncode != 0:
            kept += 1
            continue
        try:
            same = strip(json.loads(old.stdout)) == strip(json.loads(open(path, encoding="utf-8").read()))
        except json.JSONDecodeError:
            same = False
        if same:
            subprocess.run(["git", "checkout", "--", path], check=True)
            reverted += 1
        else:
            kept += 1
    print(f"{kept} fichier(s) réellement modifié(s), {reverted} changement(s) de date annulé(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
