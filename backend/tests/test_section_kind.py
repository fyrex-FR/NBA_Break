import unittest
import pandas as pd

from backend.services.section_kind import marker_kind, assign_sections, apply_section_kinds
from backend.services.card_logic import (
    CATEGORY_AUTO, CATEGORY_BASE_OTHER, CATEGORY_CASE_HIT, CATEGORY_LOGOMAN, CATEGORY_MEM, HIT_TYPE_NONE, category_from_hit_type,
)
from backend.services.analysis_engine import enrich_dataframe


class SectionKindTests(unittest.TestCase):
    def test_markers(self):
        self.assertEqual(marker_kind("INSERT"), "insert")
        self.assertEqual(marker_kind(" autograph "), "auto")
        self.assertEqual(marker_kind("RELIC"), "mem")
        self.assertEqual(marker_kind("AUTOGRAPH RELIC"), "auto_mem")
        self.assertIsNone(marker_kind("BASE MEMBERS ONLY"))  # un set, pas un en-tête
        self.assertIsNone(marker_kind("THE MAIN STAGE"))

    def test_assign_sections_suit_les_marqueurs(self):
        entries = ["a", {"marker": "INSERT"}, "b", "c", {"marker": "AUTOGRAPH"}, "d"]
        self.assertEqual(assign_sections(entries), ["base", "insert", "insert", "auto"])

    def _enrich(self, rows):
        df = pd.DataFrame([{"Player": "A", "Team": "X", "Box Type": b, "Sport": "nba", "Hits": 1, "Numbering": None,
                            "Year": "2025-26", "Product": "p", "File": "f", "Section": s} for b, s in rows])
        return enrich_dataframe(df, "nba", {}).set_index("Box Type")

    def test_la_section_passe_avant_les_mots_cles(self):
        out = self._enrich([("Mystery Set", "auto"), ("Jersey Relics", "insert"), ("Cosigners", "auto"), ("Plain", "")])
        self.assertEqual(out.loc["Mystery Set", "Category"], CATEGORY_AUTO)       # aucun mot-clé: la section décide
        self.assertEqual(out.loc["Jersey Relics", "Category"], CATEGORY_BASE_OTHER)  # « relic » mais section insert
        self.assertEqual(out.loc["Jersey Relics", "Hit Type"], HIT_TYPE_NONE)
        self.assertEqual(out.loc["Cosigners", "Category"], CATEGORY_AUTO)
        self.assertEqual(out.loc["Plain", "Category"], CATEGORY_BASE_OTHER)

    def test_sans_colonne_section_rien_ne_change(self):
        df = pd.DataFrame([{"Player": "A", "Team": "X", "Box Type": "Jersey Relics", "Sport": "nba", "Hits": 1, "Numbering": None,
                            "Year": "2025-26", "Product": "p", "File": "f"}])
        self.assertEqual(enrich_dataframe(df, "nba", {}).iloc[0]["Category"], CATEGORY_MEM)

    def test_logoman_et_case_hit_restent(self):
        mask = pd.Series([True, True])
        df = pd.DataFrame({"Section": ["mem", "insert"], "Hit Type": ["mem", "none"], "Category": [CATEGORY_LOGOMAN, CATEGORY_CASE_HIT]})
        apply_section_kinds(df, mask, HIT_TYPE_NONE, category_from_hit_type, (CATEGORY_LOGOMAN, CATEGORY_CASE_HIT))
        self.assertEqual(list(df["Category"]), [CATEGORY_LOGOMAN, CATEGORY_CASE_HIT])


if __name__ == "__main__":
    unittest.main()


class ParseurDualsTests(unittest.TestCase):
    def test_codes_repetes_fusionnes(self):
        import sys
        sys.path.insert(0, "scripts")
        from parse_topps_pdf_sections import merge_duals
        rows = [{"Player": "A", "Team": "X", "Box Type": "Dual", "Section": "auto", "Rookie": 0, "_code": "D-1"},
                {"Player": "B", "Team": "Y", "Box Type": "Dual", "Section": "auto", "Rookie": 1, "_code": "D-1"},
                {"Player": "C", "Team": "Z", "Box Type": "Solo", "Section": "auto", "Rookie": 0, "_code": "S-1"}]
        out = merge_duals(rows)
        self.assertEqual([r["Player"] for r in out], ["A/B", "C"])
        self.assertEqual(out[0]["Team"], "X")
        self.assertEqual(out[0]["Rookie"], 1)
