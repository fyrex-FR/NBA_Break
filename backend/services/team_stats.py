"""
NBA team stats service.
- Classement conférence + bilan
- 5 derniers matchs
- Cache R2 (TTL 6h — données changeantes)
"""

import json
import logging
import re
import time
import unicodedata
from typing import Optional

from .r2_storage import get_r2_config, is_r2_configured, make_r2_client

logger = logging.getLogger(__name__)

CACHE_PREFIX = "teams_cache"
CACHE_TTL_HOURS = 6


def current_nba_season() -> str:
    """Retourne la saison NBA en cours (ex: '2024-25').
    La saison NBA commence en octobre — avant octobre on est encore sur la saison précédente.
    """
    from datetime import date
    today = date.today()
    year = today.year if today.month >= 10 else today.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def normalize_name(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _cache_key(team_id: int) -> str:
    return f"{CACHE_PREFIX}/{team_id}.json"


def _load_cache(config, team_id: int) -> Optional[dict]:
    if not is_r2_configured(config):
        return None
    try:
        client = make_r2_client(config)
        resp = client.get_object(Bucket=config["bucket"], Key=_cache_key(team_id))
        data = json.loads(resp["Body"].read().decode("utf-8"))
        age_hours = (time.time() - data.get("_cached_at", 0)) / 3600
        if age_hours > CACHE_TTL_HOURS:
            return None
        return data
    except Exception:
        return None


def _save_cache(config, team_id: int, data: dict):
    if not is_r2_configured(config):
        return
    try:
        client = make_r2_client(config)
        data["_cached_at"] = time.time()
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        client.put_object(
            Bucket=config["bucket"],
            Key=_cache_key(team_id),
            Body=payload,
            ContentType="application/json",
        )
    except Exception as e:
        logger.warning(f"Team cache save failed: {e}")


def _find_team(name: str):
    from nba_api.stats.static import teams as nba_teams

    norm = normalize_name(name)
    all_teams = nba_teams.get_teams()

    # Correspondance sur full_name, nickname ou city
    for t in all_teams:
        if normalize_name(t["full_name"]) == norm:
            return t
        if normalize_name(t["nickname"]) == norm:
            return t

    # Recherche partielle
    for t in all_teams:
        if norm in normalize_name(t["full_name"]):
            return t

    return None


def _fetch_from_nba(team_id: int, team_info: dict) -> dict:
    from nba_api.stats.endpoints import teamgamelog, leaguestandingsv3

    season = current_nba_season()

    # Classement
    standings_ep = leaguestandingsv3.LeagueStandingsV3(season=season, timeout=10)
    standings_data = standings_ep.get_normalized_dict()
    standing = next(
        (t for t in standings_data["Standings"] if t["TeamID"] == team_id),
        None,
    )

    time.sleep(0.6)

    # 5 derniers matchs
    log_ep = teamgamelog.TeamGameLog(team_id=team_id, season=season, timeout=10)
    log_data = log_ep.get_normalized_dict()
    games_raw = log_data.get("TeamGameLog", [])[:5]

    games = []
    for g in games_raw:
        games.append({
            "date": g.get("GAME_DATE", ""),
            "matchup": g.get("MATCHUP", ""),
            "wl": g.get("WL", ""),
            "pts": g.get("PTS"),
            "reb": g.get("REB"),
            "ast": g.get("AST"),
        })

    result = {
        "team_id": team_id,
        "full_name": team_info["full_name"],
        "abbreviation": team_info["abbreviation"],
        "logo_url": f"https://cdn.nba.com/logos/nba/{team_id}/global/L/logo.svg",
        "season": season,
        "last_games": games,
    }

    if standing:
        conf = standing.get("Conference", "")
        rank = standing.get("PlayoffRank", "")
        result["standing"] = {
            "conference": conf,
            "rank": rank,
            "wins": standing.get("WINS"),
            "losses": standing.get("LOSSES"),
            "win_pct": round((standing.get("WinPCT") or 0) * 100, 1),
            "streak": standing.get("strCurrentStreak", ""),
            "last_10": standing.get("L10", ""),
            "label": f"{rank}e {conf}",
        }
    else:
        result["standing"] = None

    return result


def get_team_stats(name: str) -> dict:
    team_info = _find_team(name)
    if not team_info:
        raise ValueError(f"Équipe '{name}' introuvable dans la base NBA")

    team_id = team_info["id"]
    config = get_r2_config()

    cached = _load_cache(config, team_id)
    if cached:
        return cached

    data = _fetch_from_nba(team_id, team_info)
    _save_cache(config, team_id, data)
    return data
