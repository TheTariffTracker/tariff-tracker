import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { getCountryName } from "../lib/census-countries";
import { decodeChapter99 } from "../lib/tariff-actions";

export const metadata: Metadata = {
  title: "Rate Calculator",
  description:
    "Look up the MFN base rate and applicable special programs (Section 232, 301, IEEPA, USMCA) for any HTS code and country of origin.",
};

// Calculator page (route: "/calculator"). Lite version per the calculator
// backup plan in project memory: shows the HTS code's base MFN rate, FTA
// preferential rates, and the special-tariff programs likely applicable
// for a given country. **Does NOT compute a final dollar amount** —
// per-HTS-code effective rates aren't available without Yale's
// rate_timeseries.rds data.
//
// HTS data is hierarchical. Rates live at the 8-digit subheading level
// (e.g., 8703.23.01); 10-digit leaf codes (8703.23.01.40) inherit. We
// walk up the hierarchy to find the most-specific ancestor with a
// non-empty `general` field — that's the applicable MFN base rate.
//
// Chapter 99 cross-references (in `raw_data.footnotes`) identify which
// special tariff programs apply (Section 301, 232, IEEPA, etc.). We
// decode the common patterns; anything unrecognized shows verbatim with
// a link to USITC for manual lookup.

// ===================== Country pre-filtered list =====================
// A subset of Census Schedule C codes that are most-used trading partners
// (plus a default "any country"). Keeps the dropdown manageable. Users
// who need an obscure country can still type its code in the future.
const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "",     label: "Any country (show all rates)" },
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
// Accept user input in various formats: "8703230140", "8703.23.01.40",
// "8703.23.01", "8703". Normalize to dotted form when possible.
function normalizeHtsCode(input: string): string {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!cleaned) return "";
  // If it already has dots, just trim
  if (cleaned.includes(".")) return cleaned;
  // Pure digits: dot every 2 chars after the first 4
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  if (digits.length <= 8)
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
}

// Walk up the hierarchy. For "8703.23.01.40" returns
// ["8703.23.01.40", "8703.23.01", "8703.23", "8703"].
function htsAncestors(code: string): string[] {
  const parts = code.split(".");
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push(parts.slice(0, i).join("."));
  }
  return out;
}

// ===================== Chapter 99 reference decoder =====================
// decodeChapter99 + the action definitions moved to app/lib/tariff-actions.ts,
// the single source of truth shared with the /country profile pages. That's
// where each action's legal status lives now (so the calculator and the
// country pages can't drift on, e.g., whether an IEEPA tariff is still valid).

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

// ===================== Fetch =====================
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
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
      json: JSON.stringify(e),
    });
    return { kind: "error" };
  }

  const rows = (data ?? []) as HtsRow[];
  if (rows.length === 0) {
    return { kind: "not_found", queriedCode: normalized };
  }

  // Build a map for quick lookup
  const byCode = new Map(rows.map((r) => [r.hts_code, r]));
  const queriedRow = byCode.get(normalized) ?? null;

  // Walk down from longest match looking for non-empty general rate
  for (const candidate of ancestors) {
    const row = byCode.get(candidate);
    if (row && (row.raw_data?.general ?? "").trim() !== "") {
      return {
        kind: "ok",
        queriedCode: normalized,
        rateCode: candidate,
        rateRow: row,
        queriedRow,
      };
    }
  }

  return { kind: "no_rate", queriedCode: normalized, queriedRow };
}

// ===================== Page =====================
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; country?: string }>;
}) {
  const params = await searchParams;
  const codeInput = (params?.code ?? "").trim();
  const countryInput = (params?.country ?? "").trim();
  const hasQuery = codeInput !== "";

  const result = hasQuery ? await lookupCode(codeInput) : null;

  return (
    <MainContent
      title="Tariff Rate Calculator"
      subtitle="Look up the base MFN rate and likely-applicable special tariff programs for a Harmonized Tariff Schedule code. This calculator does not compute a final dollar amount — for that, consult a customs broker or USITC's official tariff lookup."
    >
      {/* Search form */}
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">Lookup</h2>
        </header>
        <form
          method="get"
          action="/calculator"
          className="flex flex-wrap gap-2 items-end px-4 py-4 bg-bg-alt"
        >
          <label className="flex flex-col flex-1 min-w-[200px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">
              HTS code
            </span>
            <input
              type="text"
              name="code"
              defaultValue={codeInput}
              placeholder="e.g., 8703.23.01.40 or 8703230140"
              aria-label="HTS code"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange placeholder:text-fg-muted font-mono"
              required
            />
          </label>
          <label className="flex flex-col min-w-[200px] gap-1">
            <span className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold">
              Source country
            </span>
            <select
              name="country"
              defaultValue={countryInput}
              aria-label="Source country"
              className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code || "any"} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="bg-orange text-white px-3 py-1.5 text-[13px] font-medium rounded cursor-pointer hover:bg-orange-bright transition-colors"
          >
            Look up
          </button>
        </form>
      </section>

      {/* Results */}
      {result && <Results result={result} countryCode={countryInput} />}
    </MainContent>
  );
}

// ===================== Results =====================
function Results({
  result,
  countryCode,
}: {
  result: LookupResult;
  countryCode: string;
}) {
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
          No matches found for{" "}
          <span className="font-mono">{result.queriedCode || "(empty)"}</span>.
        </p>
        <p className="mt-2 mb-0 text-fg-muted">
          Check the code at{" "}
          <a
            href={`https://hts.usitc.gov/search?query=${encodeURIComponent(result.queriedCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            USITC HTS Online
          </a>
          .
        </p>
      </section>
    );
  }
  if (result.kind === "no_rate") {
    return (
      <section className="border border-border bg-bg p-6 text-[13px]">
        <p className="m-0">
          Found <span className="font-mono">{result.queriedCode}</span>
          {result.queriedRow?.description ? ` — ${result.queriedRow.description}` : ""} but no MFN rate is published at any level in our snapshot. Check{" "}
          <a
            href={`https://hts.usitc.gov/search?query=${encodeURIComponent(result.queriedCode)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            USITC HTS Online
          </a>{" "}
          for the current rate.
        </p>
      </section>
    );
  }

  // kind === "ok"
  const { queriedCode, rateCode, rateRow, queriedRow } = result;
  const description =
    queriedRow?.description?.trim() || rateRow.description?.trim() || "";
  const general = (rateRow.raw_data?.general ?? "").trim();
  const special = (rateRow.raw_data?.special ?? "").trim();
  const other = (rateRow.raw_data?.other ?? "").trim();
  const footnotes = rateRow.raw_data?.footnotes ?? [];

  // Decode all the Chapter 99 footnotes
  const decoded = footnotes
    .filter((fn) => typeof fn?.value === "string")
    .map((fn) => {
      const authority = decodeChapter99(fn.value as string);
      return {
        raw: (fn.value as string).trim(),
        columns: fn.columns ?? [],
        authority,
      };
    });

  // Country-aware filter: if country selected, hide programs that explicitly
  // don't apply to that country.
  const countryRelevant = decoded.filter((d) => {
    if (!countryCode) return true;
    if (!d.authority) return true;
    return d.authority.appliesToCountry(countryCode);
  });

  return (
    <>
      {/* Code summary */}
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base">{queriedCode}</span>
            {description && (
              <span className="text-fg-muted font-normal text-sm">— {description}</span>
            )}
          </h2>
          {rateCode !== queriedCode && (
            <p className="text-[11px] text-fg-muted mt-1 mb-0">
              Rates inherited from parent code{" "}
              <span className="font-mono">{rateCode}</span> (10-digit leaf
              codes share rates with their 8-digit subheading).
            </p>
          )}
        </header>
        <div className="px-4 py-4 grid grid-cols-1 min-[700px]:grid-cols-3 gap-4">
          <RateBlock
            label="General (MFN)"
            value={general}
            description="Most-favored-nation rate — applies to most US trading partners."
          />
          <RateBlock
            label="Special"
            value={special}
            description="Free trade agreement & preferential program rates (FTA partners, GSP, etc.)."
            isLong
          />
          <RateBlock
            label="Column 2"
            value={other}
            description="Statutory rate for non-NTR countries (e.g., Cuba, North Korea)."
          />
        </div>
      </section>

      {/* Special tariff programs */}
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">
            Special Tariff Programs
            {countryCode && (
              <span className="text-fg-muted font-normal text-[12px] ml-2">
                · filtered to {getCountryName(countryCode)}
              </span>
            )}
          </h2>
        </header>
        <div className="px-4 py-4">
          {countryRelevant.length === 0 ? (
            <p className="m-0 text-[13px] text-fg-muted">
              No special tariff programs cross-referenced for this code
              {countryCode ? ` and country` : ""}. (The MFN rate above applies.)
            </p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-3">
              {countryRelevant.map((d, i) => (
                <li key={i} className="border-l-2 border-orange pl-3">
                  {d.authority ? (
                    <>
                      <div className="text-[13px] font-semibold text-fg flex items-center gap-2 flex-wrap">
                        {d.authority.label}
                        {d.authority.status === "invalidated" && (
                          <span
                            className="text-[10px] uppercase tracking-wide font-semibold text-red px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(185,28,28,0.12)" }}
                          >
                            Invalidated
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-fg-muted mt-1">
                        {d.authority.description}
                      </div>
                      <div className="text-[11px] text-fg-muted mt-1 font-mono">
                        Cross-reference: {d.raw}
                      </div>
                      <a
                        href={d.authority.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-orange underline hover:text-orange-bright transition-colors mt-1 inline-block"
                      >
                        Official source ↗
                      </a>
                    </>
                  ) : (
                    <>
                      <div className="text-[13px] font-semibold text-fg">
                        Cross-reference: <span className="font-mono">{d.raw}</span>
                      </div>
                      <div className="text-[12px] text-fg-muted mt-1">
                        Not in our common-pattern lookup. Check{" "}
                        <a
                          href="https://hts.usitc.gov/?query=Chapter+99"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange underline hover:text-orange-bright transition-colors"
                        >
                          USITC Chapter 99
                        </a>{" "}
                        for the full text.
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border border-border bg-bg mb-5">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold m-0">Disclaimer</h2>
        </header>
        <div className="px-4 py-4 text-[12px] text-fg-muted space-y-2">
          <p className="m-0">
            This tool shows the published MFN rate and lists tariff programs whose Chapter 99 cross-references appear in our HTS snapshot. It does not compute a final dollar amount, does not account for stacking rules across multiple programs, and does not reflect every exclusion or modification.
          </p>
          <p className="m-0">
            For exact rates at a specific date, consult{" "}
            <a
              href={`https://hts.usitc.gov/search?query=${encodeURIComponent(queriedCode)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange underline hover:text-orange-bright transition-colors"
            >
              USITC HTS Online
            </a>
            , a licensed customs broker, or{" "}
            <a
              href="https://budgetlab.yale.edu/research/introducing-tariff-rate-tracker-open-source-tool-daily-effective-tariff-rates"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange underline hover:text-orange-bright transition-colors"
            >
              Yale Budget Lab&apos;s Tariff Rate Tracker
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}

function RateBlock({
  label,
  value,
  description,
  isLong = false,
}: {
  label: string;
  value: string;
  description: string;
  isLong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-semibold mb-1">
        {label}
      </div>
      {value ? (
        <div
          className={`text-fg ${isLong ? "text-[12px] font-mono" : "text-base font-semibold tabular-nums"}`}
        >
          {value}
        </div>
      ) : (
        <div className="text-fg-muted italic text-[12px]">(not published)</div>
      )}
      <div className="text-[11px] text-fg-muted mt-1">{description}</div>
    </div>
  );
}
