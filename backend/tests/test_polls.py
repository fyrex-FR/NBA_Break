import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.routers import polls


CATALOG = [
    {"checklist_id": "2024-prizm", "checklist_name": "2024-prizm", "display_name": "2024-25 Prizm", "year": "2024-25"},
    {"checklist_id": "2023-select", "checklist_name": "2023-select", "display_name": "2023-24 Select", "year": "2023-24"},
]


class PollTests(unittest.TestCase):
    def setUp(self):
        self.objects = {}

    def write(self, _config, key, value):
        self.objects[key] = value

    def read(self, _config, key):
        return self.objects[key]

    def keys(self, _config, prefix, suffix=None):
        return [key for key in self.objects if key.startswith(prefix) and (not suffix or key.endswith(suffix))]

    def patches(self):
        return (
            patch.object(polls, "_config", return_value={"bucket": "test"}),
            patch.object(polls, "_catalog", return_value=CATALOG),
            patch.object(polls, "write_r2_json", side_effect=self.write),
            patch.object(polls, "read_r2_json", side_effect=self.read),
            patch.object(polls, "list_r2_keys_with_prefix", side_effect=self.keys),
        )

    def test_same_pseudo_replaces_vote_and_results_never_expose_it(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4]:
            polls.submit_vote(polls.VotePayload(
                pseudo="Xavier", years=["2024-25"], checklist_ids=["2024-prizm"], preference="value"
            ))
            polls.submit_vote(polls.VotePayload(
                pseudo=" xavier ", years=["2023-24"], checklist_ids=["2023-select"], preference="guarantee"
            ))
            results = polls.poll_results()

        self.assertEqual(results["voters"], 1)
        self.assertEqual(results["checklists"], {"2023-select": 1})
        self.assertNotIn("pseudo", str(results).lower())
        self.assertNotIn("xavier", str(results).lower())

    def test_rejects_checklist_outside_selected_years(self):
        contexts = self.patches()
        with contexts[0], contexts[1], contexts[2], contexts[3], contexts[4]:
            with self.assertRaises(HTTPException) as raised:
                polls.submit_vote(polls.VotePayload(
                    pseudo="Tester", years=["2024-25"], checklist_ids=["2023-select"], preference="either"
                ))
        self.assertEqual(raised.exception.status_code, 422)

    def test_rejects_blank_selections(self):
        with self.assertRaises(ValidationError):
            polls.VotePayload(pseudo="Tester", years=[" "], checklist_ids=["2024-prizm"], preference="either")


if __name__ == "__main__":
    unittest.main()
