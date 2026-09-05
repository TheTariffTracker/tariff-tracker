"""
prepare_rate_panel.py — Turn the merged rate panel into a query-optimized
parquet for point lookups over HTTP (Step 3 prep / spike support).

Why this matters (measured 2026-07-22):
  DuckDB answers a (hts10, country, date) lookup by reading only the parquet
  row groups whose hts10 min/max span the queried code — IF the file is sorted
  by hts10. On a sorted sample a lookup read ~63 KiB (1 row group); the SAME
  data shuffled forced reading the whole file (~290x more bytes). So sorting is
  the difference between a fast serverless lookup and downloading 143 MB per
  query.

What it does:
  Reads the merged panel from merge_yale_snapshots.py and rewrites it sorted by
  (hts10, country, valid_from) with a fixed ROW_GROUP_SIZE, so every row group
  covers a tight, contiguous hts10 range and carries useful min/max statistics.
  Output is a single parquet ready to upload to Supabase Storage.

Row-group size:
  50,000 rows/group. On the full ~30.6M-row panel that is ~600 groups of
  ~235 KiB each — small enough that one lookup transfers a few hundred KiB, big
  enough to keep the footer (per-group metadata) modest.

Splitting (--parts):
  Supabase's free Storage tier caps a single file at 50 MB; the sorted panel is
  ~52-59 MB. --parts N splits it into N files, each a contiguous hts10 range, so
  no hts10 is ever split across files and each part stays under the cap. DuckDB
  reads all parts (pass them as a list) and still prunes to the single row group
  the lookup needs — files whose hts10 range excludes the key cost only a footer
  read. Sorted output also compresses better, so --level trades write time (none
  at read) for a smaller file.

Usage:
  python -m scripts.prepare_rate_panel <merged.parquet>
  python -m scripts.prepare_rate_panel <merged.parquet> --parts 2 --level 15
  python -m scripts.prepare_rate_panel <merged.parquet> --out <sorted.parquet>
  python -m scripts.prepare_rate_panel <merged.parquet> --mem 12GB \
      --row-group 50000

With --parts N > 1, output files are named <stem>_sorted_partK.parquet.
"""

import argparse
import os
import sys
import time
from pathlib import Path

try:
    import duckdb
except ImportError:
    print("ERROR: duckdb not installed. Run: pip install duckdb")
    sys.exit(1)


def _copy_sorted(con, select_from: str, dest: Path, level: int, row_group: int) -> tuple[float, int]:
    """COPY a sorted, zstd-compressed parquet to dest; return (MB, row_groups)."""
    con.execute(
        f"COPY ({select_from} ORDER BY hts10, country, valid_from) "
        f"TO '{dest}' (FORMAT parquet, COMPRESSION zstd, "
        f"COMPRESSION_LEVEL {level}, ROW_GROUP_SIZE {row_group})"
    )
    groups = con.execute(
        f"SELECT count(DISTINCT row_group_id) FROM parquet_metadata('{dest}')"
    ).fetchone()[0]
    return os.path.getsize(dest) / 1e6, groups


def prepare(src: Path, out: Path, mem: str, threads: int, row_group: int,
            level: int, parts: int) -> None:
    if not src.exists():
        print(f"ERROR: file not found: {src}", file=sys.stderr)
        sys.exit(1)

    con = duckdb.connect()
    con.execute(f"PRAGMA memory_limit='{mem}'")
    con.execute(f"PRAGMA threads={threads}")
    tmp = str(out.parent / "_prep_tmp")
    os.makedirs(tmp, exist_ok=True)
    con.execute(f"PRAGMA temp_directory='{tmp}'")

    n = con.execute(f"SELECT count(*) FROM read_parquet('{src}')").fetchone()[0]
    print(f"input rows: {n:,}  (zstd level {level}, {parts} part(s))")

    t = time.time()
    if parts <= 1:
        mb, groups = _copy_sorted(con, f"SELECT * FROM read_parquet('{src}')",
                                  out, level, row_group)
        print(f"wrote {out.name}  ({mb:.1f} MB, {groups} row groups)")
    else:
        # Assign each DISTINCT hts10 to a part via NTILE so no code is split
        # across files and every part is a contiguous, sorted hts10 range.
        con.execute(
            f"CREATE TEMP TABLE _codes AS "
            f"SELECT hts10, ntile({parts}) OVER (ORDER BY hts10) AS part "
            f"FROM (SELECT DISTINCT hts10 FROM read_parquet('{src}'))"
        )
        total = 0.0
        for k in range(1, parts + 1):
            dest = out.with_name(f"{out.stem}_part{k}.parquet")
            sel = (f"SELECT s.* FROM read_parquet('{src}') s "
                   f"JOIN _codes c USING (hts10) WHERE c.part = {k}")
            mb, groups = _copy_sorted(con, sel, dest, level, row_group)
            total += mb
            print(f"  {dest.name}: {mb:.1f} MB, {groups} row groups"
                  + ("  !! OVER 50MB" if mb > 50 else ""))
        print(f"total across {parts} parts: {total:.1f} MB")

    print(f"done in {time.time() - t:.0f}s. Sorted by (hts10, country, valid_from).")

    try:
        for f in Path(tmp).glob("*"):
            f.unlink()
        Path(tmp).rmdir()
    except OSError:
        pass


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Sort + tune the merged rate panel for lookups.")
    ap.add_argument("src", type=Path, help="merged parquet from merge_yale_snapshots.py")
    ap.add_argument("--out", type=Path, default=None,
                    help="output (default: <src stem>_sorted.parquet next to src)")
    ap.add_argument("--mem", default="12GB", help="DuckDB memory_limit (default 12GB)")
    ap.add_argument("--threads", type=int, default=4, help="DuckDB threads (default 4)")
    ap.add_argument("--row-group", type=int, default=50000, help="rows per row group (default 50000)")
    ap.add_argument("--level", type=int, default=15,
                    help="zstd compression level 1-22 (default 15; higher = smaller "
                         "file, slower write, same read speed)")
    ap.add_argument("--parts", type=int, default=1,
                    help="split output into N hts10-contiguous files under the 50MB "
                         "free-tier cap (default 1 = single file)")
    ap.add_argument("--vintage", default=None,
                    help="vintage id (e.g. 2026-07-21-08). When set, output files are "
                         "named rate_panel_<vintage>_sorted[_partK].parquet so each "
                         "vintage has unique filenames (no stale-cache collisions on swap).")
    ap.add_argument("--base-url", default=None,
                    help="Storage public URL prefix for this bucket (e.g. "
                         "https://<proj>.supabase.co/storage/v1/object/public/rate-panel/). "
                         "When given with --vintage, writes current.json listing the part "
                         "URLs + vintage — upload it to the bucket to point the live app "
                         "at this vintage (no redeploy).")
    args = ap.parse_args(argv)

    if args.out:
        out = args.out
    elif args.vintage:
        out = args.src.with_name(f"rate_panel_{args.vintage}_sorted.parquet")
    else:
        out = args.src.with_name(args.src.stem + "_sorted.parquet")
    prepare(args.src, out, args.mem, args.threads, args.row_group, args.level, args.parts)

    # Emit current.json (the "current vintage" pointer the app reads) when we
    # know both the vintage and the Storage URL prefix.
    if args.vintage and args.base_url:
        base = args.base_url if args.base_url.endswith("/") else args.base_url + "/"
        if args.parts <= 1:
            names = [out.name]
        else:
            names = [out.with_name(f"{out.stem}_part{k}.parquet").name
                     for k in range(1, args.parts + 1)]
        manifest = {"vintage": args.vintage, "parts": [base + n for n in names]}
        cj = out.with_name("current.json")
        cj.write_text(__import__("json").dumps(manifest, indent=2))
        print(f"wrote {cj} — upload it + the part file(s) to Storage to go live.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
