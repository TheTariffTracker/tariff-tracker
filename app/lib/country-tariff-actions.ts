// Country-level tariff-action applicability for the /country/[slug] profiles.
//
// This answers the qualitative question "which U.S. tariff actions touch
// imports from country X?" — NOT dollar amounts (per-action revenue requires
// the Yale per-HTS data we don't have yet; see /methodology). It deliberately
// does not reuse the /calculator's inline mapping because that mapping is
// HTS-code-driven and, as of this writing, still shows the IEEPA fentanyl
// tariffs as active. The facts below are the verified post-ruling status.
//
// LEGAL STATUS AS OF MAY 2026 — keep this current; it's the single source of
// truth for every country page, so a change here + a rebuild updates all of
// them at once:
//   • 2026-02-20 — SCOTUS held (6-3) that IEEPA does not authorize tariffs,
//     striking down BOTH the "reciprocal" trade-deficit tariffs AND the
//     fentanyl/trafficking tariffs on China, Mexico, and Canada.
//   • The administration announced Section 122 (balance-of-payments) as the
//     replacement mechanism (~10% across the board, statutory time limit).
//   • Section 301 (China) and Section 232 (steel/aluminum/autos) rest on
//     separate authorities and were unaffected by the ruling.
// If any of this changes, edit STATUS_AS_OF and the affected entries below.

export const STATUS_AS_OF = "May 2026";

export type ActionStatus = "active" | "invalidated";

export type TariffAction = {
  /** Stable key for React lists. */
  key: string;
  /** Short display name. */
  label: string;
  /** Legal authority / statute. */
  authority: string;
  /** Whether this action is country-specific or applies broadly. */
  scope: string;
  status: ActionStatus;
  /** One-line factual note shown under the label. */
  note: string;
  /** Authoritative external source. */
  sourceUrl: string;
};

// Census Schedule C codes referenced below.
const CHINA = "5700";
const MEXICO = "2010";
const CANADA = "1220";
const IEEPA_FENTANYL_COUNTRIES = new Set([CHINA, MEXICO, CANADA]);

// ---- Action definitions ----------------------------------------------------

const SECTION_301_CHINA: TariffAction = {
  key: "section-301",
  label: "Section 301 (China)",
  authority: "Trade Act of 1974, §301",
  scope: "Country-specific — imports from China",
  status: "active",
  note: "Additional duties on a wide range of Chinese-origin goods. Unaffected by the 2026 IEEPA ruling — separate legal authority.",
  sourceUrl:
    "https://ustr.gov/issue-areas/enforcement/section-301-investigations/section-301-china/300-billion-trade-action",
};

const SECTION_232: TariffAction = {
  key: "section-232",
  label: "Section 232 (steel, aluminum, autos)",
  authority: "Trade Expansion Act of 1962, §232",
  scope: "Product-based — applies to covered goods from most sources",
  status: "active",
  note: "National-security tariffs on steel, aluminum, and automobiles/parts. Applies to covered products regardless of origin, subject to country-specific exemptions. Unaffected by the 2026 IEEPA ruling.",
  sourceUrl:
    "https://www.commerce.gov/issues/trade-enforcement/section-232-investigations",
};

const SECTION_122: TariffAction = {
  key: "section-122",
  label: "Section 122 (balance-of-payments)",
  authority: "Trade Act of 1974, §122",
  scope: "Global — applies to most imports",
  status: "active",
  note: "Announced as the replacement for the invalidated IEEPA tariffs. A temporary across-the-board surcharge subject to a statutory time limit. Details were still being finalized as of this writing.",
  sourceUrl:
    "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title19-section2132",
};

const IEEPA_RECIPROCAL: TariffAction = {
  key: "ieepa-reciprocal",
  label: "IEEPA Reciprocal (invalidated)",
  authority: "International Emergency Economic Powers Act",
  scope: "Formerly most imports",
  status: "invalidated",
  note: "Struck down by the Supreme Court on February 20, 2026, which held that IEEPA does not authorize tariffs. No longer in effect.",
  sourceUrl: "https://www.congress.gov/crs-product/LSB11398",
};

const IEEPA_FENTANYL: TariffAction = {
  key: "ieepa-fentanyl",
  label: "IEEPA Fentanyl / Trafficking (invalidated)",
  authority: "International Emergency Economic Powers Act",
  scope: "Formerly China, Mexico, and Canada",
  status: "invalidated",
  note: "Tariffs tied to a declared drug-trafficking emergency. Struck down alongside the reciprocal tariffs by the Supreme Court on February 20, 2026. No longer in effect.",
  sourceUrl: "https://www.congress.gov/crs-product/LSB11398",
};

/**
 * Returns the tariff actions relevant to a country, ordered active-first.
 * Global/product-based actions appear for every country; country-specific
 * actions (301, IEEPA fentanyl) appear only for the countries they targeted.
 */
export function getCountryActions(code: string): TariffAction[] {
  const actions: TariffAction[] = [];

  // Country-specific, active.
  if (code === CHINA) actions.push(SECTION_301_CHINA);

  // Global / product-based, active.
  actions.push(SECTION_232, SECTION_122);

  // Invalidated — shown for context, since they recently applied.
  actions.push(IEEPA_RECIPROCAL);
  if (IEEPA_FENTANYL_COUNTRIES.has(code)) actions.push(IEEPA_FENTANYL);

  return actions;
}
