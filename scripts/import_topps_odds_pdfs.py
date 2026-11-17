#!/usr/bin/env python3
"""
Importe les feuilles d'odds officielles Topps (PDF publiés sur
https://www.topps.com/pages/odds) au format docs/ODDS_FILE_FORMAT.md.

Les PDF Topps n'ont pas tous la même mise en page (une ou plusieurs colonnes
de formats, cases vides quand une carte n'existe pas dans un format). Le
texte brut ne dit pas sous quelle colonne tombe une cote : on lit donc la
position horizontale de chaque mot (pdfplumber) et on rattache chaque cote à
la colonne d'en-tête la plus proche.

- « 1:N » = une carte pour N paquets → odds N.
- « N:1 » (plusieurs par paquet, la base) et « (cancelled) » sont ignorés :
  le format 1:N ne les représente pas.
- Les séries prennent le nom exact des Box Type de notre checklist quand on
  les retrouve (même correspondance que import_hobbychecklist_odds.py).

Sources : scripts/topps_odds_sources.json ({checklist_id: url du PDF}).
Les PDF sont mis en cache dans ~/.cache/noclim/topps_odds/.

Usage (dépendances : backend/requirements.txt + scripts/requirements-dev.txt) :
    python scripts/import_topps_odds_pdfs.py                # toutes les sources
    python scripts/import_topps_odds_pdfs.py --only <checklist_id>
    python scripts/import_topps_odds_pdfs.py --dry-run      # rapport sans écrire

Une feuille existante (générée depuis The Hobby Checklist) n'est remplacée que
si la version PDF rattache une plus grande part des cotes à nos séries. Une
feuille faite à la main (R2, ou source non générée) n'est jamais touchée.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from backend.services.odds_engine import build_pull_rates, derive_parallel, derive_set_root, validate_odds_sheet  # noqa: E402
from import_hobbychecklist_odds import (  # noqa: E402
    box_types_for, channel_group, master_key, match_set, r2_sheets, slug,
)

SOURCES = ROOT / "scripts" / "topps_odds_sources.json"
GUIDES = ROOT / "backend" / "box_guides.json"
OUT_DIR = ROOT / "backend" / "odds" / "nba"
CACHE = Path.home() / ".cache" / "noclim" / "topps_odds"
UA = "Mozilla/5.0 (NoClim odds import)"

RATIO = re.compile(r"^(\d[\d,]*):(\d[\d,]*)$")
# Libellés de colonnes connus (plusieurs mots possibles), du plus long au plus court.
COLUMN_WORDS = [
    "Value Box", "Mega Box", "Fat Pack", "Hanger Box", "Blaster Box", "Breaker Delight",
    "Hobby", "Jumbo", "Breaker", "Delight", "Value", "Mega", "Blaster", "Hanger", "Retail", "Bulk",
    "Sapphire", "Fanatics", "Promo", "FDI", "Choice", "Monster", "Cello", "Topper",
]


# ── Lecture du PDF par positions ────────────────────────────────────────────

def lines_of(page) -> list[list[dict]]:
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
    rows: dict[int, list[dict]] = {}
    for w in words:
        rows.setdefault(round(w["top"] / 3), []).append(w)
    return [sorted(ws, key=lambda w: w["x0"]) for _, ws in sorted(rows.items())]


def header_columns(line: list[dict]) -> list[tuple[str, float]] | None:
    """Ligne d'en-tête « Card(s) Hobby Jumbo … » → [(libellé, x_centre)]."""
    if not line or line[0]["text"].lower() not in ("card", "cards"):
        return None
    rest = line[1:]
    texts = [w["text"] for w in rest]
    upper = " ".join(texts).upper()
    # Mise en page « Card 5698 - SPO-TOPPS MOTIF BASKETBALL 2023-24 HOBBY DISTRIBUTOR » : une seule colonne.
    if rest and any(ch.isdigit() for ch in texts[0]):
        for name in ("JUMBO", "HOBBY", "BLASTER", "MEGA", "VALUE", "HANGER", "RETAIL"):
            if name in upper:
                return [(name.title(), None)]
        return [("Hobby", None)]
    cols, i = [], 0
    while i < len(rest):
        for cand in sorted(COLUMN_WORDS, key=lambda c: -len(c.split())):
            n = len(cand.split())
            if [t.lower() for t in texts[i:i + n]] == cand.lower().split():
                ws = rest[i:i + n]
                cols.append((cand, (ws[0]["x0"] + ws[-1]["x1"]) / 2))
                i += n
                break
        else:
            # Mot inconnu : sa propre colonne, ou la suite de la précédente s'il lui est collé (« Player Samples »).
            w = rest[i]
            prev = rest[i - 1] if i else None
            if cols and prev is not None and cols[-1][0].split()[-1] == prev["text"] \
                    and cols[-1][0] not in COLUMN_WORDS and w["x0"] - prev["x1"] < 12:
                name, _ = cols.pop()
                start = rest[i - len(name.split())]
                cols.append((f"{name} {w['text']}", (start["x0"] + w["x1"]) / 2))
            else:
                cols.append((w["text"], (w["x0"] + w["x1"]) / 2))
            i += 1
    return cols or None


def parse_pdf(path: Path) -> tuple[list[str], list[dict], Counter]:
    import pdfplumber

    columns: list[tuple[str, float | None]] = []
    order: list[str] = []
    rows: list[dict] = []
    stats = Counter()
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            for line in lines_of(page):
                head = header_columns(line)
                if head:
                    columns = head
                    for name, _ in head:
                        if name not in order:
                            order.append(name)
                    continue
                texts = [w["text"] for w in line]
                if not columns:
                    # Pas (encore) d'en-tête : certaines feuilles n'ont qu'une colonne, sans titre.
                    if line and RATIO.match(line[-1]["text"]):
                        columns = [("Hobby", None)]
                        order.append("Hobby")
                    else:
                        continue
                if any("cancel" in t.lower() for t in texts):
                    stats["annulées"] += 1
                    continue
                # Cotes = mots de fin de ligne au format a:b ou « - ».
                k = len(line)
                while k > 0 and (RATIO.match(line[k - 1]["text"]) or line[k - 1]["text"] in ("-", "–")):
                    k -= 1
                label_words, cells = line[:k], line[k:]
                if not label_words or not cells:
                    continue
                label = " ".join(w["text"] for w in label_words).strip()
                if label.isupper():
                    label = label.title()
                odds: dict[str, int] = {}
                for w in cells:
                    m = RATIO.match(w["text"])
                    if not m:
                        continue
                    a, b = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
                    if a != 1:
                        stats["plusieurs par paquet"] += 1
                        continue
                    if len(columns) == 1:
                        col = columns[0][0]
                    else:
                        xc = (w["x0"] + w["x1"]) / 2
                        col = min(columns, key=lambda c: abs((c[1] or 0) - xc))[0]
                    odds[col] = b
                # Même sans cote 1:N (la base à « 3:1 »), le libellé sert de repère pour déduire les séries.
                rows.append({"label": label, "odds": odds})
    return order, rows, stats


# ── Construction de la feuille ──────────────────────────────────────────────

def build_sheet(checklist_id: str, product_label: str | None, order: list[str], parsed: list[dict],
                box_types: list[str], guide: dict | None) -> dict:
    packs, boxes = {}, {}
    for f in (guide or {}).get("formats", []):
        for a in [f["name"], *(f.get("aliases") or [])]:
            if f.get("packs_per_box"):
                packs.setdefault(a.lower(), int(f["packs_per_box"]))
            if f.get("boxes_per_case"):
                boxes.setdefault(a.lower(), int(f["boxes_per_case"]))

    configs, key_of = [], {}
    for name in order:
        key = slug(name)
        ch, gr = channel_group(name)
        cfg = {"key": key, "label": name, "channel": ch, "group": gr}
        if packs.get(name.lower()):
            cfg["packs_per_box"] = packs[name.lower()]
        if boxes.get(name.lower()):
            cfg["boxes_per_case"] = boxes[name.lower()]
        configs.append(cfg)
        key_of[name] = key

    labels = [r["label"] for r in parsed]
    rows = []
    for r in parsed:
        if not r["odds"]:
            continue
        root = derive_set_root(r["label"], labels)
        rows.append({
            "label": r["label"],
            "set": match_set(root, box_types) or root,
            "parallel": derive_parallel(r["label"], root),
            "odds": {key_of[c]: n for c, n in r["odds"].items()},
        })
    used = {k for r in rows for k in r["odds"]}
    return {
        "version": 1,
        "sport": "nba",
        "checklist_id": checklist_id,
        "product_label": product_label,
        "source": "Topps — feuille d'odds officielle (PDF topps.com/pages/odds)",
        "updated_at": date.today().isoformat(),
        "configs": [c for c in configs if c["key"] in used],
        "rows": rows,
    }


def coverage(sheet: dict, box_types: list[str]) -> float:
    """Part de la masse des cotes (format principal) rattachée à nos séries."""
    if not sheet or not sheet.get("configs"):
        return 0.0
    main = next((c["key"] for c in sheet["configs"] if c["group"] == "hobby"), sheet["configs"][0]["key"])
    counts = {bt: 1 for bt in box_types}
    return build_pull_rates(sheet, main, counts)["coverage"]


def pdf_for(url: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("/")[-1].split("?")[0])
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            path.write_bytes(r.read())
        time.sleep(1)
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="checklist_id à traiter seul")
    ap.add_argument("--dry-run", action="store_true", help="rapport sans écrire")
    args = ap.parse_args()

    sources = json.loads(SOURCES.read_text(encoding="utf-8"))["nba"]
    guides = json.loads(GUIDES.read_text(encoding="utf-8"))["nba"]
    on_r2 = r2_sheets()
    mk = master_key()

    for cid, src in sorted(sources.items()):
        if args.only and cid != args.only:
            continue
        if cid in on_r2:
            print(f"· {cid} : feuille faite à la main, on n'y touche pas")
            continue
        order, parsed, stats = parse_pdf(pdf_for(src["url"]))
        box_types = box_types_for(cid, mk)
        sheet = build_sheet(cid, src.get("label"), order, parsed, box_types, guides.get(cid))
        errors = validate_odds_sheet(sheet)
        cov = coverage(sheet, box_types)
        out = OUT_DIR / f"{cid}.json"
        verdict = "écrite"
        # Feuille officielle = complète par définition : pas de minimum de lignes, juste valide et non vide.
        # (Les feuilles déjà écrites par ce script sont remplacées, sauf si la version actuelle rattache mieux.)
        if errors or not sheet["rows"]:
            verdict = f"écartée ({len(sheet['rows'])} lignes{', invalide' if errors else ''})"
        elif out.exists():
            current = json.loads(out.read_text(encoding="utf-8"))
            cur_cov = coverage(current, box_types)
            if cur_cov > cov + 0.02 or (abs(cur_cov - cov) <= 0.02 and len(current["rows"]) >= len(sheet["rows"])):
                verdict = f"gardée (actuelle {len(current['rows'])} lignes, {cur_cov:.0%})"
        if verdict == "écrite" and out.exists():
            previous = json.loads(out.read_text(encoding="utf-8"))
            for key in ("exclusives", "rarity"):
                if previous.get(key):
                    sheet[key] = previous[key]
        if verdict == "écrite" and not args.dry_run:
            out.write_text(json.dumps(sheet, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        extra = ", ".join(f"{n} {k}" for k, n in stats.items())
        print(f"{'✓' if verdict == 'écrite' else '·'} {cid} : {len(sheet['rows'])} lignes · "
              f"colonnes {order} · cotes rattachées {cov:.0%} → {verdict}" + (f" · ignorées : {extra}" if extra else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
