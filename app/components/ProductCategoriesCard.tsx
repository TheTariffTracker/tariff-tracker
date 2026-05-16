// ProductCategoriesCard — right card of the two-column row at the bottom of
// the Dashboard. Top 6 HTS 2-digit chapters by calculated duties for the most
// recent month in trade_imports, with a year-over-year delta column.
//
// Data flow:
//   1. Hit `chapter_duties_monthly` view (created in Supabase 2026-05-13)
//      ordered by (year DESC, month DESC, total_duties DESC), limit 6. First
//      row's (year, month) tells us the latest month available. The 6 rows
//      themselves are the top-6 chapters of that month.
//   2. Fetch those same 6 chapter codes from (year - 1, same month) to get
//      prior-year totals for the YoY delta.
//   3. Compute delta = (current − prior) / prior * 100. If prior is missing
//      (chapter didn't exist in trade_imports for that month), show "—".
//
// **Unit note:** trade_imports.calculated_duties is in ACTUAL DOLLARS (not
// millions, unlike DTS). The view returns the same. Display formats to "$X,XXXM"
// by rounding to the nearest million.

import { supabase } from "../lib/supabase";
import InfoIcon from "./InfoIcon";

// 2-digit HTS chapter → short, user-friendly name. Based on the WCO HS
// Convention chapter titles, condensed to match the mockup's tone. Chapter
// 77 is reserved (intentionally unused in HTS). Anything missing here falls
// back to "Chapter NN" via getChapterName().
const CHAPTER_NAMES: Record<string, string> = {
  "01": "Live animals",
  "02": "Meat",
  "03": "Fish and seafood",
  "04": "Dairy, eggs, honey",
  "05": "Other animal products",
  "06": "Live trees and plants",
  "07": "Vegetables",
  "08": "Fruit and nuts",
  "09": "Coffee, tea, spices",
  "10": "Cereals",
  "11": "Milling products",
  "12": "Oilseeds",
  "13": "Gums and resins",
  "14": "Vegetable plaiting materials",
  "15": "Fats and oils",
  "16": "Prepared meat and fish",
  "17": "Sugars",
  "18": "Cocoa",
  "19": "Cereal preparations",
  "20": "Prepared vegetables",
  "21": "Misc. edible preparations",
  "22": "Beverages and spirits",
  "23": "Animal feed",
  "24": "Tobacco",
  "25": "Salt, sulfur, stone",
  "26": "Ores and slag",
  "27": "Mineral fuels",
  "28": "Inorganic chemicals",
  "29": "Organic chemicals",
  "30": "Pharmaceuticals",
  "31": "Fertilizers",
  "32": "Dyes and tanning",
  "33": "Cosmetics and essential oils",
  "34": "Soaps and waxes",
  "35": "Albuminoidal substances",
  "36": "Explosives",
  "37": "Photographic goods",
  "38": "Misc. chemicals",
  "39": "Plastics",
  "40": "Rubber",
  "41": "Raw hides and leather",
  "42": "Leather goods",
  "43": "Furskins",
  "44": "Wood",
  "45": "Cork",
  "46": "Basketwork",
  "47": "Pulp",
  "48": "Paper",
  "49": "Printed books",
  "50": "Silk",
  "51": "Wool",
  "52": "Cotton",
  "53": "Other vegetable fibers",
  "54": "Man-made filaments",
  "55": "Man-made staple fibers",
  "56": "Wadding and nonwovens",
  "57": "Carpets",
  "58": "Special woven fabrics",
  "59": "Coated fabrics",
  "60": "Knitted fabrics",
  "61": "Apparel, knitted",
  "62": "Apparel, woven",
  "63": "Other textile articles",
  "64": "Footwear",
  "65": "Headgear",
  "66": "Umbrellas",
  "67": "Feathers and artificial flowers",
  "68": "Stone articles",
  "69": "Ceramic products",
  "70": "Glass",
  "71": "Pearls and precious stones",
  "72": "Iron and steel",
  "73": "Iron or steel articles",
  "74": "Copper",
  "75": "Nickel",
  "76": "Aluminum",
  "78": "Lead",
  "79": "Zinc",
  "80": "Tin",
  "81": "Other base metals",
  "82": "Tools and cutlery",
  "83": "Misc. base metal articles",
  "84": "Mechanical appliances",
  "85": "Electrical machinery",
  "86": "Railway equipment",
  "87": "Vehicles",
  "88": "Aircraft",
  "89": "Ships",
  "90": "Optical and medical instruments",
  "91": "Clocks and watches",
  "92": "Musical instruments",
  "93": "Arms and ammunition",
  "94": "Furniture and lamps",
  "95": "Toys and games",
  "96": "Misc. manufactured articles",
  "97": "Works of art",
  "98": "Special classifications",
  "99": "Temporary modifications",
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getChapterName(chapter: string): string {
  return CHAPTER_NAMES[chapter] ?? `Chapter ${chapter}`;
}

// "$3,311M" — round to nearest million, comma-separate. Mockup formatting.
function formatDuties(dollars: number): string {
  const millions = Math.round(dollars / 1_000_000);
  return `$${millions.toLocaleString("en-US")}M`;
}

// "+217.4%" or "−12.3%" (typographic minus). Returns null if prior missing.
function formatDelta(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  if (pct >= 0) return `+${pct.toFixed(1)}%`;
  return `−${Math.abs(pct).toFixed(1)}%`;
}

type ViewRow = {
  year: number;
  month: number;
  chapter: string;
  total_duties: string | number; // numeric → string in JSON
};

type CategoryRow = {
  chapter: string;
  name: string;
  currentDuties: number;
  deltaPct: number | null;
};

type CategoriesData =
  | {
      kind: "ok";
      rows: CategoryRow[];
      year: number;
      month: number;
    }
  | { kind: "empty" }
  | { kind: "error" };

// Supabase errors don't serialize cleanly via console.error (often print as
// `{}`). Pull the useful properties out by name so logs are actually useful.
function logSupabaseError(label: string, error: unknown) {
  const e = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  console.error(label, {
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
  });
}

async function getCategoriesData(): Promise<CategoriesData> {
  // Query 1: cheapest possible "what's the latest month?" lookup. Goes against
  // the trade_imports table directly (NOT the aggregated view) so it's an
  // index seek on the (year, month, ...) primary key — no aggregation, O(1).
  // Avoids the prior approach's full-table aggregation that occasionally
  // blew past PostgREST's statement timeout.
  const anchorResp = await supabase
    .from("trade_imports")
    .select("year, month")
    .order("year", { ascending: false })
    .order("month", { ascending: false })
    .limit(1);

  if (anchorResp.error) {
    logSupabaseError("ProductCategoriesCard anchor fetch error:", anchorResp.error);
    return { kind: "error" };
  }
  if (!anchorResp.data || anchorResp.data.length === 0) {
    return { kind: "empty" };
  }

  const { year, month } = anchorResp.data[0] as { year: number; month: number };
  const priorYear = year - 1;

  // Queries 2 + 3 in parallel. Both filter by year/month so the view's
  // aggregation only touches one month's rows (~148K), not the whole table.
  const [currentResp, priorResp] = await Promise.all([
    supabase
      .from("chapter_duties_monthly")
      .select("chapter, total_duties")
      .eq("year", year)
      .eq("month", month)
      .order("total_duties", { ascending: false })
      .limit(6),
    supabase
      .from("chapter_duties_monthly")
      .select("chapter, total_duties")
      .eq("year", priorYear)
      .eq("month", month),
  ]);

  if (currentResp.error) {
    logSupabaseError("ProductCategoriesCard current fetch error:", currentResp.error);
    return { kind: "error" };
  }
  if (priorResp.error) {
    logSupabaseError("ProductCategoriesCard prior fetch error:", priorResp.error);
    return { kind: "error" };
  }
  if (!currentResp.data || currentResp.data.length === 0) {
    return { kind: "empty" };
  }

  const priorMap = new Map<string, number>();
  for (const r of (priorResp.data ?? []) as Pick<ViewRow, "chapter" | "total_duties">[]) {
    priorMap.set(r.chapter, Number(r.total_duties));
  }

  const rows: CategoryRow[] = (currentResp.data as Pick<ViewRow, "chapter" | "total_duties">[]).map(
    (r) => {
      const current = Number(r.total_duties);
      const prior = priorMap.get(r.chapter);
      const delta =
        prior !== undefined && prior > 0 ? ((current - prior) / prior) * 100 : null;
      return {
        chapter: r.chapter,
        name: getChapterName(r.chapter),
        currentDuties: current,
        deltaPct: delta,
      };
    },
  );

  return { kind: "ok", rows, year, month };
}

export default async function ProductCategoriesCard() {
  const data = await getCategoriesData();

  if (data.kind !== "ok") {
    const msg =
      data.kind === "error"
        ? "Unable to load product categories. Please refresh."
        : "No data available yet.";
    return (
      <section className="border border-border bg-bg">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Top Product Categories by Duties Collected
          </h2>
        </header>
        <div className="px-4 py-6 text-[13px] text-fg-muted">{msg}</div>
      </section>
    );
  }

  const { rows, year, month } = data;
  const monthLabel = `${MONTH_SHORT[month - 1]} ${year}`;
  const priorYearLabel = `${MONTH_SHORT[month - 1]} '${String(year - 1).slice(-2)}`;

  return (
    <section className="border border-border bg-bg">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0 flex items-center gap-1.5">
          Top Product Categories by Duties Collected
          <InfoIcon
            tooltip="Product categories here are 2-digit HTS Chapters. Sourced from Census Bureau import data."
            ariaLabel="Source info"
          />
        </h2>
        <span className="text-[11px] text-fg-muted whitespace-nowrap">
          {monthLabel}
        </span>
      </header>

      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
              Ch.
            </th>
            <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
              Product Category
            </th>
            <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-right px-4 py-1.5 border-b border-border">
              Duties Collected
            </th>
            <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-right px-4 py-1.5 border-b border-border">
              vs {priorYearLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
            const deltaColor =
              row.deltaPct === null
                ? "text-fg-muted"
                : row.deltaPct >= 0
                  ? "text-green"
                  : "text-red";
            return (
              <tr key={row.chapter} className="hover:bg-bg-alt">
                <td className={cellBase}>{row.chapter}</td>
                <td className={cellBase}>{row.name}</td>
                <td className={`${cellBase} text-right tabular-nums`}>
                  {formatDuties(row.currentDuties)}
                </td>
                <td className={`${cellBase} text-right tabular-nums ${deltaColor}`}>
                  {formatDelta(row.deltaPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
