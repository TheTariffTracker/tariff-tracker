// MtsBarChart — monthly customs duties bar chart from mts_monthly.
// Hand-rolled SVG. One bar per ingested month since the Jan 2025 baseline.
//
// **Unit note:** mts_monthly.customs_duties is stored in ACTUAL DOLLARS
// (with cents). NOT millions like dts_daily. We pass it through directly to
// the Y-axis scale.
//
// ** NEGATIVE MONTHS ARE REAL AND MUST RENDER. ** customs_duties is NET
// receipts, and since the IEEPA refunds began it has gone negative three
// times (May/Jun/Jul 2026, the worst at -$25.6B). The original version
// computed `height = (dollars / yMax) * PLOT_H` and passed that straight to
// <rect>; a negative height is invalid SVG, so browsers skipped the element
// and those three months silently vanished from the chart between June and
// October 2026. Bar geometry below is written so height is ALWAYS >= 0 --
// a bar spans from its value to zero, whichever way that runs.
//
// Coordinate system (viewBox 0 0 800 280):
//   plot area x ∈ [40, 780], y ∈ [40, 220]
//   y-axis is dynamic (computeAxis picks a nice yMax)
//   bars are distributed evenly across the plot area with a small gap

import { supabase } from "../lib/supabase";

const VIEWBOX_W = 800;
const VIEWBOX_H = 280;
const PLOT_X0 = 40;
const PLOT_X1 = 780;
const PLOT_Y0 = 40;
const PLOT_Y1 = 220;
const PLOT_W = PLOT_X1 - PLOT_X0;
const PLOT_H = PLOT_Y1 - PLOT_Y0;
const BAR_GAP = 4; // px between bars

type MtsRow = {
  year: number;
  month: number;
  customs_duties: number | string; // numeric → string in JSON; NET of refunds
  customs_gross: number | string | null; // gross receipts before refunds
  customs_refunds: number | string | null; // kept for the tooltip/aria text
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} '${String(year).slice(-2)}`;
}

// Signed axis: the range must span zero, because net months go negative.
// Picks the finest interval that keeps the total number of divisions at 7 or
// fewer, then extends to a whole interval in each direction so zero always
// lands exactly on a gridline.
function computeAxis(
  maxDollars: number,
  minDollars: number,
): { yMin: number; yMax: number; ticks: number[] } {
  const intervals = [
    1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200,
  ];
  const upB = Math.max(maxDollars, 0) / 1e9;
  const downB = Math.abs(Math.min(minDollars, 0)) / 1e9;

  let interval = intervals[intervals.length - 1];
  for (const v of intervals) {
    if (Math.ceil(upB / v) + Math.ceil(downB / v) <= 7) {
      interval = v;
      break;
    }
  }

  const up = Math.max(1, Math.ceil(upB / interval));
  const down = Math.ceil(downB / interval);
  const ticks: number[] = [];
  for (let k = -down; k <= up; k += 1) ticks.push(k * interval * 1e9);
  return { yMin: -down * interval * 1e9, yMax: up * interval * 1e9, ticks };
}

// Sign-aware. Ticks go negative now, and the magnitude test has to run on the
// absolute value: -10e9 / 1e9 is -10, which fails a `>= 1` check and used to
// fall through to the millions branch, printing "$-10000M" -- long enough to
// overflow the left margin and render as a clipped "0000M".
function formatTickLabel(dollars: number): string {
  if (dollars === 0) return "$0";
  const sign = dollars < 0 ? "\u2212" : "";
  const abs = Math.abs(dollars);
  const billions = abs / 1e9;
  if (billions >= 1) {
    return billions === Math.floor(billions)
      ? `${sign}$${billions}B`
      : `${sign}$${billions.toFixed(1)}B`;
  }
  return `${sign}$${Math.round(abs / 1e6)}M`;
}

async function getMtsRows(): Promise<{ rows: MtsRow[]; error: boolean }> {
  const { data, error } = await supabase
    .from("mts_monthly")
    .select("year, month, customs_duties, customs_gross, customs_refunds")
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  if (error) {
    console.error("MtsBarChart fetch error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as MtsRow[], error: false };
}

export default async function MtsBarChart() {
  const { rows, error } = await getMtsRows();

  if (error || rows.length === 0) {
    const msg = error
      ? "Unable to load monthly revenue data. Please refresh."
      : "No monthly data available yet.";
    return (
      <section className="border border-border bg-bg mb-5">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Monthly Customs Duties — Since January 2025
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Source: Monthly Treasury Statement Table 4
          </span>
        </header>
        <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
          {msg}
        </div>
      </section>
    );
  }

  // Axis spans both series: the top comes from gross, the floor from net,
  // which is the one that goes negative.
  const netDollars = rows.map((r) => Number(r.customs_duties));
  const grossDollars = rows.map((r) =>
    r.customs_gross === null ? Number(r.customs_duties) : Number(r.customs_gross),
  );
  const axis = computeAxis(
    Math.max(...grossDollars, ...netDollars),
    Math.min(...netDollars, 0),
  );
  const axisSpan = axis.yMax - axis.yMin;
  const toY = (v: number) => PLOT_Y1 - ((v - axis.yMin) / axisSpan) * PLOT_H;

  // Bar layout: evenly distribute N bars across the plot area, with BAR_GAP
  // between each. Each bar's width = (PLOT_W - (N+1)*GAP) / N, but cap at a
  // reasonable max so single-month charts aren't comically wide.
  const n = rows.length;
  const totalGap = (n + 1) * BAR_GAP;
  const barWidth = Math.max(2, (PLOT_W - totalGap) / n);

  const newestMonth = rows[rows.length - 1];
  const newestLabel = `${MONTH_SHORT[newestMonth.month - 1]} ${newestMonth.year}`;

  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0">
          Monthly Customs Duties — Since January 2025
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-[2px]"
              style={{ background: "var(--color-orange)", opacity: 0.28 }}
            />
            Gross collected
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-[2px]"
              style={{ background: "var(--color-orange)", opacity: 0.9 }}
            />
            Net of refunds
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span
              aria-hidden="true"
              className="inline-block w-3 h-3 rounded-[2px]"
              style={{ background: "var(--color-red)", opacity: 0.9 }}
            />
            Refunds exceeded collections
          </span>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Source: Monthly Treasury Statement Table 4 · Through {newestLabel}
          </span>
        </div>
      </header>
      <div className="px-4 pb-4 pt-2">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          preserveAspectRatio="none"
          className="w-full h-[280px] block"
          role="img"
          aria-label="Monthly customs duties since January 2025, gross receipts and net of refunds. Three months in 2026 are negative, where refunds exceeded collections."
        >
          {/* Horizontal gridlines + y-axis labels */}
          {axis.ticks.map((tick, i) => {
            const y = toY(tick);
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={PLOT_X0}
                  y1={y}
                  x2={PLOT_X1}
                  y2={y}
                  stroke={
                    tick === 0
                      ? "var(--color-border-strong)"
                      : "var(--color-border)"
                  }
                />
                <text
                  x={35}
                  y={y + 4}
                  fill="var(--color-fg-muted)"
                  fontSize={10}
                  textAnchor="end"
                >
                  {formatTickLabel(tick)}
                </text>
              </g>
            );
          })}

          {/* Bars + month labels */}
          {rows.map((row, i) => {
            const net = Number(row.customs_duties);
            const gross =
              row.customs_gross === null ? net : Number(row.customs_gross);
            const x = PLOT_X0 + BAR_GAP + i * (barWidth + BAR_GAP);
            const centerX = x + barWidth / 2;

            // A bar always runs between its value and zero, so height is never
            // negative whichever side of the axis the value sits on.
            const bar = (v: number) => {
              const top = toY(Math.max(v, 0));
              const bottom = toY(Math.min(v, 0));
              return { y: top, height: Math.max(0, bottom - top) };
            };
            const g = bar(gross);
            const nb = bar(net);
            const netW = barWidth * 0.56;

            return (
              <g key={`${row.year}-${row.month}`}>
                {/* Gross, behind and full width. The visible gap above the
                    net bar is the month's refunds. */}
                <rect
                  x={x}
                  y={g.y}
                  width={barWidth}
                  height={g.height}
                  fill="var(--color-orange)"
                  opacity={0.28}
                />
                {/* Net, in front. Red below the zero line, where refunds
                    exceeded collections. */}
                <rect
                  x={centerX - netW / 2}
                  y={nb.y}
                  width={netW}
                  height={nb.height}
                  fill={net < 0 ? "var(--color-red)" : "var(--color-orange)"}
                  opacity={0.9}
                />
                {/* Label calendar quarters plus the newest month. All 21
                    labels at this width overlap into an unreadable run --
                    "Jan '25Feb '25Mar '25". Keyed on the month number rather
                    than the index so they stay quarter-aligned as the series
                    grows. */}
                {(row.month === 1 ||
                  row.month === 4 ||
                  row.month === 7 ||
                  row.month === 10 ||
                  i === rows.length - 1) && (
                  <text
                    x={centerX}
                    y={PLOT_Y1 + 25}
                    fill="var(--color-fg-muted)"
                    fontSize={10}
                    textAnchor="middle"
                  >
                    {formatMonthLabel(row.year, row.month)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
