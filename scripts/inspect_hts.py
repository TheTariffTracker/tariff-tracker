"""
inspect_hts.py — One-time discovery script.

Run this ONCE to see what USITC's HTS API actually returns, so we can build
fetch_hts.py against the real JSON schema instead of guessing field names.

What it does:
  1. Hits the HTS download page and extracts the current revision number.
  2. Hits the export API for a tiny code range (0101.21–0101.30) and prints
     the actual JSON record structure.

Run from the project root with:
    python scripts/inspect_hts.py

This script will be deleted once fetch_hts.py is working.
"""

import json
import re
import sys

import requests


DOWNLOAD_PAGE = "https://hts.usitc.gov/download"
EXPORT_URL = "https://hts.usitc.gov/reststop/exportList"


def part1_revision_number() -> None:
    print("=" * 60)
    print("PART 1: Current HTS revision number")
    print("=" * 60)

    resp = requests.get(DOWNLOAD_PAGE, timeout=30)
    print(f"HTTP status: {resp.status_code}")
    print(f"Response size: {len(resp.content):,} bytes")

    if resp.status_code != 200:
        print("Page fetch failed. Body preview:")
        print(resp.text[:500])
        return

    # Look for a pattern like "2026 HTS Revision 4" anywhere in the HTML.
    match = re.search(r"(\d{4})\s*HTS\s*Revision\s*(\d+)", resp.text)
    if match:
        year, rev = match.groups()
        print(f"Detected revision: {year} HTS Revision {rev}")
    else:
        print("Could not find revision pattern in page text.")
        print("First 800 chars of HTML so we can see what it contains:")
        print(resp.text[:800])


def part2_sample_records() -> None:
    print()
    print("=" * 60)
    print("PART 2: Sample of HTS export JSON")
    print("=" * 60)

    params = {
        "from": "0101.21",
        "to": "0101.30",
        "format": "JSON",
        "styles": "false",
    }
    resp = requests.get(EXPORT_URL, params=params, timeout=60)
    print(f"HTTP status: {resp.status_code}")
    print(f"Response size: {len(resp.content):,} bytes")

    if resp.status_code != 200:
        print("Body preview:")
        print(resp.text[:1000])
        return

    try:
        data = resp.json()
    except ValueError as e:
        print(f"Could not parse response as JSON: {e}")
        print("First 500 chars of body:")
        print(resp.text[:500])
        return

    print(f"Top-level type: {type(data).__name__}")

    if isinstance(data, list):
        print(f"Number of records returned: {len(data)}")
        if not data:
            print("(empty list — try a different range)")
            return

        print()
        print("--- First record ---")
        print(json.dumps(data[0], indent=2))
        print()
        print("Field names in first record:")
        for k in data[0].keys():
            print(f"  - {k}")

        if len(data) > 1:
            print()
            print("--- Second record (for comparison) ---")
            print(json.dumps(data[1], indent=2))
    else:
        print("Unexpected top-level structure. Pretty-printed (truncated):")
        print(json.dumps(data, indent=2)[:1500])


def main() -> int:
    part1_revision_number()
    part2_sample_records()
    return 0


if __name__ == "__main__":
    sys.exit(main())
