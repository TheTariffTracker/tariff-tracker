import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import {
  FR_DOC_TYPES,
  badgeClasses,
  formatPubDate,
  mapDocType,
} from "../lib/fr-badges";

// Incoming Tariffs page (route: "/incoming-tariffs"). Full Federal Register
// alerts feed — the same `federal_register_alerts` table the Dashboard's
// FrAlertsCard pulls from, but with a larger row limit (50). Filter by
// document type lands in sub-step D; pagination in sub-step E.
//
// Shared chrome (Masthead, Nav, CounterStrip, StatStrip, Footer) comes
// from app/layout.tsx. ISR cache window inherited from layout.tsx (5 min).

const PAGE_LIMIT = 50;

type FrRow = {
  document_number: string;
  title: string;
  publication_date: string;
  document_type: string;
  html_url: string | null;
};

async function getRows(): Promise<{ rows: FrRow[]; error: boolean }> {
  const { data, error } = await supabase
    // tariff_fr_alerts is the agency-filtered view of federal_register_alerts.
    .from("tariff_fr_alerts")
    .select("document_number, title, publication_date, document_type, html_url")
    .in("document_type", FR_DOC_TYPES)
    .order("publication_date", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    console.error("IncomingTariffsPage fetch error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as FrRow[], error: false };
}

export default async function IncomingTariffsPage() {
  const { rows, error } = await getRows();

  return (
    <MainContent
      title="Incoming Tariffs"
      subtitle="Federal Register documents matching tariff keywords. Updated each business day."
    >
      <section className="border border-border bg-bg">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Federal Register Tariff Alerts
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Showing {rows.length} most recent
          </span>
        </header>

        {error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load Federal Register alerts. Please refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            No alerts match the current filter.
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
                  <tr key={row.document_number} className="hover:bg-bg-alt">
                    <td className={`${cellBase} whitespace-nowrap`}>
                      {formatPubDate(row.publication_date)}
                    </td>
                    <td className={cellBase}>
                      <span className={badgeClasses(badge.tone)}>{badge.label}</span>
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
    </MainContent>
  );
}
