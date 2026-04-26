"""
fetch_hts.py — Sync the USITC Harmonized Tariff Schedule into Supabase.

Logic:
  1. Download the full HTS dataset (JSON) from USITC's export endpoint.
  2. SHA-256 hash the raw response; compare to the hash stored in
     system_state.hts_revision_hash.
       - Hash unchanged   -> log "no change" and exit (no DB writes).
       - Hash changed     -> upsert all records into hts_codes,
                             then update system_state with the new hash.
  3. Records with empty `htsno` (hierarchy headers) are skipped — only leaf
     codes are stored.
  4. The fields section_301_rate, section_232_rate, executive_rate, and
     total_rate are LEFT NULL during Phase 2. Yale Budget Lab's logic in
     Phase 3 derives them from the `footnotes` JSONB column.

Run from the project root:
    python scripts/fetch_hts.py            # real run; writes to Supabase
    python scripts/fetch_hts.py --dry-run  # do everything except the writes

Schedule (production): daily at 6:00 AM ET via GitHub Actions.
"""

import hashlib
import json
import os
import sys
from datetime import date

import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


# ---------- HTTP session with automatic retry ----------
# urllib3's Retry handles transient connection errors (including SSL hiccups
# like SSLV3_ALERT_BAD_RECORD_MAC), 5xx responses, and 429 rate limits with
# exponential backoff. Without this, a single dropped packet kills the run.
def _build_session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=5,                       # up to 5 retries per request
        connect=5,
        read=5,
        backoff_factor=2,              # waits 0s, 2s, 4s, 8s, 16s between attempts
        status_forcelist=[500, 502, 503, 504, 429],
        allowed_methods={"GET", "HEAD", "POST"},  # POST is OK because our upserts are idempotent
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    return s


SESSION = _build_session()


# ---------- USITC ----------
HTS_EXPORT_URL = "https://hts.usitc.gov/reststop/exportList"
HTS_EXPORT_PARAMS = {
    "from": "0100",
    "to": "9999",
    "format": "JSON",
    "styles": "false",
}
HTS_FETCH_TIMEOUT = 180  # seconds — full export is multi-MB

# ---------- Supabase ----------
BATCH_SIZE = 500           # rows per upsert request
DB_TIMEOUT = 60            # seconds per Supabase request

# ---------- Sanity ----------
MIN_EXPECTED_RECORDS = 1000  # refuse to overwrite if the API returns suspiciously little


# ===================== USITC fetch =====================

def fetch_hts_dataset() -> tuple[bytes, list[dict]]:
    """Download the full HTS export. Returns (raw_bytes, parsed_list)."""
    print(f"Fetching HTS export from {HTS_EXPORT_URL} ...")
    resp = SESSION.get(
        HTS_EXPORT_URL,
        params=HTS_EXPORT_PARAMS,
        timeout=HTS_FETCH_TIMEOUT,
    )
    resp.raise_for_status()
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")

    data = resp.json()
    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON list, got {type(data).__name__}")
    print(f"  Parsed {len(data):,} records")
    return resp.content, data


# ===================== Hash & state =====================

def compute_hash(raw_bytes: bytes) -> str:
    return hashlib.sha256(raw_bytes).hexdigest()


def get_stored_hash(supabase_url: str, headers: dict) -> str | None:
    """Read hts_revision_hash from system_state. Returns None if absent."""
    url = f"{supabase_url}/rest/v1/system_state"
    params = {"key": "eq.hts_revision_hash", "select": "value"}
    resp = SESSION.get(url, headers=headers, params=params, timeout=DB_TIMEOUT)
    resp.raise_for_status()
    rows = resp.json()
    return rows[0]["value"] if rows else None


def store_hash(supabase_url: str, headers: dict, new_hash: str) -> None:
    """Upsert hts_revision_hash in system_state."""
    url = f"{supabase_url}/rest/v1/system_state"
    upsert_headers = {
        **headers,
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    payload = [{"key": "hts_revision_hash", "value": new_hash}]
    resp = SESSION.post(
        url,
        headers=upsert_headers,
        params={"on_conflict": "key"},
        data=json.dumps(payload),
        timeout=DB_TIMEOUT,
    )
    if resp.status_code >= 400:
        print(f"  ERROR storing hash: HTTP {resp.status_code} {resp.text[:300]}")
        resp.raise_for_status()


# ===================== Mapping =====================

def map_record(usitc_record: dict, revision_label: str) -> dict | None:
    """Map a USITC JSON record to a hts_codes row. Returns None to skip."""
    hts_code = (usitc_record.get("htsno") or "").strip()
    if not hts_code:
        return None  # Header/parent row — no actual code to store

    footnotes = usitc_record.get("footnotes")
    footnotes_value = footnotes if footnotes else None  # treat [] / None as NULL

    def empty_to_none(v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    return {
        "hts_code": hts_code,
        "description": (usitc_record.get("description") or "").strip(),
        "general_rate": empty_to_none(usitc_record.get("general")),
        "special_rate": empty_to_none(usitc_record.get("special")),
        "column2_rate": empty_to_none(usitc_record.get("other")),
        "footnotes": footnotes_value,
        "raw_data": usitc_record,
        "hts_revision": revision_label,
        # section_301_rate, section_232_rate, executive_rate, total_rate
        # intentionally OMITTED — they default to NULL in the table.
    }


# ===================== Upsert =====================

def upsert_batch(supabase_url: str, headers: dict, batch: list[dict]) -> None:
    url = f"{supabase_url}/rest/v1/hts_codes"
    upsert_headers = {
        **headers,
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    resp = SESSION.post(
        url,
        headers=upsert_headers,
        params={"on_conflict": "hts_code"},
        data=json.dumps(batch),
        timeout=DB_TIMEOUT,
    )
    if resp.status_code >= 400:
        print(f"  ERROR upserting batch: HTTP {resp.status_code}")
        print(f"  Body: {resp.text[:500]}")
        resp.raise_for_status()


# ===================== Main =====================

def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    if dry_run:
        print("*** DRY RUN — no writes will be made to Supabase ***")

    load_dotenv()
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")
        return 1

    base_headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    # 1. Fetch USITC data
    raw_bytes, records = fetch_hts_dataset()

    # 2. Hash + compare
    new_hash = compute_hash(raw_bytes)
    print(f"Dataset hash: {new_hash[:16]}...")

    old_hash = get_stored_hash(supabase_url, base_headers)
    if old_hash == new_hash:
        print("Hash matches stored value. No change. Exiting.")
        return 0
    if old_hash is None:
        print("No prior hash stored — first run.")
    else:
        print(f"Hash differs from stored ({old_hash[:16]}...). Will upsert.")

    # 3. Map records
    revision_label = f"fetched-{date.today().isoformat()}"
    mapped = []
    skipped = 0
    for r in records:
        m = map_record(r, revision_label)
        if m is None:
            skipped += 1
        else:
            mapped.append(m)
    print(
        f"Mapped {len(mapped):,} records "
        f"(skipped {skipped:,} hierarchy/header rows)"
    )

    # 4. Sanity check
    if len(mapped) < MIN_EXPECTED_RECORDS:
        print(
            f"REFUSING TO WRITE: only {len(mapped)} records mapped "
            f"(< {MIN_EXPECTED_RECORDS}). API may have returned bad data. "
            f"Aborting without modifying Supabase."
        )
        return 1

    # 5. Upsert
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped):,} rows in batches of {BATCH_SIZE}.")
        print("DRY RUN: would update system_state with new hash.")
        print("DRY RUN: sample mapped row:")
        print(json.dumps(mapped[0], indent=2)[:800])
        return 0

    total = len(mapped)
    for i in range(0, total, BATCH_SIZE):
        batch = mapped[i : i + BATCH_SIZE]
        upsert_batch(supabase_url, base_headers, batch)
        done = min(i + BATCH_SIZE, total)
        print(f"  Upserted {done:,} / {total:,}")

    # 6. Store new hash
    store_hash(supabase_url, base_headers, new_hash)
    print("Stored new hash in system_state.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
