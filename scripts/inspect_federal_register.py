"""
inspect_federal_register.py — Discovery script for the Federal Register API.

Goals:
  1. Confirm endpoint URL and basic search syntax.
  2. See the field structure of a document record.
  3. Get a feel for volume: how many tariff-related documents exist
     since 2025-01-01?
  4. Confirm pagination behavior and total document count.

Run from project root:
    python -m scripts.inspect_federal_register
"""

import json
import sys
from datetime import date

from scripts.db import SESSION


FR_URL = "https://www.federalregister.gov/api/v1/documents.json"

# These mirror the keywords listed in the blueprint.
TEST_KEYWORDS = [
    "tariff",
    "Section 301",
    "Section 232",
    "Harmonized Tariff Schedule",
    "antidumping",
    "countervailing duty",
    "safeguard",
]


def fetch_one_page(term: str, gte_date: str, page: int) -> dict:
    params = {
        "conditions[term]": term,
        "conditions[publication_date][gte]": gte_date,
        "per_page": 100,
        "page": page,
        "order": "newest",
    }
    resp = SESSION.get(FR_URL, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def main() -> int:
    today = date.today()
    start = date(2025, 1, 1)

    print("=" * 70)
    print(f"Federal Register API discovery (publication_date >= {start})")
    print(f"URL: {FR_URL}")
    print("=" * 70)

    # ---------- Per-keyword counts ----------
    print()
    print("Document counts per keyword (just the metadata, no body fetch):")
    print()
    total_summary = {}
    for kw in TEST_KEYWORDS:
        try:
            data = fetch_one_page(kw, start.isoformat(), page=1)
        except Exception as e:
            print(f"  {kw!r}: ERROR -- {e}")
            continue
        count = data.get("count", "?")
        total_summary[kw] = count
        print(f"  {kw!r}: {count} matching documents")

    # ---------- Detailed look at one keyword ----------
    print()
    print("=" * 70)
    print("Sample full document structure (keyword: 'tariff', newest match):")
    print("=" * 70)
    data = fetch_one_page("tariff", start.isoformat(), page=1)
    results = data.get("results") or []
    if not results:
        print("  No results returned.")
        return 0
    sample = results[0]
    print(f"  Top-level field count: {len(sample)}")
    print()
    print("  Field names + brief value preview:")
    for k, v in sample.items():
        preview = repr(v)
        if len(preview) > 80:
            preview = preview[:77] + "..."
        print(f"    - {k}: {preview}")

    # Also show the next-level structure
    print()
    print("  Full first sample (compact JSON):")
    print(json.dumps(sample, indent=2)[:2500])

    # ---------- Pagination metadata ----------
    print()
    print("=" * 70)
    print("Pagination/meta from the 'tariff' query:")
    print("=" * 70)
    print(f"  count (total docs):    {data.get('count')}")
    print(f"  total_pages:           {data.get('total_pages')}")
    print(f"  next_page_url:         {data.get('next_page_url')}")
    print(f"  description:           {data.get('description')!r}")

    # ---------- Estimate combined unique document count ----------
    print()
    print("=" * 70)
    print("Combined fetch test: page 1 of all keywords merged, dedup by document_number")
    print("=" * 70)
    seen_numbers: set = set()
    for kw in TEST_KEYWORDS:
        try:
            data = fetch_one_page(kw, start.isoformat(), page=1)
        except Exception:
            continue
        for r in data.get("results") or []:
            num = r.get("document_number")
            if num:
                seen_numbers.add(num)
    print(f"  Unique document_numbers across page-1 of all keywords: {len(seen_numbers)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
