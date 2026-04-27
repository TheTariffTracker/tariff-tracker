"""
inspect_census.py — Discovery script for Census Bureau International Trade
imports/hs API.

Goals:
  1. Confirm endpoint URL is correct.
  2. Discover the exact field names and what they mean.
  3. Get a feel for response size:
       - How many rows for one month, all HTS codes, single country (China)?
       - How many rows for one month, all HTS codes, all countries?
       - How many of those rows have non-zero calculated duties?
  4. Confirm the API's filter / pagination behavior.

Run from project root:
    python -m scripts.inspect_census

This script makes ~3-4 API calls. Each call may take 30+ seconds.
"""

import json
import os
import sys
from datetime import date

from dotenv import load_dotenv

from scripts.db import SESSION


CENSUS_BASE = "https://api.census.gov/data/timeseries/intltrade/imports/hs"
CENSUS_VARS_URL = f"{CENSUS_BASE}/variables.json"


def main() -> int:
    load_dotenv()
    api_key = os.getenv("CENSUS_API_KEY")
    if not api_key:
        print("ERROR: CENSUS_API_KEY missing in .env")
        return 1

    # ---------- 1. Available variables ----------
    print("=" * 70)
    print("1. Available variables for imports/hs dataset")
    print("=" * 70)
    print(f"  URL: {CENSUS_VARS_URL}")
    resp = SESSION.get(CENSUS_VARS_URL, timeout=30)
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")
    if resp.status_code != 200:
        print(f"  Body: {resp.text[:1000]}")
        return 1

    vars_meta = resp.json().get("variables", {})
    print(f"  Total variables defined: {len(vars_meta)}")
    print()
    # Print only the ones that look relevant to our use case
    keywords = ["commodity", "duty", "value", "country", "ctry", "cty",
                "port", "month", "time", "general", "calc"]
    print("  Variables matching {keywords}:".format(keywords=keywords))
    for name, info in sorted(vars_meta.items()):
        nl = name.lower()
        label = (info.get("label") or "") if isinstance(info, dict) else ""
        ll = label.lower()
        if any(k in nl or k in ll for k in keywords):
            print(f"    {name:24} -> {label}")

    # ---------- 2. Pick a recent month and probe China-only ----------
    # Census data lags 2-3 months, so try Feb 2026 then back off.
    test_month = "2026-02"
    print()
    print("=" * 70)
    print(f"2. Sample request: ALL HTS, China-only ({test_month})")
    print("=" * 70)
    params = {
        "get": "I_COMMODITY,I_COMMODITY_LDESC,GEN_VAL_MO,CAL_DUT_MO,CTY_CODE,CTY_NAME",
        "CTY_CODE": "5700",  # China
        "time": test_month,
        "key": api_key,
    }
    print(f"  URL: {CENSUS_BASE}")
    print(f"  Params (key redacted): "
          f"{ {k: ('<redacted>' if k == 'key' else v) for k, v in params.items()} }")
    resp = SESSION.get(CENSUS_BASE, params=params, timeout=120)
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")
    if resp.status_code != 200:
        print(f"  Body: {resp.text[:800]}")
        # Try previous month if Feb 2026 isn't published yet
        test_month = "2026-01"
        params["time"] = test_month
        print()
        print(f"  Retrying with {test_month} ...")
        resp = SESSION.get(CENSUS_BASE, params=params, timeout=120)
        print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")
        if resp.status_code != 200:
            print(f"  Body: {resp.text[:800]}")
            return 1

    data = resp.json()
    print(f"  Response shape: list of {len(data):,} rows")
    if not data:
        print("  Empty response.")
        return 1
    headers = data[0]
    rows = data[1:]
    print(f"  Headers: {headers}")
    print(f"  Data rows: {len(rows):,}")
    print()
    print("  First 3 rows:")
    for r in rows[:3]:
        print(f"    {r}")

    # Find indices of duty + commodity for filtering preview
    cal_dut_idx = headers.index("CAL_DUT_MO") if "CAL_DUT_MO" in headers else None
    if cal_dut_idx is not None:
        nonzero = sum(1 for r in rows if r[cal_dut_idx] not in ("0", "0.0", "", None, "null"))
        print()
        print(f"  Rows with non-zero CAL_DUT_MO (China, {test_month}): "
              f"{nonzero:,} / {len(rows):,}")
        # Show 3 example non-zero rows
        nonzero_examples = [r for r in rows if r[cal_dut_idx] not in ("0", "0.0", "", None, "null")][:3]
        print(f"  Example non-zero rows:")
        for r in nonzero_examples:
            print(f"    {r}")

    # ---------- 3. Same month, ALL countries, see total scale ----------
    print()
    print("=" * 70)
    print(f"3. Sample request: ALL HTS, ALL countries ({test_month})")
    print("=" * 70)
    params_all = {
        "get": "I_COMMODITY,GEN_VAL_MO,CAL_DUT_MO,CTY_CODE",
        "time": test_month,
        "key": api_key,
    }
    print("  This may take 30+ seconds and return several MB...")
    resp = SESSION.get(CENSUS_BASE, params=params_all, timeout=180)
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")
    if resp.status_code != 200:
        print(f"  Body: {resp.text[:600]}")
    else:
        data = resp.json()
        rows = data[1:]
        headers = data[0]
        print(f"  Total rows for {test_month}: {len(rows):,}")
        cal_dut_idx = headers.index("CAL_DUT_MO") if "CAL_DUT_MO" in headers else None
        if cal_dut_idx is not None:
            nonzero = sum(1 for r in rows if r[cal_dut_idx] not in ("0", "0.0", "", None, "null"))
            print(f"  Rows with non-zero CAL_DUT_MO: {nonzero:,} ({nonzero / max(len(rows), 1):.1%})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
