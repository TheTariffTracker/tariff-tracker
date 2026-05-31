// ChartCard — "Daily Customs Receipts — Last 90 Days" card. Hand-rolled SVG
// matching the v11 mockup (no charting library). Two series:
//   - current period (orange, solid stroke + translucent fill)
//   - prior year same days (blue, dashed stroke)
//
// Async server component that fetches `dts_daily` rows from Supabase at
// render time. Anchor is the most recent dts_daily.record_date (DTS lags
// ~1 business day, so this is also the chart's right edge). The current
// period spans 90 calendar days ending at the anchor; the prior-year line
// is calendar-aligned (each prior point is its current counterpart minus
// exactly 365 days).
//
// **Critical unit conversion:** dts_daily.customs_revenue_today is stored
// in MILLIONS of dollars. We multiply by 1e6 before plotting on a $-axis.
//
// Coordinate system (viewBox 0 0 800 280):
//   plot area x ∈ [40, 780], y ∈ [40, 220]
//   y-axis is dynamic (computeAxis picks a nice yMax based on the largest
//   value in either series); 4 ticks evenly spaced.
//   x position = day offset within the 90-day period, scaled to [40, 780].

import { supabase } from "../lib/supabase";
import CiteButton from "./CiteButton";

const SITE_URL = "https://tarifftracker.org/";

const VIEWBOX_W = 800;
const VIEWBOX_H = 280;
const PLOT_X0 = 40;
const PLOT_X1 = 780;
const PLOT_Y0 = 40; // top of plot area
const PLOT_Y1 = 220; // bottom (zero baseline)
const PERIOD_DAYS = 90;
const MAX_OFFSET = PERIOD_DAYS - 1; // 89 — offsets run 0..89

type DtsRow = {
  record_date: string;
  customs_revenue_today: number; // millions of dollars
};

// ---------- Date helpers (avoid UTC midnight timezone bug) ----------
function parseDate(iso: string): Date {
  const [yyyy, mm, dd] = iso.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return formatIsoDate(d);
}

function daysBetween(startIso: string, endIso: string): number {
  const a = parseDate(startIso).getTime();
  const b = parseDate(endIso).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatShortDate(iso: string): string {
  const d = parseDate(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatLongDate(iso: string): string {
  const d = parseDate(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ---------- Y-axis helpers ----------
// Pick a "nice" yMax for 4 ticks (0 + 3 increments). Chooses the smallest
// interval from a curated list such that 3 * interval covers the max value.
function computeAxis(maxDollars: number): { yMax: number; ticks: number[] } {
  const billions = maxDollars / 1e9;
  const intervals = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 50, 100];
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

// ---------- Point + path helpers ----------
type Point = { x: number; y: number };

function rowToPoint(row: DtsRow, periodStart: string, yMax: number): Point {
  const offset = daysBetween(periodStart, row.record_date);
  const xRatio = offset / MAX_OFFSET;
  const x = PLOT_X0 + xRatio * (PLOT_X1 - PLOT_X0);
  const dollars = Number(row.customs_revenue_today) * 1e6;
  const y = PLOT_Y1 - (dollars / yMax) * (PLOT_Y1 - PLOT_Y0);
  return { x, y };
}

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

function pointsToAreaPath(points: Point[]): string {
  if (points.length === 0) return "";
  const top = pointsToPath(points);
  const lastX = points[points.length - 1].x.toFixed(2);
  const firstX = points[0].x.toFixed(2);
  return `${top} L ${lastX},${PLOT_Y1} L ${firstX},${PLOT_Y1} Z`;
}

// ---------- Data fetch ----------
type ChartData =
  | {
      kind: "ok";
      current: DtsRow[];
      prior: DtsRow[];
      anchorDate: string;
      periodStart: string;
      priorPeriodStart: string;
    }
  | { kind: "empty" }
  | { kind: "error" };

async function getChartData(): Promise<ChartData> {
  // Step 1: anchor = latest DTS record_date. DTS publishes T-1, so this is
  // the chart's right edge and also gives us a stable date that doesn't
  // depend on the wall clock or timezone of whoever's rendering.
  const anchorResp = await supabase
    .from("dts_daily")
    .select("record_date")
    .order("record_date", { ascending: false })
    .limit(1);

  if (anchorResp.error) {
    console.error("ChartCard anchor fetch error:", anchorResp.error);
    return { kind: "error" };
  }
  if (!anchorResp.data || anchorResp.data.length === 0) {
    return { kind: "empty" };
  }

  const anchorDate = anchorResp.data[0].record_date as string;
  const periodStart = addDays(anchorDate, -MAX_OFFSET);
  const priorYearAnchor = addDays(anchorDate, -365);
  const priorPeriodStart = addDays(priorYearAnchor, -MAX_OFFSET);

  // Step 2: parallel queries for current + prior periods.
  const [currentResp, priorResp] = await Promise.all([
    supabase
      .from("dts_daily")
      .select("record_date, customs_revenue_today")
      .gte("record_date", periodStart)
      .lte("record_date", anchorDate)
      .order("record_date", { ascending: true }),
    supabase
      .from("dts_daily")
      .select("record_date, customs_revenue_today")
      .gte("record_date", priorPeriodStart)
      .lte("record_date", priorYearAnchor)
      .order("record_date", { ascending: true }),
  ]);

  if (currentResp.error || priorResp.error) {
    console.error(
      "ChartCard series fetch error:",
      currentResp.error || priorResp.error,
    );
    return { kind: "error" };
  }

  return {
    kind: "ok",
    current: (currentResp.data ?? []) as DtsRow[],
    prior: (priorResp.data ?? []) as DtsRow[],
    anchorDate,
    periodStart,
    priorPeriodStart,
  };
}

// ---------- Render ----------
export default async function ChartCard() {
  const data = await getChartData();

  // Error / empty fallback: same card chrome, no SVG.
  if (data.kind !== "ok") {
    const msg =
      data.kind === "error"
        ? "Unable to load chart data. Please refresh."
        : "No data available yet.";
    return (
      <section className="border border-border bg-bg mb-5">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Daily Customs Receipts — Last 90 Days
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Source: Daily Treasury Statement
          </span>
        </header>
        <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
          {msg}
        </div>
      </section>
    );
  }

  const { current, prior, anchorDate, periodStart, priorPeriodStart } = data;

  // Dynamic Y-axis from the max across both series. Falls back to $1B if
  // both series are empty/zero so we still render a usable axis.
  const allDollars = [
    ...current.map((r) => Number(r.customs_revenue_today) * 1e6),
    ...prior.map((r) => Number(r.customs_revenue_today) * 1e6),
  ];
  const maxDollars = allDollars.length > 0 ? Math.max(...allDollars) : 1e9;
  const axis = computeAxis(maxDollars);

  const currentPoints = current.map((r) => rowToPoint(r, periodStart, axis.yMax));
  const priorPoints = prior.map((r) => rowToPoint(r, priorPeriodStart, axis.yMax));

  const currentPath = pointsToPath(currentPoints);
  const currentArea = pointsToAreaPath(currentPoints);
  const priorPath = pointsToPath(priorPoints);

  // X-axis: 5 evenly-spaced date labels covering the current period.
  const labelOffsets = [
    0,
    Math.round(MAX_OFFSET * 0.25),
    Math.round(MAX_OFFSET * 0.5),
    Math.round(MAX_OFFSET * 0.75),
    MAX_OFFSET,
  ];

  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <div className="flex items-center gap-5 flex-wrap">
          <h2 className="text-sm font-semibold m-0 flex items-center gap-1.5">
            Daily Customs Receipts — Last 90 Days
          </h2>
          <div className="flex gap-3.5 items-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
              <span
                className="inline-block w-3.5 h-[3px] rounded-[1px] bg-orange"
                aria-hidden
              />
              Current period
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
              <span
                className="inline-block w-3.5 h-[2px]"
                aria-hidden
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--color-blue) 0, var(--color-blue) 4px, transparent 4px, transparent 7px)",
                }}
              />
              Prior year (same days)
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Source: Daily Treasury Statement · Data through {formatLongDate(anchorDate)}
          </span>
          <CiteButton
            figureLabel={`Daily U.S. Customs Receipts, 90 days ending ${formatLongDate(anchorDate)}`}
            sourceName="U.S. Department of the Treasury, Daily Treasury Statement"
            dataThrough={formatLongDate(anchorDate)}
            url={SITE_URL}
          />
        </div>
      </header>

      <div className="px-4 pb-4 pt-2">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          preserveAspectRatio="none"
          className="w-full h-[280px] block"
          role="img"
          aria-label="Daily customs receipts over the last 90 days, current period versus prior year"
        >
          {/* Horizontal gridlines + y-axis labels */}
          {axis.ticks.map((tick, i) => {
            const y = PLOT_Y1 - (i / 3) * (PLOT_Y1 - PLOT_Y0);
            return (
              <g key={`tick-${i}`}>
                <line x1={PLOT_X0} y1={y} x2={PLOT_X1} y2={y} stroke="var(--color-border)" />
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

          {/* X-axis date labels */}
          {labelOffsets.map((offset, i) => {
            const date = addDays(periodStart, offset);
            const x = PLOT_X0 + (offset / MAX_OFFSET) * (PLOT_X1 - PLOT_X0);
            const isLast = i === labelOffsets.length - 1;
            return (
              <text
                key={`xlabel-${i}`}
                x={x}
                y={245}
                fill="var(--color-fg-muted)"
                fontSize={10}
                textAnchor={isLast ? "end" : "start"}
              >
                {formatShortDate(date)}
              </text>
            );
          })}

          {/* Prior-year dashed line */}
          {priorPath && (
            <path
              d={priorPath}
              stroke="var(--color-blue)"
              strokeWidth={1.3}
              strokeDasharray="4,3"
              fill="none"
              opacity={0.75}
            />
          )}

          {/* Current-period filled area + solid stroke */}
          {currentPath && (
            <>
              <path d={currentArea} fill="var(--color-orange)" opacity={0.1} />
              <path
                d={currentPath}
                stroke="var(--color-orange)"
                strokeWidth={1.8}
                fill="none"
              />
            </>
          )}
        </svg>
      </div>
    </section>
  );
}
