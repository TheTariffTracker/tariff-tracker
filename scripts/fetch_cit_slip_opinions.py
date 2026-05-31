"""fetch_cit_slip_opinions.py — scrape U.S. Court of International Trade slip
opinions into Supabase (Phase 3.65, tool #5).

Source: https://www.cit.uscourts.gov/content/slip-opinions-YYYY — a Drupal page
with one 6-column table (Number, Caption, Date, Court No., Judge, Jurisdiction).
The exact cell encoding was confirmed via scripts/inspect_cit.py:
  - Number cell: text, optionally wrapped in <a href> to the PDF. Confidential
    opinions have NO link (the public text isn't posted yet).
  - Caption cell: case name(s) split by <br>; an italic <em> holds editorial
    notes ("confidential", "Public version: ...", "Errata: ...", "Amended: ...").
  - Court No. / Judge: <br>-separated for consolidated cases.

Defensive by design: one malformed row is skipped, never crashes the run.
Idempotent: upserts on opinion_number ("YY-NN"), so re-scraping a year updates
amended/unsealed opinions in place.

Modes:
  (default)   current calendar year only — cheap daily run.
  --backfill  BASELINE_YEAR (2025) through the current year.
  --dry-run   parse + summarize + print samples; write nothing.
"""

import json
import sys
from datetime import date, datetime
from urllib.parse import urljoin

try:
    from bs4 import BeautifulSoup
except ImportError:
    print(
        "Missing dependency. Install with:\n"
        "    pip install beautifulsoup4 --break-system-packages",
        file=sys.stderr,
    )
    raise

from scripts.db import SESSION, upsert

HOST = "https://www.cit.uscourts.gov"
PAGE = HOST + "/content/slip-opinions-{year}"
BASELINE_YEAR = 2025
FETCH_TIMEOUT = 60
UA = "Mozilla/5.0 (TariffTracker CIT scraper; +https://tarifftracker.org)"


def fetch_year_html(year: int) -> str:
    resp = SESSION.get(
        PAGE.format(year=year), headers={"User-Agent": UA}, timeout=FETCH_TIMEOUT
    )
    resp.raise_for_status()
    return resp.text


def find_opinions_table(soup: "BeautifulSoup"):
    """The opinions table is the one whose header has Jurisdiction + Caption.
    The table has no class/id, so we identify it by content."""
    for t in soup.find_all("table"):
        head = t.get_text(" ", strip=True)[:300].lower()
        if "jurisdiction" in head and "caption" in head:
            return t
    return None


def _cell_lines(cell) -> list[str]:
    """A cell's text split on <br>, trimmed, with empties dropped."""
    txt = cell.get_text("\n", strip=True)
    return [ln.strip() for ln in txt.split("\n") if ln.strip()]


def _parse_date(mmddyyyy: str) -> str | None:
    try:
        return datetime.strptime(mmddyyyy.strip(), "%m/%d/%Y").date().isoformat()
    except ValueError:
        return None


def parse_row(tr) -> dict | None:
    cells = tr.find_all("td")
    if len(cells) < 6:
        return None  # header row (<th>) or malformed

    num_cell, cap_cell, date_cell, court_cell, judge_cell, juris_cell = cells[:6]

    opinion_number = num_cell.get_text(strip=True)
    if not opinion_number:
        return None

    link = num_cell.find("a", href=True)
    pdf_url = urljoin(HOST, link["href"]) if link else None

    # Editorial notes live in <em>; capture them, then strip for a clean caption.
    notes = [e.get_text(" ", strip=True) for e in cap_cell.find_all("em")]
    editorial_note = " ".join(n for n in notes if n) or None
    cap_clone = BeautifulSoup(str(cap_cell), "html.parser")
    for e in cap_clone.find_all("em"):
        e.extract()
    caption = "; ".join(_cell_lines(cap_clone)) or None

    decision_date = _parse_date(date_cell.get_text(strip=True))
    court_number = "; ".join(_cell_lines(court_cell)) or None
    judge = "; ".join(_cell_lines(judge_cell)) or None
    jurisdiction = juris_cell.get_text(" ", strip=True) or None

    is_confidential = (
        pdf_url is None
        and editorial_note is not None
        and "confidential" in editorial_note.lower()
    )

    # Year from the "YY-" prefix (e.g. "26-56" -> 2026), else from the date.
    year = None
    head = opinion_number.split("-", 1)[0].strip()
    if head.isdigit() and len(head) == 2:
        year = 2000 + int(head)
    elif decision_date:
        year = int(decision_date[:4])

    return {
        "opinion_number": opinion_number,
        "decision_date": decision_date,
        "caption": caption,
        "court_number": court_number,
        "judge": judge,
        "jurisdiction": jurisdiction,
        "pdf_url": pdf_url,
        "editorial_note": editorial_note,
        "is_confidential": is_confidential,
        "year": year,
    }


def scrape_year(year: int) -> list[dict]:
    soup = BeautifulSoup(fetch_year_html(year), "html.parser")
    table = find_opinions_table(soup)
    if table is None:
        print(f"  !! {year}: opinions table not found — skipping.", file=sys.stderr)
        return []
    rows = [r for tr in table.find_all("tr") if (r := parse_row(tr))]
    print(f"  {year}: parsed {len(rows)} opinions")
    return rows


def main(argv: list[str]) -> int:
    dry_run = "--dry-run" in argv
    backfill = "--backfill" in argv
    if dry_run:
        print("*** DRY RUN — no writes will be made ***")

    current_year = date.today().year
    years = (
        list(range(BASELINE_YEAR, current_year + 1)) if backfill else [current_year]
    )
    print(f"Scraping CIT slip opinions for: {years}")

    all_rows: list[dict] = []
    for y in years:
        all_rows.extend(scrape_year(y))

    # Dedup defensively by opinion_number (YY- prefix keeps years distinct).
    rows = list({r["opinion_number"]: r for r in all_rows}.values())
    print(f"Total unique opinions: {len(rows)}")

    if not rows:
        print("Nothing to write.")
        return 0

    if dry_run:
        with_pdf = sum(1 for r in rows if r["pdf_url"])
        confidential = sum(1 for r in rows if r["is_confidential"])
        print(
            f"DRY RUN: would upsert {len(rows)} rows "
            f"({with_pdf} with public PDF, {confidential} confidential)."
        )
        print("Sample rows:")
        for r in rows[:3]:
            print(json.dumps(r, indent=2))
        return 0

    upsert(
        "cit_slip_opinions",
        rows,
        on_conflict="opinion_number",
        progress_label="Upserted",
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
