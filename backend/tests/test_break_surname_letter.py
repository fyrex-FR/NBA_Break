import pandas as pd
import unittest

from backend.services.break_engine import (
    SIM_METHOD_SURNAME_LETTER,
    build_break_simulation_pool,
    build_default_spots,
    build_deterministic_spot_summary,
    build_spot_player_map,
    extract_last_name_initial,
    extract_surname_initial,
)


class SurnameLetterTests(unittest.TestCase):
    def test_extract_last_name_initial_for_real_mma_names(self):
        cases = [
        ("Dricus du Plessis", "P"),
        ("Reinier de Ridder", "R"),
        ("Natalia Cristina da Silva", "S"),
        ("José Aldo", "A"),
        ("Joanna Jędrzejczyk", "J"),
        ("Jan Błachowicz", "B"),
        ("Song Yadong", "Y"),
        ("Shi Ming", "M"),
        ("SeungWoo Choi", "C"),
        ("Ateba Gautier", "G"),
        ("Conor O'Malley Jr.", "M"),
        ("Georges Saint-Pierre III", "P"),
        ]
        for name, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(extract_last_name_initial(name), expected)


    def test_surname_letter_mode_handles_multi_fighter_cards_without_rewriting_data(self):
        original_player = "José Aldo / Dricus du Plessis / Reinier de Ridder"
        source = pd.DataFrame(
        [
            {
                "Player": original_player,
                "Team": "",
                "Box Type": "Triple Autographs",
                "Numbering": "/10",
                "Hits": 1,
                "Category": "✍️ Auto",
                "Hit Type": "auto",
                "checklist_name": "mma.parquet",
                "checklist_id": "mma",
                "Year": "2026",
            }
        ]
        )

        pool = build_break_simulation_pool(source)
        spots = build_default_spots(pool, SIM_METHOD_SURNAME_LETTER)
        result, _, card_details = build_deterministic_spot_summary(
            pool, SIM_METHOD_SURNAME_LETTER, spots
        )
        player_map = build_spot_player_map(pool, SIM_METHOD_SURNAME_LETTER)

        counts = result.set_index("Spot")["Cartes"].to_dict()
        self.assertEqual(counts["A"], 1)
        self.assertEqual(counts["P"], 1)
        self.assertEqual(counts["R"], 1)
        self.assertEqual({card["Spot"] for card in card_details}, {"A", "P", "R"})
        self.assertEqual(player_map["A"], {"José Aldo"})
        self.assertEqual(player_map["P"], {"Dricus du Plessis"})
        self.assertEqual(player_map["R"], {"Reinier de Ridder"})
        self.assertEqual(source.iloc[0]["Player"], original_player)


    def test_legacy_letter_mode_remains_distinct(self):
        self.assertEqual(extract_surname_initial("Dricus du Plessis"), "D")
        self.assertEqual(extract_last_name_initial("Dricus du Plessis"), "P")


if __name__ == "__main__":
    unittest.main()
