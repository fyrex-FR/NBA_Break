#!/usr/bin/env python3
"""Audit/apply NBA Hit Type from local Beckett XLSX sheet context.

This is stricter than a Box Type-only override: source rows are matched back to
the master by checklist + player + box type, with numbering when available.
That keeps generic parallels such as Gold or Black from being broadly
reclassified just because they appear on an Autographs or Memorabilia sheet.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.analysis_engine import enrich_dataframe, normalize_box_type_text, normalize_player_name  # noqa: E402
from backend.services.card_logic import (  # noqa: E402
    CATEGORY_BASE_OTHER,
    CATEGORY_CASE_HIT,
    CATEGORY_LOGOMAN,
    HIT_TYPE_AUTO,
    HIT_TYPE_AUTO_MEM,
    HIT_TYPE_MEM,
    HIT_TYPE_NONE,
    category_from_hit_type,
    classify_hit_type,
)
from backend.services.checklist_aliases import canonical_checklist_id  # noqa: E402
from backend.services.data_pipeline import ensure_master_dataframe_schema, master_parquet_key_for_sport  # noqa: E402
from backend.services.gemini_parser import _parse_standard_sheet  # noqa: E402
from backend.services.r2_storage import get_r2_config, is_r2_configured, read_r2_parquet, upload_parquet_dataframe  # noqa: E402
from backend.services.sports_config import get_sport_profile  # noqa: E402
from scripts.checklist_hit_type_backfill_audit import load_keyword_overrides, write_markdown  # noqa: E402


AUTO_SHEET_TERMS = {"auto", "autos", "autograph", "autographs", "signature", "signatures"}
MEM_SHEET_TERMS = {"mem", "memo", "memorabilia", "relic", "relics", "material", "materials"}


def slugify_stem(path: Path) -> str:
    stem = re.sub(r"\.xlsx?$", "", path.name, flags=re.I)
    stem = re.sub(r"-cardboardconnection$", "", stem, flags=re.I)
    stem = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return stem


def norm_player(value) -> str:
    text = "" if value is None or pd.isna(value) else str(value).strip()
    if not text:
        return ""
    return normalize_player_name(text).lower()


def norm_numbering(value) -> str:
    text = "" if value is None or pd.isna(value) else str(value).strip().lower()
    if not text or text == "nan":
        return ""
    if re.fullmatch(r"\d{1,5}", text):
        return f"/{text}"
    return text


def sheet_signal(sheet_name: str) -> str | None:
    key = re.sub(r"[^a-z0-9]+", " ", str(sheet_name or "").lower()).strip()
    has_auto = any(term in key.split() or term in key for term in AUTO_SHEET_TERMS)
    has_mem = any(term in key.split() or term in key for term in MEM_SHEET_TERMS)
    if has_auto and has_mem:
        return HIT_TYPE_AUTO_MEM
    if has_auto:
        return HIT_TYPE_AUTO
    if has_mem:
        return HIT_TYPE_MEM
    return None


def source_hit_type(box_type: str, sheet_name: str, sport_key: str) -> str:
    signal = sheet_signal(sheet_name)
    rules = get_sport_profile(sport_key).get("category_rules", {})
    inferred = classify_hit_type(box_type, rules)
    if inferred == HIT_TYPE_AUTO_MEM:
        return HIT_TYPE_AUTO_MEM
    if signal == HIT_TYPE_AUTO_MEM:
        return HIT_TYPE_AUTO_MEM
    if signal == HIT_TYPE_AUTO:
        return HIT_TYPE_AUTO_MEM if inferred == HIT_TYPE_MEM else HIT_TYPE_AUTO
    if signal == HIT_TYPE_MEM:
        return HIT_TYPE_AUTO_MEM if inferred == HIT_TYPE_AUTO else HIT_TYPE_MEM
    return inferred


def merge_hit_types(left: str, right: str) -> str:
    values = {left, right} - {"", HIT_TYPE_NONE}
    if not values:
        return HIT_TYPE_NONE
    if HIT_TYPE_AUTO_MEM in values or values == {HIT_TYPE_AUTO, HIT_TYPE_MEM}:
        return HIT_TYPE_AUTO_MEM
    if HIT_TYPE_AUTO in values:
        return HIT_TYPE_AUTO
    if HIT_TYPE_MEM in values:
        return HIT_TYPE_MEM
    return HIT_TYPE_NONE


def default_source_roots() -> list[Path]:
    candidates = [
        ROOT / "data",
        WORKSPACE_ROOT / "data",
    ]
    return [p for p in candidates if p.exists()]


def discover_sources(source_roots: list[Path]) -> list[Path]:
    seen = set()
    paths = []
    for root in source_roots:
        for path in root.rglob("*.xlsx"):
            low = path.name.lower()
            if "basketball" not in low or "checklist" not in low:
                continue
            if "cardboardconnection" in low:
                continue
            key = str(path.resolve())
            if key not in seen:
                seen.add(key)
                paths.append(path)
    return sorted(paths, key=lambda p: str(p).lower())


def parse_source_file(path: Path, sport_key: str) -> list[dict]:
    checklist_id = canonical_checklist_id(sport_key, slugify_stem(path))
    out = []
    try:
        xls = pd.ExcelFile(path, engine="openpyxl")
    except Exception as exc:
        return [{"error": str(exc), "source_path": str(path), "checklist_id": checklist_id}]

    for sheet in xls.sheet_names:
        signal = sheet_signal(sheet)
        if signal not in {HIT_TYPE_AUTO, HIT_TYPE_MEM, HIT_TYPE_AUTO_MEM}:
            continue
        try:
            df = pd.read_excel(path, sheet_name=sheet, engine="openpyxl", header=None)
            rows = _parse_standard_sheet(df, default_box_type=sheet)
        except Exception as exc:
            out.append({"error": str(exc), "source_path": str(path), "checklist_id": checklist_id, "sheet": sheet})
            continue
        for row in rows:
            player = norm_player(row.get("Player"))
            box_type = str(row.get("Box Type") or "").strip()
            box_norm = normalize_box_type_text(box_type)
            if not player or not box_norm:
                continue
            hit_type = source_hit_type(box_type, sheet, sport_key)
            if hit_type == HIT_TYPE_NONE:
                continue
            out.append(
                {
                    "source_path": str(path),
                    "checklist_id": checklist_id,
                    "sheet": sheet,
                    "player_norm": player,
                    "box_norm": box_norm,
                    "numbering_norm": norm_numbering(row.get("Numbering")),
                    "source_hit_type": hit_type,
                }
            )
    return out


def build_source_maps(source_rows: list[dict]):
    exact = {}
    loose = {}
    conflicts = Counter()
    for row in source_rows:
        if row.get("error"):
            continue
        cid = row["checklist_id"]
        player = row["player_norm"]
        box = row["box_norm"]
        numbering = row["numbering_norm"]
        hit_type = row["source_hit_type"]
        loose_key = (cid, player, box)
        loose[loose_key] = merge_hit_types(loose.get(loose_key, HIT_TYPE_NONE), hit_type)
        if numbering:
            exact_key = (cid, player, box, numbering)
            previous = exact.get(exact_key, HIT_TYPE_NONE)
            merged = merge_hit_types(previous, hit_type)
            if previous not in {"", HIT_TYPE_NONE, merged}:
                conflicts[f"{previous}->{hit_type}"] += 1
            exact[exact_key] = merged
    return exact, loose, conflicts


def apply_sheet_context(df, exact_map, loose_map):
    work = df.copy()
    changes = []
    matched_rows = 0
    source_hit_values = []
    match_qualities = []

    for idx, row in work.iterrows():
        cid = str(row.get("checklist_id") or "").strip()
        player = norm_player(row.get("Player"))
        box = normalize_box_type_text(row.get("Box Type"))
        numbering = norm_numbering(row.get("Numbering"))
        current_hit = str(row.get("Hit Type") or HIT_TYPE_NONE)
        current_category = str(row.get("Category") or CATEGORY_BASE_OTHER)
        new_hit = HIT_TYPE_NONE
        quality = ""
        if numbering:
            new_hit = exact_map.get((cid, player, box, numbering), HIT_TYPE_NONE)
            quality = "player_box_numbering" if new_hit != HIT_TYPE_NONE else ""
        if new_hit == HIT_TYPE_NONE:
            new_hit = loose_map.get((cid, player, box), HIT_TYPE_NONE)
            quality = "player_box" if new_hit != HIT_TYPE_NONE else ""
        source_hit_values.append(new_hit)
        match_qualities.append(quality)
        if new_hit == HIT_TYPE_NONE:
            continue
        matched_rows += 1
        if new_hit == current_hit:
            continue
        work.at[idx, "Hit Type"] = new_hit
        if current_category not in {CATEGORY_LOGOMAN, CATEGORY_CASE_HIT}:
            work.at[idx, "Category"] = category_from_hit_type(new_hit)
        changes.append(
            {
                "index": int(idx),
                "checklist_id": cid,
                "checklist_name": str(row.get("checklist_name") or ""),
                "player": str(row.get("Player") or ""),
                "box_type": str(row.get("Box Type") or ""),
                "numbering": str(row.get("Numbering") or ""),
                "old_hit_type": current_hit,
                "new_hit_type": new_hit,
                "old_category": current_category,
                "new_category": str(work.at[idx, "Category"]),
                "match_quality": quality,
            }
        )

    work["Beckett Source Hit Type"] = source_hit_values
    work["Beckett Match Quality"] = match_qualities
    return work, changes, matched_rows


def build_report(sport_key: str, master_key: str, source_paths: list[Path], source_rows: list[dict], before_df, after_df, changes: list[dict], matched_rows: int, conflicts: Counter, applied: bool, backup_key: str | None, bytes_written: int | None) -> dict:
    source_checklists = sorted({r["checklist_id"] for r in source_rows if not r.get("error")})
    parsed_rows = [r for r in source_rows if not r.get("error")]
    errors = [r for r in source_rows if r.get("error")]
    change_counts = Counter(f"{c['old_hit_type']}->{c['new_hit_type']}" for c in changes)
    changed_checklists = sorted({c["checklist_id"] for c in changes})
    grouped = defaultdict(lambda: {"rows": 0, "examples": []})
    for change in changes:
        key = (change["checklist_id"], change["box_type"], change["old_hit_type"], change["new_hit_type"])
        grouped[key]["rows"] += 1
        if len(grouped[key]["examples"]) < 5:
            grouped[key]["examples"].append(change["player"])
    top_changes = [
        {
            "checklist_id": cid,
            "box_type": box,
            "old_hit_type": old,
            "new_hit_type": new,
            "rows": data["rows"],
            "examples": data["examples"],
        }
        for (cid, box, old, new), data in grouped.items()
    ]
    top_changes.sort(key=lambda x: (-x["rows"], x["checklist_id"], x["box_type"]))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sport_key": sport_key,
        "master_key": master_key,
        "applied": applied,
        "backup_key": backup_key,
        "bytes_written": bytes_written,
        "source_files_discovered": len(source_paths),
        "source_files_parsed_with_signals": len({r["source_path"] for r in parsed_rows}),
        "source_checklists_with_signals": len(source_checklists),
        "source_signal_rows": len(parsed_rows),
        "source_parse_errors": errors[:50],
        "master_rows": int(len(before_df)),
        "matched_master_rows": int(matched_rows),
        "changed_rows": len(changes),
        "changed_checklists": len(changed_checklists),
        "change_counts": dict(sorted(change_counts.items())),
        "source_conflicts": dict(conflicts),
        "hit_type_counts_before": dict(Counter(before_df["Hit Type"].fillna(HIT_TYPE_NONE).astype(str))),
        "hit_type_counts_after": dict(Counter(after_df["Hit Type"].fillna(HIT_TYPE_NONE).astype(str))),
        "top_changes": top_changes[:200],
    }


def write_report(report: dict, out_base: Path) -> None:
    out_base.parent.mkdir(parents=True, exist_ok=True)
    out_base.with_suffix(".json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [
        "# Beckett Sheet Hit Type Backfill",
        "",
        f"- Generated: `{report['generated_at']}`",
        f"- Sport: `{report['sport_key']}`",
        f"- Master: `{report['master_key']}`",
        f"- Applied: `{report['applied']}`",
        f"- Backup: `{report.get('backup_key') or ''}`",
        "",
        "## Summary",
        "",
        f"- Source files discovered: {report['source_files_discovered']}",
        f"- Source files with Auto/Memo sheet signals: {report['source_files_parsed_with_signals']}",
        f"- Source checklists with signals: {report['source_checklists_with_signals']}",
        f"- Source signal rows: {report['source_signal_rows']}",
        f"- Matched master rows: {report['matched_master_rows']}",
        f"- Changed rows: {report['changed_rows']}",
        f"- Changed checklists: {report['changed_checklists']}",
        "",
        "## Change Counts",
        "",
    ]
    for key, value in report["change_counts"].items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Hit Type Counts Before", ""])
    for key, value in report["hit_type_counts_before"].items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Hit Type Counts After", ""])
    for key, value in report["hit_type_counts_after"].items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Top Changes", ""])
    if not report["top_changes"]:
        lines.append("No changes.")
    else:
        lines.append("| Rows | Checklist | Old -> New | Box Type | Examples |")
        lines.append("|---:|---|---|---|---|")
        for row in report["top_changes"]:
            lines.append(
                "| {rows} | `{checklist_id}` | `{old_hit_type}->{new_hit_type}` | `{box_type}` | {examples} |".format(
                    rows=row["rows"],
                    checklist_id=row["checklist_id"],
                    old_hit_type=row["old_hit_type"],
                    new_hit_type=row["new_hit_type"],
                    box_type=str(row["box_type"]).replace("|", "\\|"),
                    examples=", ".join(row["examples"]).replace("|", "\\|"),
                )
            )
    out_base.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sport-key", default="nba")
    parser.add_argument("--master-key", default=None)
    parser.add_argument("--source-root", action="append", default=None)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--out-prefix", default=None)
    args = parser.parse_args()

    if args.sport_key != "nba":
        raise RuntimeError("This Beckett sheet backfill is currently scoped to NBA.")
    config = get_r2_config()
    if not is_r2_configured(config):
        raise RuntimeError("R2 non configuré.")

    source_roots = [Path(p) for p in args.source_root] if args.source_root else default_source_roots()
    source_paths = discover_sources(source_roots)
    source_rows = []
    for path in source_paths:
        source_rows.extend(parse_source_file(path, args.sport_key))
    exact_map, loose_map, conflicts = build_source_maps(source_rows)

    master_key = args.master_key or master_parquet_key_for_sport(args.sport_key)
    before_df = read_r2_parquet(config, master_key)
    enriched = enrich_dataframe(before_df.copy(), args.sport_key, load_keyword_overrides())
    after_df, changes, matched_rows = apply_sheet_context(enriched, exact_map, loose_map)
    final_df = ensure_master_dataframe_schema(after_df.drop(columns=["Beckett Source Hit Type", "Beckett Match Quality"]), args.sport_key)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    date_stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    backup_key = f"backups/parquet_master/{args.sport_key}/beckett-sheet-{stamp}.parquet" if args.apply else None
    bytes_written = None
    if args.apply:
        upload_parquet_dataframe(config, backup_key, before_df)
        bytes_written = upload_parquet_dataframe(config, master_key, final_df)

    prefix = args.out_prefix or f"data/checklist_hit_type_beckett_sheet_backfill_{args.sport_key}_{date_stamp}"
    report = build_report(
        args.sport_key,
        master_key,
        source_paths,
        source_rows,
        enriched,
        final_df,
        changes,
        matched_rows,
        conflicts,
        args.apply,
        backup_key,
        bytes_written,
    )
    write_report(report, ROOT / prefix)
    print(json.dumps({k: report[k] for k in ["source_files_discovered", "source_checklists_with_signals", "matched_master_rows", "changed_rows", "change_counts", "applied", "backup_key"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
