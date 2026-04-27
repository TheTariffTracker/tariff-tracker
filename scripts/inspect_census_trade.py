"""
inspect_census_trade.py — Discovery script for Census Bureau International
Trade (HS Imports) API.

What we're trying to figure out:
  1. The full list of available variables/fields on this endpoint.
  2. Specifically: which field is calculated duties, which is import value,
     which is the 10-digit HTS code, which is country code/name.
  3. The actual response structure for a real query (Census returns a 2D
     array — not standard JSON-objects).
  4. How many rows a single month yields (helps us plan pagination/filtering).

Run from project root:
    python -m scripts.inspect_census_trade
"""

import json
import os
import sys

from dotenv import load_dotenv

from scripts.db import SESSION


CENSUS_BASE = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
VARIABLES_URL = f"{CENSUS_BASE}/variables.json"


def main() -> int:
    load_dotenv()
    api_key = os.getenv("CENSUS_API_KEY")
    if not api_key:
        print("ERROR: CENSUS_API_KEY missing from .env")
        return 1

    # === 1. Fetch the full variables list ===
    print("=" * 70)
    print("PART 1: All available variables on imports/hs endpoint")
    print("=" * 70)
    print(f"URL: {VARIABLES_URL}")
    resp = SESSION.get(VARIABLES_URL, timeout=30)
    print(f"HTTP {resp.status_code}, {len(resp.content):,} bytes")
    if resp.status_code != 200:
        print("Body preview:")
        print(resp.text[:2000])
        return 1

    vars_data = resp.json().get("variables", {})
    print(f"Total variables: {len(vars_data)}")

    # Print variables that look related to: duty, value, hts/commodity, country, port
    print()
    print("--- Variables likely relevant to our use case ---")
    keywords = ("duty", "calc_duty", "val_mo", "val_yr", "commodity",
                "country", "cty_", "district", "port", "year", "month")
    for var_name in sorted(vars_data.keys()):
        low = var_name.lower()
        if any(kw in low for kw in keywords):
            info = vars_data[var_name]
            label = info.get("label", "")
            concept = info.get("concept", "")
            print(f"  {var_name:30}  {label[:60]}")
            if concept and concept != label:
                print(f"  {'':30}  ({concept})")

    # === 2. Try a small live query for a recent published month ===
    # Census typically lags 2-3 months, so February 2026 should be safely available.
    print()
    print("=" * 70)
    print("PART 2: Sample query — Feb 2026, top-level fields")
    print("=" * 70)

    # Best guess at field names based on common Census trade variable conventions.
    candidate_fields = [
        "I_COMMODITY",          # 10-digit HTS code
        "I_COMMODITY_LDESC",    # commodity description
        "CTY_CODE",             # country code
        "CTY_NAME",             # country name
        "GEN_VAL_MO",           # general value, this month
        "CON_VAL_MO",           # consumption value, this month
        "CIF_VAL_MO",           # CIF value, this month
        "CAL_DUT_MO",           # calculated duty, this month (best guess)
        "DUT_VAL_MO",           # dutiable value, this month
    ]
    # Verify which of the candidates are actually valid variables.
    valid_fields = [f for f in candidate_fields if f in vars_data]
    invalid_fields = [f for f in candidate_fields if f not in vars_data]
    if invalid_fields:
        print(f"NOTE: candidate field(s) not in variables list: {invalid_fields}")
        print("Will only request the valid ones.")
    print(f"Requesting fields: {valid_fields}")

    params = {
        "get": ",".join(valid_fields),
        "YEAR": "2026",
        "MONTH": "02",
        "key": api_key,
    }
    print(f"URL: {CENSUS_BASE}")
    print(f"Params (key redacted): {{'get': '{params['get']}', 'YEAR': '2026', 'MONTH': '02', 'key': '<REDACTED>'}}")
    resp = SESSION.get(CENSUS_BASE, params=params, timeout=120)
    print(f"HTTP {resp.status_code}, {len(resp.content):,} bytes")

    if resp.status_code != 200:
        print("Body preview:")
        print(resp.text[:2000])
        return 1

    try:
        data = resp.json()
    except ValueError as e:
        print(f"Could not parse response as JSON: {e}")
        print("Body preview:")
        print(resp.text[:1000])
        return 1

    print(f"Top-level type: {type(data).__name__}")
    if not isinstance(data, list):
        print("Unexpected structure:")
        print(json.dumps(data, indent=2)[:1500])
        return 1

    print(f"Total rows (incl. header): {len(data):,}")
    if not data:
        print("Empty response.")
        return 0

    # First row is column headers
    print()
    print("Column headers:")
    print(data[0])

    # Show a few sample data rows
    print()
    print(f"--- First 5 data rows ---")
    for row in data[1:6]:
        print(row)

    # Find rows with non-zero calculated duty (the filter we'll use in production)
    if "CAL_DUT_MO" in data[0]:
        cal_idx = data[0].index("CAL_DUT_MO")
        nonzero = [r for r in data[1:] if r[cal_idx] not in ("0", "", None)]
        print()
        print(f"Rows with non-zero CAL_DUT_MO: {len(nonzero):,} / {len(data) - 1:,}")
        if nonzero:
            print("--- Sample row with non-zero calculated duty ---")
            for col, val in zip(data[0], nonzero[0]):
                print(f"  {col:25}  {val}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
