"""
NBA player stats service.
- Cherche le joueur via nba_api
- Cache les résultats dans R2 (parquet_cache/players/{id}.json)
- Retourne bio + stats carrière saison par saison
"""

import json
import logging
import re
import time
import unicodedata
from typing import Optional

from .r2_storage import get_r2_config, is_r2_configured, make_r2_client

logger = logging.getLogger(__name__)

CACHE_PREFIX = "players_cache"
CACHE_TTL_DAYS = 30

# Hall of Fame — chargé depuis HOF.json au démarrage
import os as _os
_HOF_PATH = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "HOF.json")
_HOF_NAMES: set = set()
try:
    with open(_HOF_PATH, "r", encoding="utf-8") as _f:
        _HOF_NAMES = {entry["name"].lower().strip() for entry in json.load(_f)}
except Exception:
    pass


def normalize_name(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _cache_key(player_id: int) -> str:
    return f"{CACHE_PREFIX}/{player_id}.json"


def _load_cache(config, player_id: int) -> Optional[dict]:
    if not is_r2_configured(config):
        return None
    try:
        client = make_r2_client(config)
        resp = client.get_object(Bucket=config["bucket"], Key=_cache_key(player_id))
        data = json.loads(resp["Body"].read().decode("utf-8"))
        # Vérifier TTL
        cached_at = data.get("_cached_at", 0)
        age_days = (time.time() - cached_at) / 86400
        if age_days > CACHE_TTL_DAYS:
            return None
        return data
    except Exception:
        return None


def _save_cache(config, player_id: int, data: dict):
    if not is_r2_configured(config):
        return
    try:
        client = make_r2_client(config)
        data["_cached_at"] = time.time()
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        client.put_object(
            Bucket=config["bucket"],
            Key=_cache_key(player_id),
            Body=payload,
            ContentType="application/json",
        )
    except Exception as e:
        logger.warning(f"Cache save failed: {e}")


def _find_player(name: str):
    """Cherche un joueur par nom, avec fallback sur normalisation."""
    from nba_api.stats.static import players as nba_players

    norm = normalize_name(name)

    # Tentative 1 : correspondance exacte
    results = nba_players.find_players_by_full_name(re.escape(name))
    if results:
        return results[0]

    # Tentative 2 : recherche normalisée sur tous les joueurs
    all_players = nba_players.get_players()
    for p in all_players:
        if normalize_name(p["full_name"]) == norm:
            return p

    # Tentative 3 : nom inversé "Nom, Prénom" → "Prénom Nom"
    parts = name.split(",")
    if len(parts) == 2:
        flipped = f"{parts[1].strip()} {parts[0].strip()}"
        results = nba_players.find_players_by_full_name(re.escape(flipped))
        if results:
            return results[0]

    return None


AWARD_MAP = {
    "NBA Most Valuable Player": "mvp",
    "NBA Champion": "champion",
    "NBA Finals Most Valuable Player": "finals_mvp",
    "NBA Defensive Player of the Year Award": "dpoy",
    "NBA Rookie of the Year Award": "roy",
    "NBA All-Star": "allstar",
    "All-NBA": "all_nba",
    "NBA Most Improved Player Award": "mip",
    "NBA Sixth Man of the Year Award": "sixth_man",
    "Hall of Fame": "hof",
}


def _fetch_awards(player_id: int) -> dict:
    from nba_api.stats.endpoints import playerawards
    try:
        time.sleep(0.6)
        ep = playerawards.PlayerAwards(player_id=player_id, timeout=10)
        rows = ep.get_normalized_dict().get("PlayerAwards", [])
        counts = {}
        finals_seasons = set()
        for row in rows:
            desc = row.get("DESCRIPTION", "")
            season = row.get("SEASON", "")
            # Compter les finales (champion = victoire, on trackera aussi les saisons)
            if "NBA Champion" in desc and season:
                finals_seasons.add(season)
            for keyword, key in AWARD_MAP.items():
                if keyword in desc:
                    counts[key] = counts.get(key, 0) + 1
                    break
        # Finales perdues via PlayerCareerStats playoffs + table finales statique
        counts["finals"] = len(finals_seasons) + _count_lost_finals(player_id, finals_seasons)
        return counts
    except Exception as e:
        logger.warning(f"Awards fetch failed for {player_id}: {e}")
        return {}


# Finales NBA par saison : {season_id: (winner_abbr, loser_abbr)}
# On n'a besoin que des perdants pour compléter le compte
_NBA_FINALS = {
    "1996-97": ("CHI", "UTA"), "1997-98": ("CHI", "UTA"), "1998-99": ("SAS", "NYK"),
    "1999-00": ("LAL", "IND"), "2000-01": ("LAL", "PHI"), "2001-02": ("LAL", "NJN"),
    "2002-03": ("SAS", "NJN"), "2003-04": ("DET", "LAL"), "2004-05": ("SAS", "DET"),
    "2005-06": ("MIA", "DAL"), "2006-07": ("SAS", "CLE"), "2007-08": ("BOS", "LAL"),
    "2008-09": ("LAL", "ORL"), "2009-10": ("LAL", "BOS"), "2010-11": ("DAL", "MIA"),
    "2011-12": ("MIA", "OKC"), "2012-13": ("MIA", "SAS"), "2013-14": ("SAS", "MIA"),
    "2014-15": ("GSW", "CLE"), "2015-16": ("CLE", "GSW"), "2016-17": ("GSW", "CLE"),
    "2017-18": ("GSW", "CLE"), "2018-19": ("TOR", "GSW"), "2019-20": ("LAL", "MIA"),
    "2020-21": ("MIL", "PHX"), "2021-22": ("GSW", "BOS"), "2022-23": ("DEN", "MIA"),
    "2023-24": ("BOS", "DAL"), "2024-25": ("OKC", "IND"),
}


def _count_lost_finals(player_id: int, won_seasons: set) -> int:
    """Compte les finales perdues en croisant la carrière avec _NBA_FINALS."""
    try:
        from nba_api.stats.endpoints import playercareerstats
        time.sleep(0.6)
        ep = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=10)
        playoff_data = ep.get_normalized_dict().get("SeasonTotalsPostSeason", [])
        lost = 0
        for row in playoff_data:
            season = row.get("SEASON_ID", "")
            team = row.get("TEAM_ABBREVIATION", "")
            if season in won_seasons:
                continue  # déjà compté comme victoire
            finals = _NBA_FINALS.get(season)
            if finals and team in finals:
                lost += 1
        return lost
    except Exception as e:
        logger.warning(f"Lost finals count failed for {player_id}: {e}")
        return 0


def _fetch_from_nba(player_id: int, player_info: dict) -> dict:
    """Appelle nba_api et retourne les données structurées."""
    from nba_api.stats.endpoints import playercareerstats, commonplayerinfo

    # Bio
    info_ep = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=10)
    info_data = info_ep.get_normalized_dict()
    bio = info_data.get("CommonPlayerInfo", [{}])[0]

    # Stats carrière
    time.sleep(0.6)  # politesse NBA.com
    career_ep = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=10)
    career_data = career_ep.get_normalized_dict()
    seasons_raw = career_data.get("SeasonTotalsRegularSeason", [])

    seasons = []
    for s in seasons_raw:
        gp = s.get("GP") or 1
        seasons.append({
            "season": s.get("SEASON_ID", ""),
            "team": s.get("TEAM_ABBREVIATION", ""),
            "gp": gp,
            "pts": round((s.get("PTS") or 0) / gp, 1),
            "reb": round((s.get("REB") or 0) / gp, 1),
            "ast": round((s.get("AST") or 0) / gp, 1),
            "stl": round((s.get("STL") or 0) / gp, 1),
            "blk": round((s.get("BLK") or 0) / gp, 1),
            "fg_pct": round((s.get("FG_PCT") or 0) * 100, 1),
            "fg3_pct": round((s.get("FG3_PCT") or 0) * 100, 1),
        })

    # Awards
    awards = _fetch_awards(player_id)
    # Hall of Fame depuis fichier statique
    full_name = player_info.get("full_name", "")
    if normalize_name(full_name) in _HOF_NAMES:
        awards["hof"] = 1

    draft_year = bio.get("DRAFT_YEAR", "")
    draft_round = bio.get("DRAFT_ROUND", "")
    draft_number = bio.get("DRAFT_NUMBER", "")

    if draft_year and draft_year != "Undrafted":
        draft_label = f"{draft_year} — Tour {draft_round}, Pick #{draft_number}"
    elif draft_year == "Undrafted":
        draft_label = "Undrafted"
    else:
        draft_label = None

    return {
        "player_id": player_id,
        "full_name": player_info["full_name"],
        "is_active": player_info.get("is_active", False),
        "photo_url": f"https://cdn.nba.com/headshots/nba/latest/1040x760/{player_id}.png",
        "position": bio.get("POSITION", ""),
        "height": bio.get("HEIGHT", ""),
        "weight": bio.get("WEIGHT", ""),
        "country": bio.get("COUNTRY", ""),
        "team": bio.get("TEAM_NAME", ""),
        "jersey": bio.get("JERSEY", ""),
        "draft": draft_label,
        "awards": awards,
        "seasons": seasons,
    }


def get_player_stats(name: str) -> dict:
    """Point d'entrée principal : cache → nba_api → cache."""
    player_info = _find_player(name)
    if not player_info:
        raise ValueError(f"Joueur '{name}' introuvable dans la base NBA")

    player_id = player_info["id"]
    config = get_r2_config()

    # Essayer le cache d'abord
    cached = _load_cache(config, player_id)
    if cached:
        return cached

    # Appel NBA.com
    data = _fetch_from_nba(player_id, player_info)

    # Sauvegarder en cache
    _save_cache(config, player_id, data)

    return data
