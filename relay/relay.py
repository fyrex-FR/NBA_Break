"""Relais NBA Stats : GET /stats/{endpoint} vers stats.nba.com, liste blanche, Bearer, 1 req/s, cache 6 h."""

import asyncio
import hmac
import logging
import os
import time

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response

ALLOWED = {"commonplayerinfo", "playercareerstats", "playerawards", "teamgamelog", "leaguestandingsv3"}
UPSTREAM = os.getenv("NBA_UPSTREAM", "https://stats.nba.com/stats")
TOKEN = os.getenv("RELAY_TOKEN", "")
TTL = 6 * 3600
MIN_INTERVAL = 1.0
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://www.nba.com",
    "Referer": "https://www.nba.com/",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
    "Connection": "keep-alive",
}


log = logging.getLogger("uvicorn.error")
if len(TOKEN) < 32:
    raise SystemExit("RELAY_TOKEN absent ou trop court (>= 32 caractères)")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
client = httpx.AsyncClient(timeout=15, headers=HEADERS)
cache: dict[str, tuple[float, int, bytes]] = {}
lock = asyncio.Lock()
last_call = 0.0


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/stats/{endpoint}")
async def stats(endpoint: str, request: Request):
    global last_call
    auth = request.headers.get("authorization", "")
    if not hmac.compare_digest(auth.encode(), f"Bearer {TOKEN}".encode()):
        raise HTTPException(401, "unauthorized")
    if endpoint not in ALLOWED:
        raise HTTPException(404, "not found")
    query = request.url.query
    key = f"{endpoint}?{query}"
    hit = cache.get(key)
    if hit and hit[0] > time.time():
        log.info("%s cache %s", endpoint, hit[1])
        return Response(hit[2], status_code=hit[1], media_type="application/json")
    async with lock:
        hit = cache.get(key)
        if hit and hit[0] > time.time():
            return Response(hit[2], status_code=hit[1], media_type="application/json")
        wait = MIN_INTERVAL - (time.monotonic() - last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        t0 = time.monotonic()
        try:
            r = await client.get(f"{UPSTREAM}/{endpoint}" + (f"?{query}" if query else ""))
        except httpx.HTTPError as e:
            last_call = time.monotonic()
            log.info("%s error %s %.1fs", endpoint, type(e).__name__, last_call - t0)
            return JSONResponse({"error": "upstream"}, status_code=504)
        last_call = time.monotonic()
        log.info("%s %s %.1fs", endpoint, r.status_code, last_call - t0)
    if r.status_code == 200:
        cache[key] = (time.time() + TTL, 200, r.content)
    return Response(r.content, status_code=r.status_code, media_type="application/json")
