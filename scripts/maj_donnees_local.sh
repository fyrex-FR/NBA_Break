#!/usr/bin/env bash
# Mise à jour des données (guide des boîtes, odds) en local, avec cache de pages
# persistant (~/.cache/noclim) : seules les pages nouvelles ou périmées sont
# retéléchargées. Ne pousse rien : laisse le diff dans le working tree.
#
# Usage : scripts/maj_donnees_local.sh [--refresh]
#   --refresh : ignore le cache de pages (crawl complet, lent: ~1 req/s)
#
# Environnement : venv dans ~/.venvs/nba-break-imports (backend + scripts/requirements-dev.txt).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${NOCLIM_IMPORT_VENV:-$HOME/.venvs/nba-break-imports}"
PY="$VENV/bin/python"
LOG="${NOCLIM_IMPORT_LOG:-$HOME/.hermes/cache/maj-donnees.log}"
REFRESH=""
[[ "${1:-}" == "--refresh" ]] && REFRESH="--refresh"

cd "$ROOT"
mkdir -p "$(dirname "$LOG")"
: > "$LOG"

if [[ "$(git branch --show-current)" != "main" ]] || [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "✗ working tree pas propre ou pas sur main : abandon (rien n'a été modifié)" | tee -a "$LOG"
  exit 2
fi
git pull --ff-only 2>&1 | tee -a "$LOG"

echo "== Guide des boîtes" | tee -a "$LOG"
"$PY" scripts/import_hobbychecklist_boxes.py $REFRESH 2>&1 | tee -a "$LOG"
echo "== Odds The Hobby Checklist" | tee -a "$LOG"
"$PY" scripts/import_hobbychecklist_odds.py --force 2>&1 | tee -a "$LOG"
echo "== Odds PDF Topps" | tee -a "$LOG"
"$PY" scripts/import_topps_odds_pdfs.py 2>&1 | tee -a "$LOG"
echo "== Nettoyage des changements de date seuls" | tee -a "$LOG"
"$PY" scripts/ci_drop_noise_changes.py 2>&1 | tee -a "$LOG"

echo "== Diff" | tee -a "$LOG"
git status --short -- backend/box_guides.json backend/odds frontend/public/boxes | tee -a "$LOG"
echo "DONE" | tee -a "$LOG"
