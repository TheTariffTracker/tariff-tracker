"""
inspect_dts_categories.py — Find every distinct customs/duty-related
transaction_catg value Treasury has used since 2025-01-01, plus the date
range each label covered.

Why this exists: fetch_dts.py's strict filter on
"DHS - Customs Duties, Taxes, and Fees" only returned ~1/3 of expected
business days, suggesting Treasury renamed the line mid-period. We need
to know all the historical names to filter correctly.

Run from project root:
    python -m scripts.inspect_dts_categories
"""

import sys
from datetime import date

from scripts.db import SESSION


DTS_URL = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/dts/deposits_withdrawals_operating_cash/"
)


def main() -> int:
    today = date.today()
    start = date(2025, 1, 1)

    all_records: list[dict] = []
    page = 1
    while True:
        params = {
            "filter": (
                f"transaction_type:eq:Deposits,"
                f"record_date:gte:{start.isoformat()},"
                f"record_date:lte:{today.isoformat()}"
            ),
            "fields": "record_date,transaction_catg,transaction_today_amt",
            "page[size]": "10000",
            "page[number]": str(page),
        }
        print(f"Fetching page {page} ...")
        resp = SESSION.get(DTS_URL, params=params, timeout=90)
        resp.raise_for_status()
        data = resp.json()
        records = data.get("data", [])
        all_records.extend(records)
        meta = data.get("meta", {})
        total_pages = meta.get("total-pages", 1) or 1
        if page >= total_pages:
            break
        page += 1
    print(f"Total Deposits records: {len(all_records):,}\n")

    # Collect customs/duty-related categories
    categories: dict[str, dict] = {}
    for r in all_records:
        catg = r.get("transaction_catg", "") or ""
        low = catg.lower()
        if "customs" not in low and "duties" not in low:
            continue
        d = r.get("record_date")
        if not d:
            continue
        info = categories.setdefault(
            catg,
            {"count": 0, "first": d, "last": d, "sample_amt": None},
        )
        info["count"] += 1
        if d < info["first"]:
            info["first"] = d
        if d > info["last"]:
            info["last"] = d
        if info["sample_amt"] is None:
            info["sample_amt"] = r.get("transaction_today_amt")

    print(f"=== Customs/duty-related categories found ({len(categories)}) ===")
    for catg in sorted(categories.keys()):
        info = categories[catg]
        print()
        print(f"Category: {catg!r}")
        print(f"  Records:    {info['count']:,}")
        print(f"  Date range: {info['first']}  ->  {info['last']}")
        print(f"  Sample today_amt: {info['sample_amt']!r}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
