"""
Vocabulaires et constantes pour la fonctionnalité "odds Topps".

Tout ici est volontairement extensible : ce sont des `set`/`list`/`dict` simples
qu'on peut enrichir sans toucher au reste du code quand un nouveau produit Topps
apporte de nouveaux tokens de parallèle ou de nouvelles colonnes de configuration.

Piège de nommage (voir aussi backend/services/box_prices.py) : ici, "Box Type"
(avec majuscules, entre guillemets) désigne la colonne de checklist qui nomme un
set/sous-set de carte (ex. "Base", "Clutch City", "Topps Chrome Autographs").
Le `box_type` en minuscules ailleurs dans le repo (box_prices.py) désigne au
contraire une configuration de boîte (hobby/mega/etc.) — ce n'est PAS la même
notion. Dans ce module et dans odds_engine.py, "config" / "config_key" décrit
toujours une colonne d'odds (Hobby, Delight, Value Box EA...), jamais un Box Type
de checklist.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Tokens de parallèle
# ---------------------------------------------------------------------------
# Un token de parallèle est un mot qui, seul ou en combinaison, décrit une
# variante de parallèle (finish, couleur...) plutôt qu'un nouveau set. Utilisé
# par `derive_set_root` pour décider si le "reste" d'un label après un préfixe
# candidat est bien une simple déclinaison de parallèle.

PARALLEL_TOKENS = {
    # Finishes / familles de parallèle
    "Refractors", "Refractor", "Superfractors", "Frozenfractors", "X-Fractors",
    "Sapphire", "Geometric", "Wave", "RayWave", "Speckle", "Prism", "Negative",
    "Skylight", "Basketball", "Padpardascha", "Denim", "Tears", "Lava", "Lamp",
    "Selections", "Infinite", "Mirror", "Ice",
    # Couleurs
    "Magenta", "Teal", "Yellow", "Aqua", "Blue", "Green", "Purple", "Gold",
    "Orange", "Black", "Red", "White", "Silver", "Bronze", "Pink",
    # Mot de liaison ("Red White and Blue")
    "and",
}


def is_parallel_token(token: str) -> bool:
    """Case-insensitive membership test against PARALLEL_TOKENS."""
    if not token:
        return False
    lowered = token.strip().lower()
    if not lowered:
        return False
    return any(lowered == t.lower() for t in PARALLEL_TOKENS)


# Couleurs pures (sous-ensemble de PARALLEL_TOKENS) — utilisées pour isoler les
# tokens de "famille de finish" (Wave, Geometric, Sapphire...) des simples
# déclinaisons de couleur quand on calcule les familles de parallèles exclusives.
COLOR_TOKENS = {
    "Magenta", "Teal", "Yellow", "Aqua", "Blue", "Green", "Purple", "Gold",
    "Orange", "Black", "Red", "White", "Silver", "Bronze", "Pink",
}

# Tokens de "finish" trop génériques pour être une famille intéressante à
# signaler comme exclusive (présents dans presque tous les sets) — exclus du
# calcul des familles de parallèles exclusives.
_GENERIC_FINISH_TOKENS = {"Refractors", "Refractor", "Superfractors", "Frozenfractors", "and"}

# Tokens de famille "notables" (Wave, Geometric, Sapphire, X-Fractors, RayWave...)
# à utiliser pour le croisement famille × disponibilité.
PARALLEL_FAMILY_TOKENS = {
    t for t in PARALLEL_TOKENS
    if t not in COLOR_TOKENS and t not in _GENERIC_FINISH_TOKENS
}

# Libellés FR "amicaux" pour un group isolé (cas où une famille de parallèle
# n'existe que dans un seul group).
GROUP_DISPLAY_LABELS_FR = {
    "hobby": "Hobby",
    "jumbo": "Jumbo",
    "delight": "Delight",
    "sapphire": "Sapphire",
    "value": "Value",
    "mega": "Mega",
    "fanatics": "Fanatics",
    "promo": "Promo",
    "blaster": "Blaster",
    "hanger": "Hanger",
    "retail": "Retail",
}


def group_display_label(group: str) -> str:
    return GROUP_DISPLAY_LABELS_FR.get(group, (group or "").replace("_", " ").title() or group)


# ---------------------------------------------------------------------------
# Vocabulaire des noms de configuration (en-tête PDF)
# ---------------------------------------------------------------------------
# Ordre = priorité de matching glouton. Les entrées à plusieurs mots doivent
# apparaître AVANT les entrées plus courtes qui pourraient matcher un préfixe
# (ex. "Value Box EA" avant tout token isolé "Value").
# Trié par nombre de mots décroissant pour que le matching glouton "le plus
# long d'abord" fonctionne sans dépendre de l'ordre de déclaration.

CONFIG_NAME_VOCAB = [
    "Value Box EA",
    "Value Box SE",
    "Value Box CEE",
    "Mega Box EA",
    "Mega Box SE",
    "Mega Box CEE",
    "Fanatics Box ASCC",
    "Promo Pks",
    "Hobby",
    "Jumbo",
    "Delight",
    "Sapphire",
    "Blaster",
    "Hanger",
    "Retail",
]


def config_name_vocab_sorted():
    """CONFIG_NAME_VOCAB trié par nombre de mots décroissant (matching glouton)."""
    return sorted(CONFIG_NAME_VOCAB, key=lambda name: -len(name.split()))


# ---------------------------------------------------------------------------
# Channel / group par défaut, dérivés d'un libellé de configuration
# ---------------------------------------------------------------------------
# channel ∈ {"hobby", "retail", "special"} ; group replie les variantes
# régionales (EA/SE/CEE) en une seule colonne dans l'UI.

_CHANNEL_HOBBY = "hobby"
_CHANNEL_RETAIL = "retail"
_CHANNEL_SPECIAL = "special"

# Groups dont le channel est "hobby" mais qui ne sont PAS Delight — sert au
# calcul des badges de disponibilité (hobby_only vs hobby_delight).
HOBBY_NON_DELIGHT_GROUPS = {"hobby", "jumbo"}
DELIGHT_GROUP = "delight"

# Groups "singleton" qui, quand ils sont seuls, donnent un badge dédié
# (sapphire_only, delight_only, fanatics_only, promo_only).
SINGLETON_BADGE_GROUPS = {"sapphire", "delight", "fanatics", "promo"}


def default_channel_and_group(config_label: str):
    """Déduit (channel, group) depuis un libellé de configuration Topps.

    Args:
        config_label: libellé tel qu'extrait de l'en-tête PDF (ex. "Value Box EA").

    Returns:
        (channel, group) — channel ∈ {"hobby","retail","special"}, group est un
        slug court en snake_case.
    """
    label = (config_label or "").strip()
    lower = label.lower()

    if lower == "hobby":
        return _CHANNEL_HOBBY, "hobby"
    if lower == "jumbo":
        return _CHANNEL_HOBBY, "jumbo"
    if lower == "delight":
        return _CHANNEL_HOBBY, "delight"
    if lower == "sapphire":
        return _CHANNEL_SPECIAL, "sapphire"
    if lower.startswith("fanatics"):
        return _CHANNEL_SPECIAL, "fanatics"
    if lower.startswith("promo"):
        return _CHANNEL_SPECIAL, "promo"
    if lower.startswith("value"):
        return _CHANNEL_RETAIL, "value"
    if lower.startswith("mega"):
        return _CHANNEL_RETAIL, "mega"
    if lower.startswith("blaster"):
        return _CHANNEL_RETAIL, "blaster"
    if lower.startswith("hanger"):
        return _CHANNEL_RETAIL, "hanger"
    if lower.startswith("retail"):
        return _CHANNEL_RETAIL, "retail"

    # Inconnu : on retombe sur "special" avec un group dérivé du libellé pour
    # rester extensible sans planter.
    slug = "_".join(lower.split()) or "unknown"
    return _CHANNEL_SPECIAL, slug


def config_key_from_label(label: str) -> str:
    """Slug snake_case pour servir de clé de config par défaut (ex. "Value Box EA" -> "value_box_ea")."""
    lower = (label or "").strip().lower()
    slug = []
    prev_underscore = False
    for ch in lower:
        if ch.isalnum():
            slug.append(ch)
            prev_underscore = False
        elif not prev_underscore:
            slug.append("_")
            prev_underscore = True
    key = "".join(slug).strip("_")
    return key or "config"


# ---------------------------------------------------------------------------
# Badges — codes + libellés FR
# ---------------------------------------------------------------------------

BADGE_HOBBY_ONLY = "hobby_only"
BADGE_HOBBY_DELIGHT = "hobby_delight"
BADGE_RETAIL_ONLY = "retail_only"
BADGE_SAPPHIRE_ONLY = "sapphire_only"
BADGE_DELIGHT_ONLY = "delight_only"
BADGE_FANATICS_ONLY = "fanatics_only"
BADGE_PROMO_ONLY = "promo_only"
BADGE_EVERYWHERE = "partout"

AVAILABILITY_BADGE_LABELS_FR = {
    BADGE_HOBBY_ONLY: "Hobby uniquement",
    BADGE_HOBBY_DELIGHT: "Hobby / Delight",
    BADGE_RETAIL_ONLY: "Retail uniquement",
    BADGE_SAPPHIRE_ONLY: "Sapphire uniquement",
    BADGE_DELIGHT_ONLY: "Delight uniquement",
    BADGE_FANATICS_ONLY: "Fanatics uniquement",
    BADGE_PROMO_ONLY: "Promo uniquement",
    BADGE_EVERYWHERE: "Partout",
}

# Rareté — seuils sur les MEILLEURES odds toutes configs confondues (1:N, N >= seuil)
RARITY_SP_THRESHOLD = 200
RARITY_SSP_THRESHOLD = 1000
RARITY_CASE_HIT_THRESHOLD = 20000

BADGE_RARITY_SP = "sp"
BADGE_RARITY_SSP = "ssp"
BADGE_RARITY_CASE_HIT = "case_hit"

RARITY_BADGE_LABELS_FR = {
    BADGE_RARITY_SP: "SP (1:200+)",
    BADGE_RARITY_SSP: "SSP (1:1000+)",
    BADGE_RARITY_CASE_HIT: "Case Hit (1:20000+)",
}


def rarity_badge_for_odds(best_odds):
    """Retourne le code de rareté (ou None) pour les meilleures odds 1:N données."""
    if best_odds is None:
        return None
    try:
        n = float(best_odds)
    except (TypeError, ValueError):
        return None
    if n >= RARITY_CASE_HIT_THRESHOLD:
        return BADGE_RARITY_CASE_HIT
    if n >= RARITY_SSP_THRESHOLD:
        return BADGE_RARITY_SSP
    if n >= RARITY_SP_THRESHOLD:
        return BADGE_RARITY_SP
    return None
