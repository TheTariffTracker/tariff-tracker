"""
fetch_mts.py — Sync the Treasury Monthly Treasury Statement (MTS) "Customs
Duties" line into `mts_monthly`, then recompute `calendar_year_totals`.

Source: MTS Table 4 (`mts_table_4`). NOT Table 5 — that's agency outlays.
Table 4 gives net + gross + refunds + FYTD comparisons per month.

Logic:
  1. Decide date range:
       - normal run -> from (system_state.mts_last_record_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE (2025-01-01) to today
       - --backfill -> from HISTORICAL_BASELINE to today (ignore stored state)
  2. Page through MTS Table 4 for the date range.
  3. Python-side filter to records where classification_desc == "Customs Duties".
  4. Upsert to mts_monthly. Update system_state.mts_last_record_date.
  5. Recompute calendar_year_totals from the full mts_monthly table.

Run from project root:
    python -m scripts.fetch_mts            # incremental
    python -m scripts.fetch_mts --dry-run  # do everything except writes
    python -m scripts.fetch_mts --backfill # force from HISTORICAL_BASELINE

Schedule (production): 1st and 15th of each month at 8:00 AM ET via GitHub Actions.

Units: MTS values are in actual dollars with cents.
"""

import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from scripts.db import (
    SESSION,
    SUPABASE_URL,
    BASE_HEADERS,
    DB_TIMEOUT,
    get_state,
    set_state,
    upsert,
)


MTS_URL = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/mts/mts_table_4/"
)
HISTORICAL_BASELINE = date(2025, 1, 1)
CUSTOMS_LABEL = "Customs Duties"
PAGE_SIZE = 10000
MTS_FETCH_TIMEOUT = 90
STATE_KEY = "mts_last_record_date"


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


# ===================== Filter & map =====================

def filter_customs_duties(records: list[dict]) -> list[dict]:
    """Keep only Customs Duties classification rows.

    Warns if any record's classification_desc mentions 'customs' but isn't
    exactly 'Customs Duties' — could mean Treasury renamed the line.
    """
    matched = []
    unknown_customs_labels: set[str] = set()
    for r in records:
        catg = r.get("classification_desc") or ""
        if catg == CUSTOMS_LABEL:
            matched.append(r)
            continue
        if "customs" in catg.lower() and "duties" in catg.lower():
            unknown_customs_labels.add(catg)
    if unknown_customs_labels:
        print(
            "  WARNING: found customs/duties-related labels NOT matching "
            f"{CUSTOMS_LABEL!r} — Treasury may have renamed the line:"
        )
        for label in sorted(unknown_customs_labels):
            print(f"    - {label!r}")
    return matched


def parse_amount(s: str | None) -> float | None:
    if s is None or s == "" or s == "null":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_int(s: str | None) -> int | None:
    if s is None or s == "" or s == "null":
        return None
    try:
        return int(s)
    except ValueError:
        return None


def map_record(r: dict) -> dict:
    return {
        "year": parse_int(r.get("record_calendar_year")),
        "month": parse_int(r.get("record_calendar_month")),
        "customs_duties": parse_amount(r.get("current_month_net_rcpt_amt")),
        "fiscal_year": r.get("record_fiscal_year"),
        "published_date": r.get("record_date"),
        "raw_data": r,
    }


# ===================== calendar_year_totals recompute =====================

def fetch_all_mts_monthly() -> list[dict]:
    """Read every row from mts_monthly so we can rebuild the yearly aggregate."""
    url = f"{SUPABASE_URL}/rest/v1/mts_monthly"
    params = {"select": "year,month,customs_duties"}
    resp = SESSION.get(url, headers=BASE_HEADERS, params=params, timeout=DB_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def recompute_calendar_year_totals(dry_run: bool) -> None:
    rows = fetch_all_mts_monthly()
    print(f"  Read {len(rows)} mts_monthly rows for aggregation.")

    by_year: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        if r.get("year") is None:
            continue
        by_year[r["year"]].append(r)

    aggregated = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for year in sorted(by_year):
        months = by_year[year]
        # Only count months with a non-null customs_duties value.
        valid_amounts = [m["customs_duties"] for m in months if m.get("customs_duties") is not None]
        total = sum(valid_amounts) if valid_amounts else 0
        months_available = len(valid_amounts)
        is_complete = months_available == 12
        aggregated.append({
            "calendar_year": year,
            "total_customs_duties": total,
            "months_available": months_available,
            "is_complete": is_complete,
            "last_computed": now_iso,
        })

    if dry_run:
        print("  DRY RUN: would upsert calendar_year_totals:")
        for a in aggregated:
            print(
                f"    - {a['calendar_year']}: "
                f"${a['total_customs_duties']:,.2f} "
                f"across {a['months_available']} months"
                f"{' (complete)' if a['is_complete'] else ''}"
            )
        return

    if aggregated:
        upsert(
            "calendar_year_totals",
            aggregated,
            on_conflict="calendar_year",
            progress_label="Calendar-year totals",
        )


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
            print(f"Last seen MTS record_date: {last}. Starting from {start_date}.")
        else:
            start_date = HISTORICAL_BASELINE
            print(f"No prior state. Starting from baseline {start_date}.")

    if start_date > today:
        print(f"Start date {start_date} is in the future. Nothing to do.")
        return 0

    # 2. Fetch
    print(f"Fetching MTS Table 4 records from {start_date} to {today} ...")
    raw_records = fetch_all_mts_records(start_date, today)

    # 3. Filter
    customs_records = filter_customs_duties(raw_records)
    print(
        f"Filtered to {len(customs_records)} Customs Duties records "
        f"(out of {len(raw_records):,})."
    )

    if not customs_records:
        print("No new MTS customs data. Skipping mts_monthly upsert.")
        # Still recompute year totals — useful for first-run case where
        # mts_monthly has data but calendar_year_totals doesn't.
        print("Recomputing calendar_year_totals from existing mts_monthly ...")
        recompute_calendar_year_totals(dry_run=dry_run)
        return 0

    # 4. Map
    mapped = [map_record(r) for r in customs_records]
    max_date = max(m["published_date"] for m in mapped)

    # 5. Upsert mts_monthly
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped)} rows to mts_monthly.")
        print(f"DRY RUN: would update {STATE_KEY} to {max_date}.")
        print("DRY RUN: sample mapped row:")
        sample = mapped[-1].copy()  # latest month
        sample["raw_data"] = "{...truncated for dry-run output...}"
        print(json.dumps(sample, indent=2))
    else:
        # mts_monthly has composite-PK semantics (year + month). To upsert
        # cleanly via PostgREST, the table needs a unique constraint on
        # (year, month). If that wasn't created, the upsert will fail and
        # we'll handle it then.
        upsert(
            "mts_monthly",
            mapped,
            on_conflict="year,month",
            progress_label="Upserted mts_monthly",
        )
        set_state(STATE_KEY, max_date)
        print(f"Stored {STATE_KEY} = {max_date}.")

    # 6. Recompute calendar_year_totals
    print("Recomputing calendar_year_totals ...")
    recompute_calendar_year_totals(dry_run=dry_run)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
