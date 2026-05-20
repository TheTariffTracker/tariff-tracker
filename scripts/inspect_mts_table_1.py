"""
inspect_mts_table_1.py — MTS receipts-by-source discovery.

Despite the filename, neither Table 1 (deficit/surplus summary keyed by
month) nor Table 2 (means of financing) contains the categorized federal
receipts we need. **Table 4 returned 57 rows on its previous probe — that's
the detailed receipts breakdown.** This run dumps the full Table 4
contents so we can see every category (Individual Income Tax, Corporation,
Social Insurance, Customs, etc.).

For comparison this also probes Table 3 (just in case it's the right one).

Run from project root:
    python -m scripts.inspect_mts_table_1
"""

import sys
from collections import defaultdict

from scripts.db import SESSION


MTS_BASE = (
    "https://api.fiscaldata.treasury.gov"
    "/services/api/fiscal_service/v1/accounting/mts/"
)

PROBE_RECORD_DATE = "2025-09-30"


def fetch_records(table_name: str, record_date: str) -> list[dict]:
    url = f"{MTS_BASE}{table_name}/"
    params = {
        "filter": f"record_date:eq:{record_date}",
        "page[size]": "10000",
        "page[number]": "1",
    }
    resp = SESSION.get(url, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json().get("data", [])


def dump_table(table_name: str, rows: list[dict]) -> None:
    print(f"=== {table_name} ({len(rows)} rows for {PROBE_RECORD_DATE}) ===\n")
    if not rows:
        print("  (no data)\n")
        return

    # Field names from first row
    print("--- Field names ---")
    for k in rows[0].keys():
        print(f"  {k}")
    print()

    # Group rows by parent_id so we see hierarchy. Treasury MTS tables use
    # parent_id to nest line items beneath totals.
    by_parent: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_parent[r.get("parent_id") or "null"].append(r)

    print("--- All rows (label · key amounts · indent reflects nesting) ---")
    seen = set()

    def render(parent_key: str, depth: int) -> None:
        for r in by_parent.get(parent_key, []):
            cid = r.get("classification_id")
            if cid in seen:
                continue
            seen.add(cid)
            label = (
                r.get("classification_desc")
                or r.get("line_desc")
                or "(unknown label)"
            )
            cm_net = r.get("current_month_net_rcpt_amt") or r.get("current_month_gross_rcpt_amt") or "-"
            fytd_net = r.get("current_fytd_net_rcpt_amt") or r.get("current_fytd_gross_rcpt_amt") or "-"
            indent = "  " * depth
            print(f"{indent}- [{cid}] {label!r:55s}  cm={cm_net}  fytd={fytd_net}")
            render(cid, depth + 1)

    # Top-level rows have parent_id == "null"
    render("null", 0)

    # Catch any orphans we didn't reach via the tree walk
    orphans = [r for r in rows if r.get("classification_id") not in seen]
    if orphans:
        print("\n--- Orphan rows (no parent reachable) ---")
        for r in orphans:
            cid = r.get("classification_id")
            label = (
                r.get("classification_desc")
                or r.get("line_desc")
                or "(unknown label)"
            )
            cm = r.get("current_month_net_rcpt_amt") or r.get("current_month_gross_rcpt_amt") or "-"
            print(f"  - [{cid}] parent={r.get('parent_id')} {label!r}  cm={cm}")
    print()


def main() -> int:
    for table_name in ("mts_table_4", "mts_table_3"):
        rows = fetch_records(table_name, PROBE_RECORD_DATE)
        dump_table(table_name, rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
