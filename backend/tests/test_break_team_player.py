import unittest

import pandas as pd

from backend.services.break_engine import (
    SIM_METHOD_TEAM_PLAYER,
    build_break_simulation_pool,
    build_default_spots,
    build_deterministic_spot_summary,
    build_player_selection_stats,
    build_spot_player_map,
)


def _row(player, team, box_type="Base"):
    return {
        "Player": player,
        "Team": team,
        "Box Type": box_type,
        "Numbering": "",
        "Hits": 1,
        "Category": "Base/Other",
        "Hit Type": "none",
        "checklist_name": "Test",
        "checklist_id": "test",
        "Year": "2025-26",
    }


class TeamPlayerBreakTests(unittest.TestCase):
    def simulate(self, rows, extracted):
        pool = build_break_simulation_pool(pd.DataFrame(rows))
        spots = build_default_spots(pool, SIM_METHOD_TEAM_PLAYER, extracted)
        result, _, details = build_deterministic_spot_summary(
            pool,
            SIM_METHOD_TEAM_PLAYER,
            spots,
            extracted_players=extracted,
        )
        mapping = build_spot_player_map(
            pool,
            SIM_METHOD_TEAM_PLAYER,
            custom_spots=spots,
            extracted_players=extracted,
        )
        return spots, result.set_index("Spot"), details, mapping

    def test_extracted_player_leaves_team_spot(self):
        spots, result, details, mapping = self.simulate(
            [_row("Victor Wembanyama", "San Antonio Spurs"), _row("Chris Paul", "San Antonio Spurs")],
            ["Victor Wembanyama"],
        )

        self.assertEqual(spots, ["San Antonio Spurs", "Victor Wembanyama"])
        self.assertEqual(result.loc["San Antonio Spurs", "Cartes"], 1)
        self.assertEqual(result.loc["Victor Wembanyama", "Cartes"], 1)
        self.assertEqual({item["Spot"] for item in details}, set(spots))
        self.assertEqual(mapping["San Antonio Spurs"], {"Chris Paul"})
        self.assertEqual(mapping["Victor Wembanyama"], {"Victor Wembanyama"})
        self.assertEqual(result.loc["San Antonio Spurs", "Joueurs"], "Chris Paul")
        self.assertEqual(result.loc["Victor Wembanyama", "Joueurs"], "Victor Wembanyama")

    def test_multi_player_card_splits_extracted_and_team_targets(self):
        spots, result, _, mapping = self.simulate(
            [_row("Victor Wembanyama / Chris Paul", "San Antonio Spurs / San Antonio Spurs", "Dual")],
            ["Victor Wembanyama"],
        )

        self.assertEqual(result.loc["San Antonio Spurs", "Cartes"], 1)
        self.assertEqual(result.loc["Victor Wembanyama", "Cartes"], 1)
        self.assertEqual(mapping["San Antonio Spurs"], {"Chris Paul"})

    def test_multiple_extractions_remove_empty_team(self):
        spots, result, _, _ = self.simulate(
            [_row("Victor Wembanyama / Chris Paul", "San Antonio Spurs / San Antonio Spurs", "Dual")],
            ["Victor Wembanyama", "Chris Paul"],
        )

        self.assertNotIn("San Antonio Spurs", spots)
        self.assertEqual(set(spots), {"Victor Wembanyama", "Chris Paul"})
        self.assertEqual(result.loc["Victor Wembanyama", "Cartes"], 1)
        self.assertEqual(result.loc["Chris Paul", "Cartes"], 1)

    def test_player_selection_stats_exposes_team_and_hit_breakdown(self):
        rows = [
            {**_row("Victor Wembanyama", "San Antonio Spurs"), "Hits": 2, "Category": "✍️ Auto", "Hit Type": "auto"},
            {**_row("Victor Wembanyama", "San Antonio Spurs"), "Hits": 3, "Category": "🧵 Memo", "Hit Type": "mem"},
            {**_row("Victor Wembanyama", "San Antonio Spurs"), "Category": "Auto/Memo", "Hit Type": "auto_mem"},
            {**_row("Victor Wembanyama", "San Antonio Spurs"), "Category": "✨ Case Hit"},
            {**_row("Victor Wembanyama", "San Antonio Spurs"), "Category": "🔥 Logoman"},
        ]
        stats = build_player_selection_stats(build_break_simulation_pool(pd.DataFrame(rows)))

        self.assertEqual(stats["Victor Wembanyama"], {
            "teams": ["San Antonio Spurs"],
            "cards": 8,
            "auto": 2,
            "memo": 3,
            "auto_memo": 1,
            "total_hits": 6,
            "case_hits": 1,
            "logoman": 1,
        })


if __name__ == "__main__":
    unittest.main()
