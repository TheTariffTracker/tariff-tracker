// FrAlertsCard — left card of the two-column row at the bottom of the
// Dashboard. Fetches the 5 most recent tariff-relevant Federal Register
// alerts from Supabase and renders them in a compact table.
//
// Async server component: the fetch runs at render time on the server, so
// no client-side useEffect/loading state is needed. The Supabase env vars
// are validated in app/lib/supabase.ts.
//
// Doc-type mapping, badge styling, date formatting, and the FR_DOC_TYPES
// filter list all live in app/lib/fr-badges.ts so the Incoming Tariffs
// page can reuse them.

import { supabase } from "../lib/supabase";
import {
  FR_DOC_TYPES,
  badgeClasses,
  formatPubDate,
  mapDocType,
} from "../lib/fr-badges";

type FrRow = {
  title: string;
  publication_date: string; // ISO date "YYYY-MM-DD"
  document_type: string;
  html_url: string | null;
};

async function getRecentFrAlerts(): Promise<{ rows: FrRow[]; error: boolean }> {
  const { data, error } = await supabase
    // tariff_fr_alerts is the agency-filtered view (created 2026-05-15) that
    // strips out non-tariff noise like FDA debarment orders. See lib/fr-badges.ts
    // for the FR_DOC_TYPES filter that further narrows by document type.
    .from("tariff_fr_alerts")
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
                        className="text-orange underline hover:text-orange-bright transition-colors"
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
