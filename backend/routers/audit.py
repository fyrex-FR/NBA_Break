"""Audit endpoints — FC Compta break verification."""

from __future__ import annotations

import json
import os
from collections import Counter

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..services.voggt_client import VoggtError
from ..services.audit_engine import audit_show
from ..services import box_prices

router = APIRouter(prefix="/api", tags=["audit"])

_GEMINI_MODEL = "gemini-2.5-flash"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_COMPARE_SYSTEM_PROMPT = """Tu es un expert en breaks de cartes sportives (NBA, NFL, soccer).
On te donne deux breaks avec leur liste de spots (equipes + prix). Compare-les.

Retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de ```, pas d'explication autour).

Format JSON attendu:
{
  "spot_comparison": [
    {
      "team": "Lakers",
      "price_a": "45€",
      "price_b": "38€",
      "split_a": 1,
      "split_b": 2,
      "notes": "Split en 2 chez B, prix total 76€ vs 45€ chez A"
    }
  ],
  "global_analysis": "Analyse globale en 3-5 phrases: differences de structure, pricing, contenu, red flags",
  "verdict": "Resume en 1 phrase: quel break est le plus interessant et pourquoi"
}

Regles pour spot_comparison:
- Regroupe les spots par equipe (team name normalise)
- split_a / split_b = combien de fois cette equipe apparait dans chaque break (1 = complet, 2+ = splitte)
- Si une equipe est absente d'un break, price = null et split = 0
- Ne liste que les equipes ou il y a une difference notable (prix, split, absence). Max 15 lignes.
- notes: court commentaire sur la difference

Regles pour global_analysis:
- Compare les prix moyens par spot
- Signale les splits (quand un break split des teams et pas l'autre)
- Compare le contenu (produits, types de box)
- Signale les red flags (incoherences, prix suspects)
- Prends en compte le cout des box fourni pour calculer la marge reelle

Sois direct, factuel, en francais."""


class CompareRequest(BaseModel):
    break_a: dict
    break_b: dict
    box_cost_a: float | None = None
    box_cost_b: float | None = None


def _build_spots_summary(spots: list[dict]) -> list[dict]:
    """Build a condensed spots list with prices and split counts."""
    name_data: dict[str, list] = {}
    for s in spots:
        name = s.get("name") or "?"
        price = s.get("price_eur")
        name_data.setdefault(name, []).append(price)
    return [
        {"team": name, "count": len(prices), "prices": [p for p in prices if p is not None]}
        for name, prices in name_data.items()
    ]


def _summarize_for_llm(b: dict, box_cost_override: float | None) -> dict:
    """Full break summary for LLM including all spots."""
    spots = b.get("spots", [])
    spots_summary = _build_spots_summary(spots)
    box_cost = box_cost_override if box_cost_override is not None else b.get("total_box_cost", 0)
    grille = b.get("grille_announced", 0)
    margin = round(grille - box_cost, 2) if grille and box_cost else None

    return {
        "title": b.get("title", ""),
        "sport": b.get("sport", ""),
        "total_spots": b.get("total_spots", 0),
        "grille_total": grille,
        "prix_moyen_spot": round(grille / len(spots), 2) if spots and grille else None,
        "cout_box": box_cost,
        "marge": margin,
        "produits": [p.get("label", "") for p in b.get("detected_products", [])],
        "box_types": [e.get("box_type") for e in b.get("box_estimates", []) if e.get("box_type")],
        "inconsistencies": [i.get("message", "") for i in b.get("inconsistencies", [])],
        "spots": spots_summary,
    }


@router.get("/audit")
def run_audit(url: str = Query(..., description="URL ou ID du show Voggt")):
    """Run a full break audit on a Voggt show."""
    try:
        return audit_show(url)
    except VoggtError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erreur audit: {exc}")


@router.post("/compare")
def compare_breaks(req: CompareRequest):
    """Compare two breaks spot-by-spot using Gemini AI."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configuree.")

    summary_a = _summarize_for_llm(req.break_a, req.box_cost_a)
    summary_b = _summarize_for_llm(req.break_b, req.box_cost_b)

    user_prompt = f"""Compare ces deux breaks spot par spot:

BREAK A:
{json.dumps(summary_a, ensure_ascii=False, indent=2)}

BREAK B:
{json.dumps(summary_b, ensure_ascii=False, indent=2)}"""

    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": _COMPARE_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"maxOutputTokens": 4096},
    }

    try:
        with httpx.Client(timeout=45) as client:
            resp = client.post(url, json=payload)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Gemini API {resp.status_code}")
        data = resp.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        analysis = json.loads(raw)
    except json.JSONDecodeError:
        analysis = {"spot_comparison": [], "global_analysis": raw, "verdict": ""}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Gemini: {exc}")

    return {
        "break_a_summary": summary_a,
        "break_b_summary": summary_b,
        "analysis": analysis,
    }


@router.get("/box-prices")
def get_box_prices():
    """Return the box price reference table."""
    return box_prices.get_all()


@router.put("/box-prices")
def update_box_prices(data: dict):
    """Replace the box price reference table."""
    box_prices.save_prices(data)
    return {"status": "ok"}
