"""
fetch_census_trade.py — Sync Census Bureau monthly imports/hs data into the
`trade_imports` table.

Logic:
  1. Decide month range:
       - normal run -> from (system_state.census_last_month + 1) to (today - 2 months)
       - first run  -> from HISTORICAL_BASELINE_MONTH ("2025-01") to (today - 2 months)
       - --backfill -> from HISTORICAL_BASELINE_MONTH to (today - 2 months) ignoring stored state
  2. For each month, call Census imports/hs API once. Returns one big JSON
     array (~30 MB / ~664K rows) with all HTS aggregation levels mixed in.
  3. Filter to HS10 aggregation level AND non-zero CAL_DUT_MO. Discard the
     rest (aggregation totals, duty-free imports — see blueprint for rationale).
  4. Map to trade_imports rows. Upsert using on_conflict=year,month,hts_code,country_code.
  5. Update system_state.census_last_month to the most recent month written.

Run from project root:
    python -m scripts.fetch_census_trade            # incremental
    python -m scripts.fetch_census_trade --dry-run  # do everything except writes
    python -m scripts.fetch_census_trade --backfill # ignore stored state

Schedule (production): monthly on the 15th via GitHub Actions.

Notes:
  - One full API call returns ~30 MB. Be mindful of timeout values.
  - Census revises historical months. Re-running with --backfill refreshes them.
  - The Census API returns array-of-arrays (NOT array-of-objects). First row
    is headers; rest are data aligned to those headers.
"""

import json
import os
import sys
from datetime import date

from dotenv import load_dotenv

from scripts.db import SESSION, get_state, set_state, upsert


CENSUS_BASE = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
HISTORICAL_BASELINE_MONTH = "2025-01"
LAG_MONTHS = 2  # Census data lags 2-3 months
CENSUS_FETCH_TIMEOUT = 240  # large response, generous timeout
STATE_KEY = "census_last_month"

# Fields we ask Census for. Order doesn't matter — we look up by name.
# SUMMARY_LVL is critical: distinguishes Detail ('DET') from Country Grouping
# ('CGP') aggregations. Without filtering on this, regional rollups (like
# "5XXX" or "0026" hemisphere groupings) double-count individual countries
# and inflate totals 3-4x.
CENSUS_FIELDS = "I_COMMODITY,COMM_LVL,SUMMARY_LVL,GEN_VAL_MO,CAL_DUT_MO,CON_VAL_MO,CTY_CODE"


# ===================== Date helpers =====================

def yyyymm_to_tuple(s: str) -> tuple[int, int]:
    y, m = s.split("-")
    return int(y), int(m)


def tuple_to_yyyymm(t: tuple[int, int]) -> str:
    return f"{t[0]:04d}-{t[1]:02d}"


def add_months(t: tuple[int, int], delta: int) -> tuple[int, int]:
    y, m = t
    total = (y * 12 + (m - 1)) + delta
    return (total // 12, total % 12 + 1)


def months_between(start: str, end_inclusive: str) -> list[str]:
    """Return list of YYYY-MM strings from start through end_inclusive."""
    s = yyyymm_to_tuple(start)
    e = yyyymm_to_tuple(end_inclusive)
    out = []
    cur = s
    while cur <= e:
        out.append(tuple_to_yyyymm(cur))
        cur = add_months(cur, 1)
    return out


def latest_available_month() -> str:
    """Most recent month likely to be published, given the LAG_MONTHS offset."""
    today = date.today()
    target = add_months((today.year, today.month), -LAG_MONTHS)
    return tuple_to_yyyymm(target)


# ===================== Fetch & filter =====================

def fetch_census_month(api_key: str, month: str) -> tuple[list[str], list[list]] | None:
    """Fetch Census imports/hs for one month. Returns (headers, rows) or None
    if the month isn't published yet."""
    params = {
        "get": CENSUS_FIELDS,
        "time": month,
        "key": api_key,
    }
    print(f"  Fetching Census imports/hs for {month} ...")
    resp = SESSION.get(CENSUS_BASE, params=params, timeout=CENSUS_FETCH_TIMEOUT)
    if resp.status_code == 204 or resp.status_code == 404:
        print(f"    HTTP {resp.status_code} — month not published yet.")
        return None
    if resp.status_code != 200:
        print(f"    HTTP {resp.status_code}: {resp.text[:300]}")
        resp.raise_for_status()

    print(f"    HTTP 200, {len(resp.content):,} bytes")
    data = resp.json()
    if not isinstance(data, list) or len(data) < 2:
        print(f"    Unexpected response shape: {type(data).__name__}")
        return None
    headers = data[0]
    rows = data[1:]
    print(f"    {len(rows):,} raw rows (all aggregation levels mixed)")
    return headers, rows


def parse_amount(s: str | None) -> float | None:
    if s is None or s == "" or s == "null":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def filter_and_map(
    headers: list[str], rows: list[list], year: int, month: int
) -> list[dict]:
    """Keep HS10 + DETAIL-summary + non-zero duty rows. Map to trade_imports."""
    # Index lookups
    try:
        idx_commodity = headers.index("I_COMMODITY")
        idx_level = headers.index("COMM_LVL")
        idx_summary = headers.index("SUMMARY_LVL")
        idx_cal_dut = headers.index("CAL_DUT_MO")
        idx_con_val = headers.index("CON_VAL_MO")
        # CTY_CODE may appear twice (Census quirk when filter param echoed) —
        # the first occurrence is the data column.
        idx_country = headers.index("CTY_CODE")
    except ValueError as e:
        raise RuntimeError(f"Expected field missing from Census response: {e}")

    out = []
    skipped_level = 0
    skipped_summary = 0
    skipped_zero = 0
    skipped_aggregate = 0
    skipped_invalid = 0
    for r in rows:
        if r[idx_level] != "HS10":
            skipped_level += 1
            continue
        # CRITICAL: only keep per-country detail rows, NOT regional aggregations.
        # Without this, codes like '5XXX'/'0026' double-count individual countries.
        if r[idx_summary] != "DET":
            skipped_summary += 1
            continue
        cal_dut = parse_amount(r[idx_cal_dut])
        if cal_dut is None or cal_dut == 0:
            skipped_zero += 1
            continue
        hts_code = r[idx_commodity]
        country_code = r[idx_country]
        # Census uses "-" as a sentinel for "all countries / all commodities".
        if hts_code == "-" or country_code == "-":
            skipped_aggregate += 1
            continue
        # Defensive: HS10 codes must be exactly 10 numeric chars.
        if len(hts_code) != 10 or not hts_code.isdigit():
            skipped_invalid += 1
            continue
        # Defensive: real country codes are 4 numeric chars (5700, 4280, etc.).
        # Reject codes with 'X' (regional aggregation sentinels).
        if "X" in country_code or "x" in country_code:
            skipped_aggregate += 1
            continue
        if not country_code:
            skipped_invalid += 1
            continue
        out.append({
            "year": year,
            "month": month,
            "hts_code": hts_code,
            "country_code": country_code,
            "calculated_duties": cal_dut,
            "import_value": parse_amount(r[idx_con_val]),
            # port_code intentionally not set — column allows NULL.
        })
    print(
        f"    Filtered: kept {len(out):,}; "
        f"skipped non-HS10 {skipped_level:,}, "
        f"non-DET {skipped_summary:,}, "
        f"zero-duty {skipped_zero:,}, "
        f"aggregate {skipped_aggregate:,}, "
        f"invalid {skipped_invalid:,}"
    )
    return out


# ===================== Main =====================

def parse_month_arg(argv: list[str]) -> str | None:
    """Look for --month=YYYY-MM. Returns the month string or None."""
    for a in argv:
        if a.startswith("--month="):
            value = a.split("=", 1)[1]
            yyyymm_to_tuple(value)  # raises if malformed
            return value
    return None


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    backfill = "--backfill" in argv
    single_month = parse_month_arg(argv)
    if dry_run:
        print("*** DRY RUN — no writes will be made ***")
    if single_month:
        print(f"*** SINGLE-MONTH MODE: only processing {single_month} ***")

    load_dotenv()
    api_key = os.getenv("CENSUS_API_KEY")
    if not api_key:
        print("ERROR: CENSUS_API_KEY missing in .env")
        return 1

    if single_month:
        months = [single_month]
        print(f"Will process 1 month: {single_month}")
    else:
        end_month = latest_available_month()

        # Determine start month
        if backfill:
            start_month = HISTORICAL_BASELINE_MONTH
            print(f"Backfill mode: starting from {start_month}.")
        else:
            last = get_state(STATE_KEY)
            if last:
                start_month = tuple_to_yyyymm(add_months(yyyymm_to_tuple(last), 1))
                print(f"Last seen Census month: {last}. Starting from {start_month}.")
            else:
                start_month = HISTORICAL_BASELINE_MONTH
                print(f"No prior state. Starting from baseline {start_month}.")

        if yyyymm_to_tuple(start_month) > yyyymm_to_tuple(end_month):
            print(f"Start {start_month} is after target end {end_month}. Nothing to do.")
            return 0

        months = months_between(start_month, end_month)
        print(f"Will process {len(months)} month(s): {months[0]} ... {months[-1]}")

    last_successful_month: str | None = None

    for month in months:
        print()
        print(f"=== Month: {month} ===")
        result = fetch_census_month(api_key, month)
        if result is None:
            print(f"  Skipping {month} (not yet published or empty).")
            continue
        headers, rows = result
        year, mo = yyyymm_to_tuple(month)
        mapped = filter_and_map(headers, rows, year, mo)

        if not mapped:
            print(f"  No rows after filtering for {month}. Skipping write.")
            continue

        if dry_run:
            print(f"  DRY RUN: would upsert {len(mapped):,} rows for {month}.")
            print(f"  DRY RUN: sample mapped row: {json.dumps(mapped[0])}")
        else:
            upsert(
                "trade_imports",
                mapped,
                on_conflict="year,month,hts_code,country_code",
                progress_label=f"{month}",
            )
            set_state(STATE_KEY, month)
            last_successful_month = month
            print(f"  Stored {STATE_KEY} = {month}.")

    print()
    if last_successful_month:
        print(f"Done. Last successful month: {last_successful_month}.")
    elif dry_run:
        print("Done (dry run).")
    else:
        print("Done. No new months were ingested.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
