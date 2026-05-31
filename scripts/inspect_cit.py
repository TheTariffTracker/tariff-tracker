"""Discovery script for the CIT slip-opinions scraper (Phase 3.65, tool #5).

READ-ONLY. Fetches a Court of International Trade slip-opinions year page and
dumps the raw HTML of the opinions table's header + first several data rows,
plus a parsed text preview. The point is to SEE exactly how the Drupal table
encodes its cells before writing the production parser:
  - how consolidated cases pack multiple captions / court numbers / judges
    into one cell (<br>? separate <p>? newlines?)
  - how the italic editorial notes ("confidential", "Public version: ...",
    "Errata: ...") are tagged (<em>? <i>?)
  - how the PDF link is attached (and that confidential rows have none)

Mirrors the existing scripts/inspect_*.py discovery pattern. Run it, paste the
output back, and the production scraper gets written against the real markup.

Usage:
    python -m scripts.inspect_cit          # 2026 page (default)
    python -m scripts.inspect_cit 2025     # a specific year
"""

import sys

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependency. Install with:")
    print("    pip install requests beautifulsoup4 --break-system-packages")
    raise

BASE = "https://www.cit.uscourts.gov/content/slip-opinions-{year}"
UA = "Mozilla/5.0 (TariffTracker discovery script; +https://tarifftracker.org)"


def find_opinions_table(soup: "BeautifulSoup"):
    """The opinions table is the one whose header mentions Jurisdiction + Caption."""
    for t in soup.find_all("table"):
        head = t.get_text(" ", strip=True)[:300].lower()
        if "jurisdiction" in head and "caption" in head:
            return t
    return None


def main(argv: list[str]) -> int:
    year = argv[0] if argv else "2026"
    url = BASE.format(year=year)
    print(f"Fetching {url}")
    resp = requests.get(url, headers={"User-Agent": UA}, timeout=60)
    resp.raise_for_status()
    print(f"Status {resp.status_code} | {len(resp.text)} bytes\n")

    soup = BeautifulSoup(resp.text, "html.parser")
    table = find_opinions_table(soup)
    if table is None:
        print("!! Could not locate the opinions table. Tables on page:")
        for i, t in enumerate(soup.find_all("table")):
            firsts = [c.get_text(strip=True) for c in t.find_all(["th", "td"])[:6]]
            print(f"  table[{i}] class={t.get('class')} first_cells={firsts}")
        return 1

    print("=== TABLE attrs ===")
    print(f"class={table.get('class')}  id={table.get('id')}\n")

    rows = table.find_all("tr")
    print(f"=== {len(rows)} <tr> rows total ===\n")

    print("=== RAW HTML: header + first 5 data rows ===\n")
    for i, tr in enumerate(rows[:6]):
        print(f"---------- row {i} ----------")
        print(tr.prettify())

    print("\n=== PARSED PREVIEW: first 8 data rows ===")
    print("(cell text with <br>/newlines shown as ' / '; PDF href flagged)\n")
    for tr in rows[1:9]:
        cells = tr.find_all(["td", "th"])
        out = []
        for c in cells:
            txt = c.get_text(" / ", strip=True)
            a = c.find("a", href=True)
            href = a["href"] if a else ""
            ital = c.find(["em", "i"])
            note = ital.get_text(" ", strip=True) if ital else ""
            piece = repr(txt)
            if href:
                piece += f"  [PDF:{href}]"
            if note:
                piece += f"  [ITALIC<{ital.name}>:{note!r}]"
            out.append(piece)
        print(" |#| ".join(out))
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
