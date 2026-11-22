"""/api/analyze: réponse mémorisée en octets, même JSON que l'ancien encodage FastAPI."""

import json
from unittest.mock import patch

import pandas as pd
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from backend.models.schemas import AnalyzeResponse
from backend.routers import analysis
from backend.services import r2_storage

CONFIG = {"bucket": "b", "endpoint": "e", "access_key_id": "k", "secret_access_key": "s"}
BODY = {"sport_key": "nba", "checklist_ids": ["b", "a"], "master_key": "parquet_master/nba.parquet"}


class FakeClient:
    def __init__(self):
        self.etag = "v1"

    def head_object(self, Bucket, Key):
        return {"ETag": self.etag}


def _result():
    df = pd.DataFrame({"Player": ["Zoé", "Ana"], "Hits": [3, 1], "Score": [1.5, 20.0], "Numbering": ["/25", None]})
    return {
        "df": df,
        "player_rankings": df[["Player", "Hits"]],
        "team_rankings": pd.DataFrame({"Team": ["T"], "Hits": [4]}),
        "category_summary": {"Auto": 3, "Base": 1},
        "enabled_views": {"rookies": True},
        "metadata": {"total_rows": 2, "sport_key": "nba"},
    }


class Harness:
    def __init__(self, sport="nba"):
        self.client = FakeClient()
        self.calls = 0
        self.overrides = {"a": 1}
        self.aliases = {"version": 1, "sports": {}}
        app = FastAPI()
        app.include_router(analysis.router)
        self.http = TestClient(app)

    def run_analysis(self, **kw):
        self.calls += 1
        return _result()

    def post(self, body=BODY):
        r2_storage_patch = patch.object(r2_storage, "make_r2_client", return_value=self.client)
        with r2_storage_patch, \
             patch.object(analysis, "run_analysis", side_effect=self.run_analysis), \
             patch.object(analysis, "get_r2_config", return_value=CONFIG), \
             patch.object(analysis, "is_r2_configured", return_value=True), \
             patch.object(analysis, "_load_keyword_overrides", side_effect=lambda: dict(self.overrides)), \
             patch.object(analysis, "load_checklist_aliases", side_effect=lambda: dict(self.aliases)), \
             patch.object(r2_storage, "_VALIDATE_TTL_S", 0.0):
            return self.http.post("/api/analyze", json=body)


def setup_function(_):
    r2_storage.invalidate_r2_cache()


def test_meme_json_que_l_ancien_encodage():
    r = Harness().post()
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    res = _result()
    legacy = JSONResponse(jsonable_encoder(AnalyzeResponse(
        cards=res["df"].to_dict(orient="records"),
        player_rankings=res["player_rankings"].to_dict(orient="records"),
        team_rankings=res["team_rankings"].to_dict(orient="records"),
        category_summary=res["category_summary"], enabled_views=res["enabled_views"], metadata=res["metadata"],
    ))).body
    assert r.json() == json.loads(legacy)
    assert r.json()["cards"][1]["Numbering"] is None and r.json()["cards"][0]["Player"] == "Zoé"


def test_deuxieme_appel_sert_le_cache_meme_ordre_d_ids_different():
    h = Harness()
    first = h.post()
    second = h.post({**BODY, "checklist_ids": ["a", "b"]})
    assert h.calls == 1 and first.content == second.content


def test_selection_differente_recalcule():
    h = Harness()
    h.post()
    h.post({**BODY, "checklist_ids": ["a"]})
    assert h.calls == 2


def test_overrides_ou_alias_modifies_recalculent():
    h = Harness()
    h.post()
    h.overrides = {"a": 2}
    h.post()
    assert h.calls == 2
    h.aliases = {"version": 2, "sports": {}}
    h.post()
    assert h.calls == 3


def test_master_modifie_sur_r2_recalcule():
    h = Harness()
    h.post()
    h.client.etag = "v2"
    h.post()
    assert h.calls == 2


def test_all_et_marvel_ne_sont_pas_memorises():
    for sport in ("all", "marvel"):
        h = Harness()
        h.post({**BODY, "sport_key": sport})
        h.post({**BODY, "sport_key": sport})
        assert h.calls == 2


def test_erreur_d_analyse_reste_une_400_et_n_est_pas_memorisee():
    h = Harness()

    def boom(**kw):
        h.calls += 1
        raise ValueError("Aucune ligne trouvée pour la sélection.")

    h.run_analysis = boom
    assert h.post().status_code == 400
    r = h.post()
    assert r.status_code == 400 and "Aucune ligne" in r.json()["detail"] and h.calls == 2


def test_magasin_borne():
    h = Harness()
    for i in range(analysis._RESULTS_MAX + 5):
        h.post({**BODY, "checklist_ids": [f"c{i}"]})
    assert h.calls == analysis._RESULTS_MAX + 5
    h.post({**BODY, "checklist_ids": ["c0"]})  # la plus ancienne a été évincée
    assert h.calls == analysis._RESULTS_MAX + 6
