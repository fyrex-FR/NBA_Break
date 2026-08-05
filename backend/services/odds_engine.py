"""
Moteur "odds Topps" : chargement/validation des feuilles d'odds, dérivation des
sets à partir des labels de lignes, résumés par set (badges, meilleures odds),
rattachement des Box Type de checklist, et calcul des pull rates pour la
pondération de la simulation de break.

Vocabulaire (voir aussi odds_config.py) : "config" / "config_key" désigne
toujours une colonne d'odds du PDF Topps (Hobby, Delight, Value Box EA...).
"set" désigne la colonne `Box Type` d'une checklist (Base, Clutch City...).
Ne pas confondre avec `box_type` de box_prices.py (configuration de boîte).

Rien ici ne lève d'exception vers l'appelant en cas d'absence de fichier
d'odds : c'est le comportement par défaut attendu (dégradation silencieuse).
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

from .analysis_engine import normalize_box_type_text
from .checklist_aliases import canonical_checklist_id, equivalent_checklist_ids, load_checklist_aliases
from .odds_config import (
    BADGE_DELIGHT_ONLY,
    BADGE_EVERYWHERE,
    BADGE_FANATICS_ONLY,
    BADGE_HOBBY_DELIGHT,
    BADGE_HOBBY_ONLY,
    BADGE_PROMO_ONLY,
    BADGE_RETAIL_ONLY,
    BADGE_SAPPHIRE_ONLY,
    DELIGHT_GROUP,
    HOBBY_NON_DELIGHT_GROUPS,
    PARALLEL_FAMILY_TOKENS,
    SINGLETON_BADGE_GROUPS,
    group_display_label,
    is_parallel_token,
    rarity_badge_for_odds,
)
from .r2_storage import get_r2_config, is_r2_configured, list_r2_keys_with_prefix, read_r2_json

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Emplacements
# ---------------------------------------------------------------------------

ODDS_R2_PREFIX = "odds"
_LOCAL_ODDS_ROOT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "odds")


def _r2_odds_key(sport_key, checklist_id):
    return f"{ODDS_R2_PREFIX}/{sport_key}/{checklist_id}.json"


def _local_odds_path(sport_key, checklist_id):
    return os.path.join(_LOCAL_ODDS_ROOT, sport_key, f"{checklist_id}.json")


# ---------------------------------------------------------------------------
# Validation (Python pur, pas de dépendance jsonschema)
# ---------------------------------------------------------------------------

_VALID_CHANNELS = {"hobby", "retail", "special"}


def validate_odds_sheet(data) -> list:
    """Valide une feuille d'odds contre le contrat documenté dans
    docs/ODDS_FILE_FORMAT.md et backend/services/odds_schema.json.

    Retourne une liste de messages d'erreur lisibles (liste vide = valide).
    Implémentation en Python pur (aucune dépendance jsonschema ajoutée).
    """
    errors = []

    if not isinstance(data, dict):
        return ["Le fichier d'odds doit être un objet JSON."]

    for field in ("version", "sport", "checklist_id", "configs", "rows"):
        if field not in data:
            errors.append(f"Champ obligatoire manquant : '{field}'.")

    configs = data.get("configs")
    config_keys = set()
    if configs is not None:
        if not isinstance(configs, list) or not configs:
            errors.append("'configs' doit être une liste non vide.")
        else:
            for idx, cfg in enumerate(configs):
                if not isinstance(cfg, dict):
                    errors.append(f"configs[{idx}] doit être un objet.")
                    continue
                key = cfg.get("key")
                if not key or not isinstance(key, str):
                    errors.append(f"configs[{idx}].key manquant ou invalide.")
                    continue
                if key in config_keys:
                    errors.append(f"configs[{idx}].key '{key}' est dupliqué.")
                config_keys.add(key)
                if not cfg.get("label"):
                    errors.append(f"configs[{idx}] ('{key}') : 'label' manquant.")
                channel = cfg.get("channel")
                if channel not in _VALID_CHANNELS:
                    errors.append(
                        f"configs[{idx}] ('{key}') : channel '{channel}' invalide "
                        f"(attendu {sorted(_VALID_CHANNELS)})."
                    )
                if "packs_per_box" in cfg and cfg["packs_per_box"] is not None:
                    ppb = cfg["packs_per_box"]
                    if not isinstance(ppb, int) or isinstance(ppb, bool) or ppb <= 0:
                        errors.append(
                            f"configs[{idx}] ('{key}') : packs_per_box doit être un entier > 0."
                        )

    rows = data.get("rows")
    if rows is not None:
        if not isinstance(rows, list) or not rows:
            errors.append("'rows' doit être une liste non vide.")
        else:
            for idx, row in enumerate(rows):
                if not isinstance(row, dict):
                    errors.append(f"rows[{idx}] doit être un objet.")
                    continue
                label = row.get("label")
                if not label or not isinstance(label, str):
                    errors.append(f"rows[{idx}] : 'label' manquant ou invalide.")
                odds = row.get("odds")
                if odds is None or not isinstance(odds, dict):
                    errors.append(f"rows[{idx}] ('{label}') : 'odds' doit être un objet.")
                    continue
                if not odds:
                    errors.append(f"rows[{idx}] ('{label}') : 'odds' est vide.")
                for cfg_key, value in odds.items():
                    if config_keys and cfg_key not in config_keys:
                        errors.append(
                            f"rows[{idx}] ('{label}') : la clé d'odds '{cfg_key}' ne "
                            "référence aucune config déclarée."
                        )
                    if value is None:
                        continue
                    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
                        errors.append(
                            f"rows[{idx}] ('{label}') : odds['{cfg_key}']={value!r} doit "
                            "être un entier strictement positif (ou absent)."
                        )

    return errors


# ---------------------------------------------------------------------------
# Chargement (R2 + fallback local + cache mémoire)
# ---------------------------------------------------------------------------

_SHEET_CACHE: dict = {}


def clear_odds_cache():
    """Vide le cache mémoire des feuilles d'odds (utile pour les tests)."""
    _SHEET_CACHE.clear()


def _read_json_r2_then_local(sport_key, checklist_id):
    """Essaie R2 (si configuré) puis le fichier local. Retourne (data, source) ou (None, None)."""
    config = get_r2_config()
    if is_r2_configured(config):
        try:
            data = read_r2_json(config, _r2_odds_key(sport_key, checklist_id))
            if data:
                return data, "r2"
        except Exception as exc:  # pragma: no cover - dépend de R2
            logger.debug("Lecture R2 odds/%s/%s échouée : %s", sport_key, checklist_id, exc)

    local_path = _local_odds_path(sport_key, checklist_id)
    if os.path.exists(local_path):
        try:
            with open(local_path, "r", encoding="utf-8") as f:
                return json.load(f), "local"
        except Exception as exc:
            logger.warning("Lecture locale %s invalide : %s", local_path, exc)
    return None, None


def load_odds_sheet(sport_key, checklist_id):
    """Charge la feuille d'odds pour (sport_key, checklist_id).

    Lit `odds/{sport_key}/{checklist_id}.json` sur R2, avec fallback sur le
    fichier local `backend/odds/{sport_key}/{checklist_id}.json`. Essaie aussi
    les identifiants de checklist équivalents (alias legacy). Ne lève jamais
    d'exception : retourne None si absent ou illisible. Valide et loggue les
    erreurs de contrat sans bloquer la lecture (best-effort). Cache mémoire
    simple par (sport_key, checklist_id canonique).
    """
    sport_key = str(sport_key or "").strip()
    checklist_id = str(checklist_id or "").strip()
    if not sport_key or not checklist_id:
        return None

    aliases_root = load_checklist_aliases()
    canonical = canonical_checklist_id(sport_key, checklist_id, aliases_root) or checklist_id
    cache_key = (sport_key, canonical)
    if cache_key in _SHEET_CACHE:
        return _SHEET_CACHE[cache_key]

    candidate_ids = list(equivalent_checklist_ids(sport_key, checklist_id, aliases_root) or {checklist_id})
    if canonical not in candidate_ids:
        candidate_ids.append(canonical)

    data = None
    for candidate in candidate_ids:
        data, _source = _read_json_r2_then_local(sport_key, candidate)
        if data is not None:
            break

    if data is None:
        _SHEET_CACHE[cache_key] = None
        return None

    errors = validate_odds_sheet(data)
    if errors:
        logger.warning(
            "Feuille d'odds %s/%s : %d erreur(s) de validation : %s",
            sport_key, canonical, len(errors), "; ".join(errors[:5]),
        )

    _SHEET_CACHE[cache_key] = data
    return data


def list_odds_checklists(sport_key):
    """Liste les checklist_ids ayant un fichier d'odds pour ce sport (R2 ∪ local)."""
    sport_key = str(sport_key or "").strip()
    if not sport_key:
        return []

    found = set()

    config = get_r2_config()
    if is_r2_configured(config):
        prefix = f"{ODDS_R2_PREFIX}/{sport_key}/"
        try:
            for key in list_r2_keys_with_prefix(config, prefix, suffix=".json"):
                name = os.path.basename(key)
                if name.lower().endswith(".json"):
                    found.add(name[: -len(".json")])
        except Exception as exc:  # pragma: no cover
            logger.debug("Listing R2 odds/%s échoué : %s", sport_key, exc)

    local_dir = os.path.join(_LOCAL_ODDS_ROOT, sport_key)
    if os.path.isdir(local_dir):
        for name in os.listdir(local_dir):
            if name.lower().endswith(".json"):
                found.add(name[: -len(".json")])

    return sorted(found)


# ---------------------------------------------------------------------------
# Dérivation du "set" depuis un label
# ---------------------------------------------------------------------------

def _is_prefix_word_boundary(prefix, s):
    if not s.startswith(prefix):
        return False
    if len(prefix) == len(s):
        return True
    return s[len(prefix)] == " "


def _rest_is_parallel_only(rest):
    """Le `rest` peut contenir des '/' (ex. "Magenta/Purple") : on découpe sur
    '/' avant de tester chaque partie contre les tokens de parallèle."""
    if not rest:
        return False
    for chunk in rest.split("/"):
        chunk = chunk.strip()
        if not chunk:
            continue
        for tok in chunk.split():
            if not is_parallel_token(tok):
                return False
    return True


def _word_is_parallel(word):
    """Un "mot" (séparé par des espaces) compte comme parallèle si c'est un
    token de parallèle isolé, ou une combinaison jointe par '/' dont toutes
    les parties sont des tokens de parallèle (ex. "Magenta/Purple")."""
    if is_parallel_token(word):
        return True
    if "/" in word:
        parts = [p for p in word.split("/") if p]
        return bool(parts) and all(is_parallel_token(p) for p in parts)
    return False


def _strip_trailing_parallel_tokens(label):
    tokens = label.split()
    while tokens and _word_is_parallel(tokens[-1]):
        tokens.pop()
    return " ".join(tokens) if tokens else label


def derive_set_root(label, all_labels):
    """Dérive le "set" racine d'un label de ligne d'odds.

    Algorithme (voir docs/ODDS_FILE_FORMAT.md) :
      1. Candidats = tous les autres labels qui sont un préfixe de `label` sur
         frontière de mot.
      2. Parmi eux, garder ceux dont le reste est composé uniquement de tokens
         de parallèle (le reste peut contenir des '/' : on découpe dessus
         avant de tester) → prendre le plus court.
      3. Sinon, prendre le préfixe le plus long.
      4. Sinon, retirer les tokens de parallèle en fin de chaîne.
    """
    label = str(label or "").strip()
    if not label:
        return label

    others = [str(l).strip() for l in all_labels if str(l).strip() != label]
    candidates = [o for o in others if o and _is_prefix_word_boundary(o, label)]

    parallel_only_candidates = []
    for candidate in candidates:
        rest = label[len(candidate):].strip()
        if _rest_is_parallel_only(rest):
            parallel_only_candidates.append(candidate)
    if parallel_only_candidates:
        return min(parallel_only_candidates, key=len)

    if candidates:
        return max(candidates, key=len)

    return _strip_trailing_parallel_tokens(label)


def derive_parallel(label, set_root):
    """Dérive la description de parallèle = label moins le préfixe `set_root`."""
    label = str(label or "").strip()
    set_root = str(set_root or "").strip()
    if not set_root or label == set_root:
        return ""
    if _is_prefix_word_boundary(set_root, label):
        return label[len(set_root):].strip()
    return label


# ---------------------------------------------------------------------------
# Badges de disponibilité
# ---------------------------------------------------------------------------

def classify_availability_badge(groups_present):
    """Badge de disponibilité exclusif à partir de l'ensemble des groups où le
    set/famille existe (avec au moins une odds non nulle)."""
    groups_present = {g for g in (groups_present or set()) if g}
    if not groups_present:
        return None

    if len(groups_present) == 1:
        (only_group,) = tuple(groups_present)
        if only_group == "sapphire":
            return BADGE_SAPPHIRE_ONLY
        if only_group == DELIGHT_GROUP:
            return BADGE_DELIGHT_ONLY
        if only_group == "fanatics":
            return BADGE_FANATICS_ONLY
        if only_group == "promo":
            return BADGE_PROMO_ONLY

    if groups_present <= HOBBY_NON_DELIGHT_GROUPS:
        return BADGE_HOBBY_ONLY
    if groups_present <= (HOBBY_NON_DELIGHT_GROUPS | {DELIGHT_GROUP}):
        return BADGE_HOBBY_DELIGHT
    if not (groups_present & HOBBY_NON_DELIGHT_GROUPS):
        return BADGE_RETAIL_ONLY
    return BADGE_EVERYWHERE


# ---------------------------------------------------------------------------
# Résumés par set
# ---------------------------------------------------------------------------

def _config_lookup(sheet):
    """dict[config_key] -> config dict."""
    lookup = {}
    for cfg in sheet.get("configs") or []:
        if isinstance(cfg, dict) and cfg.get("key"):
            lookup[cfg["key"]] = cfg
    return lookup


def build_set_summaries(sheet):
    """Construit, par set d'odds racine : parallèles, disponibilité par group,
    meilleures odds par group, badges, familles de parallèles exclusives.

    Retourne {"sets": {set_root: {...}}, "configs_by_key": {...}}.
    """
    if not sheet or not isinstance(sheet, dict):
        return {"sets": {}, "configs_by_key": {}}

    rows = sheet.get("rows") or []
    configs_by_key = _config_lookup(sheet)
    all_labels = [r.get("label", "") for r in rows if isinstance(r, dict)]

    # Résout (set, parallel) pour chaque ligne, en respectant les valeurs
    # explicites du fichier quand elles sont fournies.
    resolved_rows = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = str(row.get("label", "")).strip()
        if not label:
            continue
        set_root = str(row.get("set") or "").strip() or derive_set_root(label, all_labels)
        parallel = row.get("parallel")
        if parallel is None or parallel == "":
            parallel = derive_parallel(label, set_root)
        odds = row.get("odds") if isinstance(row.get("odds"), dict) else {}
        resolved_rows.append({"label": label, "set": set_root, "parallel": parallel, "odds": odds})

    sets: dict = {}
    for row in resolved_rows:
        sets.setdefault(row["set"], []).append(row)

    summaries = {}
    for set_root, set_rows in sets.items():
        groups_present = set()
        best_by_group = {}
        best_overall = None
        family_groups: dict = {}

        for row in set_rows:
            for cfg_key, value in (row["odds"] or {}).items():
                if value is None:
                    continue
                cfg = configs_by_key.get(cfg_key)
                group = cfg.get("group") if cfg else cfg_key
                group = group or cfg_key
                groups_present.add(group)

                current_best = best_by_group.get(group)
                if current_best is None or value < current_best["odds"]:
                    best_by_group[group] = {"odds": value, "config_key": cfg_key}

                if best_overall is None or value < best_overall["odds"]:
                    best_overall = {"odds": value, "config_key": cfg_key, "group": group}

                # Familles de parallèles exclusives : quels groups une famille
                # de finish (Wave, Geometric, Sapphire...) touche-t-elle ?
                for chunk in str(row["parallel"] or "").split("/"):
                    for tok in chunk.split():
                        if tok in PARALLEL_FAMILY_TOKENS:
                            family_groups.setdefault(tok, set()).add(group)

        availability_badge = classify_availability_badge(groups_present)
        rarity_badge = rarity_badge_for_odds(best_overall["odds"] if best_overall else None)

        exclusive_families = []
        for family, fam_groups in sorted(family_groups.items()):
            if len(fam_groups) == 1:
                (only_group,) = tuple(fam_groups)
                label = group_display_label(only_group)
            else:
                badge = classify_availability_badge(fam_groups)
                from .odds_config import AVAILABILITY_BADGE_LABELS_FR
                label = AVAILABILITY_BADGE_LABELS_FR.get(badge, ", ".join(sorted(fam_groups)))
            exclusive_families.append({"family": family, "groups": sorted(fam_groups), "label": label})

        badges = [b for b in (availability_badge, rarity_badge) if b]
        if best_overall:
            badges.append(f"best:{best_overall['group']}")

        summaries[set_root] = {
            "set": set_root,
            "rows": [{"label": r["label"], "parallel": r["parallel"], "odds": r["odds"]} for r in set_rows],
            "groups_present": sorted(groups_present),
            "best_by_group": best_by_group,
            "best_overall": best_overall,
            "availability_badge": availability_badge,
            "rarity_badge": rarity_badge,
            "badges": badges,
            "exclusive_parallel_families": exclusive_families,
        }

    return {"sets": summaries, "configs_by_key": configs_by_key}


# ---------------------------------------------------------------------------
# Rattachement Box Type (checklist) <-> set (odds)
# ---------------------------------------------------------------------------

NONE_MAPPING_VALUE = "__none__"


def resolve_box_types(sheet, box_types, mappings=None):
    """Rattache une liste de `Box Type` de checklist aux set roots d'une
    feuille d'odds.

    Args:
        sheet: feuille d'odds chargée (dict).
        box_types: itérable de Box Type bruts (tels qu'en checklist).
        mappings: dict {box_type_norm_ou_exact: set_root} — mapping manuel,
            prioritaire sur la résolution automatique. La valeur spéciale
            "__none__" marque un rattachement volontairement absent.

    Returns:
        (resolved: dict[str,str], unresolved: list[str]) — `resolved` mappe
        chaque Box Type d'entrée (string brute) à un set root ; les entrées
        `__none__` du mapping manuel ne sont ni résolues ni listées comme
        "unresolved" (l'utilisateur a explicitement choisi de les ignorer).
    """
    mappings = mappings or {}
    mapping_norm = {normalize_box_type_text(k): v for k, v in mappings.items()}

    summaries = build_set_summaries(sheet) if sheet else {"sets": {}}
    set_roots = list(summaries["sets"].keys())
    normalized_roots = {normalize_box_type_text(root): root for root in set_roots}

    resolved = {}
    unresolved = []
    seen = set()
    for raw in box_types or []:
        box_type = str(raw or "").strip()
        if not box_type or box_type in seen:
            continue
        seen.add(box_type)
        norm = normalize_box_type_text(box_type)

        manual = mapping_norm.get(norm)
        if manual == NONE_MAPPING_VALUE:
            continue  # ignoré volontairement : ni résolu, ni non-résolu
        if manual:
            resolved[box_type] = manual
            continue

        auto_match = normalized_roots.get(norm)
        if auto_match:
            resolved[box_type] = auto_match
            continue

        unresolved.append(box_type)

    return resolved, unresolved


# ---------------------------------------------------------------------------
# Pull rates (pondération du break)
# ---------------------------------------------------------------------------

UNMAPPED_SET_KEY = "__unmapped__"


def build_pull_rates(sheet, config_key, box_type_counts, mappings=None):
    """Calcule le pull_rate par set (par carte) pour une configuration donnée.

    Pour chaque ligne d'odds disponible dans `config_key` (odds N), set s,
    K_s = nombre de cartes de checklist rattachées à s (via `box_type_counts`
    + `mappings`) :
        - si K_s == 0 : la masse 1/N va dans la masse "hors checklist"
        - sinon : chaque carte du set s reçoit pull_rate += 1 / (N * K_s)

    Args:
        sheet: feuille d'odds chargée.
        config_key: clé de configuration (ex. "hobby", "mega_ea").
        box_type_counts: dict {Box Type brut: nombre de cartes de checklist}.
        mappings: mapping manuel Box Type -> set root (voir resolve_box_types).

    Returns:
        dict avec :
          pull_rate_by_set: {set_root: pull_rate_par_carte}
          coverage: masse rattachée / masse totale (0..1, 1.0 si aucune ligne)
          total_mass / unassigned_mass: pour diagnostic
    """
    empty_result = {
        "pull_rate_by_set": {},
        "coverage": 0.0,
        "total_mass": 0.0,
        "unassigned_mass": 0.0,
    }
    if not sheet or not config_key:
        return empty_result

    box_type_counts = box_type_counts or {}
    resolved, _unresolved = resolve_box_types(sheet, box_type_counts.keys(), mappings)

    # K_s : nombre de cartes de checklist rattachées à chaque set.
    k_by_set: dict = {}
    for box_type, set_root in resolved.items():
        k_by_set[set_root] = k_by_set.get(set_root, 0) + int(box_type_counts.get(box_type, 0) or 0)

    total_mass = 0.0
    unassigned_mass = 0.0
    pull_rate_by_set: dict = {}

    all_rows = [r for r in (sheet.get("rows") or []) if isinstance(r, dict)]
    all_labels = [r.get("label", "") for r in all_rows]

    for row in all_rows:
        odds = row.get("odds") if isinstance(row.get("odds"), dict) else {}
        n = odds.get(config_key)
        if n is None:
            continue
        try:
            n = float(n)
        except (TypeError, ValueError):
            continue
        if n <= 0:
            continue

        label = str(row.get("label", "")).strip()
        set_root = str(row.get("set") or "").strip() or derive_set_root(label, all_labels)

        mass = 1.0 / n
        total_mass += mass

        k_s = k_by_set.get(set_root, 0)
        if k_s <= 0:
            unassigned_mass += mass
            continue

        pull_rate_by_set[set_root] = pull_rate_by_set.get(set_root, 0.0) + (mass / k_s)

    coverage = 1.0 if total_mass <= 0 else max(0.0, min(1.0, (total_mass - unassigned_mass) / total_mass))

    return {
        "pull_rate_by_set": pull_rate_by_set,
        "coverage": coverage,
        "total_mass": total_mass,
        "unassigned_mass": unassigned_mass,
    }
