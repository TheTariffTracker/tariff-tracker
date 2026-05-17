import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { HTS_CHAPTER_LIST } from "../lib/hts-chapters";

// Itemized Duties page (route: "/itemized-duties"). Two view modes:
//
//   - Default (?code not set): LIST VIEW
//       Search + chapter filter + paginated table of all codes ranked by
//       cumulative duties. Each code links to the detail view.
//
//   - Detail (?code=XXXXXXXXXX): DETAIL VIEW
//       Single code header (with description from hts_codes + cumulative
//       total) followed by a monthly breakdown table. Sourced from the
//       `code_monthly_duties` materialized view.
//
// URL params:
//   ?code=8703230140   — show detail for this code
//   ?q=...             — text search (list view only)
//   ?chapter=85        — chapter filter (list view only)
//   ?page=N            — pagination (list view only)

const LIST_PAGE_LIMIT = 50;

// HTS code format helpers: trade_imports + materialized views store codes
// as plain 10-digit strings ("8703230140"); hts_codes stores them dotted
// ("8703.23.01.40"). Translate to look up descriptions.
function plainToDottedHts(plain: string): string {
  if (plain.length !== 10) return plain;
  return `${plain.slice(0, 4)}.${plain.slice(4, 6)}.${plain.slice(6, 8)}.${plain.slice(8, 10)}`;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} ${year}`;
}

function formatBillions(dollars: number): string {
  const b = dollars / 1_000_000_000;
  if (b >= 10) return `$${Math.round(b).toLocaleString("en-US")}B`;
  if (b >= 1) return `$${b.toFixed(2)}B`;
  const m = dollars / 1_000_000;
  if (m >= 1) return `$${Math.round(m).toLocaleString("en-US")}M`;
  const k = dollars / 1_000;
  return `$${Math.round(k).toLocaleString("en-US")}K`;
}

function resolvePage(rawPage: string | undefined): number {
  const n = Number(rawPage);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/** Build a /itemized-duties URL preserving list-view params + optional page. */
function listHref(q: string, chapter: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (chapter) params.set("chapter", chapter);
  if (page !== 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/itemized-duties?${qs}` : "/itemized-duties";
}

/** Build a /itemized-duties URL for detail view of a specific code. */
function detailHref(code: string): string {
  return `/itemized-duties?code=${encodeURIComponent(code)}`;
}

function logSupabaseError(label: string, err: unknown) {
  const e = err as unknown as Record<string, unknown>;
  console.error(label, {
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
}

// ===================== List view fetch =====================

type ListRow = {
  hts_code: string;
  description: string;
  total: number;
};

async function fetchListPage(
  q: string,
  chapter: string,
  page: number,
): Promise<{ rows: ListRow[]; total: number; error: boolean }> {
  // Step 1: optionally narrow hts_codes by text query and/or chapter to get
  // the set of candidate codes. If neither filter is set, skip this and let
  // hts_total_duties drive the page (cheaper).
  const offset = (page - 1) * LIST_PAGE_LIMIT;
  let candidatePlainCodes: string[] | null = null;

  if (q || chapter) {
    let codesQuery = supabase
      .from("hts_codes")
      .select("hts_code, description")
      .limit(2000); // safety cap; few real-world filters return more
    if (chapter) {
      codesQuery = codesQuery.like("hts_code", `${chapter}%`);
    }
    if (q) {
      codesQuery = codesQuery.ilike("description", `%${q}%`);
    }
    const codesResp = await codesQuery;
    if (codesResp.error) {
      logSupabaseError("ItemizedDuties hts_codes filter error:", codesResp.error);
      return { rows: [], total: 0, error: true };
    }
    // Translate dotted → plain for the hts_total_duties JOIN. Drop non-10-digit codes
    // (they're subheading-level without a statistical suffix; trade_imports has only 10-digit).
    candidatePlainCodes = (codesResp.data ?? [])
      .map((r) => (r as { hts_code: string }).hts_code.replaceAll(".", ""))
      .filter((c) => c.length === 10);
    if (candidatePlainCodes.length === 0) {
      return { rows: [], total: 0, error: false };
    }
  }

  // Step 2: query hts_total_duties for the page slice ordered by cumulative duties.
  let totalsQuery = supabase
    .from("hts_total_duties")
    .select("hts_code, total_duties", { count: "exact" })
    .order("total_duties", { ascending: false })
    .range(offset, offset + LIST_PAGE_LIMIT - 1);
  if (candidatePlainCodes !== null) {
    totalsQuery = totalsQuery.in("hts_code", candidatePlainCodes);
  }
  const totalsResp = await totalsQuery;
  if (totalsResp.error) {
    logSupabaseError("ItemizedDuties hts_total_duties error:", totalsResp.error);
    return { rows: [], total: 0, error: true };
  }
  const totals = (totalsResp.data ?? []) as { hts_code: string; total_duties: string | number }[];

  // Step 3: descriptions for the displayed codes (dotted format JOIN).
  const dotted = totals.map((r) => plainToDottedHts(r.hts_code));
  const descResp = await supabase
    .from("hts_codes")
    .select("hts_code, description")
    .in("hts_code", dotted);
  if (descResp.error) {
    logSupabaseError("ItemizedDuties description fetch error:", descResp.error);
    // Non-fatal — render without descriptions.
  }
  const descMap = new Map<string, string>();
  for (const r of (descResp.data ?? []) as { hts_code: string; description: string | null }[]) {
    descMap.set(r.hts_code.replaceAll(".", ""), r.description ?? "");
  }

  return {
    rows: totals.map((r) => ({
      hts_code: r.hts_code,
      description: descMap.get(r.hts_code) ?? "",
      total: Number(r.total_duties),
    })),
    total: totalsResp.count ?? 0,
    error: false,
  };
}

// ===================== Detail view fetch =====================

type DetailData = {
  code: string;
  description: string;
  cumulative: number;
  months: { year: number; month: number; total: number }[];
};

async function fetchDetail(code: string): Promise<{ data: DetailData | null; error: boolean }> {
  // Parallel: monthly breakdown + description + cumulative total
  const [monthlyResp, descResp, totalResp] = await Promise.all([
    supabase
      .from("code_monthly_duties")
      .select("year, month, total_duties")
      .eq("hts_code", code)
      .order("year", { ascending: true })
      .order("month", { ascending: true }),
    supabase
      .from("hts_codes")
      .select("description")
      .eq("hts_code", plainToDottedHts(code))
      .maybeSingle(),
    supabase
      .from("hts_total_duties")
      .select("total_duties")
      .eq("hts_code", code)
      .maybeSingle(),
  ]);

  if (monthlyResp.error) {
    logSupabaseError("ItemizedDuties detail monthly error:", monthlyResp.error);
    return { data: null, error: true };
  }
  if (descResp.error) {
    logSupabaseError("ItemizedDuties detail description error:", descResp.error);
    // Non-fatal
  }
  if (totalResp.error) {
    logSupabaseError("ItemizedDuties detail total error:", totalResp.error);
    // Non-fatal
  }

  const months = ((monthlyResp.data ?? []) as { year: number; month: number; total_duties: string | number }[]).map((r) => ({
    year: r.year,
    month: r.month,
    total: Number(r.total_duties),
  }));

  return {
    data: {
      code,
      description: (descResp.data as { description: string | null } | null)?.description ?? "",
      cumulative: Number((totalResp.data as { total_duties: string | number } | null)?.total_duties ?? 0),
      months,
    },
    error: false,
  };
}

// ===================== Page =====================

const TH_BASE =
  "bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] px-4 py-1.5 border-b border-border";

export default async function ItemizedDutiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chapter?: string; page?: string; code?: string }>;
}) {
  const params = await searchParams;
  const code = (params?.code ?? "").trim();

  if (code) {
    return <DetailView code={code} />;
  }
  return (
    <ListView
      q={(params?.q ?? "").trim()}
      chapter={(params?.chapter ?? "").trim()}
      page={resolvePage(params?.page)}
    />
  );
}

// ---------- List view ----------

async function ListView({ q, chapter, page }: { q: string; chapter: string; page: number }) {
  const { rows, total, error } = await fetchListPage(q, chapter, page);
  const totalPages = total > 0 ? Math.ceil(total / LIST_PAGE_LIMIT) : 0;
  const currentPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
  const isFiltered = q !== "" || chapter !== "";

  return (
    <MainContent
      title="Itemized Duties"
      subtitle="Browse customs duties by 10-digit HTS code. Click any code to see its monthly revenue breakdown since January 2025."
    >
      <section className="border border-border bg-bg">
        <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
          <h2 className="text-sm font-semibold m-0">HTS Codes by Cumulative Duties</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            {error
              ? ""
              : `${total.toLocaleString("en-US")} ${isFiltered ? "matching" : "total"} codes with duties`}
          </span>
        </header>

        <form
          method="get"
          action="/itemized-duties"
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
            {HTS_CHAPTER_LIST.map(([cCode, cName]) => (
              <option key={cCode} value={cCode}>
                {cCode} — {cName}
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
              href="/itemized-duties"
              className="text-[13px] text-fg-muted hover:text-orange transition-colors px-2"
            >
              Clear
            </Link>
          )}
        </form>

        {error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load HTS code data. Please refresh.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            {isFiltered ? "No codes match the current filter." : "No codes with duties yet."}
          </div>
        ) : (
          <>
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH_BASE} text-left`}>HTS Code</th>
                  <th className={`${TH_BASE} text-left`}>Description</th>
                  <th className={`${TH_BASE} text-right`}>Cumulative Duties</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isLast = i === rows.length - 1;
                  const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                  return (
                    <tr key={row.hts_code} className="hover:bg-bg-alt">
                      <td className={`${cellBase} tabular-nums whitespace-nowrap font-mono`}>
                        <Link
                          href={detailHref(row.hts_code)}
                          className="text-orange underline hover:text-orange-bright transition-colors"
                        >
                          {plainToDottedHts(row.hts_code)}
                        </Link>
                      </td>
                      <td className={cellBase}>
                        {row.description || (
                          <span className="text-fg-muted italic">(no description)</span>
                        )}
                      </td>
                      <td className={`${cellBase} text-right tabular-nums`}>
                        {formatBillions(row.total)}
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
                    href={listHref(q, chapter, currentPage - 1)}
                    className="text-fg hover:text-orange transition-colors"
                  >
                    ‹ Prev
                  </Link>
                ) : (
                  <span className="text-fg-muted opacity-40 cursor-not-allowed select-none">‹ Prev</span>
                )}

                <span className="text-fg-muted tabular-nums">
                  Page {currentPage} of {totalPages.toLocaleString("en-US")}
                </span>

                {currentPage < totalPages ? (
                  <Link
                    href={listHref(q, chapter, currentPage + 1)}
                    className="text-fg hover:text-orange transition-colors"
                  >
                    Next ›
                  </Link>
                ) : (
                  <span className="text-fg-muted opacity-40 cursor-not-allowed select-none">Next ›</span>
                )}
              </nav>
            )}
          </>
        )}
      </section>
    </MainContent>
  );
}

// ---------- Detail view ----------

async function DetailView({ code }: { code: string }) {
  const { data, error } = await fetchDetail(code);

  return (
    <MainContent
      title="Itemized Duties"
      subtitle="Browse customs duties by 10-digit HTS code. Click any code to see its monthly revenue breakdown since January 2025."
    >
      <div className="mb-4">
        <Link
          href="/itemized-duties"
          className="text-[13px] text-fg-muted hover:text-orange transition-colors"
        >
          ‹ Back to all codes
        </Link>
      </div>

      <section className="border border-border bg-bg">
        <header className="px-4 py-3 border-b border-border">
          {error || !data ? (
            <h2 className="text-sm font-semibold m-0">
              {`HTS Code ${plainToDottedHts(code)}`}
            </h2>
          ) : (
            <>
              <h2 className="font-mono text-lg font-semibold m-0">
                {plainToDottedHts(data.code)}
              </h2>
              <p className="text-[13px] text-fg-muted mt-1 mb-0">
                {data.description || (
                  <span className="italic">(no description on file)</span>
                )}
              </p>
              <p className="text-[13px] text-fg mt-2 mb-0">
                <span className="font-semibold tabular-nums">
                  {formatBillions(data.cumulative)}
                </span>
                <span className="text-fg-muted"> cumulative duties since January 2025</span>
              </p>
            </>
          )}
        </header>

        {error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load monthly breakdown. Please refresh.
          </div>
        ) : !data || data.months.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            No monthly data found for this code. (Either the code is unused or not in our ingested range.)
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={`${TH_BASE} text-left`}>Month</th>
                <th className={`${TH_BASE} text-right`}>Duties Collected</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m, i) => {
                const isLast = i === data.months.length - 1;
                const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                return (
                  <tr key={`${m.year}-${m.month}`} className="hover:bg-bg-alt">
                    <td className={`${cellBase} whitespace-nowrap`}>
                      {formatMonth(m.year, m.month)}
                    </td>
                    <td className={`${cellBase} text-right tabular-nums`}>
                      {formatBillions(m.total)}
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
