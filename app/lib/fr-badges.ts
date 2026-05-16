// Shared helpers for displaying federal_register_alerts rows. Used by
// FrAlertsCard (Dashboard) and the Incoming Tariffs page. Keeping these in
// one place ensures the doc-type mapping and badge styling stay consistent
// across surfaces.

// Federal Register document types we consider tariff-relevant. Most genuine
// tariff actions land in one of these three. Excludes Presidential Documents
// (rarer) and routine notice categories. Same filter StatStrip uses.
export const FR_DOC_TYPES = ["Rule", "Proposed Rule", "Notice"] as const;

export type BadgeTone = "notice" | "final" | "rule";

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Parse YYYY-MM-DD manually to avoid UTC-midnight timezone shift. */
export function formatPubDate(iso: string): string {
  const [, mm, dd] = iso.split("-");
  const monthIdx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${MONTH_SHORT[monthIdx]} ${Number(dd)}`;
}

/**
 * Map raw Federal Register document_type values to the friendly badge
 * label + tone used in the UI. Mapping matches the v11 mockup:
 *   "Notice"        → gray   "Notice"
 *   "Rule"          → orange "Final Rule"
 *   "Proposed Rule" → blue   "Proposed"
 * Unknown values fall back to gray with the raw string as-is.
 */
export function mapDocType(raw: string): { label: string; tone: BadgeTone } {
  if (raw === "Notice") return { label: "Notice", tone: "notice" };
  if (raw === "Rule") return { label: "Final Rule", tone: "final" };
  if (raw === "Proposed Rule") return { label: "Proposed", tone: "rule" };
  return { label: raw, tone: "notice" };
}

/**
 * Tailwind utility string for a badge of the given tone. Background uses
 * the light-mode hex of the brand color at low alpha; text color uses the
 * theme-responsive token so it flips in dark mode.
 */
export function badgeClasses(tone: BadgeTone): string {
  const base =
    "inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] rounded-sm whitespace-nowrap";
  if (tone === "rule") return `${base} bg-[rgba(29,78,216,0.12)] text-blue`;
  if (tone === "final") return `${base} bg-[rgba(194,65,12,0.12)] text-orange`;
  return `${base} bg-[rgba(113,113,122,0.15)] text-fg-muted`;
}
