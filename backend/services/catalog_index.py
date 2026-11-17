"""Index du catalogue entier : « Qui a signé ? » et équipes toutes collections.

Pour chaque joueur et chaque équipe, le nombre de cartes qui comptent (Logoman,
case hits, auto/memo, autos, memo) dans chaque collection du sport.

L'analyse d'une saison entière côté navigateur pèse ~11 Mo et prend ~10 s : on
la fait une fois ici, en tâche de fond, et on ne garde que les compteurs. L'index
est reconstruit au plus toutes les 6 heures ; pendant sa (re)construction, les
endpoints servent l'index précédent, ou répondent « en préparation ».
"""

from __future__ import annotations

import logging
import threading
import time
import unicodedata

from .card_logic import (
    CATEGORY_AUTO,
    CATEGORY_AUTO_MEM,
    CATEGORY_CASE_HIT,
    CATEGORY_LOGOMAN,
    CATEGORY_MEM,
)

logger = logging.getLogger(__name__)

TTL_SECONDS = 6 * 3600
CATEGORY_KEYS = {
    CATEGORY_LOGOMAN: "logoman",
    CATEGORY_CASE_HIT: "case_hit",
    CATEGORY_AUTO_MEM: "auto_mem",
    CATEGORY_AUTO: "auto",
    CATEGORY_MEM: "mem",
}
COUNT_KEYS = ("logoman", "case_hit", "auto_mem", "auto", "mem")

_indexes: dict[str, dict] = {}
_building: set[str] = set()
_lock = threading.Lock()


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKD", str(text or "").lower())
    return "".join(c for c in t if not unicodedata.combining(c)).strip()


def _empty_counts() -> dict:
    return {k: 0 for k in COUNT_KEYS} | {"premium": 0, "cards": 0}


def _add(counts: dict, category: str, hits: int) -> None:
    counts["cards"] += hits
    key = CATEGORY_KEYS.get(category)
    if key:
        counts[key] += hits
        counts["premium"] += hits


def build_index(df_p, df_t, checklists: dict[str, dict]) -> dict:
    """Index à partir des frames « une ligne par joueur » / « une ligne par équipe »
    de l'analyse (colonnes Player, Team, checklist_id, Category, Hits)."""
    players: dict[str, dict] = {}
    for (player, cid, team, category), hits in (
        df_p.groupby(["Player", "checklist_id", "Team", "Category"])["Hits"].sum().items()
    ):
        name = str(player).strip()
        if not name:
            continue
        entry = players.setdefault(name, {"name": name, "teams": {}, "totals": _empty_counts(), "collections": {}})
        n = int(hits)
        entry["teams"][team] = entry["teams"].get(team, 0) + n
        _add(entry["totals"], category, n)
        _add(entry["collections"].setdefault(str(cid), _empty_counts()), category, n)

    teams: dict[str, dict] = {}
    for (team, cid, category), hits in df_t.groupby(["Team", "checklist_id", "Category"])["Hits"].sum().items():
        name = str(team).strip()
        if not name:
            continue
        entry = teams.setdefault(name, {"name": name, "totals": _empty_counts(), "collections": {}})
        n = int(hits)
        _add(entry["totals"], category, n)
        _add(entry["collections"].setdefault(str(cid), _empty_counts()), category, n)

    # Meilleurs joueurs d'une équipe dans chaque collection (cartes premium).
    premium = df_p[df_p["Category"].isin(list(CATEGORY_KEYS))]
    top: dict[tuple[str, str], list] = {}
    for (team, cid, player), hits in premium.groupby(["Team", "checklist_id", "Player"])["Hits"].sum().items():
        top.setdefault((str(team).strip(), str(cid)), []).append((int(hits), str(player).strip()))
    for (team, cid), values in top.items():
        if team in teams and cid in teams[team]["collections"]:
            values.sort(reverse=True)
            teams[team]["collections"][cid]["top_players"] = [{"name": p, "premium": h} for h, p in values[:3]]

    for entry in players.values():
        entry["team"] = max(entry["teams"].items(), key=lambda kv: kv[1])[0] if entry["teams"] else ""
        entry["search"] = normalize(entry["name"])
    return {
        "built_at": time.time(),
        "checklists": checklists,
        "players": players,
        "teams": teams,
    }


def _build_for_sport(sport_key: str) -> dict:
    from .analysis_engine import run_analysis
    from .data_pipeline import master_parquet_key_for_sport

    started = time.time()
    result = run_analysis(sport_key, [], master_parquet_key_for_sport(sport_key))
    df = result["df"]
    checklists = {}
    for cid, group in df.groupby("checklist_id"):
        row = group.iloc[0]
        checklists[str(cid)] = {
            "checklist_id": str(cid),
            "name": str(row.get("checklist_name") or row.get("Product") or cid),
            "season": str(row.get("Year") or ""),
        }
    index = build_index(result["df_p"], result["df_t"], checklists)
    logger.info("Index catalogue %s : %d joueurs, %d équipes, %d collections en %.1fs",
                sport_key, len(index["players"]), len(index["teams"]), len(checklists), time.time() - started)
    return index


def _rebuild(sport_key: str) -> None:
    try:
        index = _build_for_sport(sport_key)
        with _lock:
            _indexes[sport_key] = index
    except Exception as exc:  # pragma: no cover - dépend de R2
        logger.warning("Index catalogue %s indisponible : %s", sport_key, exc)
    finally:
        with _lock:
            _building.discard(sport_key)


def ensure_index(sport_key: str) -> dict | None:
    """Index du sport s'il est prêt (même un peu ancien) ; lance sa (re)construction
    en tâche de fond s'il manque ou a plus de 6 heures."""
    with _lock:
        index = _indexes.get(sport_key)
        stale = index is None or time.time() - index["built_at"] > TTL_SECONDS
        if stale and sport_key not in _building:
            _building.add(sport_key)
            threading.Thread(target=_rebuild, args=(sport_key,), daemon=True).start()
    return index


def set_index(sport_key: str, index: dict) -> None:
    """Injection directe (tests, outils de dev)."""
    with _lock:
        _indexes[sport_key] = index


# ── Lectures ────────────────────────────────────────────────────────────────

def _collection_rows(index: dict, collections: dict) -> list[dict]:
    rows = []
    for cid, counts in collections.items():
        meta = index["checklists"].get(cid, {"checklist_id": cid, "name": cid, "season": ""})
        rows.append({**meta, **counts})
    rows.sort(key=lambda r: (r.get("season") or "", r["premium"], r["cards"]), reverse=True)
    return rows


def search_players(index: dict, query: str, limit: int = 20) -> list[dict]:
    q = normalize(query)
    if len(q) < 2:
        return []
    words = q.split()
    hits = [p for p in index["players"].values() if all(w in p["search"] for w in words)]
    # Le nom qui commence par la recherche d'abord, puis les plus « chargés ».
    hits.sort(key=lambda p: (not p["search"].startswith(q), -p["totals"]["premium"], -p["totals"]["cards"]))
    return [
        {"name": p["name"], "team": p["team"], "totals": p["totals"], "collections": len(p["collections"])}
        for p in hits[:limit]
    ]


def player_detail(index: dict, name: str) -> dict | None:
    p = index["players"].get(name)
    if p is None:
        key = normalize(name)
        p = next((x for x in index["players"].values() if x["search"] == key), None)
    if p is None:
        return None
    return {"name": p["name"], "team": p["team"], "totals": p["totals"], "collections": _collection_rows(index, p["collections"])}


def list_teams(index: dict) -> list[dict]:
    teams = [
        {"name": t["name"], "totals": t["totals"], "collections": len(t["collections"])}
        for t in index["teams"].values()
    ]
    teams.sort(key=lambda t: (-t["totals"]["premium"], t["name"]))
    return teams


def team_detail(index: dict, name: str) -> dict | None:
    t = index["teams"].get(name)
    if t is None:
        return None
    return {"name": t["name"], "totals": t["totals"], "collections": _collection_rows(index, t["collections"])}
