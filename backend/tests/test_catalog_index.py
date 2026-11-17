"""Index du catalogue (« Qui a signé ? ») : agrégation par joueur, équipe et collection."""

import pandas as pd

from backend.services import catalog_index as ci
from backend.services.card_logic import CATEGORY_AUTO, CATEGORY_BASE_OTHER, CATEGORY_CASE_HIT, CATEGORY_MEM


def _frames():
    df_p = pd.DataFrame([
        {"Player": "Victor Wembanyama", "Team": "San Antonio Spurs", "checklist_id": "a", "Category": CATEGORY_AUTO, "Hits": 3},
        {"Player": "Victor Wembanyama", "Team": "San Antonio Spurs", "checklist_id": "a", "Category": CATEGORY_BASE_OTHER, "Hits": 10},
        {"Player": "Victor Wembanyama", "Team": "San Antonio Spurs", "checklist_id": "b", "Category": CATEGORY_CASE_HIT, "Hits": 2},
        {"Player": "Stephon Castle", "Team": "San Antonio Spurs", "checklist_id": "b", "Category": CATEGORY_MEM, "Hits": 1},
    ])
    df_t = df_p.drop(columns=["Player"])
    meta = {"a": {"checklist_id": "a", "name": "Prizm", "season": "2024-25"}, "b": {"checklist_id": "b", "name": "Chrome", "season": "2025-26"}}
    return ci.build_index(df_p, df_t, meta)


def test_player_totals_and_collections():
    idx = _frames()
    d = ci.player_detail(idx, "victor wembanyama")
    assert d["totals"]["auto"] == 3 and d["totals"]["case_hit"] == 2 and d["totals"]["premium"] == 5
    assert [c["checklist_id"] for c in d["collections"]] == ["b", "a"]  # saison la plus récente d'abord


def test_search_is_accent_and_case_insensitive():
    idx = _frames()
    assert ci.search_players(idx, "WEMB")[0]["name"] == "Victor Wembanyama"
    assert ci.search_players(idx, "w") == []  # au moins 2 caractères


def test_team_top_players_per_collection():
    idx = _frames()
    d = ci.team_detail(idx, "San Antonio Spurs")
    chrome = next(c for c in d["collections"] if c["checklist_id"] == "b")
    assert [p["name"] for p in chrome["top_players"]] == ["Victor Wembanyama", "Stephon Castle"]
