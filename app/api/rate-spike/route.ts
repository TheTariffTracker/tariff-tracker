// app/api/rate-spike/route.ts
//
// THROWAWAY SPIKE — not production. Proves a (hts10, country, date) rate lookup
// on Vercel by RANGE-READING the merged rate-panel parquet from Supabase
// Storage — using hyparquet (pure-JS parquet reader), NOT DuckDB.
//
// Why hyparquet instead of DuckDB:
//   Native DuckDB won't build on Vercel — its binary is fetched by an npm
//   install script, which Vercel blocks by default (allow-scripts), and the
//   native package also fights Turbopack bundling. DuckDB-WASM's Node build
//   either can't do async HTTP (blocking build) or needs worker setup that is
//   its own serverless headache. hyparquet is pure JavaScript: no native
//   binary, no WASM worker, no install script — nothing for Vercel to block —
//   and it reads only the byte ranges it needs. hyparquet-compressors adds the
//   ZSTD decoder our parquet uses.
//
// Setup before deploying:
//   1. npm install hyparquet hyparquet-compressors   (and: npm uninstall duckdb-async)
//   2. RATE_PANEL_URL = comma-separated public URLs of the sorted parquet parts
//      (Supabase Storage; must support HTTP range requests — it does).
//   3. Deploy on a branch, then hit:
//        /api/rate-spike?hts10=0303490200&country=5700&date=2026-08-19
//
// Measured (sandbox, over a range-serving HTTP host): ~194 ms cold, reading a
// single ~51k-row row group. Real Vercel numbers land when deployed.

import { NextRequest, NextResponse } from "next/server";
import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
} from "hyparquet";
import { compressors } from "hyparquet-compressors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PART_URLS = (process.env.RATE_PANEL_URL || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const COLUMNS = [
  "hts10", "country", "revision", "base_rate", "base_rate_type",
  "rate_232", "rate_301", "rate_301_cs", "rate_s301br",
  "rate_ieepa_recip", "rate_ieepa_fent", "rate_s122", "rate_s338",
  "rate_section_201", "rate_other", "total_additional", "total_rate",
  "usmca_eligible", "valid_from", "valid_until",
];

const HTS_RE = /^\d{6,10}$/;
const COUNTRY_RE = /^\d{3,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---- per-part metadata cache (footer read once per warm instance) ----
type PartMeta = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  file: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  htsColIndex: number;
  // per-row-group: [minHts, maxHts, rowStart, rowEnd]
  groups: Array<[string, string, number, number]>;
};
const cache = new Map<string, Promise<PartMeta>>();

function statStr(v: unknown): string {
  if (v == null) return "";
  // hyparquet returns string stats as Buffer/Uint8Array for BYTE_ARRAY columns
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString();
  return String(v);
}

async function getPart(url: string): Promise<PartMeta> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      const file = await asyncBufferFromUrl({ url });
      const metadata = await parquetMetadataAsync(file);
      const leaves = metadata.schema.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => s.num_children == null,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const htsColIndex = leaves.findIndex((s: any) => s.name === "hts10");
      const groups: Array<[string, string, number, number]> = [];
      let rowStart = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const rg of metadata.row_groups) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const st: any = rg.columns?.[htsColIndex]?.meta_data?.statistics ?? {};
        const lo = statStr(st.min_value ?? st.min);
        const hi = statStr(st.max_value ?? st.max);
        const n = Number(rg.num_rows);
        groups.push([lo, hi, rowStart, rowStart + n]);
        rowStart += n;
      }
      return { file, metadata, htsColIndex, groups };
    })();
    cache.set(url, p);
  }
  return p;
}

export async function GET(req: NextRequest) {
  if (PART_URLS.length === 0) {
    return NextResponse.json({ error: "RATE_PANEL_URL not set" }, { status: 500 });
  }
  const sp = req.nextUrl.searchParams;
  const hts10 = (sp.get("hts10") || "").replace(/\./g, "");
  const country = sp.get("country") || "";
  const date = sp.get("date") || new Date().toISOString().slice(0, 10);

  if (!HTS_RE.test(hts10)) return NextResponse.json({ error: "hts10 must be 6-10 digits" }, { status: 400 });
  if (!COUNTRY_RE.test(country)) return NextResponse.json({ error: "country must be 3-4 digits" }, { status: 400 });
  if (!DATE_RE.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const d = new Date(date);
  const t0 = Date.now();
  try {
    // Find the row group (across parts) whose hts10 range covers the key, read
    // only that group, then filter to country + covering interval.
    for (const url of PART_URLS) {
      const part = await getPart(url);
      const grp = part.groups.find(([lo, hi]) => hts10 >= lo && hts10 <= hi);
      if (!grp) continue;
      const [, , rowStart, rowEnd] = grp;
      const rows = await parquetReadObjects({
        file: part.file,
        metadata: part.metadata,
        rowStart,
        rowEnd,
        columns: COLUMNS,
        compressors,
      });
      const hit = rows.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) =>
          r.hts10 === hts10 &&
          String(r.country) === country &&
          new Date(r.valid_from) <= d &&
          new Date(r.valid_until) >= d,
      );
      if (hit) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bt = String((hit as any).base_rate_type);
        return NextResponse.json({
          found: true,
          query: { hts10, country, date },
          rate: hit,
          flags: { specific_or_compound: bt === "specific_or_compound" || bt === "other" },
          elapsed_ms: Date.now() - t0,
        });
      }
    }
    return NextResponse.json({
      found: false,
      reason: "no covering interval — code/country not in the panel on that date",
      query: { hts10, country, date },
      elapsed_ms: Date.now() - t0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "query failed", detail: String((e as Error).message) },
      { status: 500 });
  }
}
