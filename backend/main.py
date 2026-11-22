"""
Checklist Optimizer API — FastAPI backend.

Run with:
    python3 -m uvicorn backend.main:app --reload --port 8000
"""

from dotenv import load_dotenv
load_dotenv()  # Load .env file before anything else

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import sports, analysis, simulation, presets, export, upload, overrides, players, rookies, smart_upload, chat, jarvis, break_scout, audit, marvel_attributions, odds, polls, box_guides, catalog

from .services.nba_relay import configure_nba_relay

configure_nba_relay()

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

@app.on_event("startup")
def _warm_cache():
    """Précharge le master NBA en tâche de fond (catalogue + master préparé pour l'analyse):
    la première requête après un déploiement ne paie plus le chargement complet."""
    import threading

    def warm():
        try:
            from .routers.sports import list_checklists
            from .services.analysis_engine import _prepared_master
            from .services.data_pipeline import master_parquet_key_for_sport
            from .services.r2_storage import get_r2_config, is_r2_configured

            list_checklists("nba")
            config = get_r2_config()
            if is_r2_configured(config):
                _prepared_master("nba", master_parquet_key_for_sport("nba"), config)
        except Exception:
            pass  # le préchauffage est facultatif: la première requête chargera à la demande

    threading.Thread(target=warm, daemon=True).start()


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
app.include_router(box_guides.router)
app.include_router(catalog.router)


@app.on_event("startup")
def _warm_catalog_index():
    """Prépare l'index « Qui a signé ? » en tâche de fond dès le démarrage."""
    from .services.catalog_index import ensure_index

    ensure_index("nba")
