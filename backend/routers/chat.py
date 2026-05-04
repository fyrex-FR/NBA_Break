"""
Chat endpoint — two-step RAG via existing analysis pipeline.

Step 1: LLM extracts entities (player, team, intent) from the question
Step 2: run_analysis + targeted filter → ≤30 rows of context
Step 3: LLM streams a natural language answer with that context
"""

import os
import json
import logging

import httpx

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.analysis_engine import run_analysis, enrich_dataframe, load_master_data
from ..services.card_logic import CATEGORY_AUTO_MEM, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

_MODEL = "qwen2.5:7b-instruct"

_ENTITY_PROMPT = """Tu reçois une question sur des cartes sportives.
Extrais les entités en JSON strict, sans markdown, sans explication.

Format exact :
{"player": "Prénom Nom ou null", "team": "Équipe ou null", "intent": "auto_list|stats|compare|general"}

Intentions :
- auto_list : cartes auto/mem/logoman/case hit d'un joueur
- stats : comptage ou classement (combien, qui a le plus...)
- compare : comparer joueurs ou équipes
- general : question générale

Réponds UNIQUEMENT avec le JSON.
"""

_ANSWER_PROMPT = """Tu es un assistant spécialisé dans les cartes sportives (NBA, NFL, Soccer).
Réponds en français, de façon concise et pratique.
Utilise les données fournies pour répondre précisément. Si les données sont insuffisantes, dis-le sans inventer.

Si tu mentionnes un joueur précis présent dans les données, termine ta réponse par cette ligne exacte :
[VOIR_JOUEUR:Prénom Nom]
"""


def _ollama_url() -> str:
    return os.getenv("OLLAMA_URL", "http://100.96.225.66:11434")


async def _call_ollama_sync(messages: list[dict], num_ctx: int = 2048) -> str:
    payload = {"model": _MODEL, "messages": messages, "stream": False, "options": {"num_ctx": num_ctx}}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{_ollama_url()}/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()["message"]["content"].strip()


async def _stream_ollama(messages: list[dict], num_ctx: int = 4096):
    payload = {"model": _MODEL, "messages": messages, "stream": True, "options": {"num_ctx": num_ctx}}
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", f"{_ollama_url()}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                token = data.get("message", {}).get("content", "")
                if token:
                    yield token
                if data.get("done"):
                    break


def _extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return {}


def _build_context(df, entities: dict) -> str:
    """Filter enriched DataFrame to ≤30 relevant rows and format as text."""
    player = (entities.get("player") or "").strip()
    team = (entities.get("team") or "").strip()
    intent = entities.get("intent", "general")

    result = df.copy()

    if player:
        mask = result["Player"].str.contains(player, case=False, na=False)
        result = result[mask]

    if team and not player:
        mask = result["Team"].str.contains(team, case=False, na=False)
        result = result[mask]

    # Pour auto_list, filtre sur les cartes premium uniquement
    if intent == "auto_list" and not result.empty:
        premium_cats = {CATEGORY_AUTO_MEM, CATEGORY_LOGOMAN, CATEGORY_CASE_HIT}
        premium = result[result["Category"].isin(premium_cats)]
        if not premium.empty:
            result = premium

    result = result.head(30)

    if result.empty:
        return ""

    cols = [c for c in ["Player", "Team", "Box Type", "Numbering", "Category", "checklist_name"] if c in result.columns]
    lines = []
    for _, row in result[cols].iterrows():
        parts = [f"{c}: {row[c]}" for c in cols if str(row[c]) not in ("", "nan")]
        lines.append(" | ".join(parts))
    return "\n".join(lines)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    sport_key: str = "nba"
    checklist_ids: list[str] = []
    master_key: str | None = None


@router.post("")
async def chat(req: ChatRequest):
    user_question = next(
        (m.content for m in reversed(req.messages) if m.role == "user"), ""
    )

    async def generate():
        # Étape 1 : extraction entités
        try:
            entity_raw = await _call_ollama_sync([
                {"role": "system", "content": _ENTITY_PROMPT},
                {"role": "user", "content": user_question},
            ])
            entities = _extract_json(entity_raw)
        except Exception as e:
            logger.warning("Entity extraction failed: %s", e)
            entities = {}

        # Étape 2 : charge et filtre les données via le pipeline existant
        context_text = ""
        if req.checklist_ids and req.master_key:
            try:
                import os as _os
                overrides_path = _os.path.join(
                    _os.path.dirname(_os.path.dirname(__file__)), "keyword_overrides.json"
                )
                keyword_overrides = {}
                if _os.path.exists(overrides_path):
                    with open(overrides_path, "r", encoding="utf-8") as f:
                        keyword_overrides = json.load(f)

                result = run_analysis(
                    sport_key=req.sport_key,
                    checklist_ids=req.checklist_ids,
                    master_key=req.master_key,
                    keyword_overrides_root=keyword_overrides,
                )
                df = result["df"]
                context_text = _build_context(df, entities)
            except Exception as e:
                logger.warning("Analysis failed for chat context: %s", e)

        # Étape 3 : réponse streamée
        system = _ANSWER_PROMPT
        if context_text:
            system += f"\n\nDonnées pertinentes :\n{context_text}"

        messages = [{"role": "system", "content": system}]
        messages += [{"role": m.role, "content": m.content} for m in req.messages]

        async for token in _stream_ollama(messages, num_ctx=4096):
            yield token

    return StreamingResponse(generate(), media_type="text/plain")
