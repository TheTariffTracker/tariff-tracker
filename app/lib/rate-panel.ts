// app/lib/rate-panel.ts
//
// Rate-panel data access (Step 4 of the rate-calculator pipeline).
//
// Answers a single (hts10, country, date) lookup against the merged Yale rate
// panel — a sorted, split parquet hosted in Supabase Storage — by RANGE-READING
// only the one row group that covers the code. Pure JS (hyparquet): no native
// binary, no WASM worker, runs in a Vercel Node function. See the spike history
// and project_rate_panel_pipeline memory for why this shape was chosen.
//
// The panel is sorted by (hts10, country, valid_from) and split into parts to
// fit Supabase's 50MB free-tier file cap; every part is a contiguous hts10
// range, so exactly one part (and one row group in it) covers any given code.
//
// Env:
//   RATE_PANEL_URL     comma-separated public URLs of the sorted parquet parts
//   RATE_PANEL_VINTAGE the vintage id (e.g. "2026-07-21-08") for citation
//
// (A future refresh step can replace these env vars with a small current.json
// manifest in Storage so vintage swaps don't need a redeploy — see Step 8.)

import {
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
} from "hyparquet";
import { compressors } from "hyparquet-compressors";

const PART_URLS = (process.env.RATE_PANEL_URL || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const RATE_PANEL_VINTAGE = process.env.RATE_PANEL_VINTAGE || "unknown";

// Columns returned for a lookup: the full per-authority effective breakdown, the
// parallel statutory_* set (for the statutory-vs-collected wedge), and the
// fields the labeling rules key on (base_rate_type, usmca_eligible, interval).
export const RATE_COLUMNS = [
  "hts10", "country", "revision",
  "base_rate", "statutory_base_rate", "base_rate_type",
  "rate_232", "rate_301", "rate_301_cs", "rate_s301br",
  "rate_ieepa_recip", "rate_ieepa_fent", "rate_s122", "rate_s338",
  "rate_section_201", "rate_other", "total_additional", "total_rate",
  "statutory_rate_232", "statutory_rate_301", "statutory_rate_301_cs",
  "statutory_rate_s301br", "statutory_rate_ieepa_recip",
  "statutory_rate_ieepa_fent", "statutory_rate_s122", "statutory_rate_s338",
  "statutory_rate_section_201", "statutory_rate_other",
  "usmca_eligible", "valid_from", "valid_until",
];

export type RateRow = Record<string, unknown>;

export type RateLookup = {
  found: boolean;
  vintage: string;
  query: { hts10: string; country: string; date: string };
  rate?: RateRow;
  flags?: {
    // Q5: rate x customs value is NOT exact for these — specific/compound duty.
    specificOrCompound: boolean;
    // Q4: this interval's rate is scheduled for a future date, not yet in force.
    notYetEffective: boolean;
  };
  reason?: string;
};

// ---- per-part metadata cache (footer read once per warm instance) ----
type PartMeta = {
  // hyparquet's return types are loose; we keep the handle + metadata as-is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  file: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  htsColIndex: number;
  // per row group: [minHts, maxHts, rowStart, rowEndExclusive]
  groups: Array<[string, string, number, number]>;
};
const partCache = new Map<string, Promise<PartMeta>>();

function statStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v).toString();
  return String(v);
}

async function getPart(url: string): Promise<PartMeta> {
  let p = partCache.get(url);
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
    partCache.set(url, p);
  }
  return p;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Look up the effective tariff rate for one HTS-10 code × country on a date.
 * `date` defaults to today. Returns found:false when no interval covers the
 * key — which legitimately means the code was not in the schedule on that date
 * (HTS-lifecycle gaps are preserved in the panel), not an error.
 */
export async function lookupRate(
  hts10Raw: string,
  country: string,
  dateRaw?: string,
): Promise<RateLookup> {
  const hts10 = hts10Raw.replace(/\./g, "");
  const date = dateRaw || todayISO();
  const d = new Date(date);
  const query = { hts10, country, date };

  if (PART_URLS.length === 0) {
    throw new Error("RATE_PANEL_URL is not set");
  }

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
      columns: RATE_COLUMNS,
      compressors,
    });
    const hit = rows.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) =>
        r.hts10 === hts10 &&
        String(r.country) === country &&
        new Date(r.valid_from) <= d &&
        new Date(r.valid_until) >= d,
    ) as RateRow | undefined;

    if (hit) {
      const bt = String(hit.base_rate_type);
      const validFrom = new Date(hit.valid_from as string);
      return {
        found: true,
        vintage: RATE_PANEL_VINTAGE,
        query,
        rate: hit,
        flags: {
          specificOrCompound: bt === "specific_or_compound" || bt === "other",
          notYetEffective: validFrom > new Date(todayISO()),
        },
      };
    }
  }

  return {
    found: false,
    vintage: RATE_PANEL_VINTAGE,
    query,
    reason: "no covering interval — code/country not in the schedule on that date",
  };
}
