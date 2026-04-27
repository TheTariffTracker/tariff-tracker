"""
inspect_dts.py — One-time discovery script for Treasury DTS API.

Goals:
  1. See what fields the DTS "Deposits and Withdrawals of Operating Cash"
     endpoint returns.
  2. Identify the exact label of the customs revenue line item.
  3. Confirm units, date format, and pagination behavior.

Run from project root:
    python -m scripts.inspect_dts

Throwaway script — kept as reference utility, not run on schedule.
"""

import json
import sys
from datetime import date, timedelta

from scripts.db import SESSION


DTS_URL = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/dts/deposits_withdrawals_operating_cash/"
)


def main() -> int:
    today = date.today()
    week_ago = today - timedelta(days=14)  # 14 days to ensure we catch business days

    # Fetch range, no field filter (see everything the API returns).
    params = {
        "filter": (
            f"record_date:gte:{week_ago.isoformat()},"
            f"record_date:lte:{today.isoformat()}"
        ),
        "page[size]": "1000",
    }
    print(f"Fetching DTS records from {week_ago} to {today} ...")
    print(f"URL: {DTS_URL}")
    print(f"Params: {params}")
    print()

    resp = SESSION.get(DTS_URL, params=params, timeout=30)
    print(f"HTTP status: {resp.status_code}")
    print(f"Response size: {len(resp.content):,} bytes")

    if resp.status_code != 200:
        print("Body preview:")
        print(resp.text[:1500])
        return 1

    data = resp.json()
    print(f"Top-level keys in response: {list(data.keys())}")

    records = data.get("data", [])
    print(f"Records returned: {len(records)}")

    if not records:
        print("No records returned. Full response:")
        print(json.dumps(data, indent=2)[:2000])
        return 0

    # 1. Show full structure of first record
    print()
    print("=" * 60)
    print("First record (full structure):")
    print("=" * 60)
    print(json.dumps(records[0], indent=2))
    print()
    print("Field names:")
    for k in records[0].keys():
        print(f"  - {k}")

    # 2. Find customs-related records (case-insensitive search across all fields)
    print()
    print("=" * 60)
    print("Records mentioning 'customs' (case-insensitive):")
    print("=" * 60)
    customs_matches = []
    for r in records:
        as_str = json.dumps(r).lower()
        if "customs" in as_str:
            customs_matches.append(r)
    print(f"Found {len(customs_matches)} customs-related records.")

    if customs_matches:
        print()
        print("--- Up to 5 sample customs records ---")
        for i, r in enumerate(customs_matches[:5]):
            print(f"\n[{i + 1}]")
            print(json.dumps(r, indent=2))

    # 3. Show distinct date values present (sanity check on date format / coverage)
    print()
    print("=" * 60)
    print("Distinct record_date values present in response:")
    print("=" * 60)
    dates_seen = sorted({r.get("record_date") for r in records if r.get("record_date")})
    for d in dates_seen:
        print(f"  - {d}")

    # 4. Pagination/meta info
    print()
    print("=" * 60)
    print("Pagination / meta:")
    print("=" * 60)
    if "meta" in data:
        print(json.dumps(data["meta"], indent=2))
    if "links" in data:
        print(json.dumps(data["links"], indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
