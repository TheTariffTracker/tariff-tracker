"""
test_connection.py — Verify the script can reach Supabase and authenticate.

Run from the project root with:
    python scripts/test_connection.py

Expected output on success:
    Status: 200
    Rows in hts_codes: 0   (or some number, if data already exists)
    Connection OK.
"""

import os
import sys
import requests
from dotenv import load_dotenv


def main() -> int:
    # Load .env from the project root (the parent directory of this script).
    load_dotenv()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env")
        return 1

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        # Prefer header asks PostgREST to return an exact row count.
        "Prefer": "count=exact",
    }

    # HEAD request returns headers only (no body), with the row count in
    # the Content-Range header. Cheaper than GETing rows we don't need.
    endpoint = f"{url}/rest/v1/hts_codes"
    response = requests.head(endpoint, headers=headers, timeout=15)

    print(f"Status: {response.status_code}")

    if response.status_code != 200:
        print(f"Response body: {response.text}")
        print("Connection FAILED.")
        return 1

    # Content-Range looks like "0-0/123" — the number after the slash is the count.
    content_range = response.headers.get("Content-Range", "")
    if "/" in content_range:
        row_count = content_range.split("/")[-1]
        print(f"Rows in hts_codes: {row_count}")
    else:
        print(f"Could not parse row count from Content-Range: {content_range!r}")

    print("Connection OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
