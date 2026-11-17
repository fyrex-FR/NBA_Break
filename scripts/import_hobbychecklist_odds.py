#!/usr/bin/env python3
"""
Génère des feuilles d'odds (format docs/ODDS_FILE_FORMAT.md) à partir des
cotes publiées sur The Hobby Checklist (avec l'accord de son éditeur).

Leurs cotes reprennent les PDF officiels Topps (vérifié ligne à ligne sur
2025-26 Topps Chrome Update) :
- une cote par parallèle et par format (« 1 pour N paquets ») ;
- une cote « version de base » par série, dans le tableau des séries.

S'appuie sur le cache de pages de scripts/import_hobbychecklist_boxes.py et
sur backend/box_guides.json (correspondance avec nos checklists, formats et
paquets par boîte). Les pages manquantes sont téléchargées (1 req/s).

Ne remplace jamais une feuille déjà présente sur R2 (faite à la main depuis
le PDF, plus détaillée) ni, sauf --force, un fichier local existant.

Usage :
    python3 scripts/import_hobbychecklist_odds.py
    python3 scripts/import_hobbychecklist_odds.py --only 2025-26-topps-chrome
    python3 scripts/import_hobbychecklist_odds.py --force

Sortie : backend/odds/nba/<checklist_id>.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GUIDES = ROOT / "backend" / "box_guides.json"
OUT_DIR = ROOT / "backend" / "odds" / "nba"
CACHE = Path.home() / ".cache" / "noclim" / "thehobbychecklist"
BASE = "https://www.thehobbychecklist.com"
API = "https://checklist-api.cardvaults.app/api"
UA = "NoClim-import/1.0 (import des cotes, avec accord de l'editeur)"
MIN_ROWS = 20
# Préfixes de `source` des feuilles produites par nos scripts (remplaçables).
GENERATED_SOURCES = ("The Hobby Checklist", "Topps — feuille d'odds officielle")

# Formats → (channel, group) de notre contrat. Le reste retombe sur des règles par mot-clé.
CHANNELS = {
    "hobby": ("hobby", "hobby"),
    "hobby international": ("hobby", "hobby"),
    "fotl": ("hobby", "fotl"),
    "fdi": ("hobby", "fdi"),
    "1st day issue": ("hobby", "fdi"),
    "hobby/fdi": ("hobby", "hobby"),
    "jumbo": ("hobby", "jumbo"),
    "jumbo 1st day issue": ("hobby", "jumbo"),
    "breaker delight": ("hobby", "delight"),
    "breaker's delight": ("hobby", "delight"),
    "breaker": ("hobby", "delight"),
    "delight": ("hobby", "delight"),
    "choice": ("hobby", "choice"),
    "h2": ("hobby", "h2"),
    "sapphire": ("special", "sapphire"),
}


def channel_group(name: str) -> tuple[str, str]:
    low = name.lower().strip()
    if low in CHANNELS:
        return CHANNELS[low]
    if low.startswith("fanatics"):
        return "special", "fanatics"
    if "sapphire" in low:
        return "special", "sapphire"
    for word, group in (("value", "value"), ("mega", "mega"), ("blaster", "blaster"), ("hanger", "hanger"),
                        ("fat pack", "fat_pack"), ("cello", "cello"), ("retail", "retail"), ("fast break", "fast_break")):
        if word in low:
            return "retail", group
    if "hobby" in low or "jumbo" in low:
        return "hobby", re.sub(r"[^a-z0-9]+", "_", low).strip("_")
    return "special", re.sub(r"[^a-z0-9]+", "_", low).strip("_") or "autre"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


# ── Lecture du flux RSC ─────────────────────────────────────────────────────

def decode_flight(page: str) -> str:
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', page)
    return "".join(json.loads(c) for c in chunks)


def sections(flight: str) -> list[dict]:
    """Objets « section » de la checklist (sectionName, parallels avec cotes)."""
    dec = json.JSONDecoder()
    out, pos, seen = [], 0, set()
    while True:
        i = flight.find('"parallels":[', pos)
        if i < 0:
            break
        depth, j = 0, i
        while j > 0:
            c = flight[j]
            if c == "}":
                depth += 1
            elif c == "{":
                if depth == 0:
                    break
                depth -= 1
            j -= 1
        try:
            obj, _ = dec.raw_decode(flight[j:])
            if isinstance(obj, dict) and obj.get("sectionName") and obj.get("id") not in seen:
                seen.add(obj.get("id"))
                out.append(obj)
        except json.JSONDecodeError:
            pass
        pos = i + 10
    return out


_COTE = re.compile(r'"title":\s*"Cote :? ?1:(\d+) ([^"]+)"')


def table_odds(flight: str) -> dict[str, dict[str, int]]:
    """Tableau des séries : cellules `title="Cote : 1:N Label"`, rangées par id de section."""
    out: dict[str, dict[str, int]] = {}
    for m in re.finditer(r'\["\$","tr","([a-z0-9]+)",', flight):
        start = m.start()
        nxt = flight.find('["$","tr","', start + 10)
        chunk = flight[start: nxt if nxt > 0 else start + 20000]
        for td in _COTE.finditer(chunk):
            out.setdefault(m.group(1), {})[td.group(2).strip()] = int(td.group(1))
    return out


def base_odds_of(section: dict, table: dict[str, dict[str, int]]) -> dict[str, int]:
    """Cote de la version de base d'une série : en-tête de section, sinon tableau."""
    found = {lbl.strip(): int(n) for n, lbl in _COTE.findall(json.dumps(section.get("summary"), ensure_ascii=False))}
    return found or table.get(section.get("id"), {})


def add_boxes_per_case(sheet: dict, guide: dict) -> None:
    """Complète les formats d'une feuille avec les boxes par case du guide des boîtes."""
    bpc = {}
    for f in guide.get("formats", []):
        for a in [f["name"], *(f.get("aliases") or [])]:
            if f.get("boxes_per_case"):
                bpc.setdefault(a.lower(), int(f["boxes_per_case"]))
                bpc.setdefault(slug(a), int(f["boxes_per_case"]))
    for c in sheet.get("configs", []):
        n = bpc.get(str(c.get("label", "")).lower()) or bpc.get(c.get("key", ""))
        if n and not c.get("boxes_per_case"):
            c["boxes_per_case"] = n


def merge_exclusives(excl_by_set: dict[str, list[str | None]]) -> dict[str, str]:
    """Une exclusivité ne vaut pour une de nos séries que si toutes les séries du site
    qui y tombent la partagent (« Rookies » + « Rookies 2 » réunies chez nous : si
    l'une est partout, la série n'est pas exclusive)."""
    out = {}
    for set_name, values in excl_by_set.items():
        if values and all(v and v == values[0] for v in values):
            out[set_name] = values[0]
    return out


def exclusives_for(guide: dict, flight: str, box_types: list[str]) -> dict[str, str]:
    """Exclusivités du site, rattachées aux séries de notre checklist."""
    by_set: dict[str, list[str | None]] = {}
    for s in sections(flight):
        name = s["sectionName"].strip()
        set_name = SET_ALIASES.get(guide.get("checklist_id"), {}).get(name) or match_set(name, box_types) or name
        by_set.setdefault(set_name, []).append(exclusive_of(s))
    return merge_exclusives(by_set)


def rarity_of(section: dict) -> str | None:
    """Étiquette de rareté du site : « Case hit » (prioritaire) ou « SSP »."""
    tags = set(re.findall(r'"className": "[^"]*text-\[9px\][^"]*uppercase[^"]*", "children": "([^"]+)"',
                          json.dumps(section.get("summary"), ensure_ascii=False)))
    if "Case hit" in tags:
        return "case_hit"
    if "SSP" in tags:
        return "ssp"
    return None


def rarity_for(guide: dict, flight: str, box_types: list[str]) -> dict[str, str]:
    by_set: dict[str, list[str | None]] = {}
    for s in sections(flight):
        name = s["sectionName"].strip()
        set_name = SET_ALIASES.get(guide.get("checklist_id"), {}).get(name) or match_set(name, box_types) or name
        by_set.setdefault(set_name, []).append(rarity_of(s))
    return merge_exclusives(by_set)


def exclusive_of(section: dict) -> str | None:
    """Format auquel la série est réservée (pastille « Exclusif Costco/Sams Club »)."""
    m = re.search(r'\["Exclusif",\s*" ",\s*"([^"]+)"\]', json.dumps(section.get("summary"), ensure_ascii=False))
    if not m:
        return None
    # « China Wave 1 » = format « China Wave 1 » ; on retire seulement un compteur isolé type « 100 ».
    return re.sub(r"\s+\d+$", "", m.group(1)).strip() if not re.search(r"Wave \d+$", m.group(1)) else m.group(1).strip()


# ── Correspondance des noms de séries avec nos « Box Type » ─────────────────

# Rattachements vérifiés à la main, quand les noms divergent trop pour la règle automatique.
SET_ALIASES = {
    "2025-26-topps-chrome-basketball-checklist": {"Topps Certified Autograph Issue": "Autograph Issue - Veterans"},
    "2026-27-topps-flagship-basketball-checklist": {
        "1981-82 Topps Chrome Autographs Mojo": "1981 82 Topps Chrome Basketball Veteran Autographs",
    },
}

_SYN = {"autographs": "auto", "autograph": "auto", "autographed": "auto", "rookies": "rookie",
        "veterans": "veteran", "relics": "relic", "signatures": "signature", "&": "and"}
_NOISE = {"topps", "set", "the", "card", "cards"}
# Mots trop courants pour identifier une série à eux seuls.
_GENERIC = {"base", "auto", "relic", "rookie", "signature", "variation", "variations", "parallel", "parallels",
            "insert", "inserts", "refractor", "refractors", "chrome", "series", "basketball", "and", "of", "veteran"}


def _tokens(name: str) -> list[str]:
    t = name.lower().replace("'", "").replace("’", "").replace("…", " ").replace("...", " ")
    words = re.findall(r"[a-z0-9&]+", t)
    return [_SYN.get(w, w) for w in words if w not in _NOISE]


def match_set(name: str, box_types: list[str]) -> str | None:
    """Box Type de notre checklist qui correspond à une série du site, ou None."""
    if not box_types:
        return None
    toks = _tokens(name)
    compact = "".join(toks)
    scored = []
    for bt in box_types:
        bt_toks = _tokens(bt)
        if not bt_toks:
            continue
        if "".join(bt_toks) == compact or sorted(bt_toks) == sorted(toks):
            return bt
        a, b = set(toks), set(bt_toks)
        scored.append((len(a & b) / len(a | b), bt))
    scored.sort(reverse=True)
    if not scored or scored[0][0] < 0.6:
        # Repli : un mot distinctif (« Facsimile ») qui ne désigne qu'une seule de nos séries.
        distinct = set(toks) - _GENERIC
        if distinct:
            cands = [bt for bt in box_types if distinct <= set(_tokens(bt))]
            if len(cands) == 1:
                return cands[0]
        return None
    # Ex æquo : on ne devine pas (le mapping manuel de l'app prendra le relais).
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return None
    return scored[0][1]


# ── Construction de la feuille ──────────────────────────────────────────────

def build_sheet(guide: dict, flight: str, box_types: list[str] | None = None) -> dict | None:
    secs = sections(flight)
    table = table_odds(flight)

    configs: dict[str, dict] = {}
    alias_to_key: dict[str, str] = {}
    for f in guide["formats"]:
        key = slug(f["name"])
        ch, gr = channel_group(f["name"])
        cfg = {"key": key, "label": f["name"], "channel": ch, "group": gr}
        if f.get("packs_per_box"):
            cfg["packs_per_box"] = int(f["packs_per_box"])
        if f.get("boxes_per_case"):
            cfg["boxes_per_case"] = int(f["boxes_per_case"])
        configs[key] = cfg
    # Nom exact d'abord, puis alias (un alias partagé ne doit pas voler un nom exact).
    for f in guide["formats"]:
        alias_to_key[f["name"].lower()] = slug(f["name"])
    for f in guide["formats"]:
        for a in f.get("aliases") or []:
            alias_to_key.setdefault(a.lower(), slug(f["name"]))

    def config_for(label: str) -> str:
        low = label.lower().strip()
        if low in alias_to_key:
            return alias_to_key[low]
        key = slug(label)
        if key not in configs:
            ch, gr = channel_group(label)
            configs[key] = {"key": key, "label": label, "channel": ch, "group": gr}
        alias_to_key[low] = key
        return key

    rows, skipped, matched = [], 0, 0
    excl_by_set: dict[str, list[str | None]] = {}
    rarity_by_set: dict[str, list[str | None]] = {}
    for s in secs:
        name = s["sectionName"].strip()
        # La série prend le nom exact de notre checklist quand on le retrouve.
        set_name = SET_ALIASES.get(guide.get("checklist_id"), {}).get(name) or match_set(name, box_types or []) or name
        matched += set_name != name or name in (box_types or [])
        excl_by_set.setdefault(set_name, []).append(exclusive_of(s))
        rarity_by_set.setdefault(set_name, []).append(rarity_of(s))
        base = base_odds_of(s, table)
        if base:
            rows.append({"label": name, "set": set_name, "parallel": "",
                         "odds": {config_for(lbl): n for lbl, n in base.items()}})
        for p in s.get("parallels") or []:
            odds = {}
            for o in p.get("odds") or []:
                per, packs = o.get("per"), o.get("packs")
                # « 1 pour N paquets » seulement : « 7 par paquet » n'entre pas dans le format 1:N.
                if per == 1 and isinstance(packs, int) and packs > 0:
                    odds[config_for(o["label"])] = packs
                else:
                    skipped += 1
            if odds:
                label = f"{name} {p['name']}".strip()
                if p.get("printRun"):
                    label += f" /{p['printRun']}"
                rows.append({"label": label, "set": set_name, "parallel": p["name"], "odds": odds})

    exclusives = merge_exclusives(excl_by_set)
    rarity = merge_exclusives(rarity_by_set)
    if not rows:
        return None
    used = {k for r in rows for k in r["odds"]}
    return {
        "version": 1,
        "sport": "nba",
        "checklist_id": guide["checklist_id"],
        "product_label": guide.get("name"),
        "source": "The Hobby Checklist (cotes Topps officielles), import avec accord de l'éditeur",
        "updated_at": date.today().isoformat(),
        "configs": [c for k, c in configs.items() if k in used],
        "rows": rows,
        **({"exclusives": exclusives} if exclusives else {}),
        **({"rarity": rarity} if rarity else {}),
        "_skipped_non_ratio": skipped,
        "_sets_matched": f"{matched}/{len(secs)}",
    }


# ── Main ────────────────────────────────────────────────────────────────────

_last = 0.0


def page_for(slug_: str) -> str:
    global _last
    path = CACHE / f"{slug_}.html"
    if path.exists():
        return path.read_text(encoding="utf-8")
    wait = 1.0 - (time.monotonic() - _last)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(f"{BASE}/collections/{slug_}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        body = r.read().decode("utf-8", errors="replace")
    _last = time.monotonic()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body


def box_types_for(checklist_id: str, master_key: str | None) -> list[str]:
    body = json.dumps({"sport_key": "nba", "checklist_ids": [checklist_id], "master_key": master_key}).encode()
    req = urllib.request.Request(f"{API}/analyze", data=body, headers={"Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        cards = json.loads(r.read())["cards"]
    return sorted({c.get("Box Type") for c in cards if c.get("Box Type")})


def master_key() -> str | None:
    req = urllib.request.Request(f"{API}/sports/nba/checklists", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read()).get("master_key")


def r2_sheets() -> set[str]:
    """Feuilles à ne jamais remplacer : celles servies en prod (R2 ∪ repo) qui ne
    viennent pas de nos générateurs, c'est-à-dire faites à la main depuis un PDF."""
    req = urllib.request.Request(f"{API}/odds/nba", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        served = set(json.loads(r.read())["checklist_ids"])
    generated = set()
    for p in OUT_DIR.glob("*.json"):
        try:
            if str(json.loads(p.read_text(encoding="utf-8")).get("source", "")).startswith(GENERATED_SOURCES):
                generated.add(p.stem)
        except (OSError, json.JSONDecodeError):
            pass
    return served - generated


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="slug thehobbychecklist à traiter seul")
    ap.add_argument("--force", action="store_true", help="réécrire les fichiers locaux existants")
    args = ap.parse_args()

    guides = json.loads(GUIDES.read_text(encoding="utf-8"))["nba"]
    existing_r2 = r2_sheets()
    mk = master_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    written, skipped = [], []
    for cid, g in sorted(guides.items()):
        if cid.startswith("thc:") or not g.get("odds_published"):
            continue
        if args.only and g["source_slug"] != args.only:
            continue
        # Feuille faite à la main depuis le PDF Topps (plus détaillée) : on n'y touche jamais.
        if cid in existing_r2:
            skipped.append(f"{cid} (feuille faite à la main)")
            continue
        out = OUT_DIR / f"{cid}.json"
        if out.exists() and str(json.loads(out.read_text(encoding="utf-8")).get("source", "")).startswith("Topps — feuille"):
            pdf_sheet = json.loads(out.read_text(encoding="utf-8"))
            flight, bts = decode_flight(page_for(g["source_slug"])), box_types_for(cid, mk)
            excl, rar = exclusives_for(g, flight, bts), rarity_for(g, flight, bts)
            for key, value in (("exclusives", excl), ("rarity", rar)):
                if value:
                    pdf_sheet[key] = value
            add_boxes_per_case(pdf_sheet, g)
            out.write_text(json.dumps(pdf_sheet, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            skipped.append(f"{cid} (PDF officiel prioritaire ; +{len(excl)} exclusivités, +{len(rar)} raretés)")
            continue
        if out.exists() and not args.force:
            skipped.append(f"{cid} (fichier local existant)")
            continue
        sheet = build_sheet(g, decode_flight(page_for(g["source_slug"])), box_types_for(cid, mk))
        if not sheet or len(sheet["rows"]) < MIN_ROWS:
            # Une feuille trop maigre fausserait la simulation (séries sans cote = poids nul).
            skipped.append(f"{cid} ({len(sheet['rows']) if sheet else 0} lignes, sous le minimum de {MIN_ROWS})")
            if out.exists():
                out.unlink()
            continue
        n_skip = sheet.pop("_skipped_non_ratio")
        sets_matched = sheet.pop("_sets_matched")
        out.write_text(json.dumps(sheet, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        written.append(cid)
        print(f"✓ {cid} · {len(sheet['rows'])} lignes · {len(sheet['configs'])} formats · séries reliées {sets_matched}"
              + (f" · {n_skip} cotes « N par paquet » ignorées" if n_skip else ""), flush=True)

    print(f"\n{len(written)} feuilles écrites dans {OUT_DIR}")
    for s in skipped:
        print("  ignoré :", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
