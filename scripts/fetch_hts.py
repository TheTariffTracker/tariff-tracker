"""
fetch_hts.py — Sync the USITC Harmonized Tariff Schedule into Supabase.

Logic:
  1. Download the full HTS dataset (JSON) from USITC's export endpoint.
  2. SHA-256 hash the raw response; compare to the hash stored in
     system_state.hts_revision_hash.
       - Hash unchanged   -> log "no change" and exit (no DB writes).
       - Hash changed     -> upsert all records into hts_codes,
                             then update system_state with the new hash.
  3. Records with empty `htsno` (hierarchy headers) are skipped — only leaf
     and intermediate codes are stored.
  4. The fields section_301_rate, section_232_rate, executive_rate, and
     total_rate are LEFT NULL during Phase 2. Yale Budget Lab's logic in
     Phase 3 derives them from the `footnotes` JSONB column.

Run from the project root:
    python -m scripts.fetch_hts            # real run; writes to Supabase
    python -m scripts.fetch_hts --dry-run  # do everything except the writes

Schedule (production): daily at 6:00 AM ET via GitHub Actions.
"""

import hashlib
import json
import sys
from datetime import date

from scripts.db import SESSION, get_state, set_state, upsert


# ---------- USITC ----------
HTS_EXPORT_URL = "https://hts.usitc.gov/reststop/exportList"
HTS_EXPORT_PARAMS = {
    "from": "0100",
    "to": "9999",
    "format": "JSON",
    "styles": "false",
}
HTS_FETCH_TIMEOUT = 180  # seconds — full export is multi-MB

MIN_EXPECTED_RECORDS = 1000  # refuse to overwrite if API returned suspiciously little


def fetch_hts_dataset() -> tuple[bytes, list[dict]]:
    """Download the full HTS export. Returns (raw_bytes, parsed_list)."""
    print(f"Fetching HTS export from {HTS_EXPORT_URL} ...")
    resp = SESSION.get(
        HTS_EXPORT_URL,
        params=HTS_EXPORT_PARAMS,
        timeout=HTS_FETCH_TIMEOUT,
    )
    resp.raise_for_status()
    print(f"  HTTP {resp.status_code}, {len(resp.content):,} bytes")

    data = resp.json()
    if not isinstance(data, list):
        raise ValueError(f"Expected a JSON list, got {type(data).__name__}")
    print(f"  Parsed {len(data):,} records")
    return resp.content, data


def compute_hash(raw_bytes: bytes) -> str:
    return hashlib.sha256(raw_bytes).hexdigest()


def map_record(usitc_record: dict, revision_label: str) -> dict | None:
    """Map a USITC JSON record to a hts_codes row. Returns None to skip."""
    hts_code = (usitc_record.get("htsno") or "").strip()
    if not hts_code:
        return None  # Header/parent row — no actual code to store

    footnotes = usitc_record.get("footnotes")
    footnotes_value = footnotes if footnotes else None

    def empty_to_none(v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    return {
        "hts_code": hts_code,
        "description": (usitc_record.get("description") or "").strip(),
        "general_rate": empty_to_none(usitc_record.get("general")),
        "special_rate": empty_to_none(usitc_record.get("special")),
        "column2_rate": empty_to_none(usitc_record.get("other")),
        "footnotes": footnotes_value,
        "raw_data": usitc_record,
        "hts_revision": revision_label,
        # section_301_rate, section_232_rate, executive_rate, total_rate
        # intentionally OMITTED — they default to NULL in the table.
    }


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    if dry_run:
        print("*** DRY RUN — no writes will be made to Supabase ***")

    # 1. Fetch USITC data
    raw_bytes, records = fetch_hts_dataset()

    # 2. Hash + compare
    new_hash = compute_hash(raw_bytes)
    print(f"Dataset hash: {new_hash[:16]}...")

    old_hash = get_state("hts_revision_hash")
    if old_hash == new_hash:
        print("Hash matches stored value. No change. Exiting.")
        return 0
    if old_hash is None:
        print("No prior hash stored — first run.")
    else:
        print(f"Hash differs from stored ({old_hash[:16]}...). Will upsert.")

    # 3. Map records
    revision_label = f"fetched-{date.today().isoformat()}"
    mapped = []
    skipped = 0
    for r in records:
        m = map_record(r, revision_label)
        if m is None:
            skipped += 1
        else:
            mapped.append(m)
    print(
        f"Mapped {len(mapped):,} records "
        f"(skipped {skipped:,} hierarchy/header rows)"
    )

    # 4. Sanity check
    if len(mapped) < MIN_EXPECTED_RECORDS:
        print(
            f"REFUSING TO WRITE: only {len(mapped)} records mapped "
            f"(< {MIN_EXPECTED_RECORDS}). API may have returned bad data. "
            f"Aborting without modifying Supabase."
        )
        return 1

    # 5. Upsert
    if dry_run:
        print(f"DRY RUN: would upsert {len(mapped):,} rows.")
        print("DRY RUN: would update system_state with new hash.")
        print("DRY RUN: sample mapped row:")
        print(json.dumps(mapped[0], indent=2)[:800])
        return 0

    upsert("hts_codes", mapped, on_conflict="hts_code", progress_label="Upserted")

    # 6. Store new hash
    set_state("hts_revision_hash", new_hash)
    print("Stored new hash in system_state.")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
