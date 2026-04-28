"""Checklist parser — Gemini Flash pour texte brut, parser Python pour fichiers Excel Beckett."""

import io
import os
import json
import re

import httpx
import pandas as pd


_GEMINI_MODEL = "gemini-2.5-flash"
_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

SYSTEM_PROMPT = """Tu reçois du texte brut : copier-coller depuis un site, un forum, un CSV, etc.
C'est une checklist de cartes sportives.

Retourne UNIQUEMENT un objet JSON valide, sans markdown, sans explication, sans balise ```json.

Format attendu :
{
  "checklist_name": "nom détecté ou déduit du contenu",
  "rows": [
    {"Player": "Nom du joueur", "Team": "Équipe ou nationalité", "Box Type": "Type de carte", "Numbering": ""},
    ...
  ]
}

Règles strictes :
- Player : nom du joueur (obligatoire — ignore toute ligne sans joueur identifiable)
- Team : équipe ou nationalité (chaîne vide si inconnu)
- Box Type : type de carte tel que Base, Rookie, Auto, Patch, Refractor, Prizm, etc. (chaîne vide si non précisé)
- Numbering : tirage limité uniquement ex "/25", "/99" — NE PAS confondre avec le numéro de carte (#42). Si pas de tirage explicite, laisse vide
- Ne crée pas de lignes dupliquées
- Ne génère pas de données inventées — si une valeur est absente, laisse la chaîne vide
"""

# Onglets à ignorer
_SKIP_SHEETS = {"master", "master checklist", "parallels"}

# Onglets Teams prioritaires
_PRIORITY_SHEETS = ["teams", "team"]

# Onglets à combiner si pas de Teams
_COMBINE_SHEETS = [
    "base", "inserts", "insert", "autographs", "autograph", "autos", "auto",
    "memorabilia", "memo", "rookies", "rookie", "signatures", "signature",
]

# Box Type par défaut selon le nom de l'onglet
_SHEET_BOX_TYPE = {
    "base": "Base",
    "inserts": "Insert", "insert": "Insert",
    "autographs": "Auto", "autograph": "Auto", "autos": "Auto", "auto": "Auto",
    "memorabilia": "Memorabilia", "memo": "Memorabilia",
    "rookies": "Rookie", "rookie": "Rookie",
    "signatures": "Auto", "signature": "Auto",
}


def _is_card_number(val) -> bool:
    """True si la valeur est un numéro de carte entier (pas un texte de header)."""
    try:
        n = float(str(val).strip())
        return n == int(n) and n > 0
    except (ValueError, TypeError):
        return False


def _parse_teams_sheet(df: pd.DataFrame) -> list[dict]:
    """Parse l'onglet Teams de Beckett.

    Structure typique : équipe | box type | numéro carte | joueur | (RC optionnel)
    Mais les colonnes peuvent varier — on les détecte dynamiquement.
    """
    rows = []
    df = df.dropna(how="all")

    # Détecter les colonnes : cherche celle qui contient des équipes NBA connues
    # et celle qui contient des noms de joueurs (strings longs)
    # Heuristique : col équipe = répétitions fréquentes d'une même valeur
    # col joueur = valeurs uniques longues
    # col box type = valeurs courtes répétées (Base, Auto, etc.)
    # col numéro = entiers

    ncols = df.shape[1]

    # Score chaque colonne
    col_scores = {}
    for c in range(ncols):
        col = df[c].dropna().astype(str)
        numeric_ratio = col.apply(_is_card_number).mean()
        unique_ratio = col.nunique() / max(len(col), 1)
        avg_len = col.str.len().mean()
        repeat_ratio = 1 - unique_ratio
        col_scores[c] = {
            "numeric": numeric_ratio,
            "unique": unique_ratio,
            "avg_len": avg_len,
            "repeat": repeat_ratio,
        }

    # Colonne équipe : haute répétition, longueur moyenne (~15 chars)
    team_col = max(range(ncols), key=lambda c: col_scores[c]["repeat"] * (col_scores[c]["avg_len"] > 5))

    # Colonne numéro de carte : haute proportion de numériques
    num_candidates = sorted(range(ncols), key=lambda c: -col_scores[c]["numeric"])
    card_num_col = num_candidates[0] if col_scores[num_candidates[0]]["numeric"] > 0.5 else None

    # Colonne joueur : haute unicité, longueur moyenne (~15 chars), pas numérique
    player_col = max(
        [c for c in range(ncols) if c != team_col and c != card_num_col],
        key=lambda c: col_scores[c]["unique"] * (1 - col_scores[c]["numeric"]) * (col_scores[c]["avg_len"] > 5),
        default=None,
    )

    # Colonne box type : restante avec faible unicité et courte
    used = {team_col, card_num_col, player_col}
    remaining = [c for c in range(ncols) if c not in used]
    box_type_col = None
    if remaining:
        box_type_col = min(remaining, key=lambda c: col_scores[c]["unique"])

    for _, row in df.iterrows():
        if player_col is None:
            continue
        player = str(row.get(player_col, "") or "").strip()
        if not player or player.lower() == "nan" or _is_card_number(player):
            continue
        team = str(row.get(team_col, "") or "").strip() if team_col is not None else ""
        if team.lower() == "nan":
            team = ""
        box_type = str(row.get(box_type_col, "") or "").strip() if box_type_col is not None else ""
        if box_type.lower() == "nan":
            box_type = ""

        rows.append({
            "Player": player,
            "Team": team,
            "Box Type": box_type,
            "Numbering": "",
        })

    return rows


def _parse_standard_sheet(df: pd.DataFrame, default_box_type: str = "") -> list[dict]:
    """Parse un onglet standard Beckett (Base, Inserts, Autos...).

    Structure typique : numéro carte | joueur | équipe
    Les lignes avec col0 non-entier sont des headers de section à ignorer.
    Les sections ont souvent un titre en col0 (ex: "2020 Checklist", "Gold Team Checklist").
    On détecte le box type depuis ces titres de section.
    """
    rows = []
    current_box_type = default_box_type

    # Détecter les colonnes joueur et équipe parmi les colonnes non-numéro
    df = df.dropna(how="all")
    ncols = df.shape[1]

    # Filtre les lignes data (col0 = entier)
    data_mask = df[0].apply(_is_card_number)
    data_rows = df[data_mask]

    if data_rows.empty:
        return []

    # Parmi les colonnes restantes (1, 2, ...) détecter joueur vs équipe
    # Joueur : haute unicité ; équipe : haute répétition
    candidate_cols = list(range(1, ncols))
    if not candidate_cols:
        return []

    col_unique = {}
    for c in candidate_cols:
        col = data_rows[c].dropna().astype(str)
        col_unique[c] = col.nunique() / max(len(col), 1) if len(col) > 0 else 0

    # Joueur = plus haute unicité, équipe = plus basse unicité
    sorted_cols = sorted(candidate_cols, key=lambda c: -col_unique[c])
    player_col = sorted_cols[0] if sorted_cols else None
    team_col = sorted_cols[-1] if len(sorted_cols) > 1 else None

    # Parcours ligne par ligne pour détecter les titres de section
    for _, row in df.iterrows():
        val0 = row[0]
        if _is_card_number(val0):
            # Ligne de carte
            if player_col is None:
                continue
            player = str(row.get(player_col, "") or "").strip()
            if not player or player.lower() == "nan":
                continue
            team = str(row.get(team_col, "") or "").strip() if team_col is not None else ""
            if team.lower() == "nan":
                team = ""

            rows.append({
                "Player": player,
                "Team": team,
                "Box Type": current_box_type,
                "Numbering": "",
            })
        else:
            # Ligne header de section — extraire le box type
            text = str(val0).strip()
            if text and text.lower() not in ("nan", "") and "parallel" not in text.lower():
                # Nettoie "Gold Team Checklist" → "Gold Team"
                bt = re.sub(r'\s*checklist\s*$', '', text, flags=re.IGNORECASE).strip()
                bt = re.sub(r'\s*\d+\s*cards?\s*\.?\s*$', '', bt, flags=re.IGNORECASE).strip()
                if bt:
                    current_box_type = bt

    return rows


def parse_excel_beckett(file_bytes: bytes, filename: str) -> dict:
    """Parse un fichier Excel Beckett directement en Python, sans IA."""
    buf = io.BytesIO(file_bytes)
    xls = pd.ExcelFile(buf, engine="openpyxl")
    sheets_lower = {s.lower().strip(): s for s in xls.sheet_names}

    checklist_name = os.path.splitext(os.path.basename(filename))[0]
    all_rows = []

    # 1. Priorité à l'onglet Teams
    for key in _PRIORITY_SHEETS:
        if key in sheets_lower:
            df = pd.read_excel(buf, sheet_name=sheets_lower[key], engine="openpyxl", header=None)
            rows = _parse_teams_sheet(df)
            if rows:
                return {"checklist_name": checklist_name, "rows": _dedup(rows)}

    # 2. Combine les onglets structurés
    for key in _COMBINE_SHEETS:
        if key in sheets_lower and key not in _SKIP_SHEETS:
            df = pd.read_excel(buf, sheet_name=sheets_lower[key], engine="openpyxl", header=None)
            default_bt = _SHEET_BOX_TYPE.get(key, key.capitalize())
            rows = _parse_standard_sheet(df, default_box_type=default_bt)
            all_rows.extend(rows)

    if all_rows:
        return {"checklist_name": checklist_name, "rows": _dedup(all_rows)}

    # 3. Fallback : tous les onglets non ignorés
    for name in xls.sheet_names:
        key = name.lower().strip()
        if key not in _SKIP_SHEETS:
            df = pd.read_excel(buf, sheet_name=name, engine="openpyxl", header=None)
            rows = _parse_standard_sheet(df, default_box_type=name)
            all_rows.extend(rows)

    return {"checklist_name": checklist_name, "rows": _dedup(all_rows)}


def _dedup(rows: list[dict]) -> list[dict]:
    """Déduplique par (Player, Box Type)."""
    seen = set()
    out = []
    for r in rows:
        key = (r["Player"].lower(), r["Box Type"].lower())
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


def parse_with_gemini(raw_content: str, instructions: str | None = None) -> dict:
    """Envoie du texte brut à Gemini et retourne les lignes normalisées."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurée.")

    prompt = raw_content
    if instructions:
        prompt = f"{raw_content}\n\n---\nInstructions supplémentaires : {instructions}"

    url = f"{_API_BASE}/{_GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": 8192},
    }

    with httpx.Client(timeout=60) as client:
        resp = client.post(url, json=payload)

    if resp.status_code != 200:
        raise ValueError(f"Gemini API {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    result = _extract_json(raw)

    if "rows" not in result or not isinstance(result["rows"], list):
        raise ValueError("Réponse Gemini invalide : champ 'rows' manquant.")

    clean_rows = []
    for row in result["rows"]:
        if not isinstance(row, dict):
            continue
        player = str(row.get("Player") or "").strip()
        if not player:
            continue
        clean_rows.append({
            "Player": player,
            "Team": str(row.get("Team") or "").strip(),
            "Box Type": str(row.get("Box Type") or "").strip(),
            "Numbering": str(row.get("Numbering") or "").strip(),
        })

    return {
        "checklist_name": str(result.get("checklist_name") or "import-gemini").strip(),
        "rows": clean_rows,
    }
