#!/usr/bin/env python3
"""
Importe le guide des boîtes de The Hobby Checklist (thehobbychecklist.com),
avec l'accord de son éditeur.

Pour chaque collection du sitemap : formats de boîte (Hobby, FOTL, Jumbo,
Mega, Blaster…), cartes/paquet, paquets/boîte, boîtes/case, prix public (USD),
autos par boîte et par case, contenu moyen (FR + VO), date de sortie,
présentation de la collection et image de la boîte.

Lecture des pages publiques uniquement (pas d'/api/, réservée par robots.txt),
une requête par seconde, avec cache local des pages.

Usage :
    python3 scripts/import_hobbychecklist_boxes.py            # tout le sitemap
    python3 scripts/import_hobbychecklist_boxes.py --limit 5  # essai
    python3 scripts/import_hobbychecklist_boxes.py --refresh  # ignore le cache

Sortie : backend/box_guides.json
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www.thehobbychecklist.com"
UA = "NoClim-import/1.0 (import du guide des boites, avec accord de l'editeur)"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "box_guides.json"
IMAGES = ROOT / "frontend" / "public" / "boxes"
DEFAULT_CACHE = Path.home() / ".cache" / "noclim" / "thehobbychecklist"
DELAY_S = 1.0

MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
}


# ── Réseau (poli) ──────────────────────────────────────────────────────────

_last_call = 0.0


def fetch(url: str) -> str:
    global _last_call
    wait = DELAY_S - (time.monotonic() - _last_call)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as resp:
        body = resp.read().decode("utf-8", errors="replace")
    _last_call = time.monotonic()
    return body


def cached_page(slug: str, cache: Path, refresh: bool) -> str:
    path = cache / f"{slug}.html"
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    body = fetch(f"{BASE}/collections/{slug}")
    path.write_text(body, encoding="utf-8")
    return body


def shrink(data: bytes, width: int = 480) -> bytes:
    """Réduit l'image (800px → 480px, WebP q78) si Pillow est disponible."""
    try:
        from io import BytesIO
        from PIL import Image
    except ImportError:
        return data
    img = Image.open(BytesIO(data))
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    out = BytesIO()
    img.save(out, "WEBP", quality=78, method=6)
    return out.getvalue()


def localize_image(url: str | None, dest: Path) -> str | None:
    """Copie une image de boîte chez nous ; renvoie son chemin public (/boxes/…)."""
    if not url or "/boxes/" not in url:
        return url
    name = url.rsplit("/", 1)[1]
    path = dest / name
    if not path.exists():
        global _last_call
        wait = DELAY_S - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                path.write_bytes(shrink(resp.read()))
        except Exception:
            return None
        finally:
            _last_call = time.monotonic()
    return f"/boxes/{name}"


def collection_slugs() -> list[str]:
    xml = fetch(f"{BASE}/sitemap.xml")
    return sorted(set(re.findall(r"/collections/([a-z0-9-]+)</loc>", xml)))


# ── Flux RSC (Next.js) ─────────────────────────────────────────────────────

def decode_flight(page: str) -> str:
    chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', page)
    return "".join(json.loads(c) for c in chunks)


def parse_rows(flight: str) -> dict[str, object]:
    """Lignes `id:valeur` du flux ; les valeurs JSON sont décodées."""
    rows: dict[str, object] = {}
    for line in flight.split("\n"):
        m = re.match(r"^([0-9a-f]+):(.*)$", line)
        if not m:
            continue
        key, raw = m.groups()
        try:
            rows[key] = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            rows[key] = raw
    return rows


def resolve(node, rows, depth=0):
    """Remplace les références "$L<id>" / "$<id>" par la ligne correspondante."""
    if depth > 60:
        return node
    if isinstance(node, str):
        m = re.fullmatch(r"\$L?([0-9a-f]+)", node)
        if m and m.group(1) in rows:
            return resolve(rows[m.group(1)], rows, depth + 1)
        return node
    if isinstance(node, list):
        return [resolve(x, rows, depth + 1) for x in node]
    if isinstance(node, dict):
        return {k: resolve(v, rows, depth + 1) for k, v in node.items()}
    return node


def elements(node, tag=None):
    """Itère sur les éléments React ["$", tag, key, props] de l'arbre."""
    if isinstance(node, list):
        if len(node) >= 4 and node[0] == "$" and isinstance(node[1], str):
            if tag is None or node[1] == tag:
                yield node
        for x in node:
            yield from elements(x, tag)
    elif isinstance(node, dict):
        for v in node.values():
            yield from elements(v, tag)


def texts(node) -> list[str]:
    """Textes visibles d'un sous-arbre, dans l'ordre (nombres inclus)."""
    out: list[str] = []

    def walk(n):
        if isinstance(n, str):
            if n.startswith("$") or not n.strip():
                return
            out.append(n)
        elif isinstance(n, (int, float)) and not isinstance(n, bool):
            out.append(str(n))
        elif isinstance(n, list):
            if len(n) >= 4 and n[0] == "$" and isinstance(n[1], str):
                walk((n[3] or {}).get("children") if isinstance(n[3], dict) else None)
            else:
                for x in n:
                    walk(x)
        elif isinstance(n, dict):
            walk(n.get("children"))

    walk(node)
    return out


def joined(node) -> str:
    return re.sub(r"\s+", " ", "".join(texts(node))).strip()


# ── Extraction ─────────────────────────────────────────────────────────────

def french_date(text: str) -> str | None:
    m = re.search(r"(\d{1,2})\s+([a-zéû]+)\s+(\d{4})", text.lower())
    if not m or m.group(2) not in MONTHS:
        return None
    return f"{int(m.group(3)):04d}-{MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"


def leading_int(text: str) -> int | None:
    m = re.match(r"\s*(\d+)", text)
    return int(m.group(1)) if m else None


def json_formats(flight: str) -> list[dict]:
    i = flight.find('"formats":[')
    if i < 0:
        return []
    try:
        value, _ = json.JSONDecoder().raw_decode(flight[i + len('"formats":'):])
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return []


def parse_article(article: list) -> dict:
    """Une carte de format du guide des boîtes."""
    name = article[2]
    props = article[3] if isinstance(article[3], dict) else {}
    body = props.get("children")

    description = None
    for h in elements(body, "p"):
        t = joined(h)
        if t and not t.startswith("Sortie le") and "par boîte" not in t and len(t) > 25:
            description = t
            break

    release = None
    for p in elements(body, "p"):
        t = joined(p)
        if t.startswith("Sortie le"):
            release = french_date(t)
            break

    contents = []
    for li in elements(body, "li"):
        li_props = li[3] if isinstance(li[3], dict) else {}
        title = li_props.get("title") or ""
        parts = texts(li_props.get("children"))
        marker = parts[0] if parts and parts[0] in ("✍", "•") else None
        fr = " ".join(p for p in parts if p not in ("✍", "•")).strip()
        vo = title[len("VO : "):] if title.startswith("VO : ") else (li[2] if isinstance(li[2], str) else None)
        if fr or vo:
            contents.append({"fr": fr or vo, "vo": vo, "auto": marker == "✍"})

    autos_box = autos_case = None
    for b in elements(body, "b"):
        t = joined(b)
        if "/ boîte" in t:
            autos_box = leading_int(t)
            break
    for span in elements(body, "span"):
        t = joined(span)
        m = re.match(r"·\s*(\d+)\s*par case", t)
        if m:
            autos_case = int(m.group(1))
            break

    image = None
    for img in elements(body, "img"):
        src = (img[3] or {}).get("src") if isinstance(img[3], dict) else None
        if isinstance(src, str) and "/boxes/" in src:
            image = BASE + src if src.startswith("/") else src
            break

    return {
        "name": name,
        "description": description,
        "release_date": release,
        "contents": contents,
        "autos_per_box": autos_box,
        "autos_per_case": autos_case,
        "image": image,
    }


def format_image(text: str, slug: str, fmt: str | None) -> str | None:
    key = re.sub(r"[^a-z0-9]+", "-", (fmt or "").lower()).strip("-")
    m = re.search(rf"/boxes/({re.escape(slug)}-{re.escape(key)}\.webp)", text)
    return f"{BASE}/boxes/{m.group(1)}" if m else None


def server_text(page: str) -> str:
    t = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", page)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</(p|div|li|h\d|dt|dd|span|section|article)>", "\n", t)
    t = htmllib.unescape(re.sub(r"<[^>]+>", "", t))
    return re.sub(r"\n\s*\n+", "\n", t)


def presentation(page: str) -> list[str]:
    t = server_text(page)
    a = t.find("Présentation de la collection\n")
    if a < 0:
        return []
    b = t.find("Checklist mise à jour le", a)
    block = t[a + len("Présentation de la collection\n"): b if b > 0 else a + 6000]
    lines = [l.strip() for l in block.split("\n") if l.strip()]
    out = []
    for l in lines:
        if l in {"VFVO", "VF", "VO"} or l.startswith("Traduit de l'anglais"):
            continue
        out.append(re.sub(r"(?<=[.!?)])(VO|VF)$", "", l).strip())
    return out


def page_meta(page: str, slug: str) -> dict:
    title = re.search(r"<title>(.*?)</title>", page, re.S)
    name = None
    if title:
        m = re.match(r"Checklist (.+?) :", htmllib.unescape(title.group(1)))
        name = m.group(1).strip() if m else None
    season = re.match(r"(\d{4}-\d{2})", slug)
    t = server_text(page)
    updated = re.search(r"Checklist mise à jour le (\d{2}/\d{2}/\d{4})", t)
    cover = re.search(r'/boxes/([a-z0-9-]+-cover\.webp)', page)
    return {
        "name": name,
        "season": season.group(1) if season else None,
        "brand": "Panini" if "-panini-" in slug else "Topps" if "-topps-" in slug else None,
        "checklist_updated": updated.group(1) if updated else None,
        "odds_published": "n'a pas (encore) publié les cotes" not in t,
        "cover_image": f"{BASE}/boxes/{cover.group(1)}" if cover else None,
    }


def parse_collection(page: str, slug: str) -> dict | None:
    flight = decode_flight(page)
    rows = parse_rows(flight)
    raw_formats = json_formats(flight)
    if not raw_formats:
        return None

    articles = {}
    for value in rows.values():
        for art in elements(resolve(value, rows), "article"):
            if isinstance(art[2], str) and art[2] not in articles:
                articles[art[2]] = parse_article(art)

    formats = []
    for f in raw_formats:
        name = f.get("name")
        art = articles.get(name, {})
        cpp, ppb = f.get("cardsPerPack"), f.get("packsPerBox")
        formats.append({
            "name": name,
            "aliases": f.get("aliases") or [name],
            "description": art.get("description"),
            "release_date": art.get("release_date"),
            "cards_per_pack": cpp,
            "packs_per_box": ppb,
            "boxes_per_case": f.get("boxesPerCase"),
            "cards_per_box": cpp * ppb if cpp and ppb else None,
            "price_usd": f.get("price"),
            "autos_per_box": art.get("autos_per_box"),
            "autos_per_case": art.get("autos_per_case"),
            "case_from_shops": bool(f.get("caseFromShops")),
            "contents": art.get("contents") or [{"fr": c, "vo": c, "auto": bool(re.search(r"auto|signature", c, re.I))} for c in f.get("contents") or []],
            "image": art.get("image") or format_image(page + flight, slug, name),
        })

    return {"source_slug": slug, **page_meta(page, slug), "formats": formats, "presentation": presentation(page)}


# ── Correspondance avec nos checklists ─────────────────────────────────────

def norm(text: str) -> list[str]:
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    tokens = re.findall(r"[a-z0-9]+", t)
    noise = {"basketball", "checklist", "nba", "the", "x", "and", "collection"}
    alias = {"3": "three"}
    return [alias.get(w, w) for w in tokens if w not in noise]


def match_checklist(slug: str, ours: list[dict]) -> str | None:
    by_id = {c["checklist_id"]: c for c in ours}
    direct = f"{slug}-basketball-checklist"
    if direct in by_id:
        return direct
    season = slug[:7]
    target = set(norm(slug[8:]))
    best, best_score = None, 0.0
    for c in ours:
        if c.get("year") != season:
            continue
        cand = set(norm(c["checklist_id"][8:]))
        if not cand:
            continue
        inter = len(target & cand)
        score = inter / len(target | cand)
        # « Topps Flagship » chez eux = « Topps Basketball » chez nous
        if target - {"flagship"} == cand and "flagship" in target:
            score = 0.99
        if score > best_score:
            best, best_score = c["checklist_id"], score
    return best if best_score >= 0.75 else None


def our_checklists() -> list[dict]:
    req = urllib.request.Request("https://checklist-api.cardvaults.app/api/sports/nba/checklists", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["checklists"]


# ── Main ───────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="nombre max de collections (essai)")
    ap.add_argument("--refresh", action="store_true", help="re-télécharger les pages en cache")
    ap.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--images", type=Path, default=IMAGES, help="où copier les images de boîtes (servies en /boxes/)")
    args = ap.parse_args()

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    args.images.mkdir(parents=True, exist_ok=True)
    slugs = collection_slugs()
    if args.limit:
        slugs = slugs[: args.limit]
    ours = our_checklists()

    guides: dict[str, dict] = {}
    unmatched, failed = [], []
    for i, slug in enumerate(slugs, 1):
        try:
            data = parse_collection(cached_page(slug, args.cache_dir, args.refresh), slug)
        except Exception as e:  # une page cassée ne doit pas arrêter l'import
            failed.append(f"{slug} ({e})")
            continue
        if not data:
            failed.append(f"{slug} (pas de guide des boîtes)")
            continue
        data["cover_image"] = localize_image(data["cover_image"], args.images)
        for f in data["formats"]:
            f["image"] = localize_image(f["image"], args.images)
        checklist_id = match_checklist(slug, ours)
        data["checklist_id"] = checklist_id
        if not checklist_id:
            unmatched.append(slug)
        guides[checklist_id or f"thc:{slug}"] = data
        print(f"[{i}/{len(slugs)}] {slug} → {checklist_id or 'non relié'} · {len(data['formats'])} formats", flush=True)

    out = {
        "_source": "thehobbychecklist.com — importé avec l'accord de l'éditeur",
        "_imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "_script": "scripts/import_hobbychecklist_boxes.py",
        "nba": dict(sorted(guides.items())),
    }
    args.out.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\n{len(guides)} collections écrites dans {args.out}")
    print(f"Reliées à nos checklists : {len(guides) - len(unmatched)} · non reliées : {len(unmatched)} · échecs : {len(failed)}")
    for s in unmatched:
        print("  non relié :", s)
    for s in failed:
        print("  échec :", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
