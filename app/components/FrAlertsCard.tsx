// FrAlertsCard — left card of the two-column row at the bottom of the
// Dashboard. Fetches the 5 most recent tariff-relevant Federal Register
// alerts from Supabase and renders them in a compact table.
//
// Async server component: the fetch runs at render time on the server, so
// no client-side useEffect/loading state is needed. The Supabase env vars
// are validated in app/lib/supabase.ts.
//
// Document-type mapping (raw → display + badge tone) matches the v11 mockup:
//   "Notice"        → "Notice"      gray
//   "Rule"          → "Final Rule"  orange
//   "Proposed Rule" → "Proposed"    blue

import { supabase } from "../lib/supabase";

// Same filter used by StatStrip — keeps the two surfaces consistent.
const FR_DOC_TYPES = ["Rule", "Proposed Rule", "Notice"];

type FrRow = {
  title: string;
  publication_date: string; // ISO date "YYYY-MM-DD"
  document_type: string;
  html_url: string | null;
};

type BadgeTone = "notice" | "final" | "rule";

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Parse YYYY-MM-DD manually to avoid UTC-midnight timezone shift that
// would render "Apr 27" as "Apr 26" in Western timezones.
function formatPubDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-");
  const monthIdx = Math.max(0, Math.min(11, Number(mm) - 1));
  return `${MONTH_SHORT[monthIdx]} ${Number(dd)}`;
}

function mapDocType(raw: string): { label: string; tone: BadgeTone } {
  if (raw === "Notice") return { label: "Notice", tone: "notice" };
  if (raw === "Rule") return { label: "Final Rule", tone: "final" };
  if (raw === "Proposed Rule") return { label: "Proposed", tone: "rule" };
  // Unknown type: fall back to a neutral badge so we never blow up.
  return { label: raw, tone: "notice" };
}

function badgeClasses(tone: BadgeTone): string {
  // Background uses the light-mode hex of the brand color at low alpha;
  // text color uses the theme-responsive token so it flips in dark mode.
  const base =
    "inline-block px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] rounded-sm whitespace-nowrap";
  if (tone === "rule") return `${base} bg-[rgba(29,78,216,0.12)] text-blue`;
  if (tone === "final") return `${base} bg-[rgba(194,65,12,0.12)] text-orange`;
  return `${base} bg-[rgba(113,113,122,0.15)] text-fg-muted`;
}

async function getRecentFrAlerts(): Promise<{ rows: FrRow[]; error: boolean }> {
  const { data, error } = await supabase
    .from("federal_register_alerts")
    .select("title, publication_date, document_type, html_url")
    .in("document_type", FR_DOC_TYPES)
    .order("publication_date", { ascending: false })
    .limit(5);

  if (error) {
    console.error("FrAlertsCard federal_register_alerts error:", error);
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as FrRow[], error: false };
}

export default async function FrAlertsCard() {
  const { rows, error } = await getRecentFrAlerts();

  return (
    <section className="border border-border bg-bg">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0">
          Recent Federal Register Tariff Alerts
        </h2>
        <span className="text-[11px] text-fg-muted whitespace-nowrap">
          Latest 5
        </span>
      </header>

      {error ? (
        <div className="px-4 py-6 text-[13px] text-fg-muted">
          Unable to load Federal Register alerts. Please refresh.
        </div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-fg-muted">
          No recent alerts.
        </div>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                Date
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                Type
              </th>
              <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                Title
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const badge = mapDocType(row.document_type);
              const isLast = i === rows.length - 1;
              const cellBase = `px-4 py-1.5 text-left ${isLast ? "" : "border-b border-border"}`;
              return (
                <tr key={`${row.publication_date}-${i}`} className="hover:bg-bg-alt">
                  <td className={`${cellBase} whitespace-nowrap`}>
                    {formatPubDate(row.publication_date)}
                  </td>
                  <td className={cellBase}>
                    <span className={badgeClasses(badge.tone)}>
                      {badge.label}
                    </span>
                  </td>
                  <td className={cellBase}>
                    {row.html_url ? (
                      <a
                        href={row.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fg hover:text-orange transition-colors"
                      >
                        {row.title}
                      </a>
                    ) : (
                      row.title
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
