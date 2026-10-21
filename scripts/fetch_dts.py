"""
fetch_dts.py — Sync the Treasury Daily Treasury Statement (DTS) customs line
into the `dts_daily` table.

Logic:
  1. Decide date range:
       - normal run -> from (system_state.dts_last_record_date + 1 day) to today
       - first run  -> from HISTORICAL_BASELINE (2025-01-01) to today
       - --backfill -> from HISTORICAL_BASELINE to today (ignore stored state)
  2. Page through the Fiscal Data API for the date range, BOTH transaction
     types. Only ask for the fields we actually use.
  3. Python-side filter to two known categories: the customs DEPOSITS line
     and the CBP WITHDRAWALS line. We accept multiple labels for the deposits
     line because Treasury renamed it in November 2025 (see
     CUSTOMS_CATEGORIES). Both labels contain characters ("," and "&") that
     confuse the API's filter syntax — client-side filtering avoids that.
  4. Merge the two sides into one row per record_date and upsert to dts_daily.
     Update system_state.dts_last_record_date to the max record_date written.

WHY BOTH SIDES (added 2026-10-21):
  Storing deposits alone was fine while customs refunds were under 5% of
  receipts. The IEEPA refund wave broke that: in June 2026 deposits alone
  said +$24.8B when the true net was -$25.6B. Deposits minus the CBP
  withdrawals line tracks the authoritative MTS net figure within a few
  percent. See scripts/dts_cbp_withdrawals.sql for the measured comparison
  and the caveat that the CBP line is a PROXY -- it also carries roughly
  $1-2B/month of CBP operating spending, and Treasury publishes no
  customs-refund line of its own.

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

# The withdrawals-side counterpart. This is the only DTS category that
# plausibly carries customs refunds -- Treasury publishes no customs-refund
# line -- but it also includes CBP's own operating spending. Treated as a
# proxy, never as an exact refund figure. If Treasury renames it, the WARNING
# in filter_known() fires.
CBP_WITHDRAWAL_CATEGORIES = {
    "DHS - Customs & Border Protection (CBP)",
}

PAGE_SIZE = 10000  # Treasury API maximum
DTS_FETCH_TIMEOUT = 90
STATE_KEY = "dts_last_record_date"


# ===================== Fetch =====================

def fetch_dts_page(start_date: date, end_date: date, page_number: int) -> dict:
    """Fetch one page of DTS records (both transaction types) for a date range."""
    params = {
        "filter": (
            f"record_date:gte:{start_date.isoformat()},"
            f"record_date:lte:{end_date.isoformat()}"
        ),
        "fields": (
            "record_date,transaction_type,transaction_catg,transaction_today_amt,"
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
    """Fetch all DTS records across the date range, paging as needed."""
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

def filter_known(records: list[dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    """Split records into the customs deposits line and the CBP withdrawals line.

    Returns two dicts keyed by record_date. Warns if a record looks like it
    belongs to either line but carries an unrecognised label -- that means
    Treasury renamed something and the constants above need updating.
    """
    deposits: dict[str, dict] = {}
    withdrawals: dict[str, dict] = {}
    unknown_customs: set[str] = set()
    unknown_cbp: set[str] = set()

    for r in records:
        catg = r.get("transaction_catg") or ""
        ttype = r.get("transaction_type") or ""
        rec_date = r.get("record_date")
        if not rec_date:
            continue
        low = catg.lower()

        if ttype == "Deposits":
            if catg in CUSTOMS_CATEGORIES:
                deposits[rec_date] = r
            elif "customs" in low or "duties" in low:
                unknown_customs.add(catg)
        elif ttype == "Withdrawals":
            if catg in CBP_WITHDRAWAL_CATEGORIES:
                withdrawals[rec_date] = r
            elif "customs" in low or "border protection" in low:
                unknown_cbp.add(catg)

    if unknown_customs:
        print(
            "  WARNING: customs/duty-related DEPOSIT categories NOT in "
            "CUSTOMS_CATEGORIES — Treasury may have renamed the line. "
            "Update the constant in fetch_dts.py:"
        )
        for label in sorted(unknown_customs):
            print(f"    - {label!r}")
    if unknown_cbp:
        print(
            "  WARNING: customs/CBP-related WITHDRAWAL categories NOT in "
            "CBP_WITHDRAWAL_CATEGORIES — Treasury may have renamed the line. "
            "Update the constant in fetch_dts.py:"
        )
        for label in sorted(unknown_cbp):
            print(f"    - {label!r}")

    return deposits, withdrawals


def parse_amount(s: str | None) -> float | None:
    """Convert a numeric string to float; return None if missing/blank."""
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def build_rows(
    deposits: dict[str, dict], withdrawals: dict[str, dict]
) -> list[dict]:
    """Merge the two sides into one dts_daily row per record_date.

    A date present on one side but not the other still produces a row; the
    missing side stays NULL rather than 0, so "Treasury published nothing"
    is distinguishable from "Treasury published a zero". In practice both
    lines appear on every business day.
    """
    rows = []
    for rec_date in sorted(set(deposits) | set(withdrawals)):
        dep = deposits.get(rec_date)
        wdr = withdrawals.get(rec_date)
        rows.append(
            {
                "record_date": rec_date,
                "customs_revenue_today": parse_amount(dep.get("transaction_today_amt")) if dep else None,
                "customs_revenue_mtd": parse_amount(dep.get("transaction_mtd_amt")) if dep else None,
                "cbp_withdrawals_today": parse_amount(wdr.get("transaction_today_amt")) if wdr else None,
                "cbp_withdrawals_mtd": parse_amount(wdr.get("transaction_mtd_amt")) if wdr else None,
                "raw_data": {"deposits": dep, "withdrawals": wdr},
                # source_url left NULL — Treasury PDF URL pattern unstable.
            }
        )
    return rows


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
    print(f"Fetching DTS records from {start_date} to {today} ...")
    raw_records = fetch_all_dts_records(start_date, today)

    # 3. Split into the two lines we care about
    deposits, withdrawals = filter_known(raw_records)
    print(
        f"Matched {len(deposits):,} customs deposit day(s) and "
        f"{len(withdrawals):,} CBP withdrawal day(s) "
        f"(out of {len(raw_records):,} records)."
    )

    if not deposits and not withdrawals:
        print("No new customs data to write. Exiting.")
        return 0

    # 4. Merge into one row per date
    mapped = build_rows(deposits, withdrawals)
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
