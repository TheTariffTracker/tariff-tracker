"""
merge_yale_snapshots.py — Interval-merge a staged Yale vintage's 54 daily
snapshots into a compact rate panel (Step 2 of the rate-panel pipeline).

Why:
  Yale ships the `actual/snapshots/valid_from=*/rates.parquet` panel as 54
  FULL re-emissions of the ~4.9M-row (hts10 x country) grid — one per policy
  revision — totalling ~262.6M rows. The vast majority of rows are identical
  from one snapshot to the next. This script reconstructs the compact
  interval panel we originally expected from Yale: for each (hts10, country)
  it collapses runs of consecutive snapshots that share an identical rate
  signature into a single [valid_from, valid_until] interval.

  Output = the `rate_panel` we load into Postgres (Step 3) and query for the
  calculator (code x country x date -> rate breakdown).

Method (gaps-and-islands):
  Per (hts10, country) ordered by valid_from, a new interval ("island")
  begins whenever the SIGNATURE changes. The signature is every column
  except the keys (hts10, country) and the interval metadata (revision,
  effective_date, valid_from, valid_until) — i.e. every rate / share / flag /
  type column. Change detection uses a 64-bit hash() of the signature for
  memory efficiency; Step 3's verifier reconstructs sampled dates against the
  raw snapshots to catch the astronomically unlikely hash collision.

  We keep the EARLIEST revision + effective_date of each island (the revision
  that introduced the rate now in force for that span).

Coverage is NOT contiguous for every (hts10, country). A small number of
HTS-10 codes appear in only some of the 54 snapshots — e.g. heading 3004.90
pharma lines drop out between 2026-01-31 and 2026-07-01 — because codes enter
and leave the schedule across HTS revisions. The merge PRESERVES these gaps
(it never fabricates coverage), so the panel can legitimately have a date with
no row for a given code x country. Step 3 / the calculator must treat "no
covering interval" as "code not in the tariff schedule on that date," not as
an error. Verified 2026-07-22: point reconstruction is exact (30/30 sampled
code x country x date checks matched the raw snapshot); the only gap/overlap
"violations" trace to these source-level code-lifecycle gaps.

Memory:
  Designed to run in <3 GB RAM. Snapshots are processed in batches of
  COUNTRIES (default 10); each batch's window sort operates on a slim
  (keys + valid_from + hash) projection, then joins island IDs back to the
  full rows for aggregation. A global single-pass sort of all 262M rows would
  need far more temp disk than a typical box has, hence the batching.

Usage:
  python -m scripts.merge_yale_snapshots <staged-vintage-dir>
  python -m scripts.merge_yale_snapshots <staged-vintage-dir> --out <path.parquet>
  python -m scripts.merge_yale_snapshots <staged-vintage-dir> --sample 5
  python -m scripts.merge_yale_snapshots <staged-vintage-dir> --batch 10 \
      --mem 2500MB --threads 2

<staged-vintage-dir> is the directory produced by ingest_yale_vintage.py, i.e.
the one containing `manifest.json` and `actual/snapshots/`.
"""

import argparse
import glob as _glob
import json
import os
import subprocess
import sys
import time
from pathlib import Path

try:
    import duckdb
except ImportError:
    print("ERROR: duckdb not installed. Run: pip install duckdb --break-system-packages")
    sys.exit(1)


# Columns that identify a row and describe its interval — everything else is
# part of the rate SIGNATURE that determines whether two snapshots merge.
KEY_COLS = ["hts10", "country"]
META_COLS = ["revision", "effective_date", "valid_from", "valid_until"]


def _connect(mem: str, threads: int, tmp: str):
    con = duckdb.connect()
    con.execute(f"PRAGMA memory_limit='{mem}'")
    con.execute(f"PRAGMA threads={threads}")
    # We never rely on row order (Step 3 indexes on load), and turning off
    # insertion-order preservation dramatically cuts the memory + temp-spill
    # footprint of the window/COPY pipeline — the difference between a bounded
    # run and tens of GB of spill on a big batch.
    con.execute("PRAGMA preserve_insertion_order=false")
    os.makedirs(tmp, exist_ok=True)
    con.execute(f"PRAGMA temp_directory='{tmp}'")
    return con


def _signature_cols(con, glob: str) -> list[str]:
    allcols = [r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{glob}', hive_partitioning=false)"
    ).fetchall()]
    sig = [c for c in allcols if c not in KEY_COLS + META_COLS]
    if not sig:
        raise ValueError("No signature columns found — schema unexpected.")
    return sig


def _merge_batch_sql(glob: str, sig: list[str], inlist: str) -> str:
    hashargs = ",".join(sig)
    anyval = ",\n      ".join(f"any_value({c}) AS {c}" for c in sig)
    return f"""
    WITH base AS (
      SELECT * FROM read_parquet('{glob}', hive_partitioning=false)
      WHERE country IN ({inlist})
    ),
    slim AS (
      SELECT hts10, country, valid_from, hash({hashargs}) AS h FROM base
    ),
    flagged AS (
      SELECT *, CASE WHEN h IS DISTINCT FROM lag(h) OVER w THEN 1 ELSE 0 END AS is_new
      FROM slim WINDOW w AS (PARTITION BY hts10, country ORDER BY valid_from)
    ),
    isl AS (
      SELECT hts10, country, valid_from,
             SUM(is_new) OVER (PARTITION BY hts10, country ORDER BY valid_from) AS island
      FROM flagged
    )
    SELECT b.hts10, b.country,
      {anyval},
      arg_min(b.revision, b.valid_from)        AS revision,
      arg_min(b.effective_date, b.valid_from)  AS effective_date,
      min(b.valid_from)                        AS valid_from,
      max(b.valid_until)                        AS valid_until,
      count(*)                                  AS n_snapshots_merged
    FROM base b JOIN isl USING (hts10, country, valid_from)
    GROUP BY b.hts10, b.country, island
    """


def merge_vintage(staged_dir: Path, out_path: Path, batch: int,
                  mem: str, threads: int, sample: int | None) -> dict:
    glob = str(staged_dir / "actual" / "snapshots" / "valid_from=*" / "rates.parquet")
    if not _glob.glob(glob):
        print(f"ERROR: no snapshot parquets under {glob}", file=sys.stderr)
        sys.exit(1)

    tmp = str(staged_dir / "_duck_tmp")
    # One short-lived connection just to read the schema + country list.
    con = _connect(mem, threads, tmp)
    sig = _signature_cols(con, glob)
    print(f"signature columns: {len(sig)}")
    countries = [r[0] for r in con.execute(
        f"SELECT DISTINCT country FROM read_parquet('{glob}', hive_partitioning=false) "
        f"ORDER BY country"
    ).fetchall()]
    con.close()
    if sample:
        countries = countries[:sample]
        print(f"--sample: limiting to first {len(countries)} countries")
    print(f"countries to process: {len(countries)}")

    parts_dir = staged_dir / "_merged_parts"
    parts_dir.mkdir(exist_ok=True)
    for f in parts_dir.glob("*.parquet"):
        f.unlink()

    # A FRESH connection per batch. DuckDB's buffer cache accumulates across
    # queries on a persistent connection; on a small box (≈4 GB RAM) that RSS
    # growth OOMs after a handful of country queries. Opening + closing per
    # batch releases everything between iterations.
    batches = [countries[i:i + batch] for i in range(0, len(countries), batch)]
    t0 = time.time()
    for bi, b in enumerate(batches):
        part = parts_dir / f"part_{bi:03d}.parquet"
        if part.exists() and part.stat().st_size > 0:
            continue  # resume: skip already-completed parts
        # Each batch runs in its OWN OS PROCESS. DuckDB does not reliably
        # return memory to the OS between in-process connections, so on a
        # small box RSS climbs until the OOM killer fires after a few
        # countries. A subprocess per batch guarantees full reclaim on exit,
        # and also makes the run resumable (completed parts are skipped above).
        cmd = [sys.executable, "-u", "-m", "scripts.merge_yale_snapshots",
               str(staged_dir), "--worker", str(part),
               "--mem", mem, "--threads", str(threads), "--_countries", *b]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not part.exists() or part.stat().st_size == 0:
            print(f"  WORKER FAILED on batch {bi} ({b}):\n{r.stderr[-800:]}",
                  file=sys.stderr)
            sys.exit(4)
        if bi % 5 == 0 or bi == len(batches) - 1:
            print(f"  batch {bi + 1}/{len(batches)}  t={time.time() - t0:.0f}s", flush=True)

    con = _connect(mem, threads, tmp)
    # Concatenate parts into the single output panel. No global ORDER BY —
    # a full sort of tens of millions of merged rows would spill more temp
    # than a small box has, and the Postgres load (Step 3) indexes anyway.
    out_path.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"COPY (SELECT * FROM read_parquet('{parts_dir}/*.parquet')) "
        f"TO '{out_path}' (FORMAT parquet, COMPRESSION zstd)"
    )

    raw_rows = con.execute(
        f"SELECT count(*) FROM read_parquet('{glob}', hive_partitioning=false)"
        + ("" if not sample else f" WHERE country IN ({','.join(chr(39)+c+chr(39) for c in countries)})")
    ).fetchone()[0]
    merged_rows = con.execute(f"SELECT count(*) FROM read_parquet('{out_path}')").fetchone()[0]
    size_mb = os.path.getsize(out_path) / 1e6

    stats = {
        "raw_rows": raw_rows,
        "merged_rows": merged_rows,
        "reduction_x": round(raw_rows / merged_rows, 2) if merged_rows else None,
        "out_path": str(out_path),
        "out_size_mb": round(size_mb, 1),
        "seconds": round(time.time() - t0, 1),
        "n_countries": len(countries),
    }
    print("\n--- merge complete ---")
    print(f"  raw rows     : {raw_rows:,}")
    print(f"  merged rows  : {merged_rows:,}")
    print(f"  reduction    : {stats['reduction_x']}x")
    print(f"  output       : {out_path}  ({size_mb:.1f} MB)")
    print(f"  elapsed      : {stats['seconds']}s")

    # clean scratch
    for f in parts_dir.glob("*.parquet"):
        f.unlink()
    (staged_dir / "_MERGE_STATS.json").write_text(json.dumps(stats, indent=1))
    return stats


def _run_worker(staged_dir: Path, part: Path, countries: list[str],
                mem: str, threads: int) -> int:
    """Single-batch worker: merge the given countries and write one part file.
    Runs as its own process (see merge_vintage) so memory is reclaimed on exit."""
    glob = str(staged_dir / "actual" / "snapshots" / "valid_from=*" / "rates.parquet")
    tmp = str(staged_dir / "_duck_tmp")
    con = _connect(mem, threads, tmp)
    sig = _signature_cols(con, glob)
    inlist = ",".join("'" + c.replace("'", "''") + "'" for c in countries)
    con.execute(
        f"COPY ({_merge_batch_sql(glob, sig, inlist)}) TO '{part}' "
        f"(FORMAT parquet, COMPRESSION zstd)"
    )
    con.close()
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Interval-merge staged Yale snapshots.")
    ap.add_argument("staged_dir", type=Path, help="Vintage dir from ingest_yale_vintage.py")
    ap.add_argument("--out", type=Path, default=None,
                    help="Output parquet (default: <staged_dir>/rate_panel_merged.parquet)")
    ap.add_argument("--batch", type=int, default=1,
                    help="Countries per batch/worker process (default 1; keeps peak "
                         "memory low on small boxes).")
    ap.add_argument("--mem", default="2500MB", help="DuckDB memory_limit (default 2500MB)")
    ap.add_argument("--threads", type=int, default=2, help="DuckDB threads (default 2)")
    ap.add_argument("--sample", type=int, default=None,
                    help="Only process the first N countries (quick test).")
    # Internal: single-batch worker invocation (not for direct use).
    ap.add_argument("--worker", type=Path, default=None, help=argparse.SUPPRESS)
    ap.add_argument("--_countries", nargs="+", default=None, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)

    if args.worker is not None:
        return _run_worker(args.staged_dir, args.worker, args._countries,
                           args.mem, args.threads)

    out = args.out or (args.staged_dir / "rate_panel_merged.parquet")
    merge_vintage(args.staged_dir, out, args.batch, args.mem, args.threads, args.sample)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
