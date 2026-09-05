import type { Metadata } from "next";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { getCountryName } from "../lib/census-countries";
import { decodeChapter99 } from "../lib/tariff-actions";
import { lookupRate, type RateLookup } from "../lib/rate-panel";
import CiteButton from "../components/CiteButton";

// Badge styling per tariff-action status. Mirrors the lookup on the country
// profile page; the calculator only ever renders the non-active variants.
const STATUS_BADGE: Record<
  string,
  { label: string; textClass: string; bg: string }
> = {
  active: { label: "Active", textClass: "text-green", bg: "rgba(21,128,61,0.12)" },
  pending: { label: "Pending", textClass: "text-orange", bg: "rgba(234,88,12,0.12)" },
  expired: { label: "Expired", textClass: "text-fg-muted", bg: "rgba(120,120,120,0.15)" },
  invalidated: { label: "Invalidated", textClass: "text-red", bg: "rgba(185,28,28,0.12)" },
};

export const metadata: Metadata = {
  title: "Rate Calculator",
  description:
    "Look up the effective tariff rate — base MFN plus Section 232/301/IEEPA and other programs — for any HTS-10 code, country of origin, and date, with the full per-authority breakdown.",
};

// Calculator page (route: "/calculator").
//
// Two data layers, shown together:
//   1. EFFECTIVE RATE (headline) — from the merged Yale rate panel via
//      app/lib/rate-panel.ts: the exact total effective rate for an
//      HTS-10 × country × date, with the per-authority stack. Optionally an
//      exact duty dollar figure for plain ad-valorem lines.
//   2. PUBLISHED RATES + PROGRAMS (context) — from our hts_codes snapshot:
//      MFN/Special/Column 2 as published, plus the Chapter 99 program list
//      with legal-status badges (the pre-Yale "lite" lookup, retained).
//
// Duty-dollar rule (locked; see project memory): show an EXACT duty only for
// ad-valorem lines (total_rate × customs value). For specific/compound/"other"
// lines the ad-valorem rate understates the true duty, so we show the rate but
// never a dollar figure. Never a blanket "dollars owed" claim.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PANEL_MIN_DATE = "2025-01-01";
const PANEL_MAX_DATE = "2026-12-31";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatUSD(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Per-authority add-on columns, in display order. base_rate is shown separately.
const AUTHORITY_COMPONENTS: Array<{ key: string; label: string }> = [
  { key: "rate_232", label: "Section 232 (metals/derivatives)" },
  { key: "rate_301", label: "Section 301" },
  { key: "rate_301_cs", label: "Section 301 — semiconductors" },
  { key: "rate_s301br", label: "Section 301 — Brazil" },
  { key: "rate_ieepa_recip", label: "IEEPA reciprocal" },
  { key: "rate_ieepa_fent", label: "IEEPA fentanyl" },
  { key: "rate_s122", label: "Section 122" },
  { key: "rate_s338", label: "Section 338" },
  { key: "rate_section_201", label: "Section 201 (safeguard)" },
  { key: "rate_other", label: "Other" },
];

// ===================== Country pre-filtered list =====================
const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "",     label: "Any country (published rates only)" },
  { code: "5700", label: "China" },
  { code: "2010", label: "Mexico" },
  { code: "1220", label: "Canada" },
  { code: "5520", label: "Vietnam" },
  { code: "5880", label: "Japan" },
  { code: "5800", label: "South Korea" },
  { code: "5830", label: "Taiwan" },
  { code: "4280", label: "Germany" },
  { code: "5330", label: "India" },
  { code: "5490", label: "Thailand" },
  { code: "4759", label: "Italy" },
  { code: "5600", label: "Indonesia" },
  { code: "3510", label: "Brazil" },
  { code: "4279", label: "France" },
  { code: "4120", label: "United Kingdom" },
  { code: "5570", label: "Malaysia" },
  { code: "5550", label: "Cambodia" },
  { code: "4419", label: "Switzerland" },
  { code: "5380", label: "Bangladesh" },
  { code: "4890", label: "Türkiye" },
  { code: "4700", label: "Spain" },
  { code: "4010", label: "Sweden" },
  { code: "4210", label: "Netherlands" },
  { code: "5650", label: "Philippines" },
];

// ===================== HTS code normalization =====================
function normalizeHtsCode(input: string): string {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!cleaned) return "";
  if (cleaned.includes(".")) return cleaned;
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
}

function htsAncestors(code: string): string[] {
  const parts = code.split(".");
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push(parts.slice(0, i).join("."));
  }
  return out;
}

// ===================== Types =====================
type HtsRow = {
  hts_code: string;
  description: string | null;
  raw_data: {
    general?: string;
    special?: string;
    other?: string;
    footnotes?: Array<{ type?: string; value?: string; columns?: string[] }>;
    indent?: string;
    [key: string]: unknown;
  };
};

type LookupResult =
  | { kind: "ok"; queriedCode: string; rateCode: string; rateRow: HtsRow; queriedRow: HtsRow | null }
  | { kind: "not_found"; queriedCode: string }
  | { kind: "no_rate"; queriedCode: string; queriedRow: HtsRow | null }
  | { kind: "error" };

// ===================== Fetch (published hts_codes) =====================
async function lookupCode(rawInput: string): Promise<LookupResult> {
  const normalized = normalizeHtsCode(rawInput);
  if (!normalized) return { kind: "not_found", queriedCode: "" };

  const ancestors = htsAncestors(normalized);
  const { data, error } = await supabase
    .from("hts_codes")
    .select("hts_code, description, raw_data")
    .in("hts_code", ancestors);

  if (error) {
    const e = error as unknown as Record<string, unknown>;
    console.error("Calculator lookup error:", {
      message: e?.message, code: e?.code, details: e?.details, hint: e?.hint,
    });
    return { kind: "error" };
  }

  const rows = (data ?? []) as HtsRow[];
  if (rows.length === 0) return { kind: "not_found", queriedCode: normalized };

  const byCode = new Map(rows.map((r) => [r.hts_code, r]));
  const queriedRow = byCode.get(normalized) ?? null;

  for (const candidate of ancestors) {
    const row = byCode.get(candidate);
    if (row && (row.raw_data?.general ?? "").trim() !== "") {
      return { kind: "ok", queriedCode: normalized, rateCode: candidate, rateRow: row, queriedRow };
    }
  }
  return { kind: "no_rate", queriedCode: normalized, queriedRow };
}

// ===================== Page =====================
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; country?: string; date?: string; customs_value?: string }>;
}) {
  const params = await searchParams;
  const codeInput = (params?.code ?? "").trim();
  const countryInput = (params?.country ?? "").trim();
  const dateInput = (params?.date ?? "").trim();
  const valueInput = (params?.customs_value ?? "").trim();
  const hasQuery = codeInput !== "";

  const date = DATE_RE.test(dateInput) ? dateInput : todayISO();
  const customsValue = valueInput ? Number(valueInput.replace(/[^0-9.]/g, "")) : NaN;

  // Published-rate lookup (context layer).
  const result = hasQuery ? await lookupCode(codeInput) : null;

  // Effective-rate lookup (headline layer): needs a full 10-digit code AND a
  // specific country. Guarded so a panel error never breaks the page.
  const plainDigits = codeInput.replace(/\D/g, "");
  const canEffective = hasQuery && plainDigits.length === 10 && countryInput !== "";
  let effective: RateLookup | null = null;
  let effectiveError = false;
  if (canEffective) {
    try {
      effective = await lookupRate(plainDigits, countryInput, date);
    } catch (e) {
      console.error("Effective-rate lookup failed:", (e as Error).message);
      effectiveError = true;
    }
  }

  return (
    <MainContent
      title="Tariff Rate Calculator"
      subtitle="Look up the effective tariff rate for a Harmonized Tariff Schedule code — the base rate plus every applicable program (Section 232, 301, IEEPA, and others) — for a given country of origin and date."
    >
      {/* Search form */}
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">Lookup</h2>
        </header>
        <form method="get" action="/calculator" className="flex flex-wrap gap-2 items-end px-4 py-4 bg-bg-alt">
          <label className="flex flex-col flex-1 min-w-[180px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">HTS code</span>
            <input
              type="text" name="code" defaultValue={codeInput}
              placeholder="e.g., 8703.23.01.40"
              aria-label="HTS code"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange placeholder:text-fg-muted font-mono"
              required
            />
          </label>
          <label className="flex flex-col min-w-[160px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">Source country</span>
            <select
              name="country" defaultValue={countryInput} aria-label="Source country"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code || "any"} value={c.code}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col min-w-[140px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">As of date</span>
            <input
              type="date" name="date" defaultValue={dateInput || todayISO()}
              min={PANEL_MIN_DATE} max={PANEL_MAX_DATE} aria-label="As-of date"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange"
            />
          </label>
          <label className="flex flex-col min-w-[150px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">Customs value (USD, optional)</span>
            <input
              type="number" name="customs_value" defaultValue={valueInput}
              placeholder="e.g., 10000" min="0" step="any" aria-label="Customs value in USD"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange placeholder:text-fg-muted tabular-nums"
            />
          </label>
          <button
            type="submit"
            className="bg-orange text-white px-3 py-1.5 text-[13px] font-medium rounded cursor-pointer hover:bg-orange-bright transition-colors"
          >
            Look up
          </button>
        </form>
      </section>

      {/* Effective rate (headline) */}
      {hasQuery && (
        <EffectiveRate
          effective={effective}
          effectiveError={effectiveError}
          canEffective={canEffective}
          plainDigits={plainDigits}
          countryInput={countryInput}
          date={date}
          customsValue={customsValue}
        />
      )}

      {/* Published rates + programs (context) */}
      {result && <Results result={result} countryCode={countryInput} />}
    </MainContent>
  );
}

// ===================== Effective rate section =====================
function EffectiveRate({
  effective, effectiveError, canEffective, plainDigits, countryInput, date, customsValue,
}: {
  effective: RateLookup | null;
  effectiveError: boolean;
  canEffective: boolean;
  plainDigits: string;
  countryInput: string;
  date: string;
  customsValue: number;
}) {
  const wrap = (children: React.ReactNode) => (
    <section className="border border-border bg-bg mb-5">
      <header className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold m-0">Effective Tariff Rate</h2>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );

  if (!canEffective) {
    const needCode = plainDigits.length !== 10;
    const needCountry = countryInput === "";
    return wrap(
      <p className="m-0 text-[13px] text-fg-muted">
        {needCode && "Enter a full 10-digit HTS code to see the effective rate (the rate panel is keyed at the 10-digit level). "}
        {needCountry && "Select a specific source country. "}
        The published rates and programs below are still shown.
      </p>
    );
  }
  if (effectiveError) {
    return wrap(
      <p className="m-0 text-[13px] text-fg-muted">
        The effective-rate panel is temporarily unavailable. The published rates below still apply.
      </p>
    );
  }
  if (!effective || !effective.found) {
    return wrap(
      <p className="m-0 text-[13px]">
        No effective rate on record for <span className="font-mono">{plainDigits}</span> ×{" "}
        {getCountryName(countryInput)} on {date}. This usually means the code was not in the
        tariff schedule on that date. <span className="text-fg-muted">(Vintage: {effective?.vintage ?? "n/a"}.)</span>
      </p>
    );
  }

  const r = effective.rate!;
  const num = (k: string): number => Number(r[k] ?? 0);
  const totalRate = num("total_rate");
  const baseRate = num("base_rate");
  const baseType = String(r.base_rate_type);
  const validFrom = String(r.valid_from).slice(0, 10);
  const validUntil = String(r.valid_until).slice(0, 10);
  const usmca = r.usmca_eligible === true;
  const specific = effective.flags?.specificOrCompound === true;
  const notYet = effective.flags?.notYetEffective === true;

  const components = AUTHORITY_COMPONENTS
    .map((c) => ({ label: c.label, value: num(c.key) }))
    .filter((c) => c.value !== 0);

  const dutyExact = !specific && Number.isFinite(customsValue) && customsValue > 0;
  const duty = dutyExact ? totalRate * customsValue : null;

  // Vintage-stamped, reproducible citation for this exact lookup.
  const citeData = {
    figureLabel: `Effective tariff rate — HTS ${plainDigits}, ${getCountryName(countryInput)}, as of ${date}`,
    value: formatPct(totalRate),
    sourceName: "The Budget Lab at Yale, Tariff Rate Tracker",
    dataThrough: `Yale Tariff Rate Tracker vintage ${effective.vintage}`,
    url: `https://tarifftracker.org/calculator?code=${plainDigits}&country=${countryInput}&date=${date}`,
  };

  return wrap(
    <>
      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="text-3xl font-semibold tabular-nums text-fg">{formatPct(totalRate)}</div>
        <div className="text-[12px] text-fg-muted">
          total effective rate · {getCountryName(countryInput)} · as of {date}
        </div>
        {notYet && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded text-orange" style={{ background: "rgba(234,88,12,0.12)" }}>
            Scheduled — not yet in effect
          </span>
        )}
      </div>

      <p className="text-[11px] text-fg-muted mt-1 mb-1">
        In effect {validFrom} → {validUntil} · revision {String(r.revision)} · vintage {effective.vintage}
        {usmca && " · USMCA-eligible"}
      </p>
      {date > todayISO() && (
        <p className="text-[11px] text-fg-muted mb-3">
          Your as-of date is in the future — this reflects rates as currently modeled and assumes no further tariff changes.
        </p>
      )}

      {/* Per-authority stack */}
      <div className="border-t border-border pt-3">
        <div className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold mb-2">Breakdown</div>
        <ul className="m-0 p-0 list-none text-[13px]">
          <li className="flex justify-between py-0.5">
            <span>Base rate (MFN){specific ? " — specific/compound" : ""}</span>
            <span className="tabular-nums">{formatPct(baseRate)}</span>
          </li>
          {components.map((c, i) => (
            <li key={i} className="flex justify-between py-0.5">
              <span>{c.label}</span>
              <span className="tabular-nums">+{formatPct(c.value)}</span>
            </li>
          ))}
          <li className="flex justify-between py-1 mt-1 border-t border-border font-semibold">
            <span>Total effective</span>
            <span className="tabular-nums">{formatPct(totalRate)}</span>
          </li>
        </ul>
      </div>

      {/* Duty dollars */}
      {Number.isFinite(customsValue) && customsValue > 0 && (
        <div className="border-t border-border pt-3 mt-3">
          <div className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold mb-1">Estimated duty</div>
          {dutyExact ? (
            <p className="m-0 text-[13px]">
              <span className="text-base font-semibold tabular-nums">{formatUSD(duty as number)}</span>{" "}
              on a customs value of {formatUSD(customsValue)}.{" "}
              <span className="text-fg-muted">Exact for this ad-valorem line ({formatPct(totalRate)} × value).</span>
            </p>
          ) : (
            <p className="m-0 text-[13px] text-fg-muted">
              This line carries a specific or compound duty (a per-unit or per-weight charge), so a dollar
              figure can&apos;t be computed from the ad-valorem rate alone — and the percentage above excludes
              that per-unit component. Consult USITC or a customs broker for the exact duty.
            </p>
          )}
        </div>
      )}

      <div className="border-t border-border pt-3 mt-3">
        <CiteButton {...citeData} />
      </div>
    </>
  );
}

// ===================== Published rates + programs (context) =====================
function Results({ result, countryCode }: { result: LookupResult; countryCode: string }) {
  if (result.kind === "error") {
    return (
      <section className="border border-border bg-bg p-6 text-[13px] text-fg-muted">
        Unable to look up that code. Please try again.
      </section>
    );
  }
  if (result.kind === "not_found") {
    return (
      <section className="border border-border bg-bg p-6 text-[13px]">
        <p className="m-0">
          No matches found for <span className="font-mono">{result.queriedCode || "(empty)"}</span>.
        </p>
        <p className="mt-2 mb-0 text-fg-muted">
          Check the code at{" "}
          <a href={`https://hts.usitc.gov/search?query=${encodeURIComponent(result.queriedCode)}`} target="_blank" rel="noopener noreferrer" className="text-orange underline hover:text-orange-bright transition-colors">USITC HTS Online</a>.
        </p>
      </section>
    );
  }
  if (result.kind === "no_rate") {
    return (
      <section className="border border-border bg-bg p-6 text-[13px]">
        <p className="m-0">
          Found <span className="font-mono">{result.queriedCode}</span>
          {result.queriedRow?.description ? ` — ${result.queriedRow.description}` : ""} but no published MFN rate at any level in our snapshot. Check{" "}
          <a href={`https://hts.usitc.gov/search?query=${encodeURIComponent(result.queriedCode)}`} target="_blank" rel="noopener noreferrer" className="text-orange underline hover:text-orange-bright transition-colors">USITC HTS Online</a>.
        </p>
      </section>
    );
  }

  const { queriedCode, rateCode, rateRow, queriedRow } = result;
  const description = queriedRow?.description?.trim() || rateRow.description?.trim() || "";
  const general = (rateRow.raw_data?.general ?? "").trim();
  const special = (rateRow.raw_data?.special ?? "").trim();
  const other = (rateRow.raw_data?.other ?? "").trim();
  const footnotes = rateRow.raw_data?.footnotes ?? [];

  const decoded = footnotes
    .filter((fn) => typeof fn?.value === "string")
    .map((fn) => ({
      raw: (fn.value as string).trim(),
      columns: fn.columns ?? [],
      authority: decodeChapter99(fn.value as string),
    }));

  const countryRelevant = decoded.filter((d) => {
    if (!countryCode) return true;
    if (!d.authority) return true;
    return d.authority.appliesToCountry(countryCode);
  });

  return (
    <>
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base">{queriedCode}</span>
            {description && <span className="text-fg-muted font-normal text-sm">— {description}</span>}
          </h2>
          {rateCode !== queriedCode && (
            <p className="text-[11px] text-fg-muted mt-1 mb-0">
              Published rates inherited from parent code <span className="font-mono">{rateCode}</span>.
            </p>
          )}
        </header>
        <div className="px-4 py-4 grid grid-cols-1 min-[700px]:grid-cols-3 gap-4">
          <RateBlock label="General (MFN)" value={general} description="Most-favored-nation rate — applies to most US trading partners." />
          <RateBlock label="Special" value={special} description="Free trade agreement & preferential program rates (FTA partners, GSP, etc.)." isLong />
          <RateBlock label="Column 2" value={other} description="Statutory rate for non-NTR countries (e.g., Cuba, North Korea)." />
        </div>
      </section>

      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">
            Special Tariff Programs
            {countryCode && <span className="text-fg-muted font-normal text-[12px] ml-2">· filtered to {getCountryName(countryCode)}</span>}
          </h2>
        </header>
        <div className="px-4 py-4">
          {countryRelevant.length === 0 ? (
            <p className="m-0 text-[13px] text-fg-muted">
              No special tariff programs cross-referenced for this code{countryCode ? " and country" : ""}.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-3">
              {countryRelevant.map((d, i) => (
                <li key={i} className="border-l-2 border-orange pl-3">
                  {d.authority ? (
                    <>
                      <div className="text-[13px] font-semibold text-fg flex items-center gap-2 flex-wrap">
                        {d.authority.label}
                        {d.authority.status !== "active" && (
                          <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${STATUS_BADGE[d.authority.status].textClass}`} style={{ background: STATUS_BADGE[d.authority.status].bg }}>
                            {STATUS_BADGE[d.authority.status].label}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-fg-muted mt-1">{d.authority.description}</div>
                      <div className="text-[11px] text-fg-muted mt-1 font-mono">Cross-reference: {d.raw}</div>
                      <a href={d.authority.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-orange underline hover:text-orange-bright transition-colors mt-1 inline-block">Official source ↗</a>
                    </>
                  ) : (
                    <>
                      <div className="text-[13px] font-semibold text-fg">Cross-reference: <span className="font-mono">{d.raw}</span></div>
                      <div className="text-[12px] text-fg-muted mt-1">
                        Not in our common-pattern lookup. Check{" "}
                        <a href="https://hts.usitc.gov/?query=Chapter+99" target="_blank" rel="noopener noreferrer" className="text-orange underline hover:text-orange-bright transition-colors">USITC Chapter 99</a>.
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">Disclaimer</h2>
        </header>
        <div className="px-4 py-4 text-[12px] text-fg-muted space-y-2">
          <p className="m-0">
            The effective rate is drawn from The Budget Lab at Yale&apos;s tariff-rate model and reflects the
            programs in force for the selected code, country, and date. Duty dollar figures are exact only for
            plain ad-valorem lines; specific and compound duties are not computed. Stacking, exclusions, and
            product-specific rulings may still affect the amount actually owed.
          </p>
          <p className="m-0">
            For exact rates at a specific date, consult{" "}
            <a href={`https://hts.usitc.gov/search?query=${encodeURIComponent(queriedCode)}`} target="_blank" rel="noopener noreferrer" className="text-orange underline hover:text-orange-bright transition-colors">USITC HTS Online</a>, a licensed customs broker, or{" "}
            <a href="https://budgetlab.yale.edu/research/introducing-tariff-rate-tracker-open-source-tool-daily-effective-tariff-rates" target="_blank" rel="noopener noreferrer" className="text-orange underline hover:text-orange-bright transition-colors">Yale Budget Lab&apos;s Tariff Rate Tracker</a>.
          </p>
        </div>
      </section>
    </>
  );
}

function RateBlock({ label, value, description, isLong = false }: { label: string; value: string; description: string; isLong?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold mb-1">{label}</div>
      {value ? (
        <div className={`text-fg ${isLong ? "text-[12px] font-mono" : "text-base font-semibold tabular-nums"}`}>{value}</div>
      ) : (
        <div className="text-fg-muted italic text-[12px]">(not published)</div>
      )}
      <div className="text-[11px] text-fg-muted mt-1">{description}</div>
    </div>
  );
}
