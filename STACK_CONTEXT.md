# Stack Context — NoClim / Checklist Optimizer

Ce document décrit l'architecture complète de l'application pour permettre une migration ou adaptation vers la même stack.

---

## Vue d'ensemble

Application web de type **SPA + API REST** pour analyser des checklists de cartes à collectionner (NBA, NFL, Soccer…). Déployée en production sous le nom **NoClim** (`nba-break.pages.dev`).

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  Frontend                   │────▶│  Backend                     │
│  React 19 + Vite            │     │  FastAPI + Uvicorn           │
│  Cloudflare Pages           │     │  Render (free tier)          │
└─────────────────────────────┘     └──────────────────────────────┘
                                              │
                                    ┌─────────▼──────────┐
                                    │  Cloudflare R2     │
                                    │  (Parquet files)   │
                                    └────────────────────┘
```

**URLs de production :**
- Frontend : `https://nba-break.pages.dev`
- Backend : `https://nba-break.onrender.com`

---

## Frontend

### Stack

| Librairie | Version | Rôle |
|-----------|---------|------|
| React | 19.2 | UI |
| TypeScript | 6.0 | Typage |
| Vite | 8.0 | Build + dev server |
| Tailwind CSS | 4.2 | Styling |
| Zustand | 5.0 | State management (persist localStorage) |
| TanStack React Query | 5.96 | Data fetching + cache |
| TanStack React Table | 8.21 | Tables (sort, pagination, export CSV) |
| Recharts | 3.8 | Graphiques (bar charts, responsive) |

### Structure

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Dispatcher de vues (pas de router)
│   ├── api/client.ts              # Client API typé (fetch wrapper)
│   ├── stores/appStore.ts         # Store Zustand unique
│   ├── types/index.ts             # Interfaces TypeScript (CardRecord, etc.)
│   ├── hooks/
│   │   ├── useUrlSync.ts          # Sync URL params ↔ store
│   │   └── useRookies.ts          # Données rookies
│   ├── constants/awards.ts        # Labels/couleurs awards NBA
│   ├── utils/countryFlag.ts       # Drapeaux emoji depuis code pays
│   └── components/
│       ├── layout/
│       │   ├── Sidebar.tsx        # Sélection checklists + upload
│       │   └── ViewTabs.tsx       # Navigation onglets
│       ├── views/                 # ~12 vues (GlobalView, PlayerDetailView, BreakSimulationView…)
│       └── shared/                # Composants réutilisables (DataTable, MetricCard, SearchSelect…)
├── public/                        # logo.png, favicon, NoClim_Guide.pdf
├── vite.config.ts                 # Proxy /api → localhost:8000 en dev
└── index.html                     # <title>NoClim</title>
```

### Routing & navigation

**Pas de React Router.** La navigation se fait uniquement via le store Zustand (`activeView`). Les vues sont des composants conditionnellement rendus dans `App.tsx`.

### Theming

Dark/light mode via attribut `data-theme` sur le `<html>`. Toutes les couleurs passent par des custom properties CSS (`--bg-primary`, `--text-primary`, `--accent`, `--border-subtle`…). Les vues n'ont aucune couleur hardcodée.

```css
[data-theme="dark"]  { --bg-primary: #0f1011; --accent: #ff6b35; … }
[data-theme="light"] { --bg-primary: #e8e8e5; --accent: #d95f28; … }
```

### Variables d'environnement

```
VITE_API_BASE=https://nba-break.onrender.com   # .env.production
# En dev : proxy Vite /api → http://localhost:8000
```

---

## Backend

### Stack

| Librairie | Version | Rôle |
|-----------|---------|------|
| FastAPI | 0.115 | Framework web (auto OpenAPI `/docs`) |
| Uvicorn | 0.30 | Serveur ASGI |
| Pydantic | 2.x | Validation des requêtes/réponses |
| Pandas | 2.0 | DataFrames en mémoire |
| PyArrow | 14+ | Lecture/écriture Parquet |
| openpyxl | 3.1 | Import Excel (.xlsx) + export |
| boto3 | 1.28 | Client S3 pour Cloudflare R2 |
| nba_api | 1.4 | Stats NBA (joueurs, équipes, awards) |
| python-multipart | 0.0.9 | Upload de fichiers (FormData) |

### Structure

```
backend/
├── main.py                        # App FastAPI, CORS, registration des routers
├── requirements.txt
├── HOF.json                       # 154 Hall of Famers NBA (statique, màj annuelle)
├── keyword_overrides.json         # Surcharges utilisateur de catégorisation
├── models/schemas.py              # Modèles Pydantic
├── routers/
│   ├── sports.py                  # GET /api/sports, /api/sports/{key}/checklists
│   ├── analysis.py                # POST /api/analyze
│   ├── simulation.py              # POST /api/simulate/break
│   ├── export.py                  # GET /api/template, POST /api/export/xlsx
│   ├── upload.py                  # POST /api/upload
│   ├── presets.py                 # CRUD /api/presets/{sport_key}
│   ├── overrides.py               # POST /api/overrides/detect + /save
│   ├── players.py                 # GET /api/players/{name}/stats
│   └── rookies.py                 # GET /api/rookies/{sport_key}
└── services/
    ├── analysis_engine.py         # Chargement master data + enrichissement
    ├── break_engine.py            # Simulation break spots (team/player/lettre)
    ├── card_logic.py              # Catégorisation carte + score de rareté
    ├── data_pipeline.py           # Normalisation, extraction métadonnées
    ├── export_engine.py           # Génération Excel export
    ├── player_stats.py            # nba_api + cache R2 (bio, stats carrière, awards)
    ├── team_stats.py              # Classements + derniers matchs
    ├── sports_config.py           # Profils par sport (règles, alias, hype tiers)
    └── r2_storage.py              # Wrapper boto3 pour R2
```

### Endpoints principaux

| Méthode | Path | Description |
|---------|------|-------------|
| GET | `/api/sports` | Liste des sports disponibles |
| GET | `/api/sports/{key}/checklists` | Checklists disponibles depuis R2 |
| POST | `/api/analyze` | Analyse + enrichissement des données |
| POST | `/api/simulate/break` | Simulation spots de break |
| POST | `/api/upload` | Upload fichier Excel → Parquet R2 |
| GET | `/api/template` | Template Excel vierge |
| POST | `/api/export/xlsx` | Export Excel des résultats |
| CRUD | `/api/presets/{sport_key}` | Gestion des presets de sélection |
| GET | `/api/players/{name}/stats` | Stats joueur NBA (cache R2 30 jours) |
| GET | `/api/health` | Health check |

### Variables d'environnement

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=checklists-prod
R2_ENDPOINT=https://{account_id}.r2.cloudflarestorage.com
```

---

## Stockage (Cloudflare R2)

R2 est utilisé comme stockage principal. Structure des objets :

```
parquet/
  {sport_key}/
    {checklist_id}.parquet      # Une checklist individuelle
    master.parquet              # Consolidation de toutes les checklists du sport

players_cache/
  {player_id}.json              # Cache stats joueur NBA (TTL 30 jours)

presets/
  {sport_key}.json              # Presets utilisateur
```

**Pattern master parquet :** À chaque upload, la checklist est ajoutée/remplacée dans `master.parquet` (upsert par `checklist_id`). Les analyses lisent uniquement le master, filtré par `checklist_ids`.

---

## Données & modèles clés

### CardRecord (frontend TypeScript)

```typescript
interface CardRecord {
  Player: string          // "LeBron James" ou "LeBron James / Anthony Davis"
  Team: string
  'Box Type': string      // Hobby, Retail, Base…
  Numbering: string       // "/25", "/99" ou ""
  Hits: number            // Toujours 1 par défaut
  Year: string            // "2025-26" (extrait du nom de fichier)
  Product: string         // "Topps Chrome" (extrait du nom de fichier)
  checklist_id: string    // Identifiant normalisé (slug du nom de fichier)
  checklist_name: string  // Nom lisible
  Category: string        // "🔥 Logoman" | "✨ Case Hit" | "💎 Auto/Mem" | "📄 Base/Autre"
  'Rarity Mult': number   // 1.0 + (100 / numbering), cap 10.0
  Score: number
}
```

### Catégorisation des cartes

La catégorie est déterminée par correspondance de mots-clés dans `Box Type` :

| Catégorie | Poids | Mots-clés types |
|-----------|-------|-----------------|
| 🔥 Logoman | 1000 | "logoman" |
| ✨ Case Hit | 500 | "downtown", "kaboom", "color blast"… |
| 💎 Auto/Mem | 20 | "auto", "patch", "relic", "autograph"… |
| 📄 Base/Autre | 1 | tout le reste |

Les règles de base sont dans `sports_config.py`. Les surcharges utilisateur sont dans `keyword_overrides.json` (éditables depuis la vue Détection).

### Score de rareté

```python
rarity_mult = 1.0 + (100 / int(numbering)) if numbering else 1.0
rarity_mult = min(rarity_mult, 10.0)
score = category_base_weight * rarity_mult * hype_multiplier
```

### Break Simulation

La simulation assigne les cartes à des spots selon la méthode choisie (équipe, joueur, lettre, custom), puis calcule pour chaque spot :

- **Auto/Memo** : nombre total de cartes auto/mem
- **Auto garanties** : cartes auto/mem dans les checklists avec garantie > 0
- **Case Hit, Logoman** : comptages directs
- **Break Score** : `(Weighted Auto × 3) + (Case Hit × 5)`
  - `Weighted Auto` = somme des auto pondérées par `hits_guaranteed` de la checklist

---

## Déploiement

### Backend (Render)

```yaml
# render.yaml
services:
  - type: web
    name: checklist-optimizer-api
    runtime: python
    buildCommand: pip install -r backend/requirements.txt
    startCommand: uvicorn backend.main:app --host 0.0.0.0 --port $PORT
    plan: free   # Attention : cold start de ~15s après inactivité
```

### Frontend (Cloudflare Pages)

- Build : `npm run build` dans `/frontend`
- Output : `frontend/dist/`
- Auto-deploy sur push de la branche `claude/silly-austin`
- Config : `wrangler.toml` ou dashboard Cloudflare

### Développement local

```bash
# Backend
uvicorn backend.main:app --reload --port 8000

# Frontend (autre terminal)
cd frontend && npx vite dev    # Port 5173, proxy /api → :8000
```

---

## Contrainte importante

Le repo contient aussi l'**application Streamlit originale** à la racine (`app.py`, `card_logic.py`, `r2_storage.py`…). Elle tourne toujours sur Streamlit Community Cloud. **Ne pas modifier ces fichiers.** Toute la nouvelle logique est dans `backend/` et `frontend/`.

---

## Configuration par sport

Chaque sport a un profil dans `backend/services/sports_config.py` :

```python
SPORT_PROFILES = {
    "nba": {
        "label": "NBA",
        "sheet_names": ["Teams_clean"],         # Onglet Excel attendu
        "category_rules": { "logoman": […], "auto_mem": […] },
        "team_aliases": { "lakers": "Los Angeles Lakers", … },
        "hype_tiers": { "Tier S": ["LeBron James", …], … },
        "enabled_views": { "🌍 Vue Globale": True, … },
    },
    "nfl": { … },
    "soccer": { … },
}
```

Pour ajouter un nouveau sport, il suffit d'ajouter une entrée dans ce dictionnaire.

---

## Format du fichier Excel importé

L'onglet doit s'appeler `Teams_clean` et contenir :

| Colonne | Statut | Notes |
|---------|--------|-------|
| `Player` | Requis | Plusieurs joueurs séparés par `/` |
| `Team` | Requis | Nom complet ou alias normalisé |
| `Card Type` ou `Box Type` | Requis | Détermine la catégorie |
| `Numbering` | Optionnel | `/25`, `/99`… |

Le nom du fichier doit inclure l'année (ex: `2025-26-Topps-Chrome-Basketball.xlsx`) pour extraction automatique.
