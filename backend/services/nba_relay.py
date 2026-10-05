"""Route les appels nba_api via un relais HTTP résidentiel (stats.nba.com bloque les IP cloud)."""

import os

from nba_api.stats.library.http import NBAStatsHTTP

_ORIGINAL_BASE_URL = NBAStatsHTTP.base_url
_ORIGINAL_HEADERS = dict(NBAStatsHTTP.headers)


def configure_nba_relay() -> bool:
    url = os.getenv("NBA_STATS_RELAY_URL", "").strip()
    token = os.getenv("NBA_STATS_RELAY_TOKEN", "").strip()
    if not (url and token):
        NBAStatsHTTP.base_url = _ORIGINAL_BASE_URL
        NBAStatsHTTP.headers = dict(_ORIGINAL_HEADERS)
        return False
    # Host doit rester celui du relais (tunnel Cloudflare), pas stats.nba.com.
    headers = {k: v for k, v in _ORIGINAL_HEADERS.items() if k.lower() != "host"}
    # Cloudflare répond en brotli si on l'accepte ; requests ne sait pas le décoder sans paquet dédié.
    headers["Accept-Encoding"] = "gzip, deflate"
    headers["Authorization"] = f"Bearer {token}"
    NBAStatsHTTP.base_url = url
    NBAStatsHTTP.headers = headers
    return True
