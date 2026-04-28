"""Gemini Flash parser — converts raw checklist content to normalized rows."""

import os
import json
import re

from google import genai
from google.genai import types as genai_types


SYSTEM_PROMPT = """Tu reçois un contenu brut : texte collé, tableau, CSV ou Excel converti en texte.
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
- Numbering : numérotation ex "25" ou "/25" ou "/99" — garde uniquement le nombre ou chaîne vide
- Ne crée pas de lignes dupliquées (même joueur + même Box Type = une seule ligne)
- Ne génère pas de données inventées — si une valeur est absente, laisse la chaîne vide

Règles spécifiques aux fichiers Excel Beckett :
- Si un onglet "Teams" est présent, utilise-le EN PRIORITÉ — il est organisé par équipe et contient toutes les cartes sans doublons de couleurs
- Évite l'onglet "Master" ou tout onglet nommé "Master Checklist" — il liste toutes les variations de couleurs/parallels et génèrerait des doublons inutiles
- Si l'onglet "Teams" est absent, additionne les onglets Base, Insert(s), Auto(graph(s)), Memo(rabilia) pour construire la checklist complète
- Attention à la numérotation : chaque carte a un numéro de carte (ex: #42) qui n'est PAS la numérotation — la numérotation est le tirage limité ex "/25", "/99", "/149". Si tu ne vois pas de tirage explicite, laisse Numbering vide
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def parse_with_gemini(raw_content: str, instructions: str | None = None) -> dict:
    """Send raw checklist content to Gemini Flash and return normalized rows.

    Returns:
        {"checklist_name": str, "rows": [{"Player", "Team", "Box Type", "Numbering"}, ...]}
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurée.")

    client = genai.Client(api_key=api_key)

    prompt = raw_content
    if instructions:
        prompt = f"{raw_content}\n\n---\nInstructions supplémentaires : {instructions}"

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
        ),
    )
    result = _extract_json(response.text)

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


# Onglets à ignorer (variations/parallels)
_SKIP_SHEETS = {"master", "master checklist", "checklist", "parallels"}

# Onglets prioritaires (par ordre de préférence)
_PRIORITY_SHEETS = ["teams", "team"]

# Onglets à combiner si Teams absent
_COMBINE_SHEETS = ["base", "inserts", "insert", "autographs", "autograph", "autos", "auto",
                   "memorabilia", "memo", "rookies", "rookie", "signatures", "signature"]


def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from uploaded file (Excel or CSV).

    For Beckett-style Excel files:
    - Prioritizes the 'Teams' sheet if present
    - Skips 'Master' and similar sheets
    - Falls back to combining Base/Insert/Auto/Memo sheets
    """
    import io
    import pandas as pd

    fname = filename.lower()
    if not fname.endswith((".xlsx", ".xls")):
        return file_bytes.decode("utf-8", errors="replace")

    buf = io.BytesIO(file_bytes)
    xls = pd.ExcelFile(buf, engine="openpyxl")
    sheet_names = xls.sheet_names
    sheets_lower = {s.lower().strip(): s for s in sheet_names}

    def read_sheet(name: str) -> str:
        df = pd.read_excel(buf, sheet_name=name, engine="openpyxl", header=None)
        if df.empty:
            return ""
        return f"[Feuille: {name}]\n{df.to_csv(index=False, header=False)}"

    # 1. Cherche un onglet Teams en priorité
    for key in _PRIORITY_SHEETS:
        if key in sheets_lower:
            return read_sheet(sheets_lower[key])

    # 2. Combine Base + Inserts + Autos + Memo en ignorant Master
    combine_parts = []
    for key in _COMBINE_SHEETS:
        if key in sheets_lower and key not in _SKIP_SHEETS:
            content = read_sheet(sheets_lower[key])
            if content:
                combine_parts.append(content)

    if combine_parts:
        return "\n\n".join(combine_parts)

    # 3. Fallback : tous les onglets sauf ceux à ignorer
    parts = []
    for name in sheet_names:
        if name.lower().strip() not in _SKIP_SHEETS:
            content = read_sheet(name)
            if content:
                parts.append(content)
    return "\n\n".join(parts) if parts else read_sheet(sheet_names[0])
