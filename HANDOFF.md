# Reprise de session — Checklist Optimizer Migration

## Contexte

Migration d'une app Streamlit d'analyse de checklists de cartes sportives (NBA, NFL, Soccer, Tennis) vers **FastAPI + React**.

**Contrainte absolue** : Les fichiers Streamlit racine (`app.py`, `card_logic.py`, `sports_config.py`, `r2_storage.py`, `keyword_overrides.json`, `requirements.txt`) ne doivent JAMAIS être modifiés/supprimés — l'app Streamlit Community Cloud est branchée dessus.

## Worktree

```bash
cd /Users/fyrex/Code/CopieStreamlit/.claude/worktrees/silly-austin
```

Branche : `claude/silly-austin`

## Lancer en dev

```bash
# Terminal 1 — Backend
cd /Users/fyrex/Code/CopieStreamlit/.claude/worktrees/silly-austin
python3 -m uvicorn backend.main:app --reload --port 8000

# Terminal 2 — Frontend
cd /Users/fyrex/Code/CopieStreamlit/.claude/worktrees/silly-austin/frontend
npx vite dev
```

Le `.env` à la racine du worktree contient les clés R2 (Cloudflare).

## Ce qui est fait (15 commits)

### Backend (`backend/`)
- 7 services Python extraits de app.py (zéro dépendance Streamlit)
- FastAPI avec 14 endpoints : sports, analyze, simulate/break, presets CRUD, export, upload, template, overrides detect/save, health
- Modèles Pydantic, CORS, python-dotenv

### Frontend (`frontend/`)
- React 19 + TypeScript + Vite 8 + Tailwind 4
- TanStack Table, TanStack Query, Recharts, Zustand (persist localStorage)
- Design dark mode inspiré Linear, accents couleur par sport

### Vues implémentées (11/16)
- ✅ 🌍 Vue Globale (rankings + bar charts)
- ✅ 💎 Autos & Patchs (filtré par catégorie)
- ✅ 🔥 Logoman (filtré par catégorie)
- ✅ ✨ Case Hits (filtré par catégorie)
- ✅ 👥 Multi-Joueurs (avec filtre joueur)
- ✅ 🔍 Analyse Joueur (SearchSelect + pie → barres horizontales + filtres catégorie)
- ✅ 🛡️ Analyse Équipe (idem)
- ✅ 📁 Par Fichier
- ✅ 🧪 Détection Auto/Mem (checkboxes par card type, sauvegarde R2)
- ✅ ⚖️ Comparateur Joueurs
- ✅ 🧩 Simulation de Break (team/player/letter)
- ✅ 📤 Export (Excel personnalisé + template)

### Vues restantes (placeholder "bientôt disponible")
- 🧠 Value Picks
- 🧨 Rookies
- 💸 Cost par Pick
- ⚡ Live Mode

### Composants partagés
- DataTable (tri, pagination, recherche, click-through, menu ⋮ export CSV/copier)
- MetricCard, CategoryBadge, CategoryBreakdown, DistributionBar
- SearchSelect (input texte + dropdown filtré + navigation clavier ↑↓ Enter Escape)
- ViewTabs (onglets catégorie + sous-vues en pills)
- Sidebar (sport selector, checklists collapsibles par année, presets save/load)

### UX
- Persistance localStorage (sport, checklists, vue active)
- Export CSV nommé selon le contexte (LeBron_James.csv, break_team.csv, etc.)
- Accès réseau local activé (mobile/tablette)

## Fichiers design à consulter
- `design-md/linear.app/DESIGN.md` — référence principale
- `design-md/vercel/DESIGN.md` — shadow-as-border
- `design-md/stripe/DESIGN.md` — polish premium

## Plan complet
- `.claude/plans/cryptic-sparking-hellman.md`

## Stack
- Backend : Python 3.9, FastAPI, Pandas, boto3 (R2), openpyxl, pyarrow
- Frontend : React 19, TypeScript, Vite 8, Tailwind 4, TanStack Table/Query, Recharts, Zustand
