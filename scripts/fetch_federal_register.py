"""
fetch_federal_register.py — Sync tariff-related Federal Register documents
into `federal_register_alerts`.

Logic:
  1. Decide start_date:
       - normal run -> from (system_state.fr_last_publication_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE (2025-01-01) to today
       - --backfill -> from HISTORICAL_BASELINE (ignore stored state)
  2. For each tariff keyword in KEYWORDS, paginate the Federal Register search
     API for documents published since start_date.
  3. Track which keyword(s) matched each document. A document that appears in
     multiple keyword searches gets all matched keywords stored in the
     keywords_matched array.
  4. Map and upsert all unique documents to federal_register_alerts.
  5. Update system_state.fr_last_publication_date to the newest publication
     date seen this run.

Run from project root:
    python -m scripts.fetch_federal_register            # incremental
    python -m scripts.fetch_federal_register --dry-run  # do everything except writes
    python -m scripts.fetch_federal_register --backfill # ignore stored state

Schedule (production): weekdays at 7:00 AM ET via GitHub Actions.

Note on noise: the Federal Register full-text search is broad. Many "tariff"
matches are unrelated (e.g. FERC oil pipeline tariffs). We accept the noise
and store all matches with `is_active_tariff = NULL` (unreviewed). UI/admin
reviews and flips the flag for genuine tariff documents.
"""

import json
import sys
from datetime import date, timedelta

from scripts.db import SESSION, get_state, set_state, upsert


FR_URL = "https://www.federalregister.gov/api/v1/documents.json"
HISTORICAL_BASELINE = date(2025, 1, 1)
PAGE_SIZE = 100  # API max per_page is 1000 but 100 is reasonable
FR_FETCH_TIMEOUT = 60
STATE_KEY = "fr_last_publication_date"

# Keywords matching the blueprint. Each search is independent; a doc that
# matches multiple keywords gets all of them recorded in keywords_matched.
KEYWORDS = [
    "tariff",
    "duty",
    "Section 301",
    "Section 232",
    "Harmonized Tariff Schedule",
    "antidumping",
    "countervailing duty",
    "safeguard",
]


# ===================== Fetch =====================

def fetch_keyword_page(keyword: str, gte_date: str, page: int) -> dict:
    params = {
        "conditions[term]": keyword,
        "conditions[publication_date][gte]": gte_date,
        "per_page": PAGE_SIZE,
        "page": page,
        "order": "newest",
    }
    resp = SESSION.get(FR_URL, params=params, timeout=FR_FETCH_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_all_for_keyword(keyword: str, gte_date: str) -> list[dict]:
    """Fetch every page of results for one keyword."""
    out: list[dict] = []
    page = 1
    while True:
        data = fetch_keyword_page(keyword, gte_date, page)
        results = data.get("results") or []
        out.extend(results)
        total_pages = data.get("total_pages") or 1
        if page >= total_pages:
            break
        page += 1
    return out


def fetch_effective_dates(start_date: date) -> dict[str, str]:
    """Decoupled second pass: fetch ONLY document_number + effective_on for the
    same keyword set, and return a {document_number: effective_on} map.

    This is deliberately separate from collect_documents() so the main fetch's
    `raw_data` (and every column the existing pages read) is never altered by
    adding `fields[]`. A failure here can only leave effective_on NULL — it can
    never degrade the Dashboard FR card, Incoming Tariffs, AD/CVD, or Search.
    `effective_on` is null for procedural notices (investigations, sunset
    reviews, hearings), which is exactly what we want — those auto-exclude from
    the calendar.
    """
    eff: dict[str, str] = {}
    gte = start_date.isoformat()
    for kw in KEYWORDS:
        page = 1
        while True:
            params = {
                "conditions[term]": kw,
                "conditions[publication_date][gte]": gte,
                "per_page": PAGE_SIZE,
                "page": page,
                "order": "newest",
                # requests serializes a list value as repeated params:
                # fields[]=document_number&fields[]=effective_on
                "fields[]": ["document_number", "effective_on"],
            }
            resp = SESSION.get(FR_URL, params=params, timeout=FR_FETCH_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            for r in data.get("results") or []:
                num = r.get("document_number")
                eff_on = r.get("effective_on")
                if num and eff_on:
                    eff[num] = eff_on
            total_pages = data.get("total_pages") or 1
            if page >= total_pages:
                break
            page += 1
    return eff


# ===================== Merge & map =====================

def collect_documents(start_date: date) -> dict[str, dict]:
    """Run all keyword searches, dedup by document_number, merge keywords."""
    by_doc: dict[str, dict] = {}
    for kw in KEYWORDS:
        print(f"  Keyword {kw!r} ...")
        results = fetch_all_for_keyword(kw, start_date.isoformat())
        print(f"    {len(results)} matches")
        for r in results:
            num = r.get("document_number")
            if not num:
                continue
            if num not in by_doc:
                by_doc[num] = {
                    "doc": r,
                    "keywords": set(),
                }
            by_doc[num]["keywords"].add(kw)
    return by_doc


def map_record(num: str, entry: dict, eff_dates: dict[str, str]) -> dict:
    r = entry["doc"]
    keywords_matched = sorted(entry["keywords"])
    return {
        "document_number": num,
        "title": r.get("title"),
        "publication_date": r.get("publication_date"),
        "document_type": r.get("type"),
        "abstract": r.get("abstract"),
        "html_url": r.get("html_url"),
        "keywords_matched": keywords_matched,
        # effective_on comes from the decoupled second pass — NOT from r, so
        # raw_data stays byte-identical to the pre-calendar pipeline.
        "effective_on": eff_dates.get(num),
        "raw_data": r,
        # is_active_tariff intentionally not set — defaults to NULL (unreviewed).
    }


# ===================== Main =====================

def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    backfill = "--backfill" in argv
    if dry_run:
        print("*** DRY RUN — no writes will be made ***")

    today = date.today()

    # 1. Determine start date
    if backfill:
        start_date = HISTORICAL_BASELINE
        print(f"Backfill mode: starting from {start_date}.")
    else:
        last = get_state(STATE_KEY)
        if last:
            # Re-fetch from last seen date (not last+1) to catch revisions.
            # Idempotent thanks to upsert.
            start_date = date.fromisoformat(last)
            print(f"Last seen publication_date: {last}. Starting from {start_date}.")
        else:
            start_date = HISTORICAL_BASELINE
            print(f"No prior state. Starting from baseline {start_date}.")

    if start_date > today:
        print(f"Start {start_date} is in the future. Nothing to do.")
        return 0

    # 2. Fetch all keyword searches, dedup
    print(f"Fetching Federal Register documents (publication_date >= {start_date}) ...")
    by_doc = collect_documents(start_date)
    print(f"Total unique documents across all keywords: {len(by_doc)}")

    if not by_doc:
        print("No documents found. Nothing to write.")
        return 0

    # 2b. Decoupled second pass: effective dates only. Kept separate so the
    # main fetch's raw_data is never altered (see fetch_effective_dates).
    print("Fetching effective dates (decoupled pass) ...")
    eff_dates = fetch_effective_dates(start_date)
    print(f"  effective_on present for {len(eff_dates)} of {len(by_doc)} documents.")

    # 3. Map
    mapped = [map_record(num, entry, eff_dates) for num, entry in by_doc.items()]
    max_pub_date = max(
        (m["publication_date"] for m in mapped if m["publication_date"]),
        default=None,
    )

    # 4. Upsert
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped)} rows.")
        if max_pub_date:
            print(f"DRY RUN: would update {STATE_KEY} to {max_pub_date}.")
        # Show a sample mapped row (truncated)
        sample = mapped[0].copy()
        if sample.get("raw_data"):
            sample["raw_data"] = "{...truncated for dry-run...}"
        print("DRY RUN: sample mapped row:")
        print(json.dumps(sample, indent=2, default=str))
        return 0

    upsert(
        "federal_register_alerts",
        mapped,
        on_conflict="document_number",
        progress_label="Upserted",
    )

    if max_pub_date:
        set_state(STATE_KEY, max_pub_date)
        print(f"Stored {STATE_KEY} = {max_pub_date}.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
