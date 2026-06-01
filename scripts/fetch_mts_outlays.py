"""
fetch_mts_outlays.py — Sync total federal OUTLAYS from MTS Table 5 into the
`federal_outlays` table. Companion to fetch_mts_receipts.py (which pulls the
full receipts breakdown from Table 4).

Why Table 5 and not Table 1:
  Table 1 (Summary) carries month-by-month outlays but has NO fiscal-year-to-
  date column and a fiddly this-year/prior-year hierarchy. Table 5 (Outlays by
  agency) exposes a single grand-total line — classification_desc "Total
  Outlays" — with current-month NET outlays, current-FYTD net, and prior-FYTD
  net, exactly parallel to how Table 4's "Total -- Receipts" line works.

What we store:
  ONE row per monthly record_date — just the "Total Outlays" grand total. This
  is the denominator for the "1912 vs Today" tool: Panel 3 (trailing 12 months)
  sums the last 12 current_month_net_outly_amt; Panel 2 (fiscal year) reads
  current_fytd_net_outly_amt at the FY-close (September) publication.

Stability notes (same gotchas as the receipts pipeline):
  - classification_id is NOT stable across record_dates — never key on it.
    We identify the total line by classification_desc == "Total Outlays".
  - The on/off-budget subtotals are "Total On-Budget"/"Total Off-Budget"
    (different text), so the desc match is unambiguous. We assert exactly one
    matching row per record_date and fail loudly if the label ever drifts.

Logic:
  1. Decide date range:
       - normal     -> from (system_state.mts_outlays_last_record_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE to today
       - --backfill -> from HISTORICAL_BASELINE to today (ignore stored state)
  2. Page through MTS Table 5 for the date range, filtered to "Total Outlays".
  3. Map each record_date's total line to a federal_outlays row.
  4. Upsert on PK (record_date).
  5. Update system_state.mts_outlays_last_record_date.

Run from project root:
    python -m scripts.fetch_mts_outlays            # incremental
    python -m scripts.fetch_mts_outlays --dry-run  # do everything except writes
    python -m scripts.fetch_mts_outlays --backfill # force from HISTORICAL_BASELINE

Schedule (production): 1st and 15th of each month, off-zero minute via
GitHub Actions (mirrors the MTS receipts workflow; staggered minute).

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
    "/services/api/fiscal_service/v1/accounting/mts/mts_table_5/"
)
HISTORICAL_BASELINE = date(2025, 1, 1)
PAGE_SIZE = 10000
MTS_FETCH_TIMEOUT = 90
STATE_KEY = "mts_outlays_last_record_date"

# The grand-total line we keep. Net total federal outlays for the month + FYTD.
TOTAL_OUTLAYS_DESC = "Total Outlays"


# ===================== Fetch =====================

def fetch_mts_page(start_date: date, end_date: date, page_number: int) -> dict:
    # Server-side filter on classification_desc keeps the payload to ~1 row per
    # month instead of ~800 agency lines. We still re-check the label in code.
    params = {
        "filter": (
            f"record_date:gte:{start_date.isoformat()},"
            f"record_date:lte:{end_date.isoformat()},"
            f"classification_desc:eq:{TOTAL_OUTLAYS_DESC}"
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
    """Map a single Treasury Table 5 'Total Outlays' record to a federal_outlays
    row. Returns None if essential fields are missing (skip the row)."""
    record_date = r.get("record_date")
    if not record_date:
        return None
    return {
        "record_date": record_date,
        "classification_desc": r.get("classification_desc"),
        "current_month_gross_outly_amt": parse_amount(r.get("current_month_gross_outly_amt")),
        "current_month_app_rcpt_amt": parse_amount(r.get("current_month_app_rcpt_amt")),
        "current_month_net_outly_amt": parse_amount(r.get("current_month_net_outly_amt")),
        "current_fytd_gross_outly_amt": parse_amount(r.get("current_fytd_gross_outly_amt")),
        "current_fytd_app_rcpt_amt": parse_amount(r.get("current_fytd_app_rcpt_amt")),
        "current_fytd_net_outly_amt": parse_amount(r.get("current_fytd_net_outly_amt")),
        "prior_fytd_gross_outly_amt": parse_amount(r.get("prior_fytd_gross_outly_amt")),
        "prior_fytd_app_rcpt_amt": parse_amount(r.get("prior_fytd_app_rcpt_amt")),
        "prior_fytd_net_outly_amt": parse_amount(r.get("prior_fytd_net_outly_amt")),
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
            print(f"Last seen MTS outlays record_date: {last}. Starting from {start_date}.")
        else:
            start_date = HISTORICAL_BASELINE
            print(f"No prior state. Starting from baseline {start_date}.")

    if start_date > today:
        print(f"Start date {start_date} is in the future. Nothing to do.")
        return 0

    # 2. Fetch
    print(f"Fetching MTS Table 5 ('Total Outlays' line) from {start_date} to {today} ...")
    raw_records = fetch_all_mts_records(start_date, today)
    if not raw_records:
        print("No MTS outlays returned. Nothing to upsert.")
        return 0

    # 2a. Defensive label check: the server filter should already restrict to
    # "Total Outlays", but verify nothing else slipped in and that we get at
    # most one row per record_date. Fail loudly if the label ever drifts.
    unexpected = [
        r.get("classification_desc")
        for r in raw_records
        if r.get("classification_desc") != TOTAL_OUTLAYS_DESC
    ]
    if unexpected:
        print(
            f"ERROR: filter returned non-total rows ({set(unexpected)}). "
            "The Treasury label may have changed — investigate before trusting data.",
            file=sys.stderr,
        )
        return 1

    by_date: dict[str, int] = {}
    for r in raw_records:
        by_date[r.get("record_date")] = by_date.get(r.get("record_date"), 0) + 1
    dupes = {d: n for d, n in by_date.items() if n > 1}
    if dupes:
        print(
            f"ERROR: more than one 'Total Outlays' row for record_date(s) {dupes}. "
            "Expected exactly one — investigate before trusting data.",
            file=sys.stderr,
        )
        return 1

    # 3. Map
    mapped = []
    skipped = 0
    for r in raw_records:
        m = map_record(r)
        if m is None:
            skipped += 1
            continue
        mapped.append(m)
    print(f"Mapped {len(mapped):,} rows (skipped {skipped} for missing fields).")

    if not mapped:
        print("No mappable rows. Done.")
        return 0

    max_date = max(m["record_date"] for m in mapped)

    # 4. Upsert
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped)} rows to federal_outlays.")
        print(f"DRY RUN: would update {STATE_KEY} to {max_date}.")
        print("DRY RUN: sample mapped row (most recent month):")
        sample = max(mapped, key=lambda m: m["record_date"]).copy()
        sample["raw_data"] = "{...truncated for dry-run output...}"
        print(json.dumps(sample, indent=2))
    else:
        upsert(
            "federal_outlays",
            mapped,
            on_conflict="record_date",
            progress_label="Upserted federal_outlays",
        )
        set_state(STATE_KEY, max_date)
        print(f"Stored {STATE_KEY} = {max_date}.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
