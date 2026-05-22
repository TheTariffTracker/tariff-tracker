import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { HTS_CHAPTER_LIST } from "../lib/hts-chapters";

export const metadata: Metadata = {
  title: "Tariff Browser",
  description:
    "Browse every active HTS code in the U.S. tariff schedule — 29,583 entries with chapter, description, and statistical suffix detail.",
};

// Tariff Browser page (route: "/tariff-browser"). Searchable, paginated
// view over the full hts_codes table (~29,583 rows).
//
// URL-driven state:
//   ?q=...     — case-insensitive text match against description (ILIKE %q%)
//   ?chapter=85— 2-digit HTS chapter (matches hts_code LIKE '85%')
//   ?page=N    — 1-indexed page number
//
// All state lives in URL search params, set by a regular HTML <form
// method="get">. No client JS needed for the filter UI — the form submit
// navigates to the same route with new params, server re-renders.
//
// **v1 limitations** (called out in the page subtitle): the blueprint
// also calls for filters by Section 301/232/executive surcharge, by
// country applicability, and by rate range. All three depend on Yale
// Budget Lab effective-rate parsing populating columns we don't have yet.
// Forward-compatible: those filters can be added without restructuring.

const PAGE_LIMIT = 50;

type HtsRow = {
  hts_code: string;
  description: string | null;
};

function resolvePage(rawPage: string | undefined): number {
  const n = Number(rawPage);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Build a /tariff-browser URL preserving q + chapter + page params. */
function buildHref(q: string, chapter: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (chapter) params.set("chapter", chapter);
  if (page !== 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/tariff-browser?${qs}` : "/tariff-browser";
}

async function getRows(q: string, chapter: string, page: number) {
  const offset = (page - 1) * PAGE_LIMIT;

  let query = supabase
    .from("hts_codes")
    .select("hts_code, description", { count: "exact" })
    .order("hts_code", { ascending: true })
    .range(offset, offset + PAGE_LIMIT - 1);

  if (chapter) {
    // hts_codes stores codes dotted ("85.17.13.00.00"); the chapter is the
    // first 2 chars. A LIKE '85%' filter catches everything in the chapter.
    query = query.like("hts_code", `${chapter}%`);
  }
  if (q) {
    // Case-insensitive substring match on description.
    query = query.ilike("description", `%${q}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    const e = error as unknown as Record<string, unknown>;
    console.error("TariffBrowser fetch error:", {
      typeOf: typeof e,
      constructor: e?.constructor?.name,
      keys: e ? Object.keys(e) : [],
      json: JSON.stringify(e),
      stringified: String(e),
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    });
    return { rows: [], total: 0, error: true };
  }

  return {
    rows: (data ?? []) as HtsRow[],
    total: count ?? 0,
    error: false,
  };
}

export default async function TariffBrowserPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chapter?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params?.q ?? "").trim();
  const chapter = (params?.chapter ?? "").trim();
  const requestedPage = resolvePage(params?.page);

  const { rows, total, error } = await getRows(q, chapter, requestedPage);

  const totalPages = total > 0 ? Math.ceil(total / PAGE_LIMIT) : 0;
  const currentPage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;

  const isFiltered = q !== "" || chapter !== "";

  return (
    <MainContent
      title="Tariff Browser"
      subtitle="Search and filter all 29,583 codes of the Harmonized Tariff Schedule. Tariff-action filters (Section 232, Section 301, executive surcharges), country applicability, and rate-range filters require effective-rate data not yet available."
    >
      <section className="border border-border bg-bg">
        {/* Header: title + count */}
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">
            Harmonized Tariff Schedule
          </h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            {error
              ? ""
              : `${total.toLocaleString("en-US")} ${isFiltered ? "matching" : "total"} codes`}
          </span>
        </header>

        {/* Filter row: text search + chapter dropdown + submit. Pure HTML
            form — submitting navigates to /tariff-browser?q=...&chapter=... */}
        <form
          method="get"
          action="/tariff-browser"
          className="flex flex-wrap gap-2 items-center px-4 py-3 border-b border-border bg-bg-alt"
        >
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by description…"
            aria-label="Search HTS descriptions"
            className="flex-1 min-w-[200px] bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange placeholder:text-fg-muted"
          />
          <select
            name="chapter"
            defaultValue={chapter}
            aria-label="Filter by HTS chapter"
            className="bg-bg border border-border-strong rounded px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-orange"
          >
            <option value="">All chapters</option>
            {HTS_CHAPTER_LIST.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-orange text-white px-3 py-1.5 text-[13px] font-medium rounded cursor-pointer hover:bg-orange-bright transition-colors"
          >
            Search
          </button>
          {isFiltered && (
            <Link
              href="/tariff-browser"
              className="text-[13px] text-fg-muted hover:text-orange transition-colors px-2"
            >
              Clear
            </Link>
          )}
        </form>

        {error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load HTS codes. Please refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            {isFiltered
              ? "No codes match the current filter."
              : "No codes available."}
          </div>
        ) : (
          <>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                    HTS Code
                  </th>
                  <th className="bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] text-left px-4 py-1.5 border-b border-border">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isLast = i === rows.length - 1;
                  const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                  return (
                    <tr key={row.hts_code} className="hover:bg-bg-alt">
                      <td className={`${cellBase} tabular-nums whitespace-nowrap font-mono`}>
                        {row.hts_code}
                      </td>
                      <td className={cellBase}>
                        {row.description || (
                          <span className="text-fg-muted italic">
                            (no description)
                          </span>
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
                    href={buildHref(q, chapter, currentPage - 1)}
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
                    href={buildHref(q, chapter, currentPage + 1)}
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
