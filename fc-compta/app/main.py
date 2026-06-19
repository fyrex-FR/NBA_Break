"""FC Compta — Outil de vérification de breaks Voggt.

Stateless sauf les prix de référence des box (persistés en JSON local).

Launch from the REPO ROOT:
    uvicorn fc-compta.app.main:app --reload --port 8001
Or with sys.path set (render startCommand does this).
"""

import sys
import os

# Ensure the repo root is in path so we can import backend.services.voggt_client etc.
_repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import audit

app = FastAPI(
    title="FC Compta",
    version="0.1.0",
    description="Vérification de breaks Voggt — grille, incohérences, marge.",
)

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
    return {"status": "ok", "app": "fc-compta"}


app.include_router(audit.router)
