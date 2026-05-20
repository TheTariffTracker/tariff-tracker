"""
fetch_mts_receipts.py — Sync the full federal-receipts breakdown from MTS
Table 4 into the `federal_receipts` table. Distinct from `fetch_mts.py`,
which filters Table 4 down to the single "Customs Duties" line.

Source: MTS Table 4. Each monthly record_date returns ~57 rows covering
all federal receipts categories (Individual Income Tax, Corporation, Social
Insurance subtotals, Excise, Estate & Gift, Customs Duties, Misc., plus
parent rollups and totals). We store everything; the frontend filters.

Logic:
  1. Decide date range:
       - normal     -> from (system_state.mts_receipts_last_record_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE (2025-01-01) to today
       - --backfill -> from HISTORICAL_BASELINE to today (ignore stored state)
  2. Page through MTS Table 4 for the date range.
  3. Map every record to a federal_receipts row.
  4. Upsert on composite PK (record_date, classification_id).
  5. Update system_state.mts_receipts_last_record_date.

Run from project root:
    python -m scripts.fetch_mts_receipts            # incremental
    python -m scripts.fetch_mts_receipts --dry-run  # do everything except writes
    python -m scripts.fetch_mts_receipts --backfill # force from HISTORICAL_BASELINE

Schedule (production): 1st and 15th of each month, off-zero minute via
GitHub Actions (mirrors the existing MTS workflow; see feedback memory on
top-of-hour cron delays).

Units: MTS values are in actual dollars with cents.
"""

import json
import sys
from datetime import date, timedelta

from scripts.db import (
    SESSION,
    get_state,
    set_state,
    upsert,
)


MTS_URL = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/mts/mts_table_4/"
)
HISTORICAL_BASELINE = date(2025, 1, 1)
PAGE_SIZE = 10000
MTS_FETCH_TIMEOUT = 90
STATE_KEY = "mts_receipts_last_record_date"


# ===================== Fetch =====================

def fetch_mts_page(start_date: date, end_date: date, page_number: int) -> dict:
    params = {
        "filter": (
            f"record_date:gte:{start_date.isoformat()},"
            f"record_date:lte:{end_date.isoformat()}"
        ),
        "page[size]": str(PAGE_SIZE),
        "page[number]": str(page_number),
    }
    resp = SESSION.get(MTS_URL, params=params, timeout=MTS_FETCH_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_all_mts_records(start_date: date, end_date: date) -> list[dict]:
    all_records: list[dict] = []
    page = 1
    while True:
        print(f"  Fetching page {page} ({start_date} to {end_date}) ...")
        data = fetch_mts_page(start_date, end_date, page)
        recs = data.get("data", [])
        all_records.extend(recs)
        meta = data.get("meta", {})
        total_pages = meta.get("total-pages", 1) or 1
        if page >= total_pages:
            break
        page += 1
    print(f"  Fetched {len(all_records):,} total records across {page} page(s).")
    return all_records


# ===================== Map =====================

def parse_amount(s: str | None) -> float | None:
    if s is None or s == "" or s == "null":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def map_record(r: dict) -> dict | None:
    """Map a single Treasury Table 4 record to a federal_receipts row.
    Returns None if essential PK fields are missing (skip the row)."""
    record_date = r.get("record_date")
    classification_id = r.get("classification_id")
    if not record_date or not classification_id:
        return None
    return {
        "record_date": record_date,
        "classification_id": str(classification_id),
        "classification_desc": r.get("classification_desc"),
        "current_month_gross_rcpt_amt": parse_amount(r.get("current_month_gross_rcpt_amt")),
        "current_month_refund_amt": parse_amount(r.get("current_month_refund_amt")),
        "current_month_net_rcpt_amt": parse_amount(r.get("current_month_net_rcpt_amt")),
        "current_fytd_gross_rcpt_amt": parse_amount(r.get("current_fytd_gross_rcpt_amt")),
        "current_fytd_refund_amt": parse_amount(r.get("current_fytd_refund_amt")),
        "current_fytd_net_rcpt_amt": parse_amount(r.get("current_fytd_net_rcpt_amt")),
        "prior_fytd_gross_rcpt_amt": parse_amount(r.get("prior_fytd_gross_rcpt_amt")),
        "prior_fytd_refund_amt": parse_amount(r.get("prior_fytd_refund_amt")),
        "prior_fytd_net_rcpt_amt": parse_amount(r.get("prior_fytd_net_rcpt_amt")),
        "raw_data": r,
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
            start_date = date.fromisoformat(last) + timedelta(days=1)
            print(f"Last seen MTS receipts record_date: {last}. Starting from {start_date}.")
        else:
            start_date = HISTORICAL_BASELINE
            print(f"No prior state. Starting from baseline {start_date}.")

    if start_date > today:
        print(f"Start date {start_date} is in the future. Nothing to do.")
        return 0

    # 2. Fetch
    print(f"Fetching MTS Table 4 (all receipts) from {start_date} to {today} ...")
    raw_records = fetch_all_mts_records(start_date, today)
    if not raw_records:
        print("No MTS receipts returned. Nothing to upsert.")
        return 0

    # 3. Map
    mapped = []
    skipped = 0
    for r in raw_records:
        m = map_record(r)
        if m is None:
            skipped += 1
            continue
        mapped.append(m)
    print(f"Mapped {len(mapped):,} rows (skipped {skipped} for missing PK fields).")

    if not mapped:
        print("No mappable rows. Done.")
        return 0

    max_date = max(m["record_date"] for m in mapped)

    # 4. Upsert
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped)} rows to federal_receipts.")
        print(f"DRY RUN: would update {STATE_KEY} to {max_date}.")
        print("DRY RUN: sample mapped row (most recent month, Customs Duties if present):")
        # Try to pull a representative sample: latest customs row, else last mapped.
        sample = next(
            (m for m in reversed(mapped) if m.get("classification_desc") == "Customs Duties"),
            mapped[-1],
        ).copy()
        sample["raw_data"] = "{...truncated for dry-run output...}"
        print(json.dumps(sample, indent=2))
    else:
        upsert(
            "federal_receipts",
            mapped,
            on_conflict="record_date,classification_id",
            progress_label="Upserted federal_receipts",
        )
        set_state(STATE_KEY, max_date)
        print(f"Stored {STATE_KEY} = {max_date}.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
