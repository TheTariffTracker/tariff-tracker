import type { Metadata } from "next";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";

export const metadata: Metadata = {
  title: "Tariffs and Taxes",
  description:
    "How customs revenue compares to other U.S. federal receipts — individual income tax, corporate, payroll, and excise totals from Treasury MTS data.",
};

// Tariffs & Taxes page (route: "/tariffs-and-taxes"). Compares customs
// duty revenue against the other federal receipt categories (individual
// income tax, corporate income tax, payroll, etc.) since Jan 2025.
//
// Source: federal_receipts table, populated from MTS Table 4 via
// scripts/fetch_mts_receipts.py. Records cover monthly settled receipts
// across all categories with full fiscal-year-to-date totals.
//
// **Important note on classification IDs**: Treasury assigns a fresh
// classification_id per record_date (e.g., Customs Duties = 57118093 in
// Sep 2025, 58331837 in Apr 2026). The PK is (record_date, classification_id)
// so they coexist correctly; cross-month queries MUST filter by
// classification_desc, not classification_id.
//
// Per project memory, the stable classification_desc rollup labels are:
//   "Customs Duties"
//   "Total -- Individual Income Taxes"
//   "Corporation Income Taxes"
//   "Total -- Social Insurance and Retirement Receipts"
//   "Total -- Excise Taxes"
//   "Estate and Gift Taxes"
//   "Total -- Miscellaneous Receipts"
//   "Total -- Receipts"  (grand total)

// US population estimate for per-capita context. Update annually or
// hardcoded source as Census ACS lands. ~340M as of mid-2025.
const US_POPULATION = 340_000_000;

// Stable category labels we display. Order matters: it's the display order
// in the composition table and the FY summary cards.
const CATEGORY_LABELS = {
  customs: "Customs Duties",
  individual: "Total -- Individual Income Taxes",
  corporate: "Corporation Income Taxes",
  social: "Total -- Social Insurance and Retirement Receipts",
  excise: "Total -- Excise Taxes",
  estate: "Estate and Gift Taxes",
  misc: "Total -- Miscellaneous Receipts",
  total: "Total -- Receipts",
} as const;

// Display names mapping
const DISPLAY_NAMES: Record<string, string> = {
  "Customs Duties": "Customs Duties",
  "Total -- Individual Income Taxes": "Individual Income Tax",
  "Corporation Income Taxes": "Corporate Income Tax",
  "Total -- Social Insurance and Retirement Receipts": "Social Insurance & Retirement",
  "Total -- Excise Taxes": "Excise Taxes",
  "Estate and Gift Taxes": "Estate & Gift Taxes",
  "Total -- Miscellaneous Receipts": "Miscellaneous Receipts",
  "Total -- Receipts": "Total Federal Receipts",
};

// Display order for the composition table (largest first, customs called out)
const COMPOSITION_ORDER = [
  "Total -- Individual Income Taxes",
  "Total -- Social Insurance and Retirement Receipts",
  "Corporation Income Taxes",
  "Total -- Excise Taxes",
  "Customs Duties",
  "Estate and Gift Taxes",
  "Total -- Miscellaneous Receipts",
];

type FedRow = {
  record_date: string;
  classification_desc: string;
  current_month_net_rcpt_amt: string | number | null;
  current_fytd_net_rcpt_amt: string | number | null;
};

// ---------- Formatters ----------
function formatLargeDollars(dollars: number): string {
  const t = dollars / 1_000_000_000_000;
  if (t >= 1) return `$${t.toFixed(2)}T`;
  const b = dollars / 1_000_000_000;
  if (b >= 1) return `$${b.toFixed(1)}B`;
  const m = dollars / 1_000_000;
  return `$${Math.round(m).toLocaleString("en-US")}M`;
}

function formatPercent(p: number): string {
  if (p >= 10) return `${p.toFixed(1)}%`;
  return `${p.toFixed(2)}%`;
}

function formatPerCapita(dollars: number): string {
  return `$${Math.round(dollars / US_POPULATION).toLocaleString("en-US")}`;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Parse "YYYY-MM-DD" without UTC midnight bug
function parseIsoDate(iso: string): Date {
  const [yyyy, mm, dd] = iso.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function formatMonthLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

// ---------- Data fetch ----------
async function getData() {
  const labels = Object.values(CATEGORY_LABELS);
  const { data, error } = await supabase
    .from("federal_receipts")
    .select("record_date, classification_desc, current_month_net_rcpt_amt, current_fytd_net_rcpt_amt")
    .in("classification_desc", labels)
    .order("record_date", { ascending: true });

  if (error) {
    const e = error as unknown as Record<string, unknown>;
    console.error("TariffsAndTaxes fetch error:", {
      typeOf: typeof e,
      constructor: e?.constructor?.name,
      keys: e ? Object.keys(e) : [],
      json: JSON.stringify(e),
      stringified: String(e),
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    });
    return { rows: [] as FedRow[], error: true };
  }
  return { rows: (data ?? []) as FedRow[], error: false };
}

// Build a map keyed by record_date → { classification_desc → row }
function indexByDateAndDesc(rows: FedRow[]): Map<string, Map<string, FedRow>> {
  const idx = new Map<string, Map<string, FedRow>>();
  for (const r of rows) {
    let inner = idx.get(r.record_date);
    if (!inner) {
      inner = new Map();
      idx.set(r.record_date, inner);
    }
    inner.set(r.classification_desc, r);
  }
  return idx;
}

// ---------- Chart (hand-rolled SVG, same coordinate system as ChartCard) ----------
const VIEWBOX_W = 800;
const VIEWBOX_H = 280;
const PLOT_X0 = 40;
const PLOT_X1 = 780;
const PLOT_Y0 = 40;
const PLOT_Y1 = 220;

function buildChart(points: { date: string; pct: number }[]): {
  linePath: string;
  areaPath: string;
  yMax: number;
  ticks: number[];
  xLabels: { x: number; label: string }[];
} {
  if (points.length === 0) {
    return { linePath: "", areaPath: "", yMax: 6, ticks: [0, 2, 4, 6], xLabels: [] };
  }
  // Y axis: round up to next "nice" max for percentage. Cap with a bit of headroom.
  const maxPct = Math.max(...points.map((p) => p.pct));
  const niceMaxes = [3, 6, 9, 12, 15, 20];
  const yMax = niceMaxes.find((m) => m >= maxPct * 1.1) ?? Math.ceil(maxPct * 1.1);
  const tickStep = yMax / 3;
  const ticks = [0, tickStep, tickStep * 2, yMax];

  const n = points.length;
  const xs = points.map((_, i) =>
    PLOT_X0 + (i / Math.max(n - 1, 1)) * (PLOT_X1 - PLOT_X0),
  );
  const ys = points.map(
    (p) => PLOT_Y1 - (p.pct / yMax) * (PLOT_Y1 - PLOT_Y0),
  );

  const linePath = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)},${ys[i].toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${xs[n - 1].toFixed(2)},${PLOT_Y1} L ${xs[0].toFixed(2)},${PLOT_Y1} Z`;

  // X-axis: 5 labels evenly spaced
  const labelIndices = [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1];
  const xLabels = labelIndices.map((i) => ({
    x: xs[i],
    label: formatMonthLabel(points[i].date),
  }));

  return { linePath, areaPath, yMax, ticks, xLabels };
}

// ---------- Page ----------
export default async function TariffsAndTaxesPage() {
  const { rows, error } = await getData();

  if (error || rows.length === 0) {
    return (
      <MainContent
        title="Tariffs & Taxes"
        subtitle="How customs duty revenue compares to other federal receipts since January 2025."
      >
        <section className="border border-border bg-bg p-10 text-center text-[13px] text-fg-muted">
          {error
            ? "Unable to load federal receipts data. Please refresh."
            : "No federal receipts data available yet."}
        </section>
      </MainContent>
    );
  }

  const byDate = indexByDateAndDesc(rows);
  const allDates = Array.from(byDate.keys()).sort();
  const latestDate = allDates[allDates.length - 1];

  // FY 2025 was complete by Sep 2025 — use FYTD at 2025-09-30 (end of FY)
  const fy2025Row = byDate.get("2025-09-30");
  const fy2026LatestRow = byDate.get(latestDate);

  function readFytd(dateMap: Map<string, FedRow> | undefined, desc: string): number {
    if (!dateMap) return 0;
    const r = dateMap.get(desc);
    if (!r) return 0;
    const v = r.current_fytd_net_rcpt_amt;
    if (v === null || v === undefined) return 0;
    return Number(v);
  }

  function readMonth(dateMap: Map<string, FedRow> | undefined, desc: string): number {
    if (!dateMap) return 0;
    const r = dateMap.get(desc);
    if (!r) return 0;
    const v = r.current_month_net_rcpt_amt;
    if (v === null || v === undefined) return 0;
    return Number(v);
  }

  // FY summaries
  const fy2025 = {
    customs: readFytd(fy2025Row, "Customs Duties"),
    individual: readFytd(fy2025Row, "Total -- Individual Income Taxes"),
    corporate: readFytd(fy2025Row, "Corporation Income Taxes"),
    total: readFytd(fy2025Row, "Total -- Receipts"),
    monthsInFY: 12, // FY 2025 is complete
  };
  const fy2026 = {
    customs: readFytd(fy2026LatestRow, "Customs Duties"),
    individual: readFytd(fy2026LatestRow, "Total -- Individual Income Taxes"),
    corporate: readFytd(fy2026LatestRow, "Corporation Income Taxes"),
    total: readFytd(fy2026LatestRow, "Total -- Receipts"),
    // FY 2026 started Oct 2025. months elapsed through latestDate:
    monthsInFY: (() => {
      const d = parseIsoDate(latestDate);
      // calendar month of latestDate, with Oct=1, Nov=2, ..., Sep=12
      const cm = d.getMonth() + 1; // 1-12
      // FY months: Oct=1 (cal 10), Nov=2 (11), Dec=3 (12), Jan=4, Feb=5, ..., Sep=12
      return cm >= 10 ? cm - 9 : cm + 3;
    })(),
  };

  // Composition rows for FY 2025
  const compositionRows = COMPOSITION_ORDER.map((desc) => ({
    desc,
    name: DISPLAY_NAMES[desc] ?? desc,
    amount: readFytd(fy2025Row, desc),
  })).sort((a, b) => b.amount - a.amount);

  // Time series: customs as % of FYTD federal receipts per month.
  // Using FYTD (fiscal-year-to-date) instead of single-month values smooths
  // out the tax-filing-month denominator effect (April spikes from personal
  // income tax filings, similar smaller spikes at quarterly estimated-tax
  // months Jun/Sep/Dec). Each month's value = cumulative customs / cumulative
  // total receipts FROM the start of that fiscal year. Resets at Oct 1 each
  // year (FY boundary).
  const seriesPoints = allDates
    .map((d) => {
      const m = byDate.get(d);
      const customs = readFytd(m, "Customs Duties");
      const total = readFytd(m, "Total -- Receipts");
      const pct = total > 0 ? (customs / total) * 100 : 0;
      return { date: d, pct };
    })
    .filter((p) => p.pct > 0);
  const chart = buildChart(seriesPoints);

  // Index of the data point that's the first month of FY 2026 (Oct 2025),
  // used to draw a fiscal-year boundary line on the chart. -1 if not present.
  const fyBoundaryIdx = seriesPoints.findIndex((p) => p.date >= "2025-10-01");

  return (
    <MainContent
      title="Tariffs & Taxes"
      subtitle="How customs duty revenue compares to other federal receipts since January 2025. Data: U.S. Treasury Monthly Statement (Table 4 — Receipts of the United States Government)."
    >
      {/* PANEL 1: FY comparison */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-5 mb-5">
        <FySummaryCard
          title="FY 2025 (Complete)"
          subtitle="Oct 2024 – Sep 2025"
          data={fy2025}
        />
        <FySummaryCard
          title={`FY 2026 (Through ${formatMonthLabel(latestDate)})`}
          subtitle={`${fy2026.monthsInFY} of 12 months · Oct 2025 – ${formatMonthLabel(latestDate)}`}
          data={fy2026}
        />
      </div>

      {/* PANEL 2: Composition table */}
      <section className="border border-border bg-bg mb-5">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Federal Revenue Composition — FY 2025
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Total: {formatLargeDollars(fy2025.total)}
          </span>
        </header>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                Receipt Category
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-right px-4 py-1.5 border-b border-border">
                FY 2025 Net Receipts
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-right px-4 py-1.5 border-b border-border">
                Share of Total
              </th>
            </tr>
          </thead>
          <tbody>
            {compositionRows.map((row, i) => {
              const isLast = i === compositionRows.length - 1;
              const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
              const pct = fy2025.total > 0 ? (row.amount / fy2025.total) * 100 : 0;
              const isCustoms = row.desc === "Customs Duties";
              const rowClass = isCustoms
                ? "bg-[rgba(194,65,12,0.06)] hover:bg-[rgba(194,65,12,0.10)]"
                : "hover:bg-bg-alt";
              return (
                <tr key={row.desc} className={rowClass}>
                  <td className={`${cellBase} ${isCustoms ? "text-orange font-semibold" : ""}`}>
                    {row.name}
                  </td>
                  <td className={`${cellBase} text-right tabular-nums`}>
                    {formatLargeDollars(row.amount)}
                  </td>
                  <td className={`${cellBase} text-right tabular-nums`}>
                    {formatPercent(pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* PANEL 3: Customs share over time */}
      <section className="border border-border bg-bg mb-5">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Customs Duties as a Share of Fiscal-Year-to-Date Federal Receipts
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Cumulative within FY · resets each Oct 1
          </span>
        </header>
        <div className="px-4 pb-4 pt-2">
          {chart.linePath ? (
            <svg
              viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
              preserveAspectRatio="none"
              className="w-full h-[280px] block"
              role="img"
              aria-label="Customs duties as a share of monthly federal receipts since January 2025"
            >
              {/* Gridlines + y-axis labels */}
              {chart.ticks.map((tick, i) => {
                const y = PLOT_Y1 - (i / 3) * (PLOT_Y1 - PLOT_Y0);
                return (
                  <g key={`tick-${i}`}>
                    <line
                      x1={PLOT_X0}
                      y1={y}
                      x2={PLOT_X1}
                      y2={y}
                      stroke="var(--color-border)"
                    />
                    <text
                      x={35}
                      y={y + 4}
                      fill="var(--color-fg-muted)"
                      fontSize={10}
                      textAnchor="end"
                    >
                      {formatPercent(tick)}
                    </text>
                  </g>
                );
              })}

              {/* X-axis date labels */}
              {chart.xLabels.map((l, i) => {
                const isLast = i === chart.xLabels.length - 1;
                return (
                  <text
                    key={`xlabel-${i}`}
                    x={l.x}
                    y={245}
                    fill="var(--color-fg-muted)"
                    fontSize={10}
                    textAnchor={isLast ? "end" : "start"}
                  >
                    {l.label}
                  </text>
                );
              })}

              {/* Filled area */}
              <path
                d={chart.areaPath}
                fill="var(--color-orange)"
                opacity={0.1}
              />
              {/* Line */}
              <path
                d={chart.linePath}
                stroke="var(--color-orange)"
                strokeWidth={1.8}
                fill="none"
              />

              {/* FY boundary marker — vertical dashed line + label at the
                  midpoint between Sep 2025 and Oct 2025 data points. Shows
                  where FY 2025 ends and FY 2026 begins. */}
              {fyBoundaryIdx > 0 && (() => {
                const n = seriesPoints.length;
                const xCur = PLOT_X0 + (fyBoundaryIdx / Math.max(n - 1, 1)) * (PLOT_X1 - PLOT_X0);
                const xPrev = PLOT_X0 + ((fyBoundaryIdx - 1) / Math.max(n - 1, 1)) * (PLOT_X1 - PLOT_X0);
                const xMid = (xCur + xPrev) / 2;
                return (
                  <g>
                    <line
                      x1={xMid}
                      y1={PLOT_Y0}
                      x2={xMid}
                      y2={PLOT_Y1}
                      stroke="var(--color-fg-muted)"
                      strokeWidth={1}
                      strokeDasharray="3,3"
                      opacity={0.6}
                    />
                    <text
                      x={xMid + 4}
                      y={PLOT_Y0 + 10}
                      fill="var(--color-fg-muted)"
                      fontSize={9}
                      textAnchor="start"
                    >
                      FY 2026 →
                    </text>
                    <text
                      x={xMid - 4}
                      y={PLOT_Y0 + 10}
                      fill="var(--color-fg-muted)"
                      fontSize={9}
                      textAnchor="end"
                    >
                      ← FY 2025
                    </text>
                  </g>
                );
              })()}
            </svg>
          ) : (
            <div className="py-10 text-center text-[13px] text-fg-muted">
              Not enough data for the time series yet.
            </div>
          )}
        </div>
      </section>
    </MainContent>
  );
}

// ---------- Sub-component: FY summary card ----------
function FySummaryCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: {
    customs: number;
    individual: number;
    corporate: number;
    total: number;
    monthsInFY: number;
  };
}) {
  const customsShare = data.total > 0 ? (data.customs / data.total) * 100 : 0;
  const customsPerCapita = formatPerCapita(data.customs);

  return (
    <section className="border border-border bg-bg">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold m-0">{title}</h2>
        <p className="text-[11px] text-fg-muted mt-1 mb-0">{subtitle}</p>
      </header>
      <div className="px-4 py-4">
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-border pb-2">
            <dt className="text-orange font-semibold text-[13px]">Customs Duties</dt>
            <dd className="text-orange font-bold text-lg tabular-nums">
              {formatLargeDollars(data.customs)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-[13px] text-fg-muted">Individual Income Tax</dt>
            <dd className="text-[13px] tabular-nums">{formatLargeDollars(data.individual)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-[13px] text-fg-muted">Corporate Income Tax</dt>
            <dd className="text-[13px] tabular-nums">{formatLargeDollars(data.corporate)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <dt className="text-[13px] text-fg-muted">Total Federal Receipts</dt>
            <dd className="text-[13px] tabular-nums">{formatLargeDollars(data.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-[13px] text-fg-muted">Customs share of receipts</dt>
            <dd className="text-[13px] tabular-nums font-semibold">
              {formatPercent(customsShare)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="text-[13px] text-fg-muted">Per US resident (customs)</dt>
            <dd className="text-[13px] tabular-nums">{customsPerCapita}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
