// MtsBarChart — monthly customs duties bar chart from mts_monthly.
// Hand-rolled SVG. One bar per ingested month since the Jan 2025 baseline.
//
// **Unit note:** mts_monthly.customs_duties is stored in ACTUAL DOLLARS
// (with cents). NOT millions like dts_daily. We pass it through directly to
// the Y-axis scale.
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
  customs_duties: number | string; // numeric → string in JSON
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} '${String(year).slice(-2)}`;
}

// Pick a nice yMax for 4 ticks (0 + 3 increments). Same idea as ChartCard.
function computeAxis(maxDollars: number): { yMax: number; ticks: number[] } {
  const billions = maxDollars / 1e9;
  const intervals = [
    1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200,
  ];
  let interval = intervals[intervals.length - 1];
  for (const v of intervals) {
    if (v * 3 >= billions) {
      interval = v;
      break;
    }
  }
  return {
    yMax: interval * 3 * 1e9,
    ticks: [0, interval, interval * 2, interval * 3].map((b) => b * 1e9),
  };
}

function formatTickLabel(dollars: number): string {
  if (dollars === 0) return "$0";
  const billions = dollars / 1e9;
  if (billions >= 1) {
    return billions === Math.floor(billions)
      ? `$${billions}B`
      : `$${billions.toFixed(1)}B`;
  }
  const millions = dollars / 1e6;
  return `$${Math.round(millions)}M`;
}

async function getMtsRows(): Promise<{ rows: MtsRow[]; error: boolean }> {
  const { data, error } = await supabase
    .from("mts_monthly")
    .select("year, month, customs_duties")
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

  // Compute axis from the max dollar value across all bars.
  const allDollars = rows.map((r) => Number(r.customs_duties));
  const maxDollars = Math.max(...allDollars);
  const axis = computeAxis(maxDollars);

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
        <span className="text-[11px] text-fg-muted whitespace-nowrap">
          Source: Monthly Treasury Statement Table 4 · Through {newestLabel}
        </span>
      </header>
      <div className="px-4 pb-4 pt-2">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          preserveAspectRatio="none"
          className="w-full h-[280px] block"
          role="img"
          aria-label="Monthly customs duties revenue since January 2025"
        >
          {/* Horizontal gridlines + y-axis labels */}
          {axis.ticks.map((tick, i) => {
            const y = PLOT_Y1 - (i / 3) * PLOT_H;
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
                  {formatTickLabel(tick)}
                </text>
              </g>
            );
          })}

          {/* Bars + month labels */}
          {rows.map((row, i) => {
            const dollars = Number(row.customs_duties);
            const x = PLOT_X0 + BAR_GAP + i * (barWidth + BAR_GAP);
            const barH = (dollars / axis.yMax) * PLOT_H;
            const barY = PLOT_Y1 - barH;
            const centerX = x + barWidth / 2;
            return (
              <g key={`${row.year}-${row.month}`}>
                <rect
                  x={x}
                  y={barY}
                  width={barWidth}
                  height={barH}
                  fill="var(--color-orange)"
                  opacity={0.85}
                />
                <text
                  x={centerX}
                  y={245}
                  fill="var(--color-fg-muted)"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {formatMonthLabel(row.year, row.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
