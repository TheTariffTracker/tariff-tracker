import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";
import CiteButton from "../components/CiteButton";
import {
  BASELINE_1912,
  REVENUE_BREAKDOWN_1912,
  OUTLAY_COMPOSITION_1912,
  MIX_1912_DISPLAY_PCT,
} from "../lib/baseline-1912";
import { getReplacementMath, type PanelData, type ScopeRow } from "../lib/calc-1912";

export const metadata: Metadata = {
  title: "1912 vs Today",
  description:
    "What would tariffs need to be today to fund the federal government on the 1912 revenue mix — before the income tax? A comparison of the pre-16th-Amendment revenue composition applied to current federal spending.",
};

// 1912 vs Today (route: "/1912-vs-today"). Three stacked panels:
//   1. Historical context — the FY1912 revenue mix (pie) + what it funded.
//   2. Fiscal-year baseline — most recent finalized FY, three-scope table.
//   3. Trailing 12 months — same table, rolling window.
//
// The headline is the mathematical answer (1912 mix applied to today's
// spending), NOT a forecast or a policy recommendation. Copy is written to
// keep that stance explicit. "Balanced," never "profitable."
//
// Data: app/lib/calc-1912.ts (federal_outlays + federal_receipts) and the
// verified app/lib/baseline-1912.ts constants. Charts are hand-rolled SVG,
// matching the site pattern.

// ===================== formatting =====================
function fmtProse(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(0)} billion`;
  return `$${(n / 1e6).toFixed(0)} million`;
}
function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}
function fmt1912(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)} billion`;
  return `$${(n / 1e6).toFixed(1)} million`;
}
function fmtMultiple(target: number, base: number): string {
  if (!base) return "—";
  return `${(target / base).toFixed(0)}×`;
}

// ===================== pie geometry =====================
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

const SLICE_COLOR: Record<string, string> = {
  tariffs: "var(--color-orange)",
  excise: "var(--color-blue)",
  miscellaneous: "var(--color-fg-muted)",
};
const SLICE_PCT: Record<string, number> = {
  tariffs: MIX_1912_DISPLAY_PCT.tariffs,
  excise: MIX_1912_DISPLAY_PCT.excise,
  miscellaneous: MIX_1912_DISPLAY_PCT.miscellaneous,
};

// ===================== shared section shell =====================
function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-start px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0">{title}</h2>
        {meta && <span className="text-[11px] text-fg-muted whitespace-nowrap">{meta}</span>}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

// ===================== Panel 1: 1912 context =====================
function HistoricalPanel() {
  const total = BASELINE_1912.receipts.total;
  // Build pie slices from the verified breakdown.
  let angle = 0;
  const slices = REVENUE_BREAKDOWN_1912.map((s) => {
    const frac = s.amount / total;
    const start = angle;
    const end = angle + frac * 360;
    angle = end;
    return {
      key: s.key,
      label: s.label,
      pct: SLICE_PCT[s.key],
      color: SLICE_COLOR[s.key],
      path: arcPath(100, 100, 90, start, end),
    };
  });

  return (
    <Panel title="1912: the last budget before the income tax" meta="FY ended June 30, 1912">
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-6 items-start">
        {/* Left: narrative + outlay composition */}
        <div>
          <p className="text-[13px] leading-relaxed text-fg m-0 mb-3">
            In fiscal year 1912, the last full year before the 16th Amendment
            authorized a federal income tax, the government took in{" "}
            <strong>{fmt1912(BASELINE_1912.receipts.total)}</strong> and spent{" "}
            <strong>{fmt1912(BASELINE_1912.expenditures.total)}</strong>; leaving the
            budget essentially balanced, and doing so without an income tax. Revenue
            came mostly from two sources: customs duties (tariffs) at{" "}
            {MIX_1912_DISPLAY_PCT.tariffs}%, and internal revenue via excise taxes,
            (chiefly on alcohol and tobacco) at {MIX_1912_DISPLAY_PCT.excise}%, with
            the remaining {MIX_1912_DISPLAY_PCT.miscellaneous}% from miscellaneous
            receipts.
          </p>
          <p className="text-[11px] uppercase tracking-[0.06em] text-fg-muted m-0 mb-2 mt-5">
            What it funded
          </p>
          <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
            {OUTLAY_COMPOSITION_1912.map((o) => (
              <li key={o.label} className="text-[12px]">
                <div className="flex justify-between gap-3">
                  <span className="text-fg">{o.label}</span>
                  <span className="text-fg-muted tabular-nums whitespace-nowrap">{o.pct}%</span>
                </div>
                <div className="h-[5px] bg-bg-alt mt-1 rounded-[1px] overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${o.pct}%`, backgroundColor: "var(--color-fg-muted)", opacity: 0.55 }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-muted m-0 mt-3 leading-relaxed">
            No Social Security, Medicare, Medicaid, federal student loans, or most
            modern civil agencies existed. Civil War veterans&rsquo; pensions were the
            largest civilian outlay.
          </p>
        </div>

        {/* Right: pie */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 200 200" className="w-full max-w-[240px] h-auto block" role="img" aria-label="FY1912 federal revenue mix">
            {slices.map((s) => (
              <path key={s.key} d={s.path} fill={s.color} stroke="var(--color-bg)" strokeWidth={1} />
            ))}
          </svg>
          <div className="flex flex-wrap gap-3 items-center justify-center mt-3">
            {slices.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                <span className="inline-block w-3 h-3 rounded-[2px]" style={{ backgroundColor: s.color }} aria-hidden />
                {s.label} · {s.pct}%
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ===================== three-scope table =====================
function ScopeTable({ panel }: { panel: PanelData }) {
  const th =
    "bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] px-4 py-1.5 border-b border-border";
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th className={`${th} text-left`}>If you abolish…</th>
          <th className={`${th} text-right`}>Income tax replaced</th>
          <th className={`${th} text-right`}>Revenue needed</th>
          <th className={`${th} text-right`}>Tariffs would need to be</th>
        </tr>
      </thead>
      <tbody>
        {panel.scopes.map((row: ScopeRow, i: number) => {
          const isHeadline = row.scope === "individual";
          const isLast = i === panel.scopes.length - 1;
          const cell = `px-4 py-2 ${isLast ? "" : "border-b border-border"}`;
          return (
            <tr
              key={row.scope}
              className={isHeadline ? "bg-[rgba(194,65,12,0.05)]" : ""}
            >
              <td className={`${cell} ${isHeadline ? "font-semibold" : ""}`}>
                {row.label}
              </td>
              <td className={`${cell} text-right tabular-nums`}>{fmtCompact(row.incomeTaxReplaced)}</td>
              <td className={`${cell} text-right tabular-nums`}>{fmtCompact(row.nonIncomeRevenueNeeded)}</td>
              <td className={`${cell} text-right tabular-nums font-semibold`}>{fmtCompact(row.tariffTarget)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ===================== Panel 2 / 3: replacement math =====================
function ReplacementPanel({
  title,
  panel,
}: {
  title: string;
  panel: PanelData;
}) {
  const h = panel.headline;
  const mult = fmtMultiple(h.tariffTarget, panel.currentRevenue.customs);
  return (
    <Panel title={title} meta={panel.basisLabel}>
      {/* Subdued headline — distinct from body, but not the Dashboard mega-counter. */}
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted mb-1">
          Abolishing the individual income tax and matching the 1912 mix, tariffs would need to be
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-serif text-3xl font-bold text-fg tabular-nums">
            {fmtProse(h.tariffTarget)}
          </span>
          <CiteButton
            figureLabel={`Tariff target to match the 1912 revenue mix — ${panel.basisLabel}`}
            value={fmtProse(h.tariffTarget)}
            sourceName="the FY1912 revenue mix (OMB Historical Tables; Census Bureau Historical Statistics, Series Y) applied to U.S. Treasury Monthly Treasury Statement outlays (Table 5) and receipts (Table 4)"
            dataThrough={panel.basisLabel}
            url="https://tarifftracker.org/1912-vs-today"
          />
        </div>
        <div className="text-[12px] text-fg-muted mt-1">
          about {mult} current customs revenue ({fmtCompact(panel.currentRevenue.customs)}). Total
          spending this period: {fmtCompact(panel.spending)}.
        </div>
      </div>

      <ScopeTable panel={panel} />

      <p className="text-[11px] text-fg-muted m-0 mt-3 leading-relaxed">
        &ldquo;Revenue needed&rdquo; is total spending minus the income/payroll taxes you keep.
        The 1912 mix would split it {MIX_1912_DISPLAY_PCT.tariffs}% tariffs /{" "}
        {MIX_1912_DISPLAY_PCT.excise}% excise / {MIX_1912_DISPLAY_PCT.miscellaneous}% miscellaneous;
        the final column shows the tariff share. For the top row, that mix also implies excise of{" "}
        {fmtCompact(h.exciseTarget)} (vs {fmtCompact(panel.currentRevenue.excise)} today) and
        miscellaneous of {fmtCompact(h.miscTarget)}.
      </p>
    </Panel>
  );
}

// ===================== page =====================
export default async function NineteenTwelveVsTodayPage() {
  let math: Awaited<ReturnType<typeof getReplacementMath>> | null = null;
  try {
    math = await getReplacementMath();
  } catch (err) {
    console.error("[1912-vs-today] failed to load replacement math:", err);
  }

  return (
    <MainContent
      title="1912 vs Today"
      subtitle="What would tariffs need to be today to fund the federal government on the 1912 revenue mix; the last time before the income tax? This is the revenue math applied to today's spending, not a forecast or recommendation."
    >
      <HistoricalPanel />

      {math ? (
        <>
          <ReplacementPanel title="Today, by fiscal year" panel={math.fiscalYear} />
          <ReplacementPanel
            title="Today, trailing 12 months"
            panel={math.trailingTwelveMonths}
          />
        </>
      ) : (
        <Panel title="Today">
          <div className="py-10 text-center text-[13px] text-fg-muted">
            Current spending and revenue data are temporarily unavailable.
          </div>
        </Panel>
      )}

      {/* Stance + methodology link */}
      <section className="border border-border bg-bg-alt px-4 py-4 mb-5">
        <p className="text-[12px] text-fg leading-relaxed m-0">
          This is the mathematical answer; what the revenue math requires to
          fund current spending on the 1912 mix. Whether tariffs at that level are
          achievable or desirable is a separate question this tool does not address,
          and 1912&rsquo;s context differs from today&rsquo;s. We present the math; you
          draw the conclusion. For sources and method, see our{" "}
          <Link
            href="/methodology#1912-vs-today"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            methodology page
          </Link>
          .
        </p>
      </section>
    </MainContent>
  );
}
