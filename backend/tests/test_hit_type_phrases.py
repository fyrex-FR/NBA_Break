"""Faux positifs du classement Hit Type: un mot-clé (tag, mem, prime) trouvé DANS un autre mot."""
import pytest

from backend.services.card_logic import classify_hit_type
from backend.services.sports_config import get_sport_profile


@pytest.mark.parametrize("sport,box_type", [
    ("baseball", "Base Cards Vintage Stock Variation"),
    ("baseball", "Vintage Vantage"),
    ("f1", "Heritage F1 Flashbacks"),
    ("soccer", "Prime Time"),
    ("soccer", "Home Pitch Advantage"),
    ("nba", "Vintage Art"),
])
def test_mot_contenant_un_mot_cle_nest_pas_un_hit(sport, box_type):
    assert classify_hit_type(box_type, get_sport_profile(sport)["category_rules"]) == "none"


@pytest.mark.parametrize("sport,box_type,attendu", [
    ("nfl", "Heritage Rookie Autographs", "auto"),
    ("soccer", "Brand Logo Autographs", "auto_mem"),
    ("nfl", "Gameday Tag Relics", "mem"),
    ("soccer", "Treasured Tags", "mem"),
])
def test_les_vrais_hits_restent_des_hits(sport, box_type, attendu):
    got = classify_hit_type(box_type, get_sport_profile(sport)["category_rules"])
    assert got == attendu
