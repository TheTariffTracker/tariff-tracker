// app/api/rate-spike/route.ts
//
// THROWAWAY SPIKE — not production. Purpose: prove DuckDB can answer a
// (hts10, country, date) rate lookup on Vercel by range-reading the merged
// rate-panel parquet from Supabase Storage, with acceptable cold/warm latency.
// If this works, the real query layer (Step 4) is built on the same pattern.
// Delete this route once the spike is evaluated.
//
// Setup before deploying:
//   1. npm install duckdb-async
//   2. Upload the SORTED parquet part(s) (scripts/prepare_rate_panel.py output)
//      to a Supabase Storage bucket and set env var RATE_PANEL_URL to their
//      public (or signed) URL(s). If the panel was split to fit the free-tier
//      50MB cap, set RATE_PANEL_URL to a COMMA-SEPARATED list of the part URLs.
//      Storage supports the HTTP range requests DuckDB needs.
//   3. Deploy on a branch, then hit:
//        /api/rate-spike?hts10=0303490200&country=5700&date=2026-08-19
//
// Measured locally (sandbox, 6-country sample over a range-serving HTTP host):
//   cold ~22 ms, warm ~5 ms, ~63 KiB read per lookup (1 of ~20 row groups).
// Real Vercel numbers will be higher (network RTT + footer fetch on cold
// start); the point of deploying is to measure that.

import { NextRequest, NextResponse } from "next/server";
import { Database } from "duckdb-async";

// Native DuckDB needs the Node runtime (not edge). Keep the function warm-ish.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// One URL, or a comma-separated list of part URLs (see prepare_rate_panel --parts).
const PARQUET_URLS = (process.env.RATE_PANEL_URL || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Build the read_parquet source. URLs come from env (trusted, never user input),
// so listing them in the SQL is safe; the lookup predicates stay bound params.
function parquetSource(): string {
  const list = PARQUET_URLS.map((u) => `'${u.replace(/'/g, "''")}'`).join(", ");
  return `read_parquet([${list}])`;
}

// Module-level singleton: created once per warm Lambda instance. httpfs is
// loaded and the HTTP metadata cache is enabled so the parquet footer is
// fetched on the first request and reused by every later request on the same
// instance — that is what makes warm lookups cheap.
let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.create(":memory:");
      await db.all("INSTALL httpfs; LOAD httpfs;");
      await db.all("SET enable_http_metadata_cache=true;");
      return db;
    })();
  }
  return dbPromise;
}

// Columns returned to the caller — the per-authority breakdown plus the fields
// the calculator's labeling rules key on (base_rate_type for specific-duty,
// interval bounds for not-yet-effective).
const SELECT_COLS = [
  "hts10", "country", "revision", "base_rate", "base_rate_type",
  "rate_232", "rate_301", "rate_301_cs", "rate_s301br",
  "rate_ieepa_recip", "rate_ieepa_fent", "rate_s122", "rate_s338",
  "rate_section_201", "rate_other", "total_additional", "total_rate",
  "usmca_eligible", "valid_from", "valid_until",
].join(", ");

const HTS_RE = /^\d{6,10}$/;      // de-dotted HTS-10 (or shorter prefix)
const COUNTRY_RE = /^\d{3,4}$/;   // Census country code
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  if (PARQUET_URLS.length === 0) {
    return NextResponse.json(
      { error: "RATE_PANEL_URL env var not set" }, { status: 500 });
  }
  const sp = req.nextUrl.searchParams;
  const hts10 = (sp.get("hts10") || "").replace(/\./g, "");
  const country = sp.get("country") || "";
  const date = sp.get("date") || new Date().toISOString().slice(0, 10);

  // Validate inputs by shape (defense-in-depth; params are also bound, never
  // string-interpolated, so this is belt + suspenders against odd input).
  if (!HTS_RE.test(hts10)) {
    return NextResponse.json({ error: "hts10 must be 6-10 digits" }, { status: 400 });
  }
  if (!COUNTRY_RE.test(country)) {
    return NextResponse.json({ error: "country must be a 3-4 digit Census code" }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const t0 = Date.now();
  try {
    const db = await getDb();
    const rows = await db.all(
      `SELECT ${SELECT_COLS} FROM ${parquetSource()}
       WHERE hts10 = ? AND country = ?
         AND valid_from <= CAST(? AS DATE) AND valid_until >= CAST(? AS DATE)
       LIMIT 1`,
      hts10, country, date, date,
    );
    const ms = Date.now() - t0;

    if (rows.length === 0) {
      // No covering interval. Two legitimate reasons: the code/country pair is
      // not in Yale's universe, OR the code was not in the schedule on that
      // date (source-level HTS lifecycle gap — see merge_yale_snapshots.py).
      return NextResponse.json({
        found: false,
        reason: "no covering interval — code/country not in the panel on that date",
        query: { hts10, country, date },
        elapsed_ms: ms,
      });
    }

    const r = rows[0] as Record<string, unknown>;
    const bt = String(r.base_rate_type);
    return NextResponse.json({
      found: true,
      query: { hts10, country, date },
      rate: r,
      flags: {
        // Q5: rate x value is NOT exact for these — specific/compound duty.
        specific_or_compound: bt === "specific_or_compound" || bt === "other",
      },
      elapsed_ms: ms,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: String((e as Error).message) },
      { status: 500 });
  }
}
