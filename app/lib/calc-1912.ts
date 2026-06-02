// app/lib/calc-1912.ts
//
// Calculation engine for the "1912 vs Today" tool. Answers: at today's federal
// spending, what would tariffs (and excise / misc) need to be to fund the
// government on the 1912 revenue mix, under three definitions of "abolish the
// income tax"?
//
// THE FORMULA (locked with Aaron):
//   For a given spending total S and a chosen set of taxes to abolish, the
//   taxes you RETAIN keep collecting at their current levels (R_retained).
//   Everything else must be raised from 1912-style sources (tariffs / excise /
//   misc) in 1912 proportions:
//       N = S - R_retained                       (non-income revenue needed)
//       tariff target = MIX_1912.tariffs * N     (≈ 45% of N)
//       excise target = MIX_1912.excise  * N     (≈ 47% of N)
//       misc   target = MIX_1912.misc    * N     (≈  8% of N)
//   The three scopes differ only in what's retained:
//       individual only            -> retain corporate + payroll
//       individual + corporate     -> retain payroll
//       individual + corp + payroll-> retain nothing  (N = S; matches the pure
//                                     1912-mix headline, tariffs = 45% of S)
//
// DATA:
//   spending S  -> federal_outlays  ("Total Outlays" net, monthly + FYTD)
//   revenue     -> federal_receipts (net, by classification_desc; monthly + FYTD)
//   1912 mix    -> baseline-1912.ts
//
// Two views:
//   Panel 2 (fiscal year)        -> most recent FINALIZED FY, via FYTD columns
//                                   at that FY's September month-end row.
//   Panel 3 (trailing 12 months) -> sum of the last 12 monthly figures.
//
// Cross-month queries filter by classification_desc, NEVER classification_id
// (Treasury reassigns the id each publication).

import { supabase } from "./supabase";
import { MIX_1912 } from "./baseline-1912";

// Stable MTS classification_desc labels (see project memory).
const REV_LABEL = {
  customs: "Customs Duties",
  individual: "Total -- Individual Income Taxes",
  corporate: "Corporation Income Taxes",
  payroll: "Total -- Social Insurance and Retirement Receipts",
  excise: "Total -- Excise Taxes",
  misc: "Total -- Miscellaneous Receipts",
  total: "Total -- Receipts",
} as const;

const REV_LABELS = Object.values(REV_LABEL);

export type ScopeKey =
  | "individual"
  | "individual_corporate"
  | "individual_corporate_payroll";

export type RevenueBySource = {
  customs: number;
  individual: number;
  corporate: number;
  payroll: number;
  excise: number;
  misc: number;
  total: number;
};

export type ScopeRow = {
  scope: ScopeKey;
  label: string;
  /** Current revenue of the taxes being abolished (informational). */
  incomeTaxReplaced: number;
  /** N = spending − retained taxes. */
  nonIncomeRevenueNeeded: number;
  tariffTarget: number;
  exciseTarget: number;
  miscTarget: number;
};

export type PanelData = {
  /** e.g. "FY2025 actuals" or "Trailing 12 months through April 2026". */
  basisLabel: string;
  /** Total federal outlays for the period (S). */
  spending: number;
  /** Current actual revenue by source, for target-vs-actual comparison. */
  currentRevenue: RevenueBySource;
  /** All three scopes. */
  scopes: ScopeRow[];
  /** The default headline scope (individual income tax only). */
  headline: ScopeRow;
};

export type ReplacementMath = {
  fiscalYear: PanelData;
  trailingTwelveMonths: PanelData;
};

// ----------------------------- helpers -----------------------------

/** Coerce a Postgres NUMERIC (number or string from PostgREST) to a number. */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Federal fiscal year of a YYYY-MM-DD month-end date (Oct–Sep). */
function fiscalYearOf(recordDate: string): number {
  const [y, m] = recordDate.split("-").map((s) => parseInt(s, 10));
  return m >= 10 ? y + 1 : y;
}

function logPgError(where: string, error: unknown): void {
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  console.error(`[calc-1912] ${where}:`, {
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
  });
}

const SCOPE_DEFS: { scope: ScopeKey; label: string; retain: (r: RevenueBySource) => number; abolished: (r: RevenueBySource) => number }[] = [
  {
    scope: "individual",
    label: "Individual income tax only",
    retain: (r) => r.corporate + r.payroll,
    abolished: (r) => r.individual,
  },
  {
    scope: "individual_corporate",
    label: "Individual + corporate income tax",
    retain: (r) => r.payroll,
    abolished: (r) => r.individual + r.corporate,
  },
  {
    scope: "individual_corporate_payroll",
    label: "Individual + corporate + payroll",
    retain: () => 0,
    abolished: (r) => r.individual + r.corporate + r.payroll,
  },
];

/**
 * Pure formula. Given spending and current revenue-by-source, compute the
 * three replacement scopes. Exported for unit-testing / verification.
 */
export function computeScopes(spending: number, rev: RevenueBySource): ScopeRow[] {
  return SCOPE_DEFS.map((d) => {
    const retained = d.retain(rev);
    const N = spending - retained;
    return {
      scope: d.scope,
      label: d.label,
      incomeTaxReplaced: d.abolished(rev),
      nonIncomeRevenueNeeded: N,
      tariffTarget: MIX_1912.tariffs * N,
      exciseTarget: MIX_1912.excise * N,
      miscTarget: MIX_1912.miscellaneous * N,
    };
  });
}

function toPanel(basisLabel: string, spending: number, rev: RevenueBySource): PanelData {
  const scopes = computeScopes(spending, rev);
  const headline = scopes.find((s) => s.scope === "individual")!;
  return { basisLabel, spending, currentRevenue: rev, scopes, headline };
}

function emptyRevenue(): RevenueBySource {
  return { customs: 0, individual: 0, corporate: 0, payroll: 0, excise: 0, misc: 0, total: 0 };
}

function assignByLabel(rev: RevenueBySource, desc: string, amount: number): void {
  switch (desc) {
    case REV_LABEL.customs: rev.customs += amount; break;
    case REV_LABEL.individual: rev.individual += amount; break;
    case REV_LABEL.corporate: rev.corporate += amount; break;
    case REV_LABEL.payroll: rev.payroll += amount; break;
    case REV_LABEL.excise: rev.excise += amount; break;
    case REV_LABEL.misc: rev.misc += amount; break;
    case REV_LABEL.total: rev.total += amount; break;
  }
}

// ----------------------------- Panel 2: fiscal year -----------------------------

/**
 * Most recent FINALIZED fiscal year. A fiscal year N (ending Sep 30 of year N)
 * is usable once we have its September month-end row AND at least one later
 * record_date (i.e. we've crossed into FY N+1, confirming September published).
 * Falls back one year if the September row isn't present yet.
 */
export async function getFiscalYearBaseline(): Promise<PanelData> {
  const { data: outlayRows, error: outErr } = await supabase
    .from("federal_outlays")
    .select("record_date, current_fytd_net_outly_amt")
    .order("record_date", { ascending: false });
  if (outErr || !outlayRows || outlayRows.length === 0) {
    logPgError("getFiscalYearBaseline/outlays", outErr);
    throw new Error("Could not load federal_outlays for the fiscal-year baseline.");
  }

  const latest = outlayRows[0].record_date as string;
  const inProgressFY = fiscalYearOf(latest);

  // Try the most recent complete FY, then step back if its Sept row is absent.
  let completeFY = inProgressFY - 1;
  let fyEndRow: { record_date: string; current_fytd_net_outly_amt: unknown } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const fyEnd = `${completeFY}-09-30`;
    fyEndRow = outlayRows.find(
      (r) => r.record_date === fyEnd && r.record_date < latest,
    );
    if (fyEndRow) break;
    completeFY -= 1;
  }
  if (!fyEndRow) {
    throw new Error(
      "No finalized fiscal year available in federal_outlays yet (need a September month-end row followed by a later publication).",
    );
  }

  const fyEnd = fyEndRow.record_date;
  const spending = num(fyEndRow.current_fytd_net_outly_amt);

  const { data: rcptRows, error: rcptErr } = await supabase
    .from("federal_receipts")
    .select("classification_desc, current_fytd_net_rcpt_amt")
    .eq("record_date", fyEnd)
    .in("classification_desc", REV_LABELS);
  if (rcptErr || !rcptRows) {
    logPgError("getFiscalYearBaseline/receipts", rcptErr);
    throw new Error("Could not load federal_receipts for the fiscal-year baseline.");
  }

  const rev = emptyRevenue();
  for (const r of rcptRows) {
    assignByLabel(rev, r.classification_desc as string, num(r.current_fytd_net_rcpt_amt));
  }

  return toPanel(`FY${completeFY} actuals`, spending, rev);
}

// ----------------------------- Panel 3: trailing 12 months -----------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatMonthYear(recordDate: string): string {
  const [y, m] = recordDate.split("-").map((s) => parseInt(s, 10));
  return `${MONTHS[m - 1]} ${y}`;
}

export async function getTrailingTwelveMonths(): Promise<PanelData> {
  const { data: outlayRows, error: outErr } = await supabase
    .from("federal_outlays")
    .select("record_date, current_month_net_outly_amt")
    .order("record_date", { ascending: false })
    .limit(12);
  if (outErr || !outlayRows || outlayRows.length === 0) {
    logPgError("getTrailingTwelveMonths/outlays", outErr);
    throw new Error("Could not load federal_outlays for the trailing-12-month view.");
  }

  const dates = outlayRows.map((r) => r.record_date as string);
  const windowEnd = dates[0];
  const spending = outlayRows.reduce((sum, r) => sum + num(r.current_month_net_outly_amt), 0);

  const { data: rcptRows, error: rcptErr } = await supabase
    .from("federal_receipts")
    .select("record_date, classification_desc, current_month_net_rcpt_amt")
    .in("record_date", dates)
    .in("classification_desc", REV_LABELS);
  if (rcptErr || !rcptRows) {
    logPgError("getTrailingTwelveMonths/receipts", rcptErr);
    throw new Error("Could not load federal_receipts for the trailing-12-month view.");
  }

  const rev = emptyRevenue();
  for (const r of rcptRows) {
    assignByLabel(rev, r.classification_desc as string, num(r.current_month_net_rcpt_amt));
  }

  return toPanel(`Trailing 12 months through ${formatMonthYear(windowEnd)}`, spending, rev);
}

// ----------------------------- combined -----------------------------

export async function getReplacementMath(): Promise<ReplacementMath> {
  const [fiscalYear, trailingTwelveMonths] = await Promise.all([
    getFiscalYearBaseline(),
    getTrailingTwelveMonths(),
  ]);
  return { fiscalYear, trailingTwelveMonths };
}
