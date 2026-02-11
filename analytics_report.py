#!/usr/bin/env python3
import argparse
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from r2_storage import get_r2_config, is_r2_configured, list_r2_keys, read_r2_json


KEY_PATTERN = re.compile(
    r".*/(?P<day>\d{4}-\d{2}-\d{2})/\d+-(?P<visitor>[a-f0-9]{8,64})-[a-f0-9]{4,}\.json$"
)


def parse_args():
    parser = argparse.ArgumentParser(description="Report unique visitors from R2 analytics events.")
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of trailing UTC days to include (default: 30).",
    )
    parser.add_argument(
        "--prefix",
        default="app/analytics/events/",
        help="R2 prefix where analytics events are stored.",
    )
    parser.add_argument(
        "--with-geo",
        action="store_true",
        help="Also compute top countries/regions/cities (requires reading event payloads).",
    )
    return parser.parse_args()


def parse_key(key):
    match = KEY_PATTERN.match(key)
    if not match:
        return None, None
    return match.group("day"), match.group("visitor")


def main():
    args = parse_args()
    cfg = get_r2_config()
    if not is_r2_configured(cfg):
        raise SystemExit(
            "R2 non configuré. Définis R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET et R2_ENDPOINT."
        )

    now = datetime.now(timezone.utc).date()
    start_day = now - timedelta(days=max(args.days, 1) - 1)

    keys = list_r2_keys(cfg, prefix=args.prefix, suffix=".json")
    by_day = defaultdict(set)
    events_by_day = defaultdict(int)
    visitor_days = defaultdict(set)
    city_counts = defaultdict(int)
    region_counts = defaultdict(int)
    country_counts = defaultdict(int)

    for key in keys:
        day_str, visitor_id = parse_key(key)
        payload = None
        if not day_str:
            # Backward-compatible fallback if key format changes.
            try:
                payload = read_r2_json(cfg, key)
            except Exception:
                continue
            day_str = str(payload.get("ts_utc", ""))[:10]
            visitor_id = str(payload.get("visitor_id", "")).strip().lower()
            if not day_str or not visitor_id:
                continue

        try:
            day = datetime.strptime(day_str, "%Y-%m-%d").date()
        except ValueError:
            continue
        if day < start_day or day > now:
            continue

        events_by_day[day] += 1
        by_day[day].add(visitor_id)
        visitor_days[visitor_id].add(day)
        if args.with_geo:
            if payload is None:
                try:
                    payload = read_r2_json(cfg, key)
                except Exception:
                    payload = {}
            country = str(payload.get("country", "")).strip()
            region = str(payload.get("region", "")).strip()
            city = str(payload.get("city", "")).strip()
            if country:
                country_counts[country] += 1
            if region:
                region_counts[region] += 1
            if city:
                city_counts[city] += 1

    if not events_by_day:
        print("Aucun event trouvé sur la période demandée.")
        return

    all_unique = set().union(*by_day.values()) if by_day else set()
    returning = sum(1 for _, days_set in visitor_days.items() if len(days_set) >= 2)
    period_events = sum(events_by_day.values())

    print(f"Periode UTC: {start_day} -> {now}")
    print(f"Events: {period_events}")
    print(f"Visiteurs uniques: {len(all_unique)}")
    print(f"Visiteurs recurrents (>=2 jours): {returning}")
    print("")
    print("Jour         | Events | Uniques")
    print("--------------------------------")
    for day in sorted(events_by_day.keys(), reverse=True):
        print(f"{day} | {events_by_day[day]:>6} | {len(by_day[day]):>7}")

    if args.with_geo:
        def print_top(title, counts, limit=15):
            print("")
            print(title)
            print("-" * len(title))
            if not counts:
                print("Aucune donnée.")
                return
            ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
            for name, count in ranked:
                print(f"{name}: {count}")

        print_top("Top Countries", country_counts)
        print_top("Top Regions", region_counts)
        print_top("Top Cities", city_counts)


if __name__ == "__main__":
    main()
