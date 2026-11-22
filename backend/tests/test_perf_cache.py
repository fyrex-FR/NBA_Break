"""Cache R2 validé par ETag et normalisation des équipes par valeur distincte."""

from unittest.mock import patch

import numpy as np
import pandas as pd

from backend.services import analysis_engine, r2_storage
from backend.services.data_pipeline import normalize_team_series, normalize_team_value
from backend.services.sports_config import get_sport_profile


# ── normalize_team_series : résultat identique à l'ancien .apply ligne à ligne ──

def test_normalize_team_series_identique_a_apply():
    aliases = get_sport_profile("nba").get("team_aliases", {})
    values = ["LA Clippers", "Los Angeles Clippers", "Lakers / LA Lakers", " Boston Celtics ", "",
              "nan", None, np.nan, "A/B/A", "Oklahoma City Thunder"] * 50
    series = pd.Series(values, dtype=object)
    expected = series.apply(lambda t: normalize_team_value(t, aliases))
    got = normalize_team_series(series, aliases)
    assert list(got) == list(expected)
    assert got.index.equals(series.index)


def test_normalize_team_series_garde_l_index_et_ne_modifie_pas_l_entree():
    aliases = {}
    series = pd.Series(["a", "b", "a"], index=[10, 20, 30])
    before = series.copy()
    got = normalize_team_series(series, aliases)
    assert list(got.index) == [10, 20, 30]
    assert series.equals(before)


# ── cached_r2 ──

class FakeClient:
    def __init__(self, etag="v1"):
        self.etag = etag
        self.heads = 0
        self.fail = False

    def head_object(self, Bucket, Key):
        self.heads += 1
        if self.fail:
            raise RuntimeError("R2 injoignable")
        return {"ETag": self.etag}


CONFIG = {"bucket": "b", "endpoint": "e", "access_key_id": "k", "secret_access_key": "s"}


def _setup(client):
    r2_storage.invalidate_r2_cache()
    return patch.object(r2_storage, "make_r2_client", return_value=client)


class Counter:
    def __init__(self):
        self.n = 0

    def __call__(self):
        self.n += 1
        return {"n": self.n}


def test_cache_ne_relit_pas_tant_que_etag_identique():
    client, load = FakeClient(), Counter()
    with _setup(client), patch.object(r2_storage, "_VALIDATE_TTL_S", 0.0):
        a = r2_storage.cached_r2(CONFIG, "k1", load)
        b = r2_storage.cached_r2(CONFIG, "k1", load)
    assert a is b and load.n == 1
    assert client.heads == 2  # une validation par appel quand le TTL est nul


def test_cache_saute_la_validation_dans_la_fenetre_ttl():
    client, load = FakeClient(), Counter()
    with _setup(client):  # TTL 10 s par défaut
        r2_storage.cached_r2(CONFIG, "k2", load)
        r2_storage.cached_r2(CONFIG, "k2", load)
        r2_storage.cached_r2(CONFIG, "k2", load)
    assert load.n == 1 and client.heads == 1


def test_cache_recharge_quand_etag_change():
    client, load = FakeClient("v1"), Counter()
    with _setup(client), patch.object(r2_storage, "_VALIDATE_TTL_S", 0.0):
        first = r2_storage.cached_r2(CONFIG, "k3", load)
        client.etag = "v2"
        second = r2_storage.cached_r2(CONFIG, "k3", load)
    assert load.n == 2 and first != second


def test_namespaces_independants_pour_une_meme_cle():
    client, load_a, load_b = FakeClient(), Counter(), Counter()
    with _setup(client):
        r2_storage.cached_r2(CONFIG, "k4", load_a, "a")
        r2_storage.cached_r2(CONFIG, "k4", load_b, "b")
    assert load_a.n == 1 and load_b.n == 1


def test_invalidate_force_la_relecture():
    client, load = FakeClient(), Counter()
    with _setup(client):
        r2_storage.cached_r2(CONFIG, "k5", load)
        r2_storage.invalidate_r2_cache("k5")
        r2_storage.cached_r2(CONFIG, "k5", load)
    assert load.n == 2


def test_r2_injoignable_sert_la_copie_en_memoire():
    client, load = FakeClient(), Counter()
    with _setup(client), patch.object(r2_storage, "_VALIDATE_TTL_S", 0.0):
        first = r2_storage.cached_r2(CONFIG, "k6", load)
        client.fail = True
        again = r2_storage.cached_r2(CONFIG, "k6", load)
    assert again is first and load.n == 1


def test_sans_etag_rien_n_est_mis_en_cache():
    client, load = FakeClient(), Counter()
    client.fail = True
    with _setup(client):
        r2_storage.cached_r2(CONFIG, "k7", load)
        r2_storage.cached_r2(CONFIG, "k7", load)
    assert load.n == 2


def test_json_cache_renvoie_une_copie_modifiable():
    client = FakeClient()
    with _setup(client), patch.object(r2_storage, "read_r2_json", return_value={"a": {"b": 1}}):
        one = r2_storage.read_r2_json_cached(CONFIG, "k8")
        one["a"]["b"] = 99
        two = r2_storage.read_r2_json_cached(CONFIG, "k8")
    assert two == {"a": {"b": 1}}


def test_ecriture_via_l_api_invalide_le_cache():
    client = FakeClient()
    load = Counter()
    with _setup(client), patch.object(r2_storage, "_VALIDATE_TTL_S", 999.0):
        r2_storage.cached_r2(CONFIG, "k9", load)
        with patch.object(r2_storage, "make_r2_client", return_value=type("W", (), {"put_object": lambda *a, **k: None})()):
            r2_storage.write_r2_json(CONFIG, "k9", {"x": 1})
        r2_storage.cached_r2(CONFIG, "k9", load)
    assert load.n == 2


# ── chargement du master : même résultat que l'ancien chemin, master mémorisé intact ──

def _master():
    rows = []
    for cid, name in (("2025-26-a-basketball-checklist", "2025-26-A-Basketball-Checklist.parquet"),
                      ("2024-25-b-basketball-checklist", "2024-25-B-Basketball-Checklist.parquet")):
        for i, team in enumerate(["LA Clippers", "Boston Celtics", "Lakers/LA Lakers", None]):
            rows.append({"Player": f"P{i}", "Team": team, "Box Type": "Base", "Numbering": "", "Hits": 1,
                         "checklist_id": cid, "checklist_name": name, "Sport": "nba"})
    return pd.DataFrame(rows)


def _legacy_load(df, sport_key, ids):
    """L'ancien chemin: schéma + .apply sur toute la table, puis filtre."""
    from backend.services.checklist_aliases import equivalent_checklist_ids, load_checklist_aliases
    from backend.services.data_pipeline import ensure_master_dataframe_schema
    aliases = get_sport_profile(sport_key).get("team_aliases", {})
    df = ensure_master_dataframe_schema(df, sport_key)
    df["Team"] = df["Team"].apply(lambda t: normalize_team_value(t, aliases))
    selected = set()
    for v in ids:
        selected.update(equivalent_checklist_ids(sport_key, v, load_checklist_aliases()))
    return df[df["checklist_id"].astype(str).isin(selected)].copy().reset_index(drop=True)


def test_load_master_data_identique_a_l_ancien_chemin_et_ne_mute_pas_le_cache():
    ids = ["2025-26-a-basketball-checklist"]
    r2_storage.invalidate_r2_cache()
    client = FakeClient()
    with patch.object(r2_storage, "make_r2_client", return_value=client), \
         patch.object(analysis_engine, "get_r2_config", return_value=CONFIG), \
         patch.object(analysis_engine, "is_r2_configured", return_value=True), \
         patch.object(analysis_engine, "load_checklist_aliases", return_value={"version": 1, "sports": {}}), \
         patch("backend.services.checklist_aliases.load_checklist_aliases", return_value={"version": 1, "sports": {}}), \
         patch.object(analysis_engine, "read_r2_parquet", side_effect=lambda cfg, key: _master()):
        got = analysis_engine.load_master_data("nba", ids, "parquet_master/nba.parquet")
        with patch("backend.services.checklist_aliases.load_checklist_aliases", return_value={"version": 1, "sports": {}}):
            want = _legacy_load(_master(), "nba", ids)
        pd.testing.assert_frame_equal(got, want)

        # L'appelant modifie sa copie: le master mémorisé et la requête suivante restent intacts.
        got["Team"] = "ZZZ"
        got.drop(columns=["Player"], inplace=True)
        again = analysis_engine.load_master_data("nba", ids, "parquet_master/nba.parquet")
        pd.testing.assert_frame_equal(again, want)

        # Sans filtre: copie aussi, pas le master lui-même.
        full = analysis_engine.load_master_data("nba", [], "parquet_master/nba.parquet")
        full["Team"] = "ZZZ"
        full2 = analysis_engine.load_master_data("nba", [], "parquet_master/nba.parquet")
        assert "ZZZ" not in set(full2["Team"])
    r2_storage.invalidate_r2_cache()
