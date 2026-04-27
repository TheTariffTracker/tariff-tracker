"""
inspect_mts.py — Discovery script for Treasury MTS API.

UPDATE 2026-04-26: original blueprint pointed at mts_table_5, but that table
contains agency outlays (spending), not receipts. Customs DUTIES (revenue) are
in either Table 1 (Summary) or Table 2 (Receipts by Source). This script now
probes BOTH tables and prints whichever one contains the "Customs Duties" line.

Run from project root:
    python -m scripts.inspect_mts
"""

import json
import sys
from datetime import date

from scripts.db import SESSION


MTS_BASE = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/mts/"
)
TABLES_TO_PROBE = [
    ("mts_table_1", "(probing)"),
    ("mts_table_2", "(probing)"),
    ("mts_table_3", "(probing)"),
    ("mts_table_4", "(probing)"),
    ("mts_table_5", "(probing)"),
    ("mts_table_6", "(probing)"),
    ("mts_table_7", "(probing)"),
    ("mts_table_8", "(probing)"),
    ("mts_table_9", "(probing)"),
]


def fetch_table(table_endpoint: str, start: date, end: date) -> list[dict]:
    """Fetch all records from one MTS table over a date range, paged."""
    url = f"{MTS_BASE}{table_endpoint}/"
    all_records: list[dict] = []
    page = 1
    while True:
        params = {
            "filter": (
                f"record_date:gte:{start.isoformat()},"
                f"record_date:lte:{end.isoformat()}"
            ),
            "page[size]": "10000",
            "page[number]": str(page),
        }
        resp = SESSION.get(url, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        recs = data.get("data", [])
        all_records.extend(recs)
        meta = data.get("meta", {})
        total_pages = meta.get("total-pages", 1) or 1
        if page >= total_pages:
            break
        page += 1
    return all_records


def find_customs_duties(records: list[dict]) -> list[dict]:
    """Return records whose classification mentions customs *duties* specifically.

    We require both 'customs' and 'duties' (or 'duty') to avoid matching
    'Immigration and Customs Enforcement' / 'Customs and Border Protection'
    agency names.
    """
    matches = []
    for r in records:
        # Look at the human-readable label fields.
        label_fields = " ".join(
            str(r.get(k, "")) for k in (
                "classification_desc", "line_desc", "src_line_desc"
            )
        ).lower()
        if "customs" in label_fields and ("duties" in label_fields or "duty" in label_fields):
            matches.append(r)
    return matches


def main() -> int:
    today = date.today()
    # Use a narrow 3-month window to keep this scan fast across 9 tables.
    start = date(2026, 1, 1)

    for endpoint, friendly_name in TABLES_TO_PROBE:
        print("=" * 70)
        print(f"PROBING {endpoint} — {friendly_name}")
        print(f"  URL: {MTS_BASE}{endpoint}/")
        print("=" * 70)

        try:
            records = fetch_table(endpoint, start, today)
        except Exception as e:
            print(f"  ERROR fetching {endpoint}: {e}")
            print()
            continue

        print(f"  Total records: {len(records):,}")
        if not records:
            print("  (empty — table may not exist or have no data in range)")
            print()
            continue

        # Show field names from first record (so we know what to expect)
        print(f"  Field names: {list(records[0].keys())}")

        # Look for customs duties
        customs = find_customs_duties(records)
        print(f"  Customs-DUTIES records found: {len(customs)}")

        if customs:
            distinct_labels = sorted({
                r.get("classification_desc") or r.get("line_desc") or "?"
                for r in customs
            })
            print(f"  *** CUSTOMS DUTIES FOUND IN {endpoint} ***")
            print(f"  Distinct customs-duties labels:")
            for lbl in distinct_labels:
                print(f"    - {lbl!r}")
            latest = max(customs, key=lambda r: r.get("record_date", ""))
            print()
            print("  Sample (most recent customs-duties record):")
            print(json.dumps(latest, indent=4))
        else:
            # Show any labels that mention "customs" anywhere (might be the
            # right table even if our DUTIES heuristic missed)
            label_field = None
            for cand in ("classification_desc", "line_desc", "src_line_desc"):
                if cand in records[0]:
                    label_field = cand
                    break
            if label_field:
                customs_mentions = sorted({
                    r.get(label_field, "")
                    for r in records
                    if "customs" in (r.get(label_field, "") or "").lower()
                })
                if customs_mentions:
                    print(f"  No 'customs duties' match, but these labels"
                          f" mention 'customs':")
                    for lbl in customs_mentions:
                        print(f"    - {lbl!r}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
