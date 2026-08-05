#!/usr/bin/env python3
"""
Parse une feuille d'odds Topps (PDF) en JSON canonique consommé par
backend/services/odds_engine.py.

Usage:
    pip install -r scripts/requirements-dev.txt   # pypdf
    python3 scripts/parse_topps_odds_pdf.py <pdf> --sport nba \
        --checklist-id 2025-26-topps-chrome-updates-basketball-checklist \
        [--product-label "2025-26 Topps Chrome Updates Basketball"] \
        -o out.json

Algorithme (voir docs/ODDS_FILE_FORMAT.md pour le détail) :
  - Extraction texte page par page avec pypdf (PdfReader(path).pages[i].extract_text()).
  - En-tête : la ligne commence par "Cards ". Le reste est découpé par matching
    glouton du plus long contre CONFIG_NAME_VOCAB (backend/services/odds_config.py).
    Tout token non reconnu devient sa propre colonne et est signalé sur stderr.
    L'en-tête se répète à chaque page : on ne le parse qu'une fois.
  - Lignes de données : on compte les tokens de fin de ligne qui matchent
    ^(1:[\\d,]+|-)$. Ce compte doit être EXACTEMENT égal au nombre de colonnes,
    sinon la ligne est rejetée (disclaimers, en-têtes répétés). Le préfixe
    restant est le label.
  - `set`/`parallel` sont dérivés via odds_engine.derive_set_root.
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Permet l'exécution depuis n'importe quel cwd : ajoute la racine du repo au path.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend.services.odds_config import config_key_from_label, config_name_vocab_sorted, default_channel_and_group
from backend.services.odds_engine import derive_parallel, derive_set_root
from backend.services.odds_engine import validate_odds_sheet


CELL_RE = re.compile(r"^(1:[\d,]+|-)$")


def _parse_header(rest_text):
    """Matching glouton du plus long contre CONFIG_NAME_VOCAB.

    Retourne (colonnes: list[str], tokens_inconnus: list[str]).
    """
    vocab = config_name_vocab_sorted()
    vocab_token_lists = [name.split() for name in vocab]
    tokens = rest_text.split()

    columns = []
    unknown = []
    i = 0
    while i < len(tokens):
        matched_name = None
        for name, name_tokens in zip(vocab, vocab_token_lists):
            n = len(name_tokens)
            if tokens[i:i + n] == name_tokens:
                matched_name = name
                break
        if matched_name:
            columns.append(matched_name)
            i += len(matched_name.split())
        else:
            columns.append(tokens[i])
            unknown.append(tokens[i])
            i += 1
    return columns, unknown


def _parse_cell(cell):
    if cell == "-":
        return None
    return int(cell[2:].replace(",", ""))


def extract_rows_from_text(full_text):
    """Parse le texte concaténé de toutes les pages. Retourne (header, rows, rejected_lines)."""
    header = None
    rows = []
    rejected = []

    for raw_line in full_text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("Cards "):
            if header is None:
                header, unknown = _parse_header(line[len("Cards "):].strip())
                if unknown:
                    print(f"[warn] Tokens d'en-tête non reconnus (conservés tels quels) : {unknown}", file=sys.stderr)
            continue

        if header is None:
            # Texte avant le premier en-tête (page de garde, disclaimer...).
            continue

        tokens = line.split(" ")
        n_cells = 0
        for tok in reversed(tokens):
            if CELL_RE.match(tok):
                n_cells += 1
            else:
                break

        if n_cells != len(header):
            rejected.append(line)
            continue

        label = " ".join(tokens[: len(tokens) - n_cells]).strip()
        if not label:
            rejected.append(line)
            continue

        cells = tokens[len(tokens) - n_cells:]
        odds = {}
        for col_label, cell in zip(header, cells):
            value = _parse_cell(cell)
            if value is not None:
                odds[config_key_from_label(col_label)] = value

        rows.append({"label": label, "odds": odds})

    return header, rows, rejected


def build_sheet(sport, checklist_id, header_labels, rows, product_label=None, packs_per_box_by_key=None):
    packs_per_box_by_key = packs_per_box_by_key or {}

    configs = []
    seen_keys = set()
    for label in header_labels:
        key = config_key_from_label(label)
        base_key = key
        suffix = 2
        while key in seen_keys:
            key = f"{base_key}_{suffix}"
            suffix += 1
        seen_keys.add(key)
        channel, group = default_channel_and_group(label)
        cfg = {"key": key, "label": label, "channel": channel, "group": group}
        if key in packs_per_box_by_key:
            cfg["packs_per_box"] = packs_per_box_by_key[key]
        configs.append(cfg)

    all_labels = [r["label"] for r in rows]
    out_rows = []
    for r in rows:
        set_root = derive_set_root(r["label"], all_labels)
        parallel = derive_parallel(r["label"], set_root)
        out_rows.append({
            "label": r["label"],
            "set": set_root,
            "parallel": parallel,
            "odds": r["odds"],
        })

    sheet = {
        "version": 1,
        "sport": sport,
        "checklist_id": checklist_id,
        "rows": out_rows,
        "configs": configs,
    }
    if product_label:
        sheet["product_label"] = product_label
    sheet["source"] = "Topps odds sheet PDF"
    return sheet


def main():
    parser = argparse.ArgumentParser(description="Parse une feuille d'odds Topps (PDF) en JSON canonique.")
    parser.add_argument("pdf", help="Chemin du PDF source.")
    parser.add_argument("--sport", required=True, help="Clé de sport (ex. nba).")
    parser.add_argument("--checklist-id", required=True, help="checklist_id canonique.")
    parser.add_argument("--product-label", default=None, help="Libellé produit (optionnel).")
    parser.add_argument("-o", "--output", required=True, help="Fichier JSON de sortie.")
    args = parser.parse_args()

    try:
        from pypdf import PdfReader
    except ImportError:
        print(
            "pypdf est requis pour ce script (pip install -r scripts/requirements-dev.txt).",
            file=sys.stderr,
        )
        return 1

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"Fichier introuvable : {pdf_path}", file=sys.stderr)
        return 1

    reader = PdfReader(str(pdf_path))
    page_texts = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(page_texts)

    header, rows, rejected = extract_rows_from_text(full_text)

    if header is None:
        print("Aucun en-tête ('Cards ...') trouvé dans le PDF.", file=sys.stderr)
        return 1

    sheet = build_sheet(args.sport, args.checklist_id, header, rows, product_label=args.product_label)

    errors = validate_odds_sheet(sheet)

    n_configs = len(sheet["configs"])
    n_rows = len(sheet["rows"])
    n_sets = len({r["set"] for r in sheet["rows"]})

    print(f"Pages           : {len(reader.pages)}")
    print(f"Configs         : {n_configs} -> {[c['label'] for c in sheet['configs']]}")
    print(f"Lignes extraites: {n_rows}")
    print(f"Lignes rejetées : {len(rejected)}")
    print(f"Sets dérivés    : {n_sets}")
    if rejected:
        print("Exemples de lignes rejetées :", file=sys.stderr)
        for line in rejected[:5]:
            print(f"  - {line[:120]}", file=sys.stderr)

    if errors:
        print(f"\n{len(errors)} erreur(s) de validation :", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sheet, f, ensure_ascii=False, indent=2)
    print(f"\nEcrit : {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
