import re


CATEGORY_LOGOMAN = "🔥 Logoman"
CATEGORY_CASE_HIT = "✨ Case Hit"
CATEGORY_AUTO_MEM = "💎 Auto/Mem"
CATEGORY_BASE_OTHER = "📄 Base/Autre"

CATEGORY_FILTER_OPTIONS = [
    "Tous",
    CATEGORY_LOGOMAN,
    CATEGORY_CASE_HIT,
    CATEGORY_AUTO_MEM,
    CATEGORY_BASE_OTHER,
]


def normalize_team_name(value, team_aliases):
    raw = "" if value is None else str(value).strip()
    key = re.sub(r"\s+", " ", raw.lower())
    if key in team_aliases:
        return team_aliases[key]
    return raw


def categorize_card(box_type, category_rules):
    text = str(box_type).lower()

    logoman_keywords = category_rules.get("logoman", [])
    if any(k in text for k in logoman_keywords):
        return CATEGORY_LOGOMAN

    case_hit_keywords = category_rules.get("case_hit", [])
    if any(k in text for k in case_hit_keywords):
        return CATEGORY_CASE_HIT

    auto_mem_keywords = category_rules.get("auto_mem", [])
    if any(k in text for k in auto_mem_keywords):
        return CATEGORY_AUTO_MEM

    return CATEGORY_BASE_OTHER


def calculate_score(category):
    weights = {
        CATEGORY_LOGOMAN: 1000,
        CATEGORY_CASE_HIT: 500,
        CATEGORY_AUTO_MEM: 20,
        CATEGORY_BASE_OTHER: 1,
    }
    return weights.get(category, 1)


def rarity_multiplier(numbering):
    try:
        num = int(float(numbering))
    except (ValueError, TypeError):
        return 1.0
    if num <= 0:
        return 1.0
    mult = 1.0 + (100.0 / num)
    return min(mult, 10.0)


def parse_numbering(value):
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def build_hype_map(hype_tiers):
    tier_weights = {"Tier S": 10.0, "Tier A": 5.0, "Tier B": 2.0}
    output = {}
    for tier_name, players in hype_tiers.items():
        weight = tier_weights.get(tier_name, 1.0)
        for player in players:
            output[player] = weight
    return output


def get_hype_multiplier(player_name, hype_map):
    return hype_map.get(player_name, 1.0)
