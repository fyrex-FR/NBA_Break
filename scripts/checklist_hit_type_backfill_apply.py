#!/usr/bin/env python3
"""Backfill Category and Hit Type into a sport master parquet on R2.

Default mode is a read-only dry-run. Use --apply to write:
1. backup of the current master parquet
2. updated master parquet with Category and Hit Type columns
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.analysis_engine import enrich_dataframe  # noqa: E402
from backend.services.data_pipeline import ensure_master_dataframe_schema, master_parquet_key_for_sport  # noqa: E402
from backend.services.r2_storage import (  # noqa: E402
    get_r2_config,
    is_r2_configured,
    read_r2_parquet,
    upload_parquet_dataframe,
)
from scripts.checklist_hit_type_backfill_audit import hit_type_label, load_keyword_overrides, write_markdown  # noqa: E402


def build_report(sport_key: str, master_key: str, before_df, after_df, backup_key: str | None, applied: bool, bytes_written: int | None) -> dict:
    before_columns = list(before_df.columns)
    after_columns = list(after_df.columns)
    before_category_counts = Counter(before_df["Category"].fillna("").astype(str)) if "Category" in before_df.columns else {}
    before_hit_counts = Counter(before_df["Hit Type"].fillna("").astype(str)) if "Hit Type" in before_df.columns else {}
    after_category_counts = Counter(after_df["Category"].fillna("").astype(str))
    after_hit_counts = Counter(after_df["Hit Type"].fillna("").astype(str))

    grouped = (
        after_df.groupby(["checklist_id", "checklist_name", "Box Type", "Hit Type", "Category"], dropna=False)
        .agg(rows=("Hits", "count"), hits=("Hits", "sum"))
        .reset_index()
        .sort_values(["hits", "rows"], ascending=[False, False])
    )
    top_rows = []
    for _, row in grouped[grouped["Hit Type"].astype(str) != "none"].head(100).iterrows():
        top_rows.append({
            "checklist_id": str(row["checklist_id"]),
            "checklist_name": str(row["checklist_name"]),
            "box_type": str(row["Box Type"]),
            "hit_type": str(row["Hit Type"]),
            "hit_type_label": hit_type_label(str(row["Hit Type"])),
            "category": str(row["Category"]),
            "rows": int(row["rows"]),
            "hits": int(row["hits"]),
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sport_key": sport_key,
        "master_key": master_key,
        "backup_key": backup_key,
        "applied": applied,
        "bytes_written": bytes_written,
        "input_parquet": "R2 master",
        "total_rows": int(len(after_df)),
        "total_rows_before": int(len(before_df)),
        "total_rows_after": int(len(after_df)),
        "columns_before": before_columns,
        "columns_after": after_columns,
        "hit_type_counts_before": {hit_type_label(k): int(v) for k, v in sorted(before_hit_counts.items())},
        "hit_type_counts": {hit_type_label(k): int(v) for k, v in sorted(after_hit_counts.items())},
        "category_counts_before": {str(k): int(v) for k, v in before_category_counts.items()},
        "category_counts": {str(k): int(v) for k, v in after_category_counts.items()},
        "top_hit_card_types": top_rows,
        "uncertain_keyword_rows": [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sport-key", default="nba")
    parser.add_argument("--master-key", default=None)
    parser.add_argument("--apply", action="store_true", help="Write backup and updated master to R2.")
    parser.add_argument("--out-prefix", default=None)
    args = parser.parse_args()

    config = get_r2_config()
    if not is_r2_configured(config):
        raise RuntimeError("R2 non configuré.")

    sport_key = args.sport_key
    master_key = args.master_key or master_parquet_key_for_sport(sport_key)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    date_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    backup_key = f"backups/parquet_master/{sport_key}/{stamp}.parquet" if args.apply else None
    prefix = args.out_prefix or f"data/checklist_hit_type_backfill_apply_{sport_key}_{date_stamp}"
    json_path = ROOT / f"{prefix}.json"
    md_path = ROOT / f"{prefix}.md"
    json_path.parent.mkdir(parents=True, exist_ok=True)

    before_df = read_r2_parquet(config, master_key)
    enriched = enrich_dataframe(before_df.copy(), sport_key, load_keyword_overrides())
    after_df = ensure_master_dataframe_schema(enriched, sport_key)

    if len(before_df) != len(after_df):
        raise RuntimeError(f"Row count changed unexpectedly: {len(before_df)} -> {len(after_df)}")

    bytes_written = None
    if args.apply:
        upload_parquet_dataframe(config, backup_key, before_df)
        bytes_written = upload_parquet_dataframe(config, master_key, after_df)

    report = build_report(sport_key, master_key, before_df, after_df, backup_key, args.apply, bytes_written)
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(report, md_path)

    mode = "APPLIED" if args.apply else "DRY-RUN"
    print(f"{mode}: {master_key}")
    if backup_key:
        print(f"Backup: {backup_key}")
    if bytes_written is not None:
        print(f"Bytes written: {bytes_written}")
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
