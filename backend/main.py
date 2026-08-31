"""
Checklist Optimizer API — FastAPI backend.

Run with:
    python3 -m uvicorn backend.main:app --reload --port 8000
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env file before anything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import sports, analysis, simulation, presets, export, upload, overrides, players, rookies, smart_upload, chat, jarvis, break_scout, audit, marvel_attributions, odds, polls

app = FastAPI(
    title="Checklist Optimizer API",
    version="0.1.0",
    description="API pour l'analyse de checklists de cartes sportives.",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}

# Register routers
app.include_router(sports.router)
app.include_router(analysis.router)
app.include_router(simulation.router)
app.include_router(presets.router)
app.include_router(export.router)
app.include_router(upload.router)
app.include_router(overrides.router)
app.include_router(players.router)
app.include_router(rookies.router)
app.include_router(smart_upload.router)
app.include_router(chat.router)
app.include_router(jarvis.router)
app.include_router(break_scout.router)
app.include_router(audit.router)
app.include_router(marvel_attributions.router)
app.include_router(odds.router)
app.include_router(polls.router)
