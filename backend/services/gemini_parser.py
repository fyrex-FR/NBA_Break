"""Gemini Flash parser — converts raw checklist content to normalized rows."""

import os
import json
import re

import google.generativeai as genai


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
- Ne crée pas de lignes dupliquées
- Ne génère pas de données inventées — si une valeur est absente, laisse la chaîne vide
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def parse_with_gemini(raw_content: str) -> dict:
    """Send raw checklist content to Gemini Flash and return normalized rows.

    Returns:
        {"checklist_name": str, "rows": [{"Player", "Team", "Box Type", "Numbering"}, ...]}
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY non configurée.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    response = model.generate_content(raw_content)
    result = _extract_json(response.text)

    if "rows" not in result or not isinstance(result["rows"], list):
        raise ValueError("Réponse Gemini invalide : champ 'rows' manquant.")

    # Sanitize rows
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


def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """Extract raw text from uploaded file (Excel or CSV)."""
    import io
    import pandas as pd

    fname = filename.lower()
    if fname.endswith((".xlsx", ".xls")):
        xls = pd.ExcelFile(io.BytesIO(file_bytes), engine="openpyxl")
        parts = []
        for sheet in xls.sheet_names:
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=sheet, engine="openpyxl", header=None)
            parts.append(f"[Feuille: {sheet}]\n{df.to_csv(index=False, header=False)}")
        return "\n\n".join(parts)
    elif fname.endswith(".csv"):
        return file_bytes.decode("utf-8", errors="replace")
    else:
        return file_bytes.decode("utf-8", errors="replace")
