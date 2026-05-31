// Citation formatting for cite-worthy figures on Tariff Tracker.
//
// Pure string builders — no React, no DOM, no side effects. Consumed by
// app/components/CiteButton.tsx, which supplies the "accessed" date from the
// client at the moment the reader opens the citation dialog.
//
// Attribution model (locked Phase 3.65): every citation names Tariff Tracker
// as the presenter AND credits the underlying primary government source. This
// matches the suggested format already published on /methodology:
//   "Tariff Tracker (tarifftracker.org), drawing on U.S. Treasury Daily
//    Treasury Statement data, accessed [date]."
//
// Locked output formats: Chicago, APA, BibTeX, Plain text / permalink.
// MLA was dropped. DEFERRED GAP: Bluebook (legal citation). Several of our
// audience segments are lawyers, so Bluebook is a known omission to add when
// the legal-facing tools (CIT Decisions feed, etc.) land — not in this pass.

export type CitationFormat = "chicago" | "apa" | "bibtex" | "plain";

export type CitationData = {
  /**
   * Human-readable label for the figure being cited, e.g.
   * "Total U.S. Tariff Revenue, January 2025 – April 2026".
   */
  figureLabel: string;
  /**
   * The figure's value exactly as displayed on the page, e.g.
   * "$340,512,345,678.90". Omitted for series/datasets (e.g. the 90-day
   * chart) where there is no single headline number.
   */
  value?: string;
  /**
   * The underlying primary government source, e.g.
   * "U.S. Department of the Treasury, Monthly Treasury Statement, Table 4
   * (Customs Duties)".
   */
  sourceName: string;
  /**
   * Vintage of the figure — the date or period the data runs through, e.g.
   * "April 2026" or "May 28, 2026". Lets a reader reconcile a snapshot value
   * against a number that changes every business day.
   */
  dataThrough: string;
  /** Stable permalink, e.g. "https://tarifftracker.org/". */
  url: string;
};

const SITE_NAME = "Tariff Tracker";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "May 30, 2026" */
export function formatAccessed(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Trailing period unless the string already ends in . ! or ? */
function withPeriod(s: string): string {
  return /[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
}

/** "April 2026" -> snapshot clause, omitted when there is no value. */
function valueClause(data: CitationData): string {
  if (!data.value) return "";
  return `${data.value} (data through ${data.dataThrough})`;
}

// ---------------------------------------------------------------------------
// Chicago (notes–bibliography style, website entry).
//   Author. "Title." Site. Accessed Date. URL.
// Here the author and the site are both Tariff Tracker, so we lead with the
// figure as the title and fold the value + source into the entry.
// ---------------------------------------------------------------------------
export function toChicago(data: CitationData, accessed: Date): string {
  const snapshot = valueClause(data);
  const titlePart = snapshot
    ? `"${data.figureLabel}," ${snapshot}`
    : `"${data.figureLabel}"`;
  return [
    `${SITE_NAME}.`,
    withPeriod(titlePart),
    withPeriod(`Drawing on ${data.sourceName}`),
    `Accessed ${formatAccessed(accessed)}.`,
    `${data.url}.`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// APA 7th (web page / dataset that changes over time).
//   Author. (Year, Month Day). Title. Site Name. Retrieved Date, from URL
// We use "Retrieved [date], from" because the figure is updated continuously,
// which is exactly the case APA reserves that phrasing for.
// ---------------------------------------------------------------------------
export function toAPA(data: CitationData, accessed: Date): string {
  const snapshot = valueClause(data);
  const titlePart = snapshot
    ? `${data.figureLabel}: ${snapshot}`
    : data.figureLabel;
  const accessedStr = formatAccessed(accessed);
  return [
    `${SITE_NAME}.`,
    `(${accessed.getFullYear()}, ${MONTHS[accessed.getMonth()]} ${accessed.getDate()}).`,
    withPeriod(titlePart),
    withPeriod(`Based on ${data.sourceName}`),
    `Retrieved ${accessedStr}, from ${data.url}`,
  ].join(" ");
}

// ---------------------------------------------------------------------------
// BibTeX (@misc entry, the standard type for web/data resources).
// ---------------------------------------------------------------------------
function bibKey(data: CitationData, accessed: Date): string {
  const slug = data.figureLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `tarifftracker_${slug || "figure"}_${accessed.getFullYear()}`;
}

export function toBibTeX(data: CitationData, accessed: Date): string {
  const snapshot = valueClause(data);
  const noteParts = [
    snapshot,
    `Based on ${data.sourceName}`,
    `Accessed ${formatAccessed(accessed)}`,
  ].filter(Boolean);
  return [
    `@misc{${bibKey(data, accessed)},`,
    `  title        = {${data.figureLabel}},`,
    `  author       = {{${SITE_NAME}}},`,
    `  year         = {${accessed.getFullYear()}},`,
    `  howpublished = {\\url{${data.url}}},`,
    `  note         = {${noteParts.join(". ")}.}`,
    `}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Plain text / permalink — a clean one-liner for emails, footnotes, captions.
// ---------------------------------------------------------------------------
export function toPlainText(data: CitationData, accessed: Date): string {
  const snapshot = valueClause(data);
  const lead = snapshot
    ? `${SITE_NAME}, "${data.figureLabel}": ${snapshot}`
    : `${SITE_NAME}, "${data.figureLabel}"`;
  return [
    withPeriod(lead),
    withPeriod(`Drawing on ${data.sourceName}`),
    `${data.url} (accessed ${formatAccessed(accessed)}).`,
  ].join(" ");
}

/** Build all four formats at once for the dialog. */
export function buildCitations(
  data: CitationData,
  accessed: Date,
): Record<CitationFormat, string> {
  return {
    chicago: toChicago(data, accessed),
    apa: toAPA(data, accessed),
    bibtex: toBibTeX(data, accessed),
    plain: toPlainText(data, accessed),
  };
}

export const FORMAT_LABELS: Record<CitationFormat, string> = {
  chicago: "Chicago",
  apa: "APA",
  bibtex: "BibTeX",
  plain: "Plain text",
};
