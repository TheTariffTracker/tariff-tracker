"""
test_connection.py — Verify the script can reach Supabase and authenticate.

Run from the project root with:
    python -m scripts.test_connection

Expected output on success:
    Rows in hts_codes: 29,583
    Connection OK.
"""

import sys

from scripts.db import count_rows


def main() -> int:
    try:
        count = count_rows("hts_codes")
    except Exception as e:
        print(f"Connection FAILED: {e}")
        return 1
    print(f"Rows in hts_codes: {count:,}")
    print("Connection OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
