"""Chat endpoint — proxies to local Ollama via Tailscale, streams response."""

import os
import json
import httpx

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/chat", tags=["chat"])

_MODEL = "qwen2.5:7b-instruct"

_SYSTEM_PROMPT = """Tu es un assistant spécialisé dans les cartes sportives (NBA, NFL, Soccer).
Tu aides les utilisateurs à comprendre leurs checklists, analyser les probabilités de break,
comparer des joueurs, et maximiser la valeur de leurs boxes.
Réponds en français, de façon concise et pratique.

Si l'utilisateur pose une question sur un joueur spécifique présent dans les données,
termine TOUJOURS ta réponse par une ligne exactement de cette forme (rien d'autre sur cette ligne) :
[VOIR_JOUEUR:Prénom Nom]

Exemple : [VOIR_JOUEUR:Victor Wembanyama]
N'ajoute ce tag que si tu mentionnes un joueur précis des données chargées.
"""


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class PlayerSummary(BaseModel):
    player: str
    team: str
    cards: int
    auto_mem: int
    logoman: int
    case_hit: int


class ChatRequest(BaseModel):
    messages: list[Message]
    context: list[PlayerSummary] | None = None


@router.post("")
async def chat(req: ChatRequest):
    ollama_url = os.getenv("OLLAMA_URL", "http://100.96.225.66:11434")

    system = _SYSTEM_PROMPT
    if req.context:
        ctx_json = json.dumps([c.model_dump() for c in req.context], ensure_ascii=False)
        system += (
            "\n\nVoici le résumé des joueurs dans les checklists chargées "
            "(player, team, cards=nb total cartes, auto_mem, logoman, case_hit) :\n"
            + ctx_json
        )

    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    payload = {
        "model": _MODEL,
        "messages": messages,
        "stream": True,
        "options": {"num_ctx": 32768},
    }

    async def generate():
        async with httpx.AsyncClient(timeout=600) as client:
            async with client.stream("POST", f"{ollama_url}/api/chat", json=payload) as resp:
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

    return StreamingResponse(generate(), media_type="text/plain")
