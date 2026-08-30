"""
ingest_yale_vintage.py — Stage + verify one Budget Lab @ Yale tariff-rate
"vintage" release archive (Step 1 of the rate-panel pipeline).

Context (2026-07):
  Yale ABANDONED the old `release/data/` folder approach. They now publish
  each vintage as a GitHub *Release* whose primary asset is a single large
  zip, e.g. `tariff-rate-tracker_2026-07-21-08.zip` (~659 MB), tags v1.0+.
  See scripts/merge_yale_snapshots.py for Step 2 (interval merge) and the
  Yale-feed reference note for the full landscape.

What this script does:
  1. Accept a LOCAL path to a vintage zip (download is handled separately /
     manually for now — Q2 to John re: per-file assets is still open, so we
     assume the monolithic zip).
  2. Read `manifest.json` from inside the archive WITHOUT full extraction.
  3. GUARD: hard-fail if manifest `schema_version` != EXPECTED_SCHEMA. A bump
     means Yale changed the layout and a human must look before we trust it.
  4. Extract only what the pipeline needs:
       <vintage>/actual/snapshots/valid_from=*/rates.parquet   (the panel)
       <vintage>/weights/import_weights_hs10_country.parquet    (trade weights)
       <vintage>/manifest.json                                  (provenance)
  5. VERIFY every extracted file's sha256 against the manifest `files` list.
     Any mismatch aborts the run — we never feed unverified data downstream.
  6. Print a provenance summary (vintage, published_at, git commit/branch/
     dirty, snapshot count, row totals, coverage span).

Idempotent: re-staging the same vintage overwrites the staging dir in place.

Usage:
  python -m scripts.ingest_yale_vintage <path-to-vintage.zip>
  python -m scripts.ingest_yale_vintage <path-to-vintage.zip> --dest <dir>
  python -m scripts.ingest_yale_vintage <path-to-vintage.zip> --manifest-only

Exit codes:
  0 ok · 1 usage/IO error · 2 schema guard tripped · 3 sha256 mismatch
"""

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

# The schema version we have validated the pipeline against. If Yale bumps
# this, STOP and re-inspect before trusting the data. (Q3 to John: treat a
# version change as the breaking-change signal — our working assumption.)
EXPECTED_SCHEMA = "2.0"

# Only these paths (relative to the <vintage>/ root inside the zip) are pulled.
# Everything else in the archive (daily aggregates, scenarios, quality, rds,
# xlsx) is intentionally skipped for the rate panel. Scenarios are OUT OF
# SCOPE until John explains what new_301 / no_s338 assume.
WANTED_PREFIXES = (
    "actual/snapshots/",
    "weights/import_weights_hs10_country.parquet",
    "manifest.json",
)

_CHUNK = 1 << 20  # 1 MiB


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(_CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def _find_vintage_root(names: list[str]) -> str:
    """The archive nests everything under a single `<vintage>/` top dir.
    Return that prefix (with trailing slash), e.g. '2026-07-21-08/'."""
    tops = {n.split("/", 1)[0] for n in names if "/" in n}
    if len(tops) != 1:
        raise ValueError(
            f"Expected exactly one top-level dir in the zip, found: {sorted(tops)}"
        )
    return tops.pop() + "/"


def _read_manifest(zf: zipfile.ZipFile, root: str) -> dict:
    mpath = root + "manifest.json"
    try:
        with zf.open(mpath) as fh:
            return json.load(fh)
    except KeyError:
        raise ValueError(f"manifest.json not found at {mpath!r} in archive")


def _print_provenance(m: dict) -> None:
    git = m.get("git", {}) or {}
    snaps = (m.get("series", {}).get("actual", {}) or {}).get("snapshots", []) or []
    n = len(snaps)
    rows = sum(int(s.get("n_rows", 0)) for s in snaps)
    span_lo = snaps[0]["valid_from"] if n else "?"
    span_hi = snaps[-1]["valid_until"] if n else "?"
    dirty = git.get("dirty")
    print("  --- vintage provenance ---")
    print(f"  vintage        : {m.get('vintage')}")
    print(f"  schema_version : {m.get('schema_version')}")
    print(f"  published_at   : {m.get('published_at')}")
    print(f"  rate_unit      : {m.get('rate_unit')}  interval_end: {m.get('interval_end')}")
    print(f"  git            : {git.get('commit','?')[:12]} "
          f"branch={git.get('branch','?')} dirty={dirty}")
    if dirty:
        print("  !! WARNING: built from a DIRTY working tree (uncommitted changes). "
              "Provenance is not reproducible from the commit alone.")
    if (git.get("branch") or "master") not in ("master", "main"):
        print(f"  !! NOTE: built off non-default branch {git.get('branch')!r}.")
    print(f"  actual snaps   : {n} snapshots, {rows:,} rows total")
    print(f"  coverage       : {span_lo} -> {span_hi}")


def stage_vintage(zip_path: Path, dest_root: Path, manifest_only: bool) -> dict:
    if not zip_path.exists():
        print(f"ERROR: file not found: {zip_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Opening archive: {zip_path}  ({zip_path.stat().st_size / 1e6:.0f} MB)")
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        root = _find_vintage_root(names)
        manifest = _read_manifest(zf, root)

        # --- Schema guard (Step 1.3) ---
        got = str(manifest.get("schema_version"))
        if got != EXPECTED_SCHEMA:
            print(
                f"\nSCHEMA GUARD TRIPPED: manifest schema_version={got!r} "
                f"but pipeline expects {EXPECTED_SCHEMA!r}.\n"
                "Yale changed the layout. Re-inspect before ingesting — refusing "
                "to stage unverified structure.",
                file=sys.stderr,
            )
            sys.exit(2)

        _print_provenance(manifest)
        if manifest_only:
            print("\n--manifest-only: not extracting. Guard + provenance OK.")
            return manifest

        # Build sha256 lookup. Two sources, because Yale splits them:
        #   - manifest.files[]  covers weights/, scenarios/, *.rds, etc.
        #   - series.<name>.snapshots[]  carries the per-snapshot rates.parquet
        #     hashes (the `actual/snapshots/valid_from=*/rates.parquet` panel
        #     is NOT in files[]).
        sha_by_path = {f["path"]: f["sha256"] for f in manifest.get("files", [])}
        for series in (manifest.get("series") or {}).values():
            for snap in (series.get("snapshots") or []):
                if snap.get("path") and snap.get("sha256"):
                    sha_by_path[snap["path"]] = snap["sha256"]

        vintage = manifest.get("vintage", root.rstrip("/"))
        dest = dest_root / vintage
        dest.mkdir(parents=True, exist_ok=True)
        print(f"\nStaging into: {dest}")

        members = [
            n for n in names
            if not n.endswith("/")
            and any(n[len(root):].startswith(p) for p in WANTED_PREFIXES)
        ]
        print(f"  {len(members)} files match the wanted set; extracting + verifying...")

        verified = mismatched = 0
        for n in members:
            rel = n[len(root):]  # path relative to <vintage>/ (matches manifest)
            out_path = dest / rel
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(n) as src, out_path.open("wb") as dst:
                for block in iter(lambda: src.read(_CHUNK), b""):
                    dst.write(block)

            expected = sha_by_path.get(rel)
            if expected is None:
                print(f"    ? no manifest sha256 for {rel} (skipping check)")
                continue
            actual = _sha256_file(out_path)
            if actual != expected:
                mismatched += 1
                print(f"    SHA256 MISMATCH: {rel}\n"
                      f"      expected {expected}\n      got      {actual}",
                      file=sys.stderr)
            else:
                verified += 1

        print(f"\n  verified {verified} files against manifest sha256; "
              f"{mismatched} mismatched.")
        if mismatched:
            print("ABORT: integrity check failed. Staged files are suspect.",
                  file=sys.stderr)
            sys.exit(3)

        # Drop a small marker so Step 2 / DB load can read provenance cheaply.
        (dest / "_STAGED_OK.json").write_text(json.dumps({
            "vintage": vintage,
            "schema_version": got,
            "published_at": manifest.get("published_at"),
            "git": manifest.get("git"),
            "n_files_verified": verified,
        }, indent=1))
        print(f"\nDONE. Vintage {vintage} staged + verified at {dest}")
        return manifest


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Stage + verify a Yale tariff vintage zip.")
    ap.add_argument("zip_path", type=Path, help="Path to the vintage .zip")
    ap.add_argument("--dest", type=Path, default=Path("data/yale_vintages"),
                    help="Staging root (a <vintage>/ subdir is created). "
                         "Default: data/yale_vintages")
    ap.add_argument("--manifest-only", action="store_true",
                    help="Read + guard + print provenance only; no extraction.")
    args = ap.parse_args(argv)

    stage_vintage(args.zip_path, args.dest, args.manifest_only)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
