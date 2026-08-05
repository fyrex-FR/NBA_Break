# Format des fichiers d'odds Topps

Ce document est le contrat que doit respecter un fichier d'odds pour être exploité par
l'app (badges, vue Odds, pondération de la simulation de break). Il est destiné à un
agent externe (ex. openclaw) qui écrit ces fichiers directement sur R2 — il n'y a **aucun
écran d'import** côté app pour ces fichiers.

## Emplacement sur R2

```
odds/{sport_key}/{checklist_id}.json
```

- `sport_key` : clé de sport telle qu'utilisée ailleurs dans l'app (`nba`, `nfl`, `soccer`...).
- `checklist_id` : identifiant **canonique** de la checklist (voir
  `backend/services/checklist_aliases.py`). L'app essaie aussi les identifiants legacy
  équivalents à la lecture, mais écrivez toujours sous l'id canonique.

Exemple : `odds/nba/2025-26-topps-chrome-update-basketball-checklist.json`

Un fallback local existe pour le développement/tests : `backend/odds/{sport_key}/{checklist_id}.json`
(c'est là que vit la fixture de référence de ce repo). En production, seul R2 compte.

**Absence de fichier = comportement normal.** L'app ne plante jamais si aucun fichier
d'odds n'existe pour une checklist (c'est le cas de la quasi-totalité du catalogue Panini,
qui ne publie pas ce format) — elle dégrade simplement en n'affichant aucun badge/pondération.

## Format JSON

```jsonc
{
  // Version du format. Toujours 1 pour l'instant.
  "version": 1,

  // Clé de sport — doit correspondre au segment {sport_key} du chemin R2.
  "sport": "nba",

  // Identifiant canonique de la checklist — doit correspondre au nom de fichier.
  "checklist_id": "2025-26-topps-chrome-update-basketball-checklist",

  // Libellé humain du produit (optionnel, pour affichage).
  "product_label": "2025-26 Topps Chrome Updates Basketball",

  // Provenance (optionnel).
  "source": "Topps odds sheet PDF",

  // Date de mise à jour, format YYYY-MM-DD (optionnel).
  "updated_at": "2026-08-05",

  // Les colonnes de configuration du produit. Chaque produit Topps a ses propres
  // colonnes (Hobby, Jumbo, Delight, Sapphire, Value Box EA/SE/CEE, Mega Box
  // EA/SE/CEE, Fanatics Box, Promo Pks...). Les clés sont libres.
  "configs": [
    { "key": "hobby",    "label": "Hobby",         "channel": "hobby",   "group": "hobby",   "packs_per_box": 8 },
    { "key": "jumbo",    "label": "Hobby Jumbo",   "channel": "hobby",   "group": "jumbo"   },
    { "key": "delight",  "label": "Delight",       "channel": "hobby",   "group": "delight" },
    { "key": "sapphire", "label": "Sapphire",      "channel": "special", "group": "sapphire" },
    { "key": "value_ea", "label": "Value Box EA",  "channel": "retail",  "group": "value"   },
    { "key": "mega_ea",  "label": "Mega Box EA",   "channel": "retail",  "group": "mega"    },
    { "key": "fanatics", "label": "Fanatics Box",  "channel": "special", "group": "fanatics" }
  ],

  // Une entrée par ligne du PDF d'odds. `odds` = le N de "1:N", par pack.
  "rows": [
    {
      "label": "Base Refractors Gold",
      // "set" et "parallel" sont OPTIONNELS : si absents, le backend les dérive
      // automatiquement depuis `label` (voir "Dérivation du set" plus bas). Vous
      // pouvez les fournir explicitement si vous les connaissez avec certitude.
      "set": "Base",
      "parallel": "Refractors Gold",
      // Clé absente ou valeur null = carte indisponible dans cette configuration
      // ("-" dans le PDF Topps). Une valeur présente doit être un entier > 0.
      "odds": { "hobby": 604, "jumbo": 240, "delight": 21, "value_ea": 1737, "mega_ea": 10822 }
    },
    {
      "label": "Chromographs",
      "set": "Chromographs",
      "parallel": "",
      "odds": { "value_ea": 183, "mega_ea": 109, "fanatics": 162 }
    }
  ]
}
```

## Sémantique de `channel` / `group` / `packs_per_box`

- **`channel`** ∈ `hobby | retail | special`. Sert de classification large pour l'UI
  (ex. le badge `retail_only` regroupe tout ce qui n'est pas Hobby/Jumbo, y compris des
  configs de channel `special` comme Fanatics — voir la règle des badges plus bas).
- **`group`** replie les variantes régionales (EA/SE/CEE) en une seule colonne dans l'UI.
  Groups typiques : `hobby`, `jumbo`, `delight`, `sapphire`, `value`, `mega`, `fanatics`,
  `promo`. Libre à vous d'en introduire d'autres pour un nouveau produit — tout le code
  qui les consomme (`backend/services/odds_config.py::default_channel_and_group`) est
  extensible.
- **`packs_per_box`** est **optionnel**, par config. Sans lui, l'app ne calcule que des
  métriques relatives (parts en %) — c'est de toute façon la métrique principale pour
  choisir un spot de break. Avec lui, elle affiche en plus des « hits attendus par box ».
  **En cas de doute, omettez-le** plutôt que de deviner : une valeur fausse serait pire
  qu'une absence.

## Règles de validation

Validées par `backend/services/odds_engine.py::validate_odds_sheet` (Python pur, sans
dépendance `jsonschema` — voir `backend/services/odds_schema.json` pour la version
schéma, qui documente le même contrat mais n'est pas utilisée à l'exécution) :

- Champs racine obligatoires : `version`, `sport`, `checklist_id`, `configs`, `rows`.
- `configs` : liste non vide. Chaque entrée a une `key` non vide et **unique**, un
  `label`, et un `channel` ∈ `{hobby, retail, special}`. `packs_per_box`, si présent,
  doit être un entier strictement positif.
- `rows` : liste non vide. Chaque entrée a un `label` non vide et un objet `odds` non
  vide. Chaque clé de `odds` doit référencer une `config.key` déclarée. Chaque valeur
  présente doit être un entier strictement positif (`null` ou absence = carte
  indisponible dans cette config, autorisé).

Une feuille qui ne valide pas n'empêche pas la lecture (l'app loggue les erreurs et fait
de son mieux), mais corrigez-la : les métriques dérivées (badges, pull rates) ne seront
fiables que sur un fichier valide.

## Dérivation du `set` (quand non fourni)

Quand `set` est absent d'une ligne, le backend le dérive depuis `label` avec l'algorithme
suivant (`backend/services/odds_engine.py::derive_set_root`) :

1. **Candidats** = tous les autres `label` du fichier qui sont un préfixe de ce `label`
   sur frontière de mot (ex. `"Base"` est un préfixe valide de `"Base Refractors Gold"` ;
   `"Bas"` ne l'est pas).
2. Parmi ces candidats, on garde ceux dont le **reste** (`label` moins le préfixe) est
   composé uniquement de tokens de parallèle (`Refractors`, `Superfractors`, `Geometric`,
   `Wave`, couleurs...— voir `PARALLEL_TOKENS` dans `odds_config.py`). Le reste peut
   contenir des `/` (ex. `"Magenta/Purple"`) : on découpe dessus avant de tester chaque
   partie. S'il y a plusieurs candidats valides, on prend le **plus court**.
3. Sinon, on prend le préfixe candidat le **plus long**.
4. Sinon (aucun candidat), on retire les tokens de parallèle en fin de `label`.

`parallel` (quand non fourni) = `label` moins le préfixe `set` retenu.

Ce mécanisme est un **best-effort** : fournir `set`/`parallel` explicitement dans le
fichier reste toujours préférable quand vous les connaissez, en particulier pour des
familles sans ligne d'ancrage (un insert dont aucune ligne ne porte le nom exact du set,
uniquement des variantes de couleur).

## Exemple complet minimal

```json
{
  "version": 1,
  "sport": "nba",
  "checklist_id": "exemple-checklist",
  "configs": [
    { "key": "hobby", "label": "Hobby", "channel": "hobby", "group": "hobby", "packs_per_box": 8 },
    { "key": "delight", "label": "Delight", "channel": "hobby", "group": "delight" }
  ],
  "rows": [
    { "label": "Base", "odds": { "hobby": 1, "delight": 1 } },
    { "label": "Base Refractors", "odds": { "hobby": 4, "delight": 2 } },
    { "label": "Base Refractors Gold", "odds": { "hobby": 604, "delight": 21 } },
    { "label": "Chromographs", "odds": { "delight": 109 } }
  ]
}
```

## Fixture de référence

`backend/odds/nba/2025-26-topps-chrome-update-basketball-checklist.json` — générée par
`scripts/parse_topps_odds_pdf.py` à partir de
`data/odds_sources/2025-26-topps-chrome-updates-basketball-odds.pdf`. Sert de fixture
locale (fallback sans R2) et de référence pour retester le parser. Regénérer avec :

```bash
pip install -r scripts/requirements-dev.txt
python3 scripts/parse_topps_odds_pdf.py \
  data/odds_sources/2025-26-topps-chrome-updates-basketball-odds.pdf \
  --sport nba --checklist-id 2025-26-topps-chrome-update-basketball-checklist \
  --product-label "2025-26 Topps Chrome Updates Basketball" \
  -o backend/odds/nba/2025-26-topps-chrome-update-basketball-checklist.json
```
