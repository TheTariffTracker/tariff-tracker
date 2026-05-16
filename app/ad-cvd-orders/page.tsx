import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import {
  FR_DOC_TYPES,
  badgeClasses,
  formatPubDate,
  mapDocType,
} from "../lib/fr-badges";

// AD/CVD Orders page (route: "/ad-cvd-orders"). Near-clone of Incoming
// Tariffs but sourced from the `adcvd_fr_alerts` view, which layers a
// keywords_matched && ARRAY['antidumping', 'countervailing duty'] filter
// on top of tariff_fr_alerts.
//
// Same URL-state model as Incoming Tariffs:
//   ?type=all|rule|proposed-rule|notice  — document-type filter
//   ?page=N                              — 1-indexed page number

const PAGE_LIMIT = 50;

const FILTER_OPTIONS = [
  { slug: "all",          label: "All",        docType: null as string | null },
  { slug: "rule",         label: "Final Rule", docType: "Rule" },
  { slug: "proposed-rule",label: "Proposed",   docType: "Proposed Rule" },
  { slug: "notice",       label: "Notice",     docType: "Notice" },
] as const;

type FilterSlug = (typeof FILTER_OPTIONS)[number]["slug"];

function resolveFilter(rawType: string | undefined): FilterSlug {
  const match = FILTER_OPTIONS.find((o) => o.slug === rawType);
  return match ? match.slug : "all";
}

function resolvePage(rawPage: string | undefined): number {
  const n = Number(rawPage);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Build an /ad-cvd-orders URL preserving filter + optional page param. */
function pageHref(filterSlug: FilterSlug, page: number): string {
  const params = new URLSearchParams();
  if (filterSlug !== "all") params.set("type", filterSlug);
  if (page !== 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/ad-cvd-orders?${qs}` : "/ad-cvd-orders";
}

type FrRow = {
  document_number: string;
  title: string;
  publication_date: string;
  document_type: string;
  html_url: string | null;
};

type RowsResult = {
  rows: FrRow[];
  totalForFilter: number;
  error: boolean;
};

async function getRows(
  filterSlug: FilterSlug,
  page: number,
): Promise<RowsResult> {
  const opt = FILTER_OPTIONS.find((o) => o.slug === filterSlug)!;
  const docTypes = opt.docType ? [opt.docType] : [...FR_DOC_TYPES];
  const offset = (page - 1) * PAGE_LIMIT;

  const baseRows = supabase
    .from("adcvd_fr_alerts")
    .select("document_number, title, publication_date, document_type, html_url")
    .in("document_type", docTypes)
    .order("publication_date", { ascending: false })
    .range(offset, offset + PAGE_LIMIT - 1);
  const baseCount = supabase
    .from("adcvd_fr_alerts")
    .select("document_number", { count: "exact", head: true })
    .in("document_type", docTypes);

  const [rowsResp, countResp] = await Promise.all([baseRows, baseCount]);

  if (rowsResp.error) {
    console.error("AdcvdOrdersPage rows fetch error:", {
      message: rowsResp.error.message,
      code: rowsResp.error.code,
      details: rowsResp.error.details,
      hint: rowsResp.error.hint,
    });
    return { rows: [], totalForFilter: 0, error: true };
  }
  if (countResp.error) {
    console.error("AdcvdOrdersPage count fetch error:", {
      message: countResp.error.message,
      code: countResp.error.code,
      details: countResp.error.details,
      hint: countResp.error.hint,
    });
  }

  return {
    rows: (rowsResp.data ?? []) as FrRow[],
    totalForFilter: countResp.count ?? 0,
    error: false,
  };
}

export default async function AdcvdOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = resolveFilter(params?.type);
  const requestedPage = resolvePage(params?.page);

  const { rows, totalForFilter, error } = await getRows(filter, requestedPage);

  const totalPages = totalForFilter > 0 ? Math.ceil(totalForFilter / PAGE_LIMIT) : 0;
  const currentPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;

  return (
    <MainContent
      title="AD/CVD Orders"
      subtitle="Antidumping and countervailing duty actions from the Federal Register. Updated each business day."
    >
      <section className="border border-border bg-bg">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            AD/CVD Federal Register Actions
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            {error
              ? ""
              : `${totalForFilter.toLocaleString("en-US")} matching actions`}
          </span>
        </header>

        <div className="flex items-stretch px-4 border-b border-border bg-bg-alt">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = opt.slug === filter;
            const className = isActive
              ? "px-3 py-2 text-[13px] font-medium text-fg border-b-2 border-b-orange transition-colors"
              : "px-3 py-2 text-[13px] font-medium text-fg-muted border-b-2 border-b-transparent hover:text-fg transition-colors";
            const href = pageHref(opt.slug, 1);
            return (
              <Link
                key={opt.slug}
                href={href}
                className={className}
                aria-current={isActive ? "page" : undefined}
                prefetch={false}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load AD/CVD actions. Please refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            No AD/CVD actions match the current filter.
          </div>
        ) : (
          <>
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
                {rows.map((row) => {
                  const badge = mapDocType(row.document_type);
                  const cellBase = "px-4 py-1.5 text-left border-b border-border";
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

            {totalPages > 1 && (
              <nav
                className="flex items-center justify-between px-4 py-3 bg-bg-alt text-[13px]"
                aria-label="Pagination"
              >
                {currentPage > 1 ? (
                  <Link
                    href={pageHref(filter, currentPage - 1)}
                    className="text-fg hover:text-orange transition-colors"
                  >
                    ‹ Prev
                  </Link>
                ) : (
                  <span className="text-fg-muted opacity-40 cursor-not-allowed select-none">
                    ‹ Prev
                  </span>
                )}

                <span className="text-fg-muted tabular-nums">
                  Page {currentPage} of {totalPages.toLocaleString("en-US")}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={pageHref(filter, currentPage + 1)}
                    className="text-fg hover:text-orange transition-colors"
                  >
                    Next ›
                  </Link>
                ) : (
                  <span className="text-fg-muted opacity-40 cursor-not-allowed select-none">
                    Next ›
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </MainContent>
  );
}
