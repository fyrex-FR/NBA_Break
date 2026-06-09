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

_NBA_TEAMS = {
    "Atlanta Hawks", "Boston Celtics", "Brooklyn Nets", "Charlotte Hornets",
    "Chicago Bulls", "Cleveland Cavaliers", "Dallas Mavericks", "Denver Nuggets",
    "Detroit Pistons", "Golden State Warriors", "Houston Rockets", "Indiana Pacers",
    "Los Angeles Clippers", "Los Angeles Lakers", "Memphis Grizzlies", "Miami Heat",
    "Milwaukee Bucks", "Minnesota Timberwolves", "New Orleans Pelicans", "New York Knicks",
    "Oklahoma City Thunder", "Orlando Magic", "Philadelphia 76ers", "Phoenix Suns",
    "Portland Trail Blazers", "Sacramento Kings", "San Antonio Spurs", "Toronto Raptors",
    "Utah Jazz", "Washington Wizards",
}


def _normalize_player(name: str) -> str:
    """Convertit 'Nom, Prénom' → 'Prénom Nom' et retire les virgules parasites."""
    name = name.strip()
    # "Murray, Dejounte" → "Dejounte Murray"
    if ',' in name:
        parts = [p.strip() for p in name.split(',', 1)]
        if len(parts) == 2 and parts[1]:
            name = f"{parts[1]} {parts[0]}"
        else:
            name = parts[0]
    return name.strip()


def _is_card_number(val) -> bool:
    """True si la valeur est un numéro de carte entier (pas un texte de header)."""
    try:
        n = float(str(val).strip())
        return n == int(n) and n > 0
    except (ValueError, TypeError):
        return False


def _clean_cell(value) -> str:
    if value is None or (isinstance(value, float) and value != value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def _clean_numbering(value) -> str:
    text = _clean_cell(value)
    if not text:
        return ""
    if re.fullmatch(r"1/1", text):
        return "1/1"
    if re.fullmatch(r"/\d{1,5}", text):
        return text
    if re.fullmatch(r"\d{1,5}", text):
        return f"/{text}"
    return ""


def _append_note_box_type(box_type: str, note: str) -> str:
    note = _clean_cell(note).strip()
    if not note:
        return box_type
    note = re.sub(r"^\s*[-–—]\s*", "", note).strip()
    if not note or re.fullmatch(r"RC", note, re.IGNORECASE) or _clean_numbering(note):
        return box_type
    if note.lower() in box_type.lower():
        return box_type
    return f"{box_type} - {note}".strip(" -")


def _parse_beckett_teams_fixed(df: pd.DataFrame) -> list[dict]:
    """Parse Beckett's Teams tab when it uses the common fixed layout.

    Typical columns are: Team, Card Type, Card #, Player, Numbering/RC/Note,
    with an optional extra note/sub-brand column for products like Chronicles.
    """
    work = df.dropna(how="all").reset_index(drop=True)
    if work.shape[1] < 4:
        return []

    first_col = work[0].map(_clean_cell)
    team_hits = first_col.isin(_NBA_TEAMS).sum()
    if team_hits < 10:
        return []

    seen: set[tuple] = set()
    rows = []
    for _, row in work.iterrows():
        team = _clean_cell(row.iloc[0] if work.shape[1] > 0 else "")
        box_type = _clean_cell(row.iloc[1] if work.shape[1] > 1 else "")
        player = _normalize_player(_clean_cell(row.iloc[3] if work.shape[1] > 3 else ""))
        if team not in _NBA_TEAMS or not player:
            continue

        note_1 = _clean_cell(row.iloc[4] if work.shape[1] > 4 else "")
        note_2 = _clean_cell(row.iloc[5] if work.shape[1] > 5 else "")
        numbering = _clean_numbering(note_1) or _clean_numbering(note_2)
        box_type = _append_note_box_type(box_type or "Base", note_1)
        box_type = _append_note_box_type(box_type, note_2)
        if re.fullmatch(r"RC", note_1, re.IGNORECASE) and "rookie" not in box_type.lower():
            box_type = f"{box_type} RC".strip()

        key = (player.lower(), team.lower(), box_type.lower(), numbering)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"Player": player, "Team": team, "Box Type": box_type, "Numbering": numbering})

    return rows


def _parse_cardboard_connection_sheet(df: pd.DataFrame) -> list[dict]:
    """Parse Cardboard Connection exports: CARD SET, CARD #, ATHLETE, TEAM, SEQ."""
    work = df.dropna(how="all").reset_index(drop=True)
    if work.empty:
        return []

    header_idx = None
    for idx, row in work.head(10).iterrows():
        cells = [_clean_cell(v).upper() for v in row.tolist()]
        if "CARD SET" in cells and "ATHLETE" in cells and "TEAM" in cells:
            header_idx = idx
            break
    if header_idx is None:
        return []

    headers = [_clean_cell(v).upper() for v in work.iloc[header_idx].tolist()]
    try:
        set_col = headers.index("CARD SET")
        player_col = headers.index("ATHLETE")
        team_col = headers.index("TEAM")
    except ValueError:
        return []
    seq_col = headers.index("SEQ") if "SEQ" in headers else None

    seen: set[tuple] = set()
    rows = []
    for _, row in work.iloc[header_idx + 1:].iterrows():
        box_type = _clean_cell(row.iloc[set_col] if set_col < work.shape[1] else "")
        player = _normalize_player(_clean_cell(row.iloc[player_col] if player_col < work.shape[1] else ""))
        team = _clean_cell(row.iloc[team_col] if team_col < work.shape[1] else "")
        if not box_type or not player:
            continue
        numbering = _clean_numbering(row.iloc[seq_col]) if seq_col is not None and seq_col < work.shape[1] else ""
        box_type = re.sub(r"^\s*(?:19|20)\d{2}(?:-\d{2})?\s+Panini\s+", "", box_type, flags=re.IGNORECASE)
        box_type = re.sub(r"^\s*(?:19|20)\d{2}(?:-\d{2})?\s+", "", box_type, flags=re.IGNORECASE)
        box_type = re.sub(r"^\s*Impeccable Basketball\s*-\s*", "", box_type, flags=re.IGNORECASE)
        box_type = re.sub(r"^\s*Recon Basketball\s*-\s*", "", box_type, flags=re.IGNORECASE)
        key = (player.lower(), team.lower(), box_type.lower(), numbering)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"Player": player, "Team": team, "Box Type": box_type, "Numbering": numbering})
    return rows


_COLUMN_DETECT_PROMPT = """Tu reçois un tableau (lignes JSON) extrait d'un fichier Excel Beckett — onglet Teams d'une checklist de cartes sportives.

Chaque ligne est un dict {"0": val, "1": val, ...} où les clés sont les indices de colonnes.

Identifie quel indice de colonne correspond à chaque rôle :
- player : nom du joueur (texte, très varié, une valeur par joueur)
- team : équipe ou nationalité (texte, se répète souvent — même équipe pour plusieurs joueurs)
- box_type : type de carte (Base, Auto, Patch, Rookie...) — peut être absent
- numbering : tirage limité format /99 /199 etc. — peut être absent
- card_num : numéro de carte (entier, ex: 1, 42, 150) — à ignorer dans le parsing

Retourne UNIQUEMENT un objet JSON valide, sans markdown :
{"player": 3, "team": 0, "box_type": 1, "numbering": null, "card_num": 2}

Si un rôle est absent mets null. Ne devine pas — si tu n'es pas sûr mets null.
"""


def _detect_columns_with_gemini(sample_rows: list[dict]) -> dict:
    """Envoie un échantillon de lignes à Gemini pour identifier les indices de colonnes."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurée.")

    sample_text = json.dumps(sample_rows, ensure_ascii=False)
    url = f"{_API_BASE}/{_GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": _COLUMN_DETECT_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": sample_text}]}],
        "generationConfig": {"maxOutputTokens": 1024},
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, json=payload)
    if resp.status_code != 200:
        raise ValueError(f"Gemini column detection {resp.status_code}: {resp.text[:200]}")

    raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    # Retire les balises markdown éventuelles
    raw = re.sub(r'^```[a-z]*\s*', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\s*```$', '', raw)
    raw = raw.strip()
    # Extrait le premier objet JSON trouvé dans la réponse
    start = raw.find('{')
    end = raw.rfind('}')
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"Pas de JSON dans la réponse Gemini : {raw[:200]}")
    return json.loads(raw[start:end + 1])


def _parse_teams_sheet(df: pd.DataFrame) -> list[dict]:
    """Parse l'onglet Teams de Beckett.

    Envoie les 30 premières lignes à Gemini pour identifier les indices de colonnes,
    puis parse tout le DataFrame avec cette carte — aucune position supposée fixe.
    """
    df = df.dropna(how="all").reset_index(drop=True)

    fixed_rows = _parse_beckett_teams_fixed(df)
    if fixed_rows:
        return fixed_rows

    # Prépare un échantillon lisible pour Gemini (30 premières lignes non vides)
    sample = []
    for _, row in df.head(30).iterrows():
        line = {}
        for c in range(df.shape[1]):
            v = row.iloc[c]
            if v is not None and not (isinstance(v, float) and v != v):
                line[str(c)] = str(v).strip()
        if line:
            sample.append(line)
        if len(sample) >= 15:
            break

    if not sample:
        return []

    col_map = _detect_columns_with_gemini(sample)

    def _idx(role: str) -> int | None:
        v = col_map.get(role)
        return int(v) if v is not None else None

    player_col = _idx("player")
    team_col = _idx("team")
    box_type_col = _idx("box_type")
    numbering_col = _idx("numbering")

    if player_col is None:
        return []

    def _get_cell(row, col):
        if col is None or col >= df.shape[1]:
            return ""
        raw = row.iloc[col]
        if raw is None or (isinstance(raw, float) and raw != raw):
            return ""
        v = str(raw).strip()
        return "" if v.lower() == "nan" else v

    seen: set[tuple] = set()
    rows = []
    for _, row in df.iterrows():
        player = _normalize_player(_get_cell(row, player_col))
        if not player or _is_card_number(player):
            continue

        team = _get_cell(row, team_col)
        box_type = _get_cell(row, box_type_col)

        numbering = _clean_numbering(_get_cell(row, numbering_col)) if numbering_col is not None else ""

        key = (player.lower(), team.lower(), box_type.lower(), numbering)
        if key in seen:
            continue
        seen.add(key)

        rows.append({"Player": player, "Team": team, "Box Type": box_type, "Numbering": numbering})

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
            player = _normalize_player(str(row.get(player_col, "") or "").strip())
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
            rows = _parse_cardboard_connection_sheet(df)
            if rows:
                all_rows.extend(rows)
                continue
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
        player = _normalize_player(str(row.get("Player") or "").strip())
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
