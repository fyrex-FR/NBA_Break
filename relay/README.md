# Relais NBA Stats

Petit relais HTTP à lancer sur une connexion résidentielle (stats.nba.com bloque les IP cloud).

    backend prod --HTTPS+Bearer--> Cloudflare Tunnel --> relais (127.0.0.1:8787) --> stats.nba.com

Sécurité : GET uniquement, 5 endpoints en liste blanche (`commonplayerinfo`, `playercareerstats`, `playerawards`, `teamgamelog`, `leaguestandingsv3`), Bearer comparé à temps constant, 1 req/s vers la NBA, cache 6 h.

## Installation (Linux/macOS)

    mkdir -p ~/nba-relay && cp relay.py requirements.txt ~/nba-relay && cd ~/nba-relay
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    umask 077 && echo "RELAY_TOKEN=$(python3 -c 'import secrets;print(secrets.token_hex(32))')" > .env
    set -a && . ./.env && set +a && .venv/bin/uvicorn relay:app --host 127.0.0.1 --port 8787

Service systemd (utilisateur) : voir `nba-relay.service`. Logs : `journalctl --user -u nba-relay -f`. Redémarrage : `systemctl --user restart nba-relay`.

## Backend

Variables d'environnement du backend (voir `render.yaml`) :

- `NBA_STATS_RELAY_URL=https://nba-relay.cardvaults.app/stats/{endpoint}`
- `NBA_STATS_RELAY_TOKEN=<valeur de RELAY_TOKEN>`

Sans l'une des deux, le backend appelle stats.nba.com directement. Si le relais tombe, les replis de `player_stats` / `team_stats` prennent le relais.
