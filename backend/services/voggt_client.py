"""Voggt show/break fetcher.

Server-side port of the standalone Card Scout's Voggt GraphQL access, using
httpx (already a backend dependency). No account login: it primes a public
session on the show page, then calls the Voggt GraphQL endpoint with desktop
headers and persisted-query hashes.

Fragile by nature (depends on Voggt's headers/query strings). The user-agent
and sticky-version are overridable via environment variables so they can be
refreshed without a code change:

    VOGGT_USER_AGENT
    VOGGT_STICKY_VERSION
    VOGGT_BROWSER_UA
"""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass, field

import httpx

VOGGT_GRAPHQL = "https://bits-server.production.voggt.io/graphql"

_DEFAULT_BROWSER_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)
_DEFAULT_VOGGT_UA = "Voggt Production Desktop/1.206.0 (http/2) [2447716327-0.vq1wz29pxk]"
_DEFAULT_STICKY_VERSION = "2447716327"


def _browser_ua() -> str:
    return os.getenv("VOGGT_BROWSER_UA", _DEFAULT_BROWSER_UA)


def _headers() -> dict:
    return {
        "accept": "application/graphql-response+json",
        "content-type": "application/json",
        "user-agent": _browser_ua(),
        "origin": "https://voggt.com",
        "voggt-user-agent": os.getenv("VOGGT_USER_AGENT", _DEFAULT_VOGGT_UA),
        "x-voggt-sticky-version": os.getenv("VOGGT_STICKY_VERSION", _DEFAULT_STICKY_VERSION),
    }


PRODUCT_CARD_FRAGMENT = '''fragment ProductCard on Product {
  availableQuantity
  currency
  fixedAmountV2
  originalAmount
  id
  name
  startingAmount
  status
  type
  images {
    id
    webPUrl(options: {width: 350})
    __typename
  }
  show {
    id
    isBroadcasting
    startAt
    __typename
  }
  __typename
}'''

BREAK_LIST_QUERY = '''query GetBreakList($nodeId: ID!, $first: Int!, $after: String, $filterByText: String) {
  node(id: $nodeId) {
    ... on Show {
      id
      breaks(first: $first, after: $after, filterByText: $filterByText) {
        edges {
          node {
            id
            title
            availableProductsCount
            coverWebPUrl
            description
            totalProductsCount
            __typename
          }
          __typename
        }
        pageInfo {
          hasNextPage
          endCursor
          __typename
        }
        totalCount
        __typename
      }
      __typename
    }
    __typename
  }
}'''

BREAK_DETAILS_QUERY = '''query GetBreakDetails($nodeId: ID!, $first: Int!, $after: String) {
  node(id: $nodeId) {
    ... on Break {
      id
      description
      coverWebPUrl
      title
      totalProductsCount
      availableProductsCount
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
          __typename
        }
        edges {
          node {
            id
            ...ProductCard
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    __typename
  }
}

''' + PRODUCT_CARD_FRAGMENT


# Persisted-query hashes for auction price queries (Voggt only accepts
# registered hashes, so these are sent hash-only — no query string).
HASH_SHOW_CURRENT_AUCTION = "376d944483380a0f72dfac30489f9038c14d98abca4f5fb29d897048fa938c31"
HASH_SHOW_PRODUCTS_ALL_TAB = "2b3aa99462d8c6a2cc31bbfe7673d40252004dc6212c02677bcaa2049db182a1"


class VoggtError(RuntimeError):
    """Raised when Voggt cannot be reached or returns an unexpected response."""


@dataclass
class BreakSummary:
    break_id: str
    title: str
    description: str
    available: int | None
    total: int | None
    cover_url: str | None = None


@dataclass
class BreakDetails:
    break_id: str
    title: str
    description: str
    available: int | None
    total: int | None
    spots: list[dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# URL parsing
# ---------------------------------------------------------------------------

def parse_show_id(url_or_id: str) -> str:
    """Extract a Voggt show id from a pasted URL or raw id.

    Accepts:
        https://voggt.com/fr/shows/353312
        https://voggt.com/shows/353312?foo=bar
        Show|353312
        353312
    """
    raw = str(url_or_id or "").strip()
    if not raw:
        raise VoggtError("URL Voggt vide.")
    if raw.startswith("Show|"):
        raw = raw.split("|", 1)[1]
    m = re.search(r"/shows/(\d+)", raw)
    if m:
        return m.group(1)
    m = re.search(r"(\d{3,})", raw)
    if m:
        return m.group(1)
    raise VoggtError(f"Impossible d'extraire un show id depuis: {url_or_id!r}")


# ---------------------------------------------------------------------------
# GraphQL plumbing
# ---------------------------------------------------------------------------

def _money_from_product(p: dict) -> str | None:
    cents = p.get("fixedAmountV2") or p.get("startingAmount") or p.get("originalAmount")
    if cents is None:
        return None
    return f"{cents // 100}€" if cents % 100 == 0 else f"{cents / 100:.2f}€"


def _gql(client: httpx.Client, operation: str, query: str, variables: dict, referer: str) -> dict:
    payload = {
        "operationName": operation,
        "variables": variables,
        "extensions": {
            "persistedQuery": {
                "version": 1,
                "sha256Hash": hashlib.sha256(query.encode()).hexdigest(),
            }
        },
        "query": query,
    }
    headers = {**_headers(), "referer": referer}
    try:
        r = client.post(VOGGT_GRAPHQL, headers=headers, json=payload, timeout=60)
    except httpx.HTTPError as exc:
        raise VoggtError(f"Connexion Voggt impossible: {exc}") from exc
    if r.status_code != 200:
        raise VoggtError(f"Voggt a refusé la requête (HTTP {r.status_code}). "
                         "Le serveur est peut-être bloqué par Voggt/Cloudflare.")
    data = r.json()
    if data.get("errors"):
        raise VoggtError(f"Erreur GraphQL Voggt: {data['errors']}")
    return data["data"]


def _prime(client: httpx.Client, referer: str) -> None:
    """Prime cookies / session context like a browser visit."""
    try:
        client.get(referer, headers={"user-agent": _browser_ua()}, timeout=30)
    except httpx.HTTPError:
        pass


def _gql_persisted(client: httpx.Client, operation: str, sha256: str, variables: dict, referer: str) -> dict:
    """Call a registered persisted query by hash only (no query string)."""
    payload = {
        "operationName": operation,
        "variables": variables,
        "extensions": {"persistedQuery": {"version": 1, "sha256Hash": sha256}},
    }
    headers = {**_headers(), "referer": referer}
    try:
        r = client.post(VOGGT_GRAPHQL, headers=headers, json=payload, timeout=60)
    except httpx.HTTPError as exc:
        raise VoggtError(f"Connexion Voggt impossible: {exc}") from exc
    if r.status_code != 200:
        raise VoggtError(f"Voggt a refusé la requête {operation} (HTTP {r.status_code}).")
    data = r.json()
    if data.get("errors"):
        raise VoggtError(f"Erreur GraphQL Voggt ({operation}): {data['errors']}")
    return data.get("data") or {}



# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_break_list(show_id: str) -> list[BreakSummary]:
    """Cheap listing of a show's breaks (no per-product pagination)."""
    node_id = f"Show|{show_id}"
    referer = f"https://voggt.com/fr/shows/{show_id}"
    out: list[BreakSummary] = []
    after = None
    with httpx.Client(follow_redirects=True) as client:
        _prime(client, referer)
        while True:
            d = _gql(client, "GetBreakList", BREAK_LIST_QUERY,
                     {"nodeId": node_id, "first": 30, "after": after, "filterByText": None}, referer)
            node = d.get("node") or {}
            conn = node.get("breaks")
            if not conn:
                raise VoggtError("Show introuvable ou sans breaks.")
            for edge in conn["edges"]:
                b = edge["node"]
                out.append(BreakSummary(
                    break_id=b["id"],
                    title=b.get("title") or "",
                    description=b.get("description") or "",
                    available=b.get("availableProductsCount"),
                    total=b.get("totalProductsCount"),
                    cover_url=b.get("coverWebPUrl"),
                ))
            if not conn["pageInfo"]["hasNextPage"]:
                break
            after = conn["pageInfo"]["endCursor"]
    return out


def fetch_break_spots(break_id: str, show_id: str | None = None) -> BreakDetails:
    """Full details for one break: paginate its products into spots."""
    referer = f"https://voggt.com/fr/shows/{show_id}" if show_id else "https://voggt.com/"
    spots: list[dict] = []
    title = ""
    description = ""
    available = total = None
    after = None
    with httpx.Client(follow_redirects=True) as client:
        _prime(client, referer)
        while True:
            dd = _gql(client, "GetBreakDetails", BREAK_DETAILS_QUERY,
                      {"nodeId": break_id, "first": 30, "after": after}, referer)
            node = dd.get("node") or {}
            if not node:
                raise VoggtError("Break introuvable.")
            title = node.get("title") or title
            description = node.get("description") or description
            available = node.get("availableProductsCount", available)
            total = node.get("totalProductsCount", total)
            pconn = node.get("products") or {"edges": [], "pageInfo": {"hasNextPage": False}}
            for pe in pconn["edges"]:
                p = pe["node"]
                spots.append({
                    "id": p.get("id"),
                    "name": p.get("name") or "",
                    "price": _money_from_product(p),
                    "status": p.get("status") or "UNKNOWN",
                    "type": p.get("type"),
                    "availableQuantity": p.get("availableQuantity"),
                    "image": (p.get("images") or {}).get("webPUrl") if isinstance(p.get("images"), dict) else None,
                })
            if not pconn["pageInfo"]["hasNextPage"]:
                break
            after = pconn["pageInfo"]["endCursor"]
    return BreakDetails(
        break_id=break_id, title=title, description=description,
        available=available, total=total, spots=spots,
    )


# ---------------------------------------------------------------------------
# Auction prices (final / live), via separate registered queries
# ---------------------------------------------------------------------------

def fetch_current_auction(show_id: str) -> dict | None:
    """Current/last auction of a show (live bid when IN_PROGRESS).

    Returns {product_id, name, amount_cents, status} or None.
    """
    node_id = f"Show|{show_id}"
    referer = f"https://voggt.com/fr/shows/{show_id}"
    with httpx.Client(follow_redirects=True) as client:
        _prime(client, referer)
        d = _gql_persisted(client, "GetShowCurrentAuction", HASH_SHOW_CURRENT_AUCTION,
                           {"showId": node_id}, referer)
    show = d.get("show") or {}
    ca = show.get("currentAuction")
    if not ca:
        return None
    product = ca.get("product") or {}
    return {
        "product_id": product.get("id"),
        "name": product.get("name") or "",
        "amount_cents": ca.get("amount"),
        "status": ca.get("status"),
    }


def fetch_show_products(show_id: str) -> list[dict]:
    """All products of a show (the "All" tab), with final amounts for sold ones.

    Returns a list of {name, type, amount_cents, sold}.
    Sold auctions appear as OrderedProduct with the realized hammer price.
    """
    node_id = f"Show|{show_id}"
    referer = f"https://voggt.com/fr/shows/{show_id}"
    out: list[dict] = []
    after = None
    with httpx.Client(follow_redirects=True) as client:
        _prime(client, referer)
        while True:
            d = _gql_persisted(client, "GetShowProductsAllTab", HASH_SHOW_PRODUCTS_ALL_TAB,
                               {"nodeId": node_id, "after": after, "first": 30, "filterByText": ""}, referer)
            node = d.get("node") or {}
            conn = node.get("products") or {}
            for edge in conn.get("edges", []):
                sp = (edge.get("node") or {}).get("showProduct") or {}
                tn = sp.get("__typename")
                if tn == "OrderedProduct":
                    amount = (sp.get("amountWithCurrency") or {}).get("amount")
                    out.append({
                        "name": sp.get("name") or "",
                        "type": sp.get("type"),
                        "amount_cents": amount,
                        "sold": True,
                    })
                elif tn == "Product":
                    amount = sp.get("fixedAmountV2") or sp.get("startingAmount") or sp.get("originalAmount")
                    out.append({
                        "name": sp.get("name") or "",
                        "type": sp.get("type"),
                        "amount_cents": amount,
                        "sold": str(sp.get("status")).upper() == "SOLD",
                    })
            pi = conn.get("pageInfo") or {}
            if not pi.get("hasNextPage"):
                break
            after = pi.get("endCursor")
    return out


def fetch_show_seller(show_id: str) -> str | None:
    """Extract seller username from the show page HTML (Apollo cache in __NEXT_DATA__)."""
    import json as _json
    url = f"https://voggt.com/fr/shows/{show_id}"
    try:
        with httpx.Client(follow_redirects=True) as client:
            resp = client.get(url, headers={"user-agent": _browser_ua()}, timeout=15)
        if resp.status_code != 200:
            return None
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.+?)</script>', resp.text)
        if not m:
            return None
        data = _json.loads(m.group(1))
        ip_str = data.get("props", {}).get("pageProps", {}).get("initialProps", "")
        if not ip_str:
            return None
        cache = _json.loads(ip_str)
        show = cache.get(f"Show:Show|{show_id}", {})
        seller_ref = (show.get("seller") or {}).get("__ref", "")
        if not seller_ref:
            return None
        user = cache.get(seller_ref, {})
        return user.get("username") or None
    except Exception:
        return None
