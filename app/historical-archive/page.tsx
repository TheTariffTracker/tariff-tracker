import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";
import { getCountryName } from "../lib/census-countries";
import { getChapterName } from "../lib/hts-chapters";

// Historical Archive page (route: "/historical-archive"). Aggregate views of
// cumulative customs revenue since Jan 2025, broken down three ways:
//
//   1. Top 25 HTS 10-digit product codes (joined to hts_codes for description)
//   2. Top 25 chapters by cumulative duties (summed across all ingested months)
//   3. Top 25 source countries (Census Schedule C codes mapped to names)
//
// **Known v1 gap (per blueprint):** Revenue attribution to specific tariff
// actions (Section 232, Section 301, IEEPA, etc.) requires the Yale Budget
// Lab effective-rate parsing which isn't built yet. Page subtitle calls
// this out. When that lands, a "Revenue by Tariff Action" panel goes here
// without restructuring the rest of the page.

// Each panel capped at 25 rows so the whole page stays readable without
// excessive vertical scroll. Tail entries beyond 25 are rounding error
// in dollar terms.
const HTS_LIMIT = 25;
const COUNTRY_LIMIT = 25;
const CHAPTER_LIMIT = 25;

// Chapter names imported from shared lib (also used by ProductCategoriesCard
// and Tariff Browser).

// ---------- Formatters ----------
function formatBillions(dollars: number): string {
  const b = dollars / 1_000_000_000;
  if (b >= 10) return `$${Math.round(b).toLocaleString("en-US")}B`;
  if (b >= 1) return `$${b.toFixed(2)}B`;
  const m = dollars / 1_000_000;
  return `$${Math.round(m).toLocaleString("en-US")}M`;
}

// ---------- Types ----------
type HtsRow = { hts_code: string; total_duties: string | number };
type HtsDescRow = { hts_code: string; description: string | null };
type ChapterRow = { chapter: string; total_duties: string | number };
type CountryRow = { country_code: string; total_duties: string | number };

// ---------- Fetchers (each panel does its own) ----------

// HTS code format conversion. trade_imports (and the hts_total_duties view
// built on it) store codes as plain 10-digit strings: "8703230140".
// hts_codes stores them dotted: "8703.23.01.40". To JOIN we have to
// translate plain → dotted before the IN query, then strip dots from the
// response keys when building the lookup map.
function plainToDottedHts(plain: string): string {
  if (plain.length !== 10) return plain;
  return `${plain.slice(0, 4)}.${plain.slice(4, 6)}.${plain.slice(6, 8)}.${plain.slice(8, 10)}`;
}
function stripDots(dotted: string): string {
  return dotted.replaceAll(".", "");
}

async function fetchHtsTop(): Promise<{
  rows: { hts_code: string; description: string; total: number }[];
  error: boolean;
}> {
  const totalsResp = await supabase
    .from("hts_total_duties")
    .select("hts_code, total_duties")
    .order("total_duties", { ascending: false })
    .limit(HTS_LIMIT);
  if (totalsResp.error) {
    const e = totalsResp.error as unknown as Record<string, unknown>;
    console.error("HistoricalArchive HTS totals error:", {
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
    return { rows: [], error: true };
  }
  const totals = (totalsResp.data ?? []) as HtsRow[];
  if (totals.length === 0) return { rows: [], error: false };

  // Translate to dotted format for the hts_codes lookup.
  const dottedCodes = totals.map((r) => plainToDottedHts(r.hts_code));
  const descResp = await supabase
    .from("hts_codes")
    .select("hts_code, description")
    .in("hts_code", dottedCodes);
  if (descResp.error) {
    console.error("HistoricalArchive HTS descriptions error:", descResp.error);
    // Non-fatal — render without descriptions.
  }
  // Map keyed by the PLAIN (no-dot) code so we can look up by trade_imports's format.
  const descMap = new Map<string, string>();
  for (const r of ((descResp.data ?? []) as HtsDescRow[])) {
    descMap.set(stripDots(r.hts_code), r.description ?? "");
  }

  return {
    rows: totals.map((r) => ({
      hts_code: r.hts_code,
      description: descMap.get(r.hts_code) ?? "",
      total: Number(r.total_duties),
    })),
    error: false,
  };
}

async function fetchChapterTop(): Promise<{
  rows: { chapter: string; name: string; total: number }[];
  error: boolean;
}> {
  // Fetch all chapter-month rows; sum across months in JS.
  const resp = await supabase
    .from("chapter_duties_monthly")
    .select("chapter, total_duties");
  if (resp.error) {
    const e = resp.error as unknown as Record<string, unknown>;
    console.error("HistoricalArchive chapter sum error:", {
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
    return { rows: [], error: true };
  }
  const totalsByChapter = new Map<string, number>();
  for (const r of ((resp.data ?? []) as ChapterRow[])) {
    const cur = totalsByChapter.get(r.chapter) ?? 0;
    totalsByChapter.set(r.chapter, cur + Number(r.total_duties));
  }
  const rows = Array.from(totalsByChapter.entries())
    .map(([chapter, total]) => ({ chapter, name: getChapterName(chapter), total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, CHAPTER_LIMIT);
  return { rows, error: false };
}

async function fetchCountryTop(): Promise<{
  rows: { country_code: string; name: string; total: number }[];
  error: boolean;
}> {
  const resp = await supabase
    .from("country_total_duties")
    .select("country_code, total_duties")
    .order("total_duties", { ascending: false })
    .limit(COUNTRY_LIMIT);
  if (resp.error) {
    const e = resp.error as unknown as Record<string, unknown>;
    console.error("HistoricalArchive country error:", {
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
    return { rows: [], error: true };
  }
  const rows = ((resp.data ?? []) as CountryRow[]).map((r) => ({
    country_code: r.country_code,
    name: getCountryName(r.country_code),
    total: Number(r.total_duties),
  }));
  return { rows, error: false };
}

// ---------- Shared table styling ----------
const TH_BASE =
  "bg-bg-alt font-semibold text-fg-muted uppercase text-[10px] tracking-[0.06em] px-4 py-1.5 border-b border-border";

function TableCard({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-bg mb-5">
      <header className="flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap">
        <h2 className="text-sm font-semibold m-0">{title}</h2>
        {meta && (
          <span className="text-[11px] text-fg-muted whitespace-nowrap">{meta}</span>
        )}
      </header>
      {children}
    </section>
  );
}

export default async function HistoricalArchivePage() {
  // Fire all three panel fetches in parallel.
  const [htsResult, chapterResult, countryResult] = await Promise.all([
    fetchHtsTop(),
    fetchChapterTop(),
    fetchCountryTop(),
  ]);

  return (
    <MainContent
      title="Historical Archive"
      subtitle="Aggregate revenue by product code, chapter, and source country since January 2025. Revenue attribution to specific tariff actions (Section 232, Section 301, etc.) requires data not yet available."
    >
      {/* Panel 1: Top HTS codes (full width) */}
      <TableCard
        title="Top Product Codes by Cumulative Duties"
        meta={`Top ${HTS_LIMIT} HTS 10-digit codes`}
      >
        {htsResult.error ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            Unable to load HTS totals. Please refresh.
          </div>
        ) : htsResult.rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
            No data available yet.
          </div>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={`${TH_BASE} text-left`}>HTS Code</th>
                <th className={`${TH_BASE} text-left`}>Description</th>
                <th className={`${TH_BASE} text-right`}>Cumulative Duties</th>
              </tr>
            </thead>
            <tbody>
              {htsResult.rows.map((row, i) => {
                const isLast = i === htsResult.rows.length - 1;
                const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                return (
                  <tr key={row.hts_code} className="hover:bg-bg-alt">
                    <td className={`${cellBase} tabular-nums whitespace-nowrap`}>
                      {row.hts_code}
                    </td>
                    <td className={cellBase}>
                      {row.description || (
                        <span className="text-fg-muted italic">
                          (description unavailable)
                        </span>
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
        )}
      </TableCard>

      {/* Panels 2 + 3: Chapters and Countries side-by-side on wide screens */}
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-5 mb-5">
        <TableCard
          title="Top Chapters by Cumulative Duties"
          meta={`Top ${CHAPTER_LIMIT}`}
        >
          {chapterResult.error ? (
            <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
              Unable to load chapter totals.
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH_BASE} text-left`}>Ch.</th>
                  <th className={`${TH_BASE} text-left`}>Category</th>
                  <th className={`${TH_BASE} text-right`}>Cumulative Duties</th>
                </tr>
              </thead>
              <tbody>
                {chapterResult.rows.map((row, i) => {
                  const isLast = i === chapterResult.rows.length - 1;
                  const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                  return (
                    <tr key={row.chapter} className="hover:bg-bg-alt">
                      <td className={cellBase}>{row.chapter}</td>
                      <td className={cellBase}>{row.name}</td>
                      <td className={`${cellBase} text-right tabular-nums`}>
                        {formatBillions(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>

        <TableCard
          title="Top Source Countries by Cumulative Duties"
          meta={`Top ${COUNTRY_LIMIT}`}
        >
          {countryResult.error ? (
            <div className="px-4 py-10 text-center text-[13px] text-fg-muted">
              Unable to load country totals.
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${TH_BASE} text-left`}>Code</th>
                  <th className={`${TH_BASE} text-left`}>Country</th>
                  <th className={`${TH_BASE} text-right`}>Cumulative Duties</th>
                </tr>
              </thead>
              <tbody>
                {countryResult.rows.map((row, i) => {
                  const isLast = i === countryResult.rows.length - 1;
                  const cellBase = `px-4 py-1.5 ${isLast ? "" : "border-b border-border"}`;
                  return (
                    <tr key={row.country_code} className="hover:bg-bg-alt">
                      <td className={`${cellBase} tabular-nums`}>{row.country_code}</td>
                      <td className={cellBase}>{row.name}</td>
                      <td className={`${cellBase} text-right tabular-nums`}>
                        {formatBillions(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      </div>
    </MainContent>
  );
}
