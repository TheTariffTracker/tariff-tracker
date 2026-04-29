"""
inspect_adcvd.py — Discovery script for ITA AD/CVD orders API.

Goals:
  1. Find the working endpoint URL for AD/CVD orders.
  2. See whether an API key is required.
  3. Get the field structure of an order record.
  4. Estimate volume.

The blueprint listed `https://api.trade.gov/v1/` but didn't specify the exact
endpoint. ITA has reorganized its trade-data APIs multiple times. This script
probes the most likely candidates and reports which works.

Run from project root:
    python -m scripts.inspect_adcvd
"""

import json
import sys

from scripts.db import SESSION


CANDIDATE_URLS = [
    # Most-likely current endpoints based on api.trade.gov directory
    "https://api.trade.gov/gateway/v1/ada_cvd/cases/search",
    "https://api.trade.gov/gateway/v1/ada_cvd/cases",
    "https://api.trade.gov/gateway/v1/ad_cvd/cases/search",
    "https://api.trade.gov/gateway/v1/ad_cvd/cases",
    "https://api.trade.gov/v1/ada_cvd/cases/search",
    "https://api.trade.gov/v1/ada_cvd/cases",
    "https://api.trade.gov/v1/ad_cvd/cases/search",
    "https://api.trade.gov/v1/ad_cvd/cases",
    # Legacy candidates
    "https://api.trade.gov/v1/ad_cvd",
    "https://developer.trade.gov/api/v1/ad_cvd",
]


def probe(url: str) -> tuple[int, str]:
    """Try fetching a URL, return (status_code, snippet)."""
    try:
        resp = SESSION.get(url, params={"size": 5}, timeout=15)
        snippet = resp.text[:300] if resp.text else ""
        return resp.status_code, snippet
    except Exception as e:
        return 0, f"ERROR: {e}"


def main() -> int:
    print("=" * 70)
    print("Probing candidate endpoints for ITA AD/CVD orders")
    print("=" * 70)

    working_url: str | None = None
    for url in CANDIDATE_URLS:
        code, snippet = probe(url)
        marker = "✓" if code == 200 else " "
        print(f"  {marker} {code:3d}  {url}")
        if code == 200 and not working_url:
            working_url = url
        elif code == 401 or code == 403:
            print(f"      (auth required: {snippet[:200]})")

    if not working_url:
        print()
        print("None of the candidate URLs returned 200.")
        print("ITA may have moved the endpoint or now requires an API key.")
        return 1

    print()
    print("=" * 70)
    print(f"Sample response from: {working_url}")
    print("=" * 70)
    resp = SESSION.get(working_url, params={"size": 3}, timeout=30)
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")
    try:
        data = resp.json()
    except ValueError:
        print(f"  Body (not JSON): {resp.text[:1500]}")
        return 1

    print(f"  Top-level type: {type(data).__name__}")
    if isinstance(data, dict):
        print(f"  Top-level keys: {list(data.keys())}")
        # Common shape: {'total': N, 'results': [...]}
        results = data.get("results") or data.get("data") or data.get("hits") or []
    elif isinstance(data, list):
        results = data
    else:
        results = []

    print(f"  Records returned: {len(results)}")

    if results:
        sample = results[0]
        print()
        print("  First record:")
        print(json.dumps(sample, indent=2)[:2000])
        print()
        print("  Field names:")
        if isinstance(sample, dict):
            for k in sample.keys():
                print(f"    - {k}")

    print()
    print("=" * 70)
    print("Total record count probe (size=1, total field):")
    print("=" * 70)
    resp = SESSION.get(working_url, params={"size": 1}, timeout=30)
    if resp.status_code == 200:
        d = resp.json()
        if isinstance(d, dict):
            total = d.get("total") or d.get("count") or d.get("total_count")
            print(f"  Total reported: {total}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
