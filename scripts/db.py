"""
db.py — Shared Supabase HTTP helpers for Tariff Tracker pipeline scripts.

Why this exists:
  Every fetch_*.py script needs the same plumbing — retry-enabled HTTPS
  session, env-loaded credentials, base headers, batched upsert pattern,
  system_state read/write. Centralizing it here keeps each pipeline script
  focused on its data-source logic.

Public API:
  SESSION                 — pre-configured requests.Session with retry/backoff.
                            Reusable for non-Supabase HTTP calls too (USITC,
                            Treasury, Census, etc.) — same retry behavior.
  SUPABASE_URL            — bare project URL (no trailing slash, no path).
  BASE_HEADERS            — apikey + Authorization + Content-Type.
  UPSERT_HEADERS          — BASE_HEADERS + Prefer for upsert semantics.
  get_state(key)          — read a string from system_state, or None.
  set_state(key, value)   — upsert a string into system_state.
  upsert(table, rows, on_conflict, batch_size, progress_label)
                          — bulk upsert with batching and progress logging.
  count_rows(table)       — exact row count of a table (cheap HEAD request).
"""

import json
import os
import sys

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ---------- Configuration ----------
DB_TIMEOUT = 60
DEFAULT_BATCH_SIZE = 500


# ---------- Retry-enabled session ----------
def _build_session() -> requests.Session:
    """Build a Session that retries transient errors with exponential backoff.

    urllib3's Retry handles connection drops, SSL hiccups (e.g.
    SSLV3_ALERT_BAD_RECORD_MAC), 5xx responses, and 429 rate limits.
    Without this, a single bad packet kills a long upsert run.
    """
    s = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=2,  # waits 0s, 2s, 4s, 8s, 16s between attempts
        status_forcelist=[500, 502, 503, 504, 429],
        allowed_methods={"GET", "HEAD", "POST", "PATCH"},
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSION = _build_session()


# ---------- Credentials ----------
def _load_credentials() -> tuple[str, str]:
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env",
            file=sys.stderr,
        )
        sys.exit(1)
    return url.rstrip("/"), key


SUPABASE_URL, _SUPABASE_KEY = _load_credentials()

BASE_HEADERS = {
    "apikey": _SUPABASE_KEY,
    "Authorization": f"Bearer {_SUPABASE_KEY}",
    "Content-Type": "application/json",
}

UPSERT_HEADERS = {
    **BASE_HEADERS,
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


# ---------- system_state helpers ----------
def get_state(key: str) -> str | None:
    """Read a value from system_state. Returns None if key is absent."""
    url = f"{SUPABASE_URL}/rest/v1/system_state"
    params = {"key": f"eq.{key}", "select": "value"}
    resp = SESSION.get(url, headers=BASE_HEADERS, params=params, timeout=DB_TIMEOUT)
    resp.raise_for_status()
    rows = resp.json()
    return rows[0]["value"] if rows else None


def set_state(key: str, value: str) -> None:
    """Upsert a key/value pair into system_state."""
    url = f"{SUPABASE_URL}/rest/v1/system_state"
    payload = [{"key": key, "value": value}]
    resp = SESSION.post(
        url,
        headers=UPSERT_HEADERS,
        params={"on_conflict": "key"},
        data=json.dumps(payload),
        timeout=DB_TIMEOUT,
    )
    if resp.status_code >= 400:
        print(
            f"  ERROR storing state {key!r}: HTTP {resp.status_code} {resp.text[:300]}",
            file=sys.stderr,
        )
        resp.raise_for_status()


# ---------- Generic batched upsert ----------
def upsert(
    table: str,
    rows: list[dict],
    on_conflict: str,
    batch_size: int = DEFAULT_BATCH_SIZE,
    progress_label: str | None = None,
) -> None:
    """Upsert rows into a table in batches.

    Args:
        table: Supabase table name.
        rows: List of dict rows to upsert.
        on_conflict: Column to use as the conflict key (typically the PK).
        batch_size: Rows per HTTP request.
        progress_label: If given, prints "<label>: N / TOTAL" after each batch.
    """
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i : i + batch_size]
        resp = SESSION.post(
            url,
            headers=UPSERT_HEADERS,
            params={"on_conflict": on_conflict},
            data=json.dumps(batch),
            timeout=DB_TIMEOUT,
        )
        if resp.status_code >= 400:
            print(
                f"  ERROR upserting batch into {table}: HTTP {resp.status_code}",
                file=sys.stderr,
            )
            print(f"  Body: {resp.text[:500]}", file=sys.stderr)
            resp.raise_for_status()
        if progress_label:
            done = min(i + batch_size, total)
            print(f"  {progress_label}: {done:,} / {total:,}")


# ---------- Cheap row count ----------
def count_rows(table: str) -> int:
    """Return the exact row count of a table via a HEAD request."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**BASE_HEADERS, "Prefer": "count=exact"}
    resp = SESSION.head(url, headers=headers, timeout=DB_TIMEOUT)
    resp.raise_for_status()
    content_range = resp.headers.get("Content-Range", "")
    if "/" in content_range:
        return int(content_range.split("/")[-1])
    raise ValueError(f"Could not parse Content-Range: {content_range!r}")
