import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { badgeClasses, formatPubDate, mapDocType } from "../lib/fr-badges";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search U.S. tariff data — HTS codes and product descriptions plus Federal Register tariff actions from USTR, ITC, CBP, BIS, and ITA.",
};

// Search results page (route: "/search").
//   ?q=<query>  — full-text search across HTS codes/descriptions and the
//                 agency-filtered Federal Register tariff alerts.
//
// Backed by two Postgres functions (created in the Phase 3.6 search build):
//   search_hts(q) — FTS on hts_codes.description + digit-prefix on the code
//   search_fr(q)  — FTS on tariff_fr_alerts.title
// Both return rows pre-ranked by ts_rank (LIMIT 50). This page just renders.
//
// Dynamic by virtue of reading searchParams — bypasses the layout's ISR,
// which is correct here since results depend entirely on the query string.

const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";

type HtsRow = { hts_code: string; description: string; rank: number };
type FrRow = {
  document_number: string;
  title: string;
  publication_date: string;
  document_type: string;
  html_url: string | null;
  rank: number;
};

// PostgrestError objects print as {} via console.error (non-enumerable
// props), so pull the useful fields out by name. Same pattern used elsewhere.
function logRpcError(label: string, error: unknown) {
  const e = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  };
  console.error(`[search] ${label} failed`, {
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
  });
}

async function runSearch(
  q: string,
): Promise<{ hts: HtsRow[]; fr: FrRow[]; error: boolean }> {
  const [htsRes, frRes] = await Promise.all([
    supabase.rpc("search_hts", { q }),
    supabase.rpc("search_fr", { q }),
  ]);

  let error = false;
  if (htsRes.error) {
    logRpcError("search_hts", htsRes.error);
    error = true;
  }
  if (frRes.error) {
    logRpcError("search_fr", frRes.error);
    error = true;
  }

  return {
    hts: (htsRes.data as HtsRow[] | null) ?? [],
    fr: (frRes.data as FrRow[] | null) ?? [],
    error,
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();

  // No query typed — show guidance instead of running an empty search.
  if (!q) {
    return (
      <MainContent
        title="Search"
        subtitle="Search HTS codes, product descriptions, and Federal Register tariff actions."
      >
        <p className="text-sm text-fg-muted">
          Type a product name, an HTS code (e.g. 8703), or a tariff topic
          (e.g. Section 301) into the search box above.
        </p>
      </MainContent>
    );
  }

  const { hts, fr, error } = await runSearch(q);
  const total = hts.length + fr.length;

  const subtitle = error
    ? `Search for "${q}"`
    : `${total} result${total === 1 ? "" : "s"} for "${q}"`;

  return (
    <MainContent title="Search" subtitle={subtitle}>
      {error && (
        <p className="text-sm text-fg-muted mb-6">
          Something went wrong running the search. Please try again in a
          moment.
        </p>
      )}

      {!error && total === 0 && (
        <p className="text-sm text-fg-muted">
          No matches for <span className="font-semibold">{q}</span>. Try a
          broader term, a product name, or a partial HTS code.
        </p>
      )}

      {hts.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-lg font-bold mb-1">
            Products &amp; HTS codes
          </h2>
          <p className="text-xs text-fg-muted mb-3">
            {hts.length} match{hts.length === 1 ? "" : "es"} in the tariff
            schedule{hts.length === 50 ? " (showing top 50)" : ""}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {hts.map((row) => {
              const plain = row.hts_code.replace(/\./g, "");
              return (
                <li key={row.hts_code} className="py-2.5">
                  <Link
                    href={`/itemized-duties?code=${encodeURIComponent(plain)}`}
                    className={`font-mono text-sm ${linkClass}`}
                  >
                    {row.hts_code}
                  </Link>
                  <span className="ml-2 text-sm text-fg">
                    {row.description}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {fr.length > 0 && (
        <section className="mb-4">
          <h2 className="font-serif text-lg font-bold mb-1">Tariff actions</h2>
          <p className="text-xs text-fg-muted mb-3">
            {fr.length} match{fr.length === 1 ? "" : "es"} in the Federal
            Register{fr.length === 50 ? " (showing top 50)" : ""}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {fr.map((row) => {
              const badge = mapDocType(row.document_type);
              return (
                <li
                  key={row.document_number}
                  className="flex flex-col gap-1 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badgeClasses(badge.tone)}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {formatPubDate(row.publication_date)}
                    </span>
                  </div>
                  {row.html_url ? (
                    <a
                      href={row.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm ${linkClass}`}
                    >
                      {row.title}
                    </a>
                  ) : (
                    <span className="text-sm text-fg">{row.title}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </MainContent>
  );
}
