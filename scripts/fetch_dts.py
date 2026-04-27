"""
fetch_dts.py — Sync the Treasury Daily Treasury Statement (DTS) customs line
into the `dts_daily` table.

Logic:
  1. Decide date range:
       - normal run -> from (system_state.dts_last_record_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE (2025-01-01) to today
       - --backfill -> from HISTORICAL_BASELINE to today (ignore stored state)
  2. Page through the Fiscal Data API filtered to `transaction_type=Deposits`
     for the date range. Only ask for the fields we actually use.
  3. Python-side filter to records whose `transaction_catg` is a known
     customs line. We accept multiple labels because Treasury renamed the
     line in November 2025 (see CUSTOMS_CATEGORIES). The label has commas
     in it, which would also confuse the API's filter syntax — client-side
     filter avoids that.
  4. Upsert mapped rows to dts_daily. Update system_state.dts_last_record_date
     to the maximum record_date we wrote.

Run from the project root:
    python -m scripts.fetch_dts            # incremental
    python -m scripts.fetch_dts --dry-run  # do everything except writes
    python -m scripts.fetch_dts --backfill # force from HISTORICAL_BASELINE

Schedule (production): weekdays at 5:00 PM ET via GitHub Actions.

Units: Treasury publishes `transaction_today_amt` / `transaction_mtd_amt` /
`transaction_fytd_amt` in millions of dollars. Stored as-is.
"""

import json
import sys
from datetime import date, timedelta

from scripts.db import SESSION, get_state, set_state, upsert


DTS_URL = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/dts/deposits_withdrawals_operating_cash/"
)
HISTORICAL_BASELINE = date(2025, 1, 1)

# Treasury renamed this line in November 2025. Both labels refer to the same
# tariff revenue stream — we accept all known historical names.
#   "DHS - Customs and Certain Excise Taxes" : 2025-01-02 -> 2025-11-07
#   "DHS - Customs Duties, Taxes, and Fees"  : 2025-11-10 -> present
# If Treasury renames it again, the WARNING below will fire so we know.
CUSTOMS_CATEGORIES = {
    "DHS - Customs and Certain Excise Taxes",
    "DHS - Customs Duties, Taxes, and Fees",
}

PAGE_SIZE = 10000  # Treasury API maximum
DTS_FETCH_TIMEOUT = 90
STATE_KEY = "dts_last_record_date"


# ===================== Fetch =====================

def fetch_dts_page(start_date: date, end_date: date, page_number: int) -> dict:
    """Fetch one page of DTS Deposits records for a date range."""
    params = {
        "filter": (
            f"transaction_type:eq:Deposits,"
            f"record_date:gte:{start_date.isoformat()},"
            f"record_date:lte:{end_date.isoformat()}"
        ),
        "fields": (
            "record_date,transaction_catg,transaction_today_amt,"
            "transaction_mtd_amt,transaction_fytd_amt"
        ),
        "sort": "record_date",
        "page[size]": str(PAGE_SIZE),
        "page[number]": str(page_number),
    }
    resp = SESSION.get(DTS_URL, params=params, timeout=DTS_FETCH_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def fetch_all_dts_records(start_date: date, end_date: date) -> list[dict]:
    """Fetch all DTS Deposits records across the date range, paging as needed."""
    all_records: list[dict] = []
    page = 1
    while True:
        print(f"  Fetching page {page} ({start_date} to {end_date}) ...")
        data = fetch_dts_page(start_date, end_date, page)
        records = data.get("data", [])
        all_records.extend(records)
        meta = data.get("meta", {})
        total_pages = meta.get("total-pages", 1) or 1
        if page >= total_pages:
            break
        page += 1
    print(f"  Fetched {len(all_records):,} total records across {page} page(s).")
    return all_records


# ===================== Filter & map =====================

def filter_customs(records: list[dict]) -> list[dict]:
    """Keep only records whose transaction_catg is a known customs line.

    Also warns if a record looks customs-related (mentions 'customs' or
    'duties' in its label) but isn't in our known set — that means Treasury
    renamed the line again and we need to update CUSTOMS_CATEGORIES.
    """
    matched = []
    unknown_customs_labels: set[str] = set()
    for r in records:
        catg = r.get("transaction_catg") or ""
        if catg in CUSTOMS_CATEGORIES:
            matched.append(r)
            continue
        low = catg.lower()
        if "customs" in low or "duties" in low:
            unknown_customs_labels.add(catg)
    if unknown_customs_labels:
        print(
            "  WARNING: found customs/duty-related categories NOT in "
            "CUSTOMS_CATEGORIES — Treasury may have renamed the line. "
            "Update the constant in fetch_dts.py:"
        )
        for label in sorted(unknown_customs_labels):
            print(f"    - {label!r}")
    return matched


def parse_amount(s: str | None) -> float | None:
    """Convert a numeric string to float; return None if missing/blank."""
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def map_record(r: dict) -> dict:
    """Map a DTS record to a dts_daily row."""
    return {
        "record_date": r["record_date"],
        "customs_revenue_today": parse_amount(r.get("transaction_today_amt")),
        "customs_revenue_mtd": parse_amount(r.get("transaction_mtd_amt")),
        "raw_data": r,
        # source_url left NULL — Treasury PDF URL pattern unstable.
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
            print(f"Last seen record_date: {last}. Starting from {start_date}.")
        else:
            start_date = HISTORICAL_BASELINE
            print(f"No prior state. Starting from baseline {start_date}.")

    if start_date > today:
        print(f"Start date {start_date} is in the future. Nothing to do.")
        return 0

    # 2. Fetch
    print(f"Fetching DTS Deposits records from {start_date} to {today} ...")
    raw_records = fetch_all_dts_records(start_date, today)

    # 3. Filter to customs
    customs_records = filter_customs(raw_records)
    print(
        f"Filtered to {len(customs_records):,} customs records "
        f"(out of {len(raw_records):,})."
    )

    if not customs_records:
        print("No new customs data to write. Exiting.")
        return 0

    # 4. Map
    mapped = [map_record(r) for r in customs_records]
    max_date = max(m["record_date"] for m in mapped)

    # 5. Upsert (or print sample on dry run)
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped):,} rows to dts_daily.")
        print(f"DRY RUN: would update {STATE_KEY} to {max_date}.")
        print("DRY RUN: sample mapped row:")
        print(json.dumps(mapped[0], indent=2))
        return 0

    upsert("dts_daily", mapped, on_conflict="record_date", progress_label="Upserted")

    # 6. Update state
    set_state(STATE_KEY, max_date)
    print(f"Stored {STATE_KEY} = {max_date}.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
