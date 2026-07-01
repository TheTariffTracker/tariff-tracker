// Single source of truth for U.S. tariff-action legal facts.
//
// Consumed by BOTH:
//   • /calculator   — decodeChapter99(reference): HTS Chapter 99 code -> action
//   • /country/[slug] — getCountryActions(code): country -> applicable actions
//
// These two surfaces used to carry their own copies of this information, and
// they drifted: the calculator kept showing the IEEPA fentanyl tariffs as
// active after the Supreme Court struck them down. Keeping the facts here, in
// one place, means a single edit updates every surface and they can't disagree.
//
// There is no data feed for "is this tariff authority still legally valid" —
// it lives in court opinions, not the APIs we ingest — so this is curated,
// hand-maintained, date-stamped metadata. Re-verify on the schedule and update
// STATUS_AS_OF + the affected entries when the law moves.
//
// LEGAL STATUS AS OF July 2026 (verified 2026-07-01):
//   • 2026-02-20 — SCOTUS held (6-3) that IEEPA does not authorize tariffs,
//     striking down BOTH the "reciprocal" trade-deficit tariffs AND the
//     fentanyl/trafficking tariffs on China, Mexico, and Canada.
//   • Section 122 (balance-of-payments) replaced them — initially ~10%, then
//     raised to 15% (statutory max) effective 2026-02-24. On 2026-05-07 the
//     Court of International Trade held it unlawful, but on 2026-06-11 the
//     Federal Circuit STAYED that ruling pending appeal (finding the
//     government likely to succeed), so CBP continues collecting the surcharge
//     from all importers — including the named plaintiffs. The 150-day
//     authority expires ~2026-07-24 unless Congress extends it (currently
//     considered unlikely) — RE-CHECK right after 2026-07-24, when this record
//     most likely flips to expired/invalidated.
//   • Section 301 (China) and Section 232 (steel/aluminum/autos) rest on
//     separate authorities and were unaffected by the ruling. A 2026-06-01
//     proclamation (eff. 2026-06-08) refreshed the 232 rates and added copper
//     as a new 232 category — not yet represented below.

export const STATUS_AS_OF = "July 2026";

export type TariffActionStatus = "active" | "invalidated";

export type TariffAction = {
  /** Stable id / React key. */
  id: string;
  /** Display name (no status suffix — status drives its own badge). */
  label: string;
  /** Legal authority / statute. */
  authority: string;
  /** Who/what it applies to, in words. */
  scope: string;
  status: TariffActionStatus;
  /** Program description shown by the calculator. */
  description: string;
  /** Legal-context note shown on the country profile. */
  note: string;
  /** Authoritative external source. */
  sourceUrl: string;
  /** HTS Chapter 99 "list" numbers (the NN in 9903.NN) that map here. */
  chapter99Lists: string[];
  /** Whether this action targets specific countries (vs. broad/product-based). */
  countrySpecific: boolean;
  /** True if the action is relevant to imports from the given Census code. */
  appliesToCountry: (code: string) => boolean;
};

// Census Schedule C codes referenced below.
const CHINA = "5700";
const MEXICO = "2010";
const CANADA = "1220";
const IEEPA_FENTANYL_COUNTRIES = new Set([CHINA, MEXICO, CANADA]);

const COMMERCE_232_URL =
  "https://www.commerce.gov/issues/trade-enforcement/section-232-investigations";
// Authoritative neutral summary of the 2026 ruling (Congressional Research Service).
const SCOTUS_IEEPA_URL = "https://www.congress.gov/crs-product/LSB11398";

const SECTION_301: TariffAction = {
  id: "section-301",
  label: "Section 301 (China)",
  authority: "Trade Act of 1974, §301",
  scope: "Country-specific — imports from China",
  status: "active",
  description:
    "Additional duties on a wide range of Chinese-origin goods under the Trade Act of 1974.",
  note: "Additional duties on Chinese-origin goods. Unaffected by the 2026 IEEPA ruling — separate legal authority.",
  sourceUrl:
    "https://ustr.gov/issue-areas/enforcement/section-301-investigations/section-301-china/300-billion-trade-action",
  chapter99Lists: ["88"],
  countrySpecific: true,
  appliesToCountry: (c) => c === CHINA,
};

const SECTION_232_STEEL: TariffAction = {
  id: "section-232-steel",
  label: "Section 232 (Steel)",
  authority: "Trade Expansion Act of 1962, §232",
  scope: "Product-based — covered steel goods from most sources",
  status: "active",
  description:
    "National-security tariffs on steel imports under Trade Expansion Act §232.",
  note: "National-security tariffs on covered steel products from most sources, subject to country-specific exemptions. Unaffected by the 2026 IEEPA ruling.",
  sourceUrl: COMMERCE_232_URL,
  chapter99Lists: ["80", "81"],
  countrySpecific: false,
  appliesToCountry: () => true,
};

const SECTION_232_ALUMINUM: TariffAction = {
  id: "section-232-aluminum",
  label: "Section 232 (Aluminum)",
  authority: "Trade Expansion Act of 1962, §232",
  scope: "Product-based — covered aluminum goods from most sources",
  status: "active",
  description:
    "National-security tariffs on aluminum imports under Trade Expansion Act §232.",
  note: "National-security tariffs on covered aluminum products from most sources, subject to country-specific exemptions. Unaffected by the 2026 IEEPA ruling.",
  sourceUrl: COMMERCE_232_URL,
  chapter99Lists: ["85"],
  countrySpecific: false,
  appliesToCountry: () => true,
};

const SECTION_232_AUTOS: TariffAction = {
  id: "section-232-autos",
  label: "Section 232 (Autos / Auto parts)",
  authority: "Trade Expansion Act of 1962, §232",
  scope: "Product-based — covered vehicles and parts from most sources",
  status: "active",
  description:
    "National-security tariffs on imported vehicles or vehicle parts under §232.",
  note: "National-security tariffs on covered vehicles and parts from most sources, subject to country-specific exemptions. Unaffected by the 2026 IEEPA ruling.",
  sourceUrl: COMMERCE_232_URL,
  chapter99Lists: ["94"],
  countrySpecific: false,
  appliesToCountry: () => true,
};

const SECTION_122: TariffAction = {
  id: "section-122",
  label: "Section 122 (Balance-of-Payments)",
  authority: "Trade Act of 1974, §122",
  scope: "Global — applies to most imports",
  status: "active",
  description:
    "Temporary balance-of-payments surcharge under Trade Act §122 that replaced the invalidated IEEPA tariffs — now 15% (the statutory maximum) on most imports. The 150-day authority expires around July 24, 2026 unless Congress extends it.",
  note: "Replaced the invalidated IEEPA tariffs: an across-the-board surcharge raised to 15% (the statutory maximum) effective February 24, 2026. The Court of International Trade held it unlawful on May 7, 2026, but the Federal Circuit stayed that ruling on June 11, 2026 pending appeal — finding the government likely to succeed — so CBP continues collecting the surcharge from all importers, including the named plaintiffs. The 150-day authority expires around July 24, 2026 unless Congress extends it, which is currently considered unlikely.",
  sourceUrl:
    "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title19-section2132",
  chapter99Lists: ["03"],
  countrySpecific: false,
  appliesToCountry: () => true,
};

const IEEPA_RECIPROCAL: TariffAction = {
  id: "ieepa-reciprocal",
  label: "IEEPA Reciprocal",
  authority: "International Emergency Economic Powers Act",
  scope: "Formerly most imports",
  status: "invalidated",
  description:
    "Tariffs imposed under IEEPA addressing the trade deficit. Struck down by the Supreme Court on February 20, 2026, which held IEEPA does not authorize tariffs.",
  note: "Struck down by the Supreme Court on February 20, 2026, which held that IEEPA does not authorize tariffs. No longer in effect.",
  sourceUrl: SCOTUS_IEEPA_URL,
  chapter99Lists: ["01"],
  countrySpecific: false,
  appliesToCountry: () => true,
};

const IEEPA_FENTANYL: TariffAction = {
  id: "ieepa-fentanyl",
  label: "IEEPA Fentanyl / Trafficking",
  authority: "International Emergency Economic Powers Act",
  scope: "Formerly China, Mexico, and Canada",
  status: "invalidated",
  description:
    "Tariffs tied to a declared drug-trafficking emergency on China, Mexico, and Canada. Struck down alongside the reciprocal tariffs by the Supreme Court on February 20, 2026.",
  note: "Tariffs tied to a declared drug-trafficking emergency. Struck down alongside the reciprocal tariffs by the Supreme Court on February 20, 2026. No longer in effect.",
  sourceUrl: SCOTUS_IEEPA_URL,
  chapter99Lists: ["02"],
  countrySpecific: true,
  appliesToCountry: (c) => IEEPA_FENTANYL_COUNTRIES.has(c),
};

// Order matters for the calculator's first-match decode and the country page's
// display order (active first, invalidated last).
const ALL_ACTIONS: TariffAction[] = [
  SECTION_301,
  SECTION_232_STEEL,
  SECTION_232_ALUMINUM,
  SECTION_232_AUTOS,
  SECTION_122,
  IEEPA_RECIPROCAL,
  IEEPA_FENTANYL,
];

/**
 * Decode an HTS Chapter 99 cross-reference (e.g. "9903.88.01", "See 9903.02")
 * to its tariff action, or null if unrecognized. Used by /calculator.
 */
export function decodeChapter99(reference: string): TariffAction | null {
  const m = reference.match(/9903\.(\d{2})/);
  if (!m) return null;
  const list = m[1];
  return ALL_ACTIONS.find((a) => a.chapter99Lists.includes(list)) ?? null;
}

/**
 * Returns the tariff actions relevant to a country, active-first. Global /
 * product-based actions appear for every country; country-specific actions
 * (301, IEEPA fentanyl) appear only for the countries they targeted. The
 * invalidated IEEPA actions are included for recent-history context.
 */
export function getCountryActions(code: string): TariffAction[] {
  const actions: TariffAction[] = [];

  // Active, country-specific.
  if (SECTION_301.appliesToCountry(code)) actions.push(SECTION_301);

  // Active, global / product-based.
  actions.push(SECTION_232_STEEL, SECTION_232_ALUMINUM, SECTION_232_AUTOS, SECTION_122);

  // Invalidated — shown for context, since they recently applied.
  actions.push(IEEPA_RECIPROCAL);
  if (IEEPA_FENTANYL.appliesToCountry(code)) actions.push(IEEPA_FENTANYL);

  return actions;
}
