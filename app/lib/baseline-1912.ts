// app/lib/baseline-1912.ts
//
// Verified FY1912 federal revenue/outlay baseline for the "1912 vs Today"
// tool. FY1912 = the last full fiscal year (ended June 30, 1912) before the
// 16th Amendment was ratified (Feb 1913), so it is the cleanest pre-income-tax
// benchmark. These are fixed historical figures, NOT user-adjustable.
//
// ACCOUNTING BASIS (important — state this anywhere these numbers appear):
//   "Ordinary receipts and expenditures, EXCLUDING postal."
//   The Post Office was a self-funding service whose receipts and outlays
//   roughly cancel; including it inflates both sides to ~$985M and distorts
//   the revenue mix. The ordinary-excl-postal basis is what produces the
//   45% / 47% / 8% mix and the near-balanced budget, and it is the basis the
//   calculation engine and the methodology page both use. The outlay
//   composition below is computed on this SAME basis for internal consistency.
//
// FIGURE CONFIDENCE:
//   - Receipts (customs / internal revenue / misc / total): firm. Customs
//     ($311.3M) independently corroborated; figures match the standard
//     Historical Statistics of the United States (Series Y) series and the
//     Treasury Annual Report for FY1912.
//   - Outlay composition: Treasury DEPARTMENTAL classification for FY1912
//     from Historical Statistics of the U.S. (Series Y), rounded to $0.1M.
//     The line items sum to ~$689.9M, matching the total OMB Historical Table
//     1.1 reports for 1912. Context only — does NOT feed any calculation. (The
//     original Treasury report's appendix tables are page-image scans; these
//     figures are the standard published series, not an in-session scan parse.)
//
// Nominal dollars only (no inflation adjustment, per design decision): the
// tool compares the revenue *mix*, not 1912's absolute budget size, so a
// CPI conversion would invite a misleading scale comparison.

export type RevenueShare = {
  /** Stable key used by the calculation engine. */
  key: "tariffs" | "excise" | "miscellaneous";
  /** Human label for display. */
  label: string;
  /** FY1912 amount in actual (nominal) dollars. */
  amount: number;
};

export type OutlayCategory = {
  label: string;
  /** FY1912 amount, Treasury departmental classification, rounded to $0.1M.
   *  Context only — not used in any calculation. */
  amount: number;
  /** Share of total ordinary expenditures (excl. postal). */
  pct: number;
};

export type SourceCitation = {
  title: string;
  url: string;
  note?: string;
};

/** FY1912 receipts by source, nominal dollars, ordinary-excl-postal basis. */
export const RECEIPTS_1912 = {
  customs: 311_300_000,
  /** Internal revenue = excise, chiefly liquor and tobacco. Includes the
   *  1909 corporation excise ("income") tax of ~$28.6M; the bulk was alcohol
   *  (~$245M) and tobacco (~$70M). Functionally different from today's
   *  federal excise (gas/aviation/telephone user-fees) — disclose this. */
  internalRevenue: 322_500_000,
  /** Public-land sales, fees, fines, and other miscellaneous receipts. */
  miscellaneous: 58_800_000,
  /** Total ordinary receipts (excl. postal). */
  total: 692_600_000,
} as const;

/** FY1912 ordinary expenditures (excl. postal), nominal dollars. */
export const EXPENDITURES_1912 = {
  total: 689_900_000,
  /** Receipts − expenditures. Small surplus → "balanced" (never "profitable"). */
  surplus: 2_700_000,
} as const;

/**
 * 1912 revenue mix used by the calculation engine.
 * Derived directly from the dollar figures above so the shares are exact and
 * sum to 1. Published copy rounds these to 45% / 47% / 8% (which also sum to
 * 100); the engine should use the precise fractions here, not the rounded
 * display values.
 */
export const MIX_1912 = {
  tariffs: RECEIPTS_1912.customs / RECEIPTS_1912.total, // ≈ 0.4495
  excise: RECEIPTS_1912.internalRevenue / RECEIPTS_1912.total, // ≈ 0.4656
  miscellaneous: RECEIPTS_1912.miscellaneous / RECEIPTS_1912.total, // ≈ 0.0849
} as const;

/** Rounded mix for display/labels only. Sums to 100. */
export const MIX_1912_DISPLAY_PCT = {
  tariffs: 45,
  excise: 47,
  miscellaneous: 8,
} as const;

/** Ordered revenue breakdown for Panel 1 (text + pie chart). */
export const REVENUE_BREAKDOWN_1912: RevenueShare[] = [
  { key: "tariffs", label: "Customs duties (tariffs)", amount: RECEIPTS_1912.customs },
  { key: "excise", label: "Internal revenue (excise)", amount: RECEIPTS_1912.internalRevenue },
  { key: "miscellaneous", label: "Miscellaneous receipts", amount: RECEIPTS_1912.miscellaneous },
];

/**
 * FY1912 outlay composition for Panel 1 context ONLY (Treasury departmental
 * classification, ordinary-excl-postal basis, rounded to $0.1M; sums to
 * ~$689.9M). Does not feed the calculation. Shown so readers understand what
 * the 1912 budget funded — note the absence of Social Security,
 * Medicare/Medicaid, federal student loans, DHS, EPA, FAA, etc., which did not
 * exist. Civil War veterans' pensions were the single largest civilian item.
 */
export const OUTLAY_COMPOSITION_1912: OutlayCategory[] = [
  { label: "War Department (Army)", amount: 161_400_000, pct: 23.4 },
  { label: "Navy Department", amount: 135_600_000, pct: 19.7 },
  { label: "Military pensions (mainly Civil War veterans)", amount: 153_600_000, pct: 22.3 },
  { label: "Other civil functions", amount: 196_600_000, pct: 28.5 },
  { label: "Interest on the public debt", amount: 22_600_000, pct: 3.3 },
  { label: "Indian affairs", amount: 20_100_000, pct: 2.9 },
];

/** Primary/authoritative sources for the figures above. */
export const SOURCES_1912: SourceCitation[] = [
  {
    title:
      "Annual Report of the Secretary of the Treasury on the State of the Finances, FY ended June 30, 1912",
    url: "https://fraser.stlouisfed.org/title/annual-report-secretary-treasury-state-finances-194/annual-report-secretary-treasury-state-finances-fiscal-year-ended-june-30-1912-appendices-5558",
    note: "Primary source for ordinary receipts and expenditures.",
  },
  {
    title:
      "Historical Statistics of the United States, Colonial Times to 1970 (U.S. Census Bureau), Series Y",
    url: "https://www.census.gov/library/publications/1975/compendia/hist_stats_colonial-1970.html",
    note: "Federal receipts by source (customs / internal revenue / misc).",
  },
  {
    title: "U.S. Federal Government Revenues: 1790 to the Present (CRS Report RL33665)",
    url: "https://www.everycrsreport.com/reports/RL33665.html",
    note: "Corroborating long-run series; identifies 1863–1913 as the excise-tax era.",
  },
];

/** Convenience bundle. */
export const BASELINE_1912 = {
  fiscalYear: 1912,
  basisNote: "Ordinary receipts and expenditures, excluding postal. Nominal dollars.",
  receipts: RECEIPTS_1912,
  expenditures: EXPENDITURES_1912,
  mix: MIX_1912,
  mixDisplayPct: MIX_1912_DISPLAY_PCT,
  revenueBreakdown: REVENUE_BREAKDOWN_1912,
  outlayComposition: OUTLAY_COMPOSITION_1912,
  sources: SOURCES_1912,
} as const;
