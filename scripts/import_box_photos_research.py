#!/usr/bin/env python3
"""
Photos de boîtes pour les collections du guide issues de la recherche web
(backend/box_guides_extra.json), prises sur la page Cardboard Connection déjà
citée en source de chaque collection.

- Photo de couverture : la boîte Hobby si l'article en montre une, sinon une
  autre photo de boîte, sinon l'affiche produit de l'article (og:image), à
  condition que ce ne soit pas la photo d'une carte (image en hauteur).
- Photo par format : une image dont le nom contient le format et « box »
  (« …-FOTL-Box-Sealed.jpg » → FOTL).
- Le fond blanc des photos est rendu transparent (remplissage depuis les
  coins), puis l'image est réduite en WebP 480 px comme les autres.

Une page par seconde, cache local des pages et des images.
Sortie : frontend/public/boxes/<id>-*.webp + data/box_research_photos.json,
repris par scripts/import_box_research.py.

Usage : python3 scripts/import_box_photos_research.py [--only <checklist_id>]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTRA = ROOT / "backend" / "box_guides_extra.json"
PHOTOS = ROOT / "data" / "box_research_photos.json"
IMAGES = ROOT / "frontend" / "public" / "boxes"
CACHE = Path.home() / ".cache" / "noclim" / "cardboardconnection"
UA = "Mozilla/5.0 (NoClim box photos)"

_last = 0.0


def get(url: str) -> bytes:
    global _last
    wait = 1.0 - (time.monotonic() - _last)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.read()
    finally:
        _last = time.monotonic()


def page(url: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (re.sub(r"[^a-z0-9]+", "-", url.lower()).strip("-")[-150:] + ".html")
    if not path.exists():
        path.write_bytes(get(url))
    return path.read_text(encoding="utf-8", errors="replace")


def candidate_images(html: str) -> tuple[list[str], str | None]:
    urls = re.findall(r'(?:src|data-src|data-lazy-src)="(https?://[^"]+\.(?:jpe?g|png|webp))"', html)
    urls += [u.split(" ")[0] for s in re.findall(r'srcset="([^"]+)"', html) for u in s.split(",")]
    seen, boxes = set(), []
    for u in urls:
        u = u.strip()
        base = re.sub(r"-\d+x\d+(?=\.\w+$)", "", u)  # vignettes WordPress → original
        name = base.rsplit("/", 1)[-1].lower()
        if base in seen or "box" not in name or re.search(r"case|break|logo|avatar|icon", name):
            continue
        seen.add(base)
        boxes.append(base)
    m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) \
        or re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
    return boxes, (m.group(1) if m else None)


def pick_cover(boxes: list[str]) -> str | None:
    def score(u: str) -> int:
        n = u.rsplit("/", 1)[-1].lower()
        s = 0
        if "hobby" in n:
            s += 4
        if re.search(r"fotl|first-off|blaster|mega|retail|hanger|cello|fast-break|choice|h2|asia|tmall|international", n):
            s -= 3
        if "sealed" in n or "box" in n:
            s += 1
        return s
    return max(boxes, key=score) if boxes else None


def format_photo(boxes: list[str], fmt: str) -> str | None:
    words = [w for w in re.split(r"[^a-z0-9]+", fmt.lower()) if w]
    if not words:
        return None
    for u in boxes:
        n = re.split(r"[^a-z0-9]+", u.rsplit("/", 1)[-1].lower())
        if all(w in n for w in words):
            return u
    return None


def to_webp(data: bytes, width: int = 480) -> bytes:
    from PIL import Image, ImageDraw

    img = Image.open(BytesIO(data)).convert("RGBA")
    # Fond blanc → transparent : remplissage depuis les quatre coins s'ils sont clairs.
    w, h = img.size
    for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        r, g, b, a = img.getpixel(xy)
        if a and min(r, g, b) >= 235:
            ImageDraw.floodfill(img, xy, (255, 255, 255, 0), thresh=24)
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    out = BytesIO()
    img.save(out, "WEBP", quality=78, method=6)
    return out.getvalue()


def is_product_art(url: str) -> bool:
    """L'image de partage est soit une affiche produit (carrée ou en largeur : on la
    garde), soit la photo d'une carte (en hauteur : PRODUCT.md exclut les visuels
    officiels de cartes)."""
    from PIL import Image

    try:
        img = Image.open(BytesIO(get(url)))
    except Exception:
        return False
    return img.width >= img.height * 0.9 and img.width >= 300


def save(url: str, name: str) -> str | None:
    path = IMAGES / name
    if not path.exists():
        try:
            path.write_bytes(to_webp(get(url)))
        except Exception as e:  # une image cassée ne doit pas arrêter l'import
            print(f"   image KO {url} : {e}")
            return None
    return f"/boxes/{name}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only")
    args = ap.parse_args()

    guides = json.loads(EXTRA.read_text(encoding="utf-8"))["nba"]
    photos = json.loads(PHOTOS.read_text(encoding="utf-8")) if PHOTOS.exists() else {}
    IMAGES.mkdir(parents=True, exist_ok=True)
    found = promo = none = 0
    for cid, g in sorted(guides.items()):
        if args.only and cid != args.only:
            continue
        src = next((s.split()[0] for s in g.get("sources", []) if "cardboardconnection.com" in s), None)
        if not src:
            none += 1
            continue
        try:
            boxes, og = candidate_images(page(src))
        except Exception as e:
            print(f"✗ {cid} : page KO ({e})")
            none += 1
            continue
        short = cid.replace("-basketball-checklist", "")
        entry = {"page": src, "formats": {}}
        cover_url = pick_cover(boxes)
        if cover_url:
            entry["cover"] = save(cover_url, f"{short}-cover.webp")
            found += 1
        elif og and is_product_art(og):
            entry["cover"] = save(og, f"{short}-cover.webp")
            entry["cover_is_promo"] = True
            promo += 1
        for f in g.get("formats", []):
            u = format_photo(boxes, f["name"])
            if u:
                p = save(u, f"{short}-{re.sub(r'[^a-z0-9]+', '-', f['name'].lower()).strip('-')}.webp")
                if p:
                    entry["formats"][f["name"]] = p
        photos[cid] = entry
        print(f"✓ {cid} : {'boîte' if cover_url else 'visuel promo' if og else 'rien'}"
              + (f" · formats {list(entry['formats'])}" if entry["formats"] else ""), flush=True)
        PHOTOS.write_text(json.dumps(photos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"\nPhotos de boîte : {found} · visuels promo : {promo} · sans page/photo : {none}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
