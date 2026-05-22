import type { Metadata } from "next";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";

export const metadata: Metadata = {
  title: "Tariff Trends",
  description:
    "Effective tariff rate trends since January 2025 — by authority (Section 232, 301, IEEPA), country group, and economic sector. Source: Yale Budget Lab.",
};

// Tariff Trends page (route: "/tariff-trends"). Six panels rendering Yale
// Budget Lab's aggregate ETR data loaded from their April 2026 snapshot.
//
// Source: Yale Budget Lab Tariff Rate Tracker
// (https://budgetlab.yale.edu/research/introducing-tariff-rate-tracker-
// open-source-tool-daily-effective-tariff-rates), MIT-licensed, snapshot
// dated 2026-04-01. Loaded via scripts/load_yale_xlsx.py into the
// yale_etr_* Supabase tables. Re-load whenever Yale publishes a new
// snapshot (currently a one-time snapshot; John at TBL is considering a
// maintained time-series feed).
//
// Charts are hand-rolled SVG matching the rest of the site's pattern
// (viewBox 800×280, dynamic Y-axis, theme-responsive colors).
//
// Daily values from 2025-01-01 through 2026-12-31 (730 days) for series F1–F5;
// 26 policy events for the bottom timeline panel.

// ===================== SVG geometry =====================
const VIEWBOX_W = 800;
const VIEWBOX_H = 280;
const PLOT_X0 = 40;
const PLOT_X1 = 780;
const PLOT_Y0 = 40;
const PLOT_Y1 = 220;
const PLOT_W = PLOT_X1 - PLOT_X0;
const PLOT_H = PLOT_Y1 - PLOT_Y0;

// Curated palette for multi-line charts (sectors, partners). Inspired by
// Tableau 10 — chosen for perceptual distinctness across 8 lines. Fixed
// hex values that don't theme-flip; readable in both light + dark.
// Note: separate from AUTHORITY_LINES below, which uses theme tokens
// because the authority colors have semantic meaning (orange = Section
// 232 etc. matches the site's accent palette).
const LINE_COLORS = [
  "#1F77B4", // strong blue
  "#FF7F0E", // strong orange
  "#2CA02C", // strong green
  "#D62728", // strong red
  "#9467BD", // strong purple
  "#8C564B", // brown
  "#E377C2", // pink
  "#7F7F7F", // mid gray
];

// Specific authority colors for panel 2 (consistent meaning across the site
// would be nice eventually, but for now just a thematic mapping).
const AUTHORITY_LINES = [
  { key: "section_232_pct" as const,      label: "Section 232",      color: "var(--color-orange)" },
  { key: "section_301_pct" as const,      label: "Section 301",      color: "var(--color-blue)" },
  { key: "ieepa_reciprocal_pct" as const, label: "IEEPA Reciprocal", color: "var(--color-green)" },
  { key: "ieepa_fentanyl_pct" as const,   label: "IEEPA Fentanyl",   color: "#8B5CF6" },
  { key: "section_122_pct" as const,      label: "Section 122",      color: "#CA8A04" },
  { key: "base_rate_pct" as const,        label: "Base Rate",        color: "var(--color-fg-muted)" },
];

// ===================== Types =====================
type OverallRow = {
  date: string;
  weighted_etr_pct: number | string | null;
};
type AuthorityRow = {
  date: string;
  section_232_pct: number | string | null;
  section_301_pct: number | string | null;
  ieepa_reciprocal_pct: number | string | null;
  ieepa_fentanyl_pct: number | string | null;
  section_122_pct: number | string | null;
  base_rate_pct: number | string | null;
};
type GroupRow = {
  date: string;
  country_group: string;
  etr_pct: number | string | null;
};
type SectorRow = {
  date: string;
  sector: string;
  etr_pct: number | string | null;
};
type PolicyRow = {
  revision: string;
  effective_date: string;
  policy_event: string | null;
  is_major: boolean | null;
};

// ===================== Helpers =====================
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

function parseIsoDate(iso: string): Date {
  const [yyyy, mm, dd] = iso.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthYearShort(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

function formatLongDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

// Y-axis: pick a nice yMax + 4 ticks (0/m/2m/3m).
function computeYAxis(maxValue: number): { yMax: number; ticks: number[] } {
  const safeMax = Math.max(maxValue, 0.5);
  const intervals = [0.5, 1, 2, 3, 4, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];
  let interval = intervals[intervals.length - 1];
  for (const v of intervals) {
    if (v * 3 >= safeMax * 1.05) {
      interval = v;
      break;
    }
  }
  return {
    yMax: interval * 3,
    ticks: [0, interval, interval * 2, interval * 3],
  };
}

function dateToX(idx: number, n: number): number {
  return PLOT_X0 + (idx / Math.max(n - 1, 1)) * PLOT_W;
}
function pctToY(pct: number, yMax: number): number {
  return PLOT_Y1 - (pct / yMax) * PLOT_H;
}

function buildLinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");
}

// X-axis labels: pick ~5 evenly spaced dates
function pickXLabels(dates: string[]): { x: number; label: string }[] {
  const n = dates.length;
  if (n === 0) return [];
  const labelIndices = [0, Math.round((n - 1) * 0.25), Math.round((n - 1) * 0.5), Math.round((n - 1) * 0.75), n - 1];
  return labelIndices.map((i) => ({
    x: dateToX(i, n),
    label: formatMonthYearShort(dates[i]),
  }));
}

// ===================== Data fetchers =====================
function logErr(label: string, err: unknown) {
  const e = err as unknown as Record<string, unknown>;
  console.error(label, {
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
}

async function getOverall() {
  const { data, error } = await supabase
    .from("yale_etr_overall")
    .select("date, weighted_etr_pct")
    .order("date", { ascending: true });
  if (error) {
    logErr("TariffTrends overall fetch error:", error);
    return [] as OverallRow[];
  }
  return (data ?? []) as OverallRow[];
}

async function getByAuthority() {
  const { data, error } = await supabase
    .from("yale_etr_by_authority")
    .select("date, section_232_pct, section_301_pct, ieepa_reciprocal_pct, ieepa_fentanyl_pct, section_122_pct, base_rate_pct")
    .order("date", { ascending: true });
  if (error) {
    logErr("TariffTrends authority fetch error:", error);
    return [] as AuthorityRow[];
  }
  return (data ?? []) as AuthorityRow[];
}

async function getCountryGroups() {
  const { data, error } = await supabase
    .from("yale_etr_by_country_group")
    .select("date, country_group, etr_pct")
    .order("date", { ascending: true });
  if (error) {
    logErr("TariffTrends country_group fetch error:", error);
    return [] as GroupRow[];
  }
  return (data ?? []) as GroupRow[];
}

async function getSectors() {
  const { data, error } = await supabase
    .from("yale_etr_by_sector")
    .select("date, sector, etr_pct")
    .order("date", { ascending: true });
  if (error) {
    logErr("TariffTrends sectors fetch error:", error);
    return [] as SectorRow[];
  }
  return (data ?? []) as SectorRow[];
}

async function getPolicyEvents() {
  const { data, error } = await supabase
    .from("yale_policy_events")
    .select("revision, effective_date, policy_event, is_major")
    .order("effective_date", { ascending: true });
  if (error) {
    logErr("TariffTrends policy events fetch error:", error);
    return [] as PolicyRow[];
  }
  return (data ?? []) as PolicyRow[];
}

// ===================== Page =====================
export default async function TariffTrendsPage() {
  const [overall, authority, countryGroups, sectors, policy] = await Promise.all([
    getOverall(),
    getByAuthority(),
    getCountryGroups(),
    getSectors(),
    getPolicyEvents(),
  ]);

  return (
    <MainContent
      title="Tariff Trends"
      subtitle="Effective tariff rates over time, decomposed by authority, country, and sector. Source: The Budget Lab at Yale, Tariff Rate Tracker (April 2026 snapshot). Rates projected forward through December 2026 per current law."
    >
      <OverallPanel data={overall} />
      <AuthorityPanel data={authority} />
      <CountryGroupPanel data={countryGroups} />
      <SectorPanel data={sectors} />
      <PolicyEventsPanel data={policy} />
    </MainContent>
  );
}

// ===================== Generic chart card wrapper =====================
function ChartCardShell({
  title,
  meta,
  legend,
  children,
}: {
  title: string;
  meta?: string;
  legend?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-start px-4 py-3 border-b border-border gap-4 flex-wrap">
        <div className="flex items-center gap-5 flex-wrap">
          <h2 className="text-sm font-semibold m-0">{title}</h2>
          {legend}
        </div>
        {meta && (
          <span className="text-[11px] text-fg-muted whitespace-nowrap">{meta}</span>
        )}
      </header>
      <div className="px-4 pb-4 pt-2">{children}</div>
    </section>
  );
}

// ===================== Panel 1: Overall ETR =====================
function OverallPanel({ data }: { data: OverallRow[] }) {
  if (data.length === 0) {
    return (
      <ChartCardShell title="Daily Effective Tariff Rate">
        <div className="py-10 text-center text-[13px] text-fg-muted">
          No data available.
        </div>
      </ChartCardShell>
    );
  }

  const values = data.map((r) => num(r.weighted_etr_pct));
  const dates = data.map((r) => r.date);
  const axis = computeYAxis(Math.max(...values));
  const n = data.length;
  const points = values.map((v, i) => ({ x: dateToX(i, n), y: pctToY(v, axis.yMax) }));
  const linePath = buildLinePath(points);
  const areaPath = `${linePath} L ${points[n - 1].x.toFixed(2)},${PLOT_Y1} L ${points[0].x.toFixed(2)},${PLOT_Y1} Z`;
  const xLabels = pickXLabels(dates);

  return (
    <ChartCardShell
      title="Daily Effective Tariff Rate"
      meta={`Import-weighted average across all products & countries · ${formatLongDate(dates[0])} – ${formatLongDate(dates[n - 1])}`}
    >
      <BaseSvg axis={axis} xLabels={xLabels}>
        <path d={areaPath} fill="var(--color-orange)" opacity={0.1} />
        <path d={linePath} stroke="var(--color-orange)" strokeWidth={1.8} fill="none" />
      </BaseSvg>
    </ChartCardShell>
  );
}

// ===================== Panel 2: By Authority =====================
function AuthorityPanel({ data }: { data: AuthorityRow[] }) {
  if (data.length === 0) {
    return (
      <ChartCardShell title="Effective Tariff Rate by Authority">
        <div className="py-10 text-center text-[13px] text-fg-muted">
          No data available.
        </div>
      </ChartCardShell>
    );
  }

  const dates = data.map((r) => r.date);
  const n = data.length;

  // Per-authority value series
  const seriesData = AUTHORITY_LINES.map((auth) => ({
    ...auth,
    values: data.map((r) => num(r[auth.key])),
  }));
  // Y-axis from the max across all series
  const overallMax = Math.max(...seriesData.flatMap((s) => s.values));
  const axis = computeYAxis(overallMax);

  const lines = seriesData.map((s) => {
    const pts = s.values.map((v, i) => ({ x: dateToX(i, n), y: pctToY(v, axis.yMax) }));
    return { ...s, path: buildLinePath(pts) };
  });

  const xLabels = pickXLabels(dates);

  const legend = (
    <div className="flex flex-wrap gap-3 items-center">
      {AUTHORITY_LINES.map((a) => (
        <span key={a.key} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span
            className="inline-block w-3 h-[3px] rounded-[1px]"
            style={{ backgroundColor: a.color }}
            aria-hidden
          />
          {a.label}
        </span>
      ))}
    </div>
  );

  return (
    <ChartCardShell
      title="ETR Decomposed by Tariff Authority"
      meta="Authority shares sum to the overall weighted ETR each day"
      legend={legend}
    >
      <BaseSvg axis={axis} xLabels={xLabels}>
        {lines.map((s) => (
          <path
            key={s.key}
            d={s.path}
            stroke={s.color}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
      </BaseSvg>
    </ChartCardShell>
  );
}

// ===================== Panel 3 & 4: Country Groups =====================
function CountryGroupPanel({ data }: { data: GroupRow[] }) {
  if (data.length === 0) {
    return (
      <ChartCardShell title="ETR by Country Group">
        <div className="py-10 text-center text-[13px] text-fg-muted">
          No data available.
        </div>
      </ChartCardShell>
    );
  }

  // Partition: F3a groups (China + All Other Countries) vs F3b partners.
  // Identify by the canonical names from the snapshot.
  const F3A_NAMES = new Set(["China", "All Other Countries"]);

  // Build a Map<group, [{date, pct}]>
  const byGroup = new Map<string, { date: string; pct: number }[]>();
  for (const r of data) {
    if (!byGroup.has(r.country_group)) byGroup.set(r.country_group, []);
    byGroup.get(r.country_group)!.push({ date: r.date, pct: num(r.etr_pct) });
  }
  // Sort each by date (data already returned ordered, but be defensive)
  for (const arr of byGroup.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const f3aSeries: { name: string; color: string; values: number[]; dates: string[] }[] = [];
  const f3bSeries: { name: string; color: string; values: number[]; dates: string[] }[] = [];

  // Order the F3a series so China is rendered LAST (on top)
  const f3aOrder = ["All Other Countries", "China"];
  for (const name of f3aOrder) {
    const series = byGroup.get(name);
    if (!series) continue;
    f3aSeries.push({
      name,
      color: name === "China" ? "var(--color-red)" : "var(--color-fg-muted)",
      values: series.map((p) => p.pct),
      dates: series.map((p) => p.date),
    });
  }

  // For F3b, just take everything not in F3A_NAMES, sorted alphabetically with
  // colors assigned from the palette.
  const f3bNames = Array.from(byGroup.keys()).filter((n) => !F3A_NAMES.has(n)).sort();
  f3bNames.forEach((name, i) => {
    const series = byGroup.get(name)!;
    f3bSeries.push({
      name,
      color: LINE_COLORS[i % LINE_COLORS.length],
      values: series.map((p) => p.pct),
      dates: series.map((p) => p.date),
    });
  });

  return (
    <>
      <CountryGroupChart
        title="China vs. All Other Countries"
        subtitle="China-origin imports vs. the global ex-China average"
        series={f3aSeries}
      />
      <CountryGroupChart
        title="ETR by Trading Partner (Excluding China)"
        subtitle="Major partner regions / FTA designations"
        series={f3bSeries}
      />
    </>
  );
}

function CountryGroupChart({
  title,
  subtitle,
  series,
}: {
  title: string;
  subtitle: string;
  series: { name: string; color: string; values: number[]; dates: string[] }[];
}) {
  if (series.length === 0) {
    return (
      <ChartCardShell title={title}>
        <div className="py-10 text-center text-[13px] text-fg-muted">
          No data available.
        </div>
      </ChartCardShell>
    );
  }

  const overallMax = Math.max(...series.flatMap((s) => s.values));
  const axis = computeYAxis(overallMax);
  const n = series[0].values.length;

  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => ({ x: dateToX(i, n), y: pctToY(v, axis.yMax) }));
    return { ...s, path: buildLinePath(pts) };
  });

  const xLabels = pickXLabels(series[0].dates);

  const legend = (
    <div className="flex flex-wrap gap-3 items-center">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span
            className="inline-block w-3 h-[3px] rounded-[1px]"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.name}
        </span>
      ))}
    </div>
  );

  return (
    <ChartCardShell title={title} meta={subtitle} legend={legend}>
      <BaseSvg axis={axis} xLabels={xLabels}>
        {lines.map((s) => (
          <path
            key={s.name}
            d={s.path}
            stroke={s.color}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
      </BaseSvg>
    </ChartCardShell>
  );
}

// ===================== Panel 5: By Sector =====================
function SectorPanel({ data }: { data: SectorRow[] }) {
  if (data.length === 0) {
    return (
      <ChartCardShell title="ETR by Sector">
        <div className="py-10 text-center text-[13px] text-fg-muted">
          No data available.
        </div>
      </ChartCardShell>
    );
  }

  const bySector = new Map<string, { date: string; pct: number }[]>();
  for (const r of data) {
    if (!bySector.has(r.sector)) bySector.set(r.sector, []);
    bySector.get(r.sector)!.push({ date: r.date, pct: num(r.etr_pct) });
  }
  for (const arr of bySector.values()) arr.sort((a, b) => a.date.localeCompare(b.date));

  const sectorNames = Array.from(bySector.keys()).sort();
  const series = sectorNames.map((name, i) => {
    const arr = bySector.get(name)!;
    return {
      name,
      color: LINE_COLORS[i % LINE_COLORS.length],
      values: arr.map((p) => p.pct),
      dates: arr.map((p) => p.date),
    };
  });

  const overallMax = Math.max(...series.flatMap((s) => s.values));
  const axis = computeYAxis(overallMax);
  const n = series[0].values.length;

  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => ({ x: dateToX(i, n), y: pctToY(v, axis.yMax) }));
    return { ...s, path: buildLinePath(pts) };
  });

  const xLabels = pickXLabels(series[0].dates);

  const legend = (
    <div className="flex flex-wrap gap-3 items-center">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span
            className="inline-block w-3 h-[3px] rounded-[1px]"
            style={{ backgroundColor: s.color }}
            aria-hidden
          />
          {s.name}
        </span>
      ))}
    </div>
  );

  return (
    <ChartCardShell title="ETR by Sector (GTAP classification)" legend={legend}>
      <BaseSvg axis={axis} xLabels={xLabels}>
        {lines.map((s) => (
          <path
            key={s.name}
            d={s.path}
            stroke={s.color}
            strokeWidth={1.5}
            fill="none"
          />
        ))}
      </BaseSvg>
    </ChartCardShell>
  );
}

// ===================== Panel 6: Policy Events =====================
function PolicyEventsPanel({ data }: { data: PolicyRow[] }) {
  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0">
          Tariff Policy Events
        </h2>
        <span className="text-[11px] text-fg-muted whitespace-nowrap">
          {data.length} events · ordered by effective date
        </span>
      </header>
      {data.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
          No policy events loaded.
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border whitespace-nowrap">
                Effective Date
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                Policy Event
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border whitespace-nowrap">
                Revision
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-center px-4 py-1.5 border-b border-border whitespace-nowrap">
                Major
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const isLast = i === data.length - 1;
              const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
              return (
                <tr key={`${row.revision}-${row.effective_date}`} className={row.is_major ? "bg-[rgba(194,65,12,0.05)] hover:bg-[rgba(194,65,12,0.10)]" : "hover:bg-bg-alt"}>
                  <td className={`${cellBase} whitespace-nowrap tabular-nums`}>
                    {formatLongDate(row.effective_date)}
                  </td>
                  <td className={cellBase}>{row.policy_event ?? ""}</td>
                  <td className={`${cellBase} font-mono text-[11px] text-fg-muted whitespace-nowrap`}>
                    {row.revision}
                  </td>
                  <td className={`${cellBase} text-center`}>
                    {row.is_major ? (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] rounded-sm whitespace-nowrap bg-[rgba(194,65,12,0.12)] text-orange">
                        Major
                      </span>
                    ) : (
                      <span className="text-fg-muted text-[11px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ===================== Shared SVG shell =====================
// Renders the gridlines, axis ticks, and X-axis date labels. Children
// (the actual lines/areas) are rendered inside it.
function BaseSvg({
  axis,
  xLabels,
  children,
}: {
  axis: { yMax: number; ticks: number[] };
  xLabels: { x: number; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      preserveAspectRatio="none"
      className="w-full h-[280px] block"
      role="img"
    >
      {/* Gridlines + y labels */}
      {axis.ticks.map((tick, i) => {
        const y = PLOT_Y1 - (i / 3) * PLOT_H;
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
              {formatPct(tick)}
            </text>
          </g>
        );
      })}

      {/* X-axis date labels */}
      {xLabels.map((l, i) => {
        const isLast = i === xLabels.length - 1;
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

      {/* Series content (lines, areas, etc.) */}
      {children}
    </svg>
  );
}
