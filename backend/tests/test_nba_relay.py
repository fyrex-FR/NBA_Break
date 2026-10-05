from nba_api.stats.library.http import NBAStatsHTTP

from backend.services.nba_relay import configure_nba_relay

URL = "https://nba-relay.example.test/stats/{endpoint}"


def test_relay_configured(monkeypatch):
    monkeypatch.setenv("NBA_STATS_RELAY_URL", URL)
    monkeypatch.setenv("NBA_STATS_RELAY_TOKEN", "tok")
    assert configure_nba_relay() is True
    assert configure_nba_relay() is True  # idempotent
    assert NBAStatsHTTP.base_url == URL
    assert NBAStatsHTTP.headers["Authorization"] == "Bearer tok"
    assert NBAStatsHTTP.headers["Accept-Encoding"] == "gzip, deflate"
    assert "Host" not in NBAStatsHTTP.headers
    assert "User-Agent" in NBAStatsHTTP.headers
    assert NBAStatsHTTP().base_url.format(endpoint="commonplayerinfo").endswith("/stats/commonplayerinfo")


def test_relay_not_configured(monkeypatch):
    monkeypatch.setenv("NBA_STATS_RELAY_URL", URL)
    monkeypatch.setenv("NBA_STATS_RELAY_TOKEN", "tok")
    configure_nba_relay()
    monkeypatch.delenv("NBA_STATS_RELAY_TOKEN")
    assert configure_nba_relay() is False
    assert NBAStatsHTTP.base_url == "https://stats.nba.com/stats/{endpoint}"
    assert "Authorization" not in NBAStatsHTTP.headers
