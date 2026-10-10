from unittest.mock import patch

import pandas as pd

from backend.services import analysis_engine
from backend.services.sports_config import ALL_SPORT_KEY, SPORT_PROFILES, get_sport_profile


def _master(sport):
    return pd.DataFrame([{"Player": f"{sport} Player", "Team": "T", "Box Type": "Base", "Numbering": "",
                          "checklist_name": f"2026 {sport} set", "Sport": sport}])


def test_all_loads_every_sport_master():
    with patch.object(analysis_engine, "get_r2_config", return_value={}), \
         patch.object(analysis_engine, "is_r2_configured", return_value=True), \
         patch.object(analysis_engine, "read_r2_parquet",
                      side_effect=lambda cfg, key: _master(key.split("/")[-1].replace(".parquet", ""))):
        df = analysis_engine.load_master_data(ALL_SPORT_KEY, [], ALL_SPORT_KEY)
    assert set(df["Sport"]) == set(SPORT_PROFILES)


def test_all_profile_has_label():
    assert get_sport_profile(ALL_SPORT_KEY)["label"] == "Tous les sports"
