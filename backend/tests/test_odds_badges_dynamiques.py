"""Badge de disponibilité dynamique + rapprochement tolérant Box Type <-> set d'odds."""
from backend.services.odds_engine import build_set_summaries, classify_availability_badge as classify, loose_box_type_key, resolve_box_types

CFG = [
    {"key": "hobby", "label": "Hobby", "channel": "hobby", "group": "hobby"},
    {"key": "members_only", "label": "Members Only", "channel": "special", "group": "members_only"},
    {"key": "value", "label": "Value", "channel": "retail", "group": "value"},
]
ALL = ["hobby", "members_only", "value"]


def test_partout_seulement_si_tous_les_formats():
    assert classify({"hobby", "members_only", "value"}, ALL) == "partout"


def test_sous_ensemble_nomme_ses_formats():
    assert classify({"hobby", "value"}, ALL) == "in:hobby,value"
    assert classify({"hobby", "members_only"}, ALL) == "in:hobby,members_only"


def test_cas_historiques_inchanges():
    assert classify({"hobby"}, ALL) == "hobby_only"
    assert classify({"value", "hanger"}, ["hobby", "value", "hanger"]) == "retail_only"
    assert classify({"members_only"}, ALL) == "only:members_only"
    assert classify({"hobby", "value"}) == "partout"          # sans liste de formats: repli historique


def test_feuille_complete():
    sheet = {"version": 1, "sport": "soccer", "checklist_id": "x", "configs": CFG, "rows": [
        {"label": "Behind The Lens Autograph Base", "set": "Behind The Lens Autograph", "odds": {"hobby": 572, "value": 15418}},
        {"label": "Base Cards Refractor", "set": "Base Cards", "odds": {"hobby": 5, "members_only": 6, "value": 7}},
    ]}
    s = build_set_summaries(sheet)["sets"]
    assert s["Behind The Lens Autograph"]["availability_badge"] == "in:hobby,value"
    assert s["Base Cards"]["availability_badge"] == "partout"


def test_rapprochement_tolerant():
    assert loose_box_type_key("Say Cheese") == loose_box_type_key("Say Cheese!")
    assert loose_box_type_key("Base Set") == loose_box_type_key("Base Cards")
    sheet = {"configs": CFG, "rows": [
        {"label": "Chrome Autograph Cards Base", "set": "Chrome Autograph Cards", "odds": {"hobby": 1}},
        {"label": "Say Cheese! Base", "set": "Say Cheese!", "odds": {"hobby": 8}},
    ]}
    res, unres = resolve_box_types(sheet, ["Chrome Autographs", "Say Cheese", "Inconnu"], {})
    assert res == {"Chrome Autographs": "Chrome Autograph Cards", "Say Cheese": "Say Cheese!"} and unres == ["Inconnu"]
