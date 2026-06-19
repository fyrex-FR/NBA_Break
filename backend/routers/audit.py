"""Audit endpoints — FC Compta break verification."""

from __future__ import annotations

import json
import os

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
On te donne deux breaks à comparer. Analyse-les et retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de ```, pas d'explication autour).

Format JSON attendu:
{
  "prix_marge": "Analyse comparative des prix et marges (2-3 phrases)",
  "splits": "Analyse des splits de teams — spots dupliqués signifient que la team est splitée entre plusieurs acheteurs (2-3 phrases)",
  "contenu": "Comparaison de la qualité du contenu — types de box (hobby > mega > blaster > value), nombre de box, produits premium vs budget (2-3 phrases)",
  "red_flags": "Signaux d'alerte — incohérences, prix suspects, choses anormales (2-3 phrases, ou 'Aucun red flag détecté' si tout est clean)",
  "verdict": "Résumé en 1 phrase: quel break est le plus intéressant et pourquoi"
}

Sois direct, factuel, en français. Si une info manque, dis-le."""


class CompareRequest(BaseModel):
    break_a: dict
    break_b: dict


def _summarize_break(b: dict) -> dict:
    """Condense a break report for the LLM prompt."""
    spots = b.get("spots", [])
    names = [s.get("name", "") for s in spots]
    from collections import Counter
    dupes = {n: c for n, c in Counter(names).items() if c > 1 and n}
    return {
        "title": b.get("title", ""),
        "sport": b.get("sport", ""),
        "total_spots": b.get("total_spots", 0),
        "sold_count": b.get("sold_count", 0),
        "grille_announced": b.get("grille_announced", 0),
        "total_sold": b.get("total_sold", 0),
        "auction_unresolved": b.get("auction_unresolved", 0),
        "margin_eur": b.get("margin_eur"),
        "margin_pct": b.get("margin_pct"),
        "total_box_cost": b.get("total_box_cost", 0),
        "box_estimates": [
            {"product": e.get("product", ""), "box_type": e.get("box_type"), "quantity": e.get("quantity", 1), "unit_price_eur": e.get("unit_price_eur")}
            for e in b.get("box_estimates", [])
        ],
        "detected_products": [p.get("label", "") for p in b.get("detected_products", [])],
        "inconsistencies": [i.get("message", "") for i in b.get("inconsistencies", [])],
        "splits": dupes if dupes else None,
        "prix_par_spot_moyen": round(b["grille_announced"] / b["total_spots"], 2) if b.get("total_spots") and b.get("grille_announced") else None,
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
    """Compare two breaks using Gemini AI analysis."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY non configurée.")

    summary_a = _summarize_break(req.break_a)
    summary_b = _summarize_break(req.break_b)

    user_prompt = f"""Compare ces deux breaks:

BREAK A:
{json.dumps(summary_a, ensure_ascii=False, indent=2)}

BREAK B:
{json.dumps(summary_b, ensure_ascii=False, indent=2)}"""

    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": _COMPARE_SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"maxOutputTokens": 2048},
    }

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, json=payload)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Gemini API {resp.status_code}")
        data = resp.json()
        raw = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        analysis = json.loads(raw)
    except json.JSONDecodeError:
        analysis = {"verdict": raw, "prix_marge": "", "splits": "", "contenu": "", "red_flags": ""}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Gemini: {exc}")

    return {
        "break_a": summary_a,
        "break_b": summary_b,
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
