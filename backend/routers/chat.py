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
"""


class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    cards: list[dict] | None = None


@router.post("")
async def chat(req: ChatRequest):
    ollama_url = os.getenv("OLLAMA_URL", "http://100.96.225.66:11434")

    system = _SYSTEM_PROMPT
    if req.cards:
        cards_json = json.dumps(req.cards, ensure_ascii=False)
        system += f"\n\nVoici les cartes actuellement chargées dans l'application (JSON) :\n{cards_json}"

    messages = [{"role": "system", "content": system}]
    messages += [{"role": m.role, "content": m.content} for m in req.messages]

    payload = {
        "model": _MODEL,
        "messages": messages,
        "stream": True,
    }

    async def generate():
        async with httpx.AsyncClient(timeout=120) as client:
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
