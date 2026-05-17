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
import { getChapterName } from "../lib/hts-chapters";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
