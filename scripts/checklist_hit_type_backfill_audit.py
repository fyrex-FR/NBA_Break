#!/usr/bin/env python3
"""Audit the Auto/Memo split for an existing master checklist parquet.

This is deliberately read-only: it recalculates Hit Type with the current app
rules and writes local JSON/Markdown reports for review before any R2 backfill.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.analysis_engine import enrich_dataframe, load_master_data  # noqa: E402
from backend.services.card_logic import HIT_TYPE_AUTO, HIT_TYPE_AUTO_MEM, HIT_TYPE_MEM, HIT_TYPE_NONE  # noqa: E402
from backend.services.data_pipeline import master_parquet_key_for_sport  # noqa: E402
from backend.services.r2_storage import get_r2_config, is_r2_configured, read_r2_json  # noqa: E402


OVERRIDES_PATH = ROOT / "backend" / "keyword_overrides.json"
KEYWORD_OVERRIDES_R2_KEY = "app/keyword_overrides.json"


def load_keyword_overrides() -> dict:
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            return read_r2_json(config, KEYWORD_OVERRIDES_R2_KEY)
        except Exception:
            pass
    if OVERRIDES_PATH.exists():
        return json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
    return {}


def hit_type_label(value: str) -> str:
    return {
        HIT_TYPE_AUTO: "Auto",
        HIT_TYPE_MEM: "Memo",
        HIT_TYPE_AUTO_MEM: "Auto/Memo",
        HIT_TYPE_NONE: "None",
    }.get(value or HIT_TYPE_NONE, value or "None")


def build_audit(sport_key: str, master_key: str | None, input_parquet: str | None, limit: int) -> dict:
    resolved_master_key = master_key or master_parquet_key_for_sport(sport_key)
    if input_parquet:
        raw_df = pd.read_parquet(input_parquet)
    else:
        raw_df = load_master_data(sport_key, [], resolved_master_key)
    enriched = enrich_dataframe(raw_df, sport_key, load_keyword_overrides())

    if "Hit Type" not in enriched.columns:
        raise RuntimeError("Hit Type was not produced by enrich_dataframe")

    hit_counts = Counter(enriched["Hit Type"].fillna(HIT_TYPE_NONE).astype(str))
    category_counts = Counter(enriched["Category"].fillna("").astype(str))

    grouped = (
        enriched.groupby(["checklist_id", "checklist_name", "Box Type", "Hit Type", "Category"], dropna=False)
        .agg(rows=("Hits", "count"), hits=("Hits", "sum"))
        .reset_index()
        .sort_values(["hits", "rows"], ascending=[False, False])
    )

    hit_rows = grouped[grouped["Hit Type"].astype(str).isin([HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM])]
    uncertain = grouped[
        (grouped["Hit Type"].astype(str) == HIT_TYPE_NONE)
        & grouped["Box Type"].astype(str).str.contains(
            r"auto|autograph|signature|signed|ink|patch|jersey|material|memorabilia|relic|swatch|tag|logo|sole|sneaker",
            case=False,
            na=False,
            regex=True,
        )
    ]

    def rows_for(df):
        return [
            {
                "checklist_id": str(row["checklist_id"]),
                "checklist_name": str(row["checklist_name"]),
                "box_type": str(row["Box Type"]),
                "hit_type": str(row["Hit Type"]),
                "hit_type_label": hit_type_label(str(row["Hit Type"])),
                "category": str(row["Category"]),
                "rows": int(row["rows"]),
                "hits": int(row["hits"]),
            }
            for _, row in df.head(limit).iterrows()
        ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sport_key": sport_key,
        "master_key": resolved_master_key,
        "input_parquet": input_parquet,
        "total_rows": int(len(enriched)),
        "hit_type_counts": {hit_type_label(k): int(v) for k, v in sorted(hit_counts.items())},
        "category_counts": {str(k): int(v) for k, v in category_counts.items()},
        "top_hit_card_types": rows_for(hit_rows),
        "uncertain_keyword_rows": rows_for(uncertain),
    }


def write_markdown(report: dict, path: Path) -> None:
    lines = [
        f"# Hit Type Backfill Audit - {report['sport_key'].upper()}",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Master: `{report['master_key']}`",
        f"- Input parquet: `{report.get('input_parquet') or 'R2 master'}`",
        f"- Rows: `{report['total_rows']}`",
        "",
        "## Hit Type Counts",
        "",
    ]
    for name, count in report["hit_type_counts"].items():
        lines.append(f"- {name}: {count}")

    lines.extend(["", "## Category Counts", ""])
    for name, count in report["category_counts"].items():
        lines.append(f"- {name}: {count}")

    def table(title: str, rows: list[dict]) -> None:
        lines.extend(["", f"## {title}", ""])
        if not rows:
            lines.append("No rows.")
            return
        lines.append("| Hits | Rows | Hit Type | Category | Box Type | Checklist |")
        lines.append("|---:|---:|---|---|---|---|")
        for row in rows:
            lines.append(
                "| {hits} | {rows} | `{hit_type_label}` | `{category}` | `{box_type}` | `{checklist_id}` |".format(
                    **row
                )
            )

    table("Top Hit Card Types", report["top_hit_card_types"])
    table("Uncertain Keyword Rows", report["uncertain_keyword_rows"])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sport-key", default="nba")
    parser.add_argument("--master-key", default=None)
    parser.add_argument("--input-parquet", default=None, help="Optional local parquet path to audit instead of R2 master.")
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--out-prefix", default=None)
    args = parser.parse_args()

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prefix = args.out_prefix or f"data/checklist_hit_type_backfill_audit_{args.sport_key}_{stamp}"
    json_path = ROOT / f"{prefix}.json"
    md_path = ROOT / f"{prefix}.md"
    json_path.parent.mkdir(parents=True, exist_ok=True)

    report = build_audit(args.sport_key, args.master_key, args.input_parquet, args.limit)
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(report, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
