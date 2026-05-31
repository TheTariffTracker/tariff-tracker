import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MainContent from "../../components/MainContent";
import CiteButton from "../../components/CiteButton";
import { supabase } from "../../lib/supabase";
import { getChapterName } from "../../lib/hts-chapters";
import { getCountryName, getCountrySlug } from "../../lib/census-countries";

// HTS Chapter profile — /chapter/[chapter] (Phase 3.65, tool #3).
//
// One page per 2-digit HTS chapter that has recorded duties since Jan 2025.
// Panels: header (chapter name + cumulative duties + Cite), top HTS codes by
// duties, top source countries (linked into the Country profiles). No new
// backend — reuses chapter_duties_monthly, hts_total_duties, and the
// country_chapter_duties matview built for the Country profiles.
//
// dynamicParams=false → only the generated (data-bearing) chapters resolve.

const SITE_URL = "https://tarifftracker.org/";
const TOP_CODES = 10;
const TOP_COUNTRIES = 10;

// trade_imports / hts_total_duties store plain 10-digit codes ("8703230140");
// hts_codes stores dotted ("8703.23.01.40"). Translate to JOIN descriptions.
function plainToDottedHts(plain: string): string {
  if (plain.length !== 10) return plain;
  return `${plain.slice(0, 4)}.${plain.slice(4, 6)}.${plain.slice(6, 8)}.${plain.slice(8, 10)}`;
}
function stripDots(dotted: string): string {
  return dotted.replaceAll(".", "");
}

function formatDuties(dollars: number): string {
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${Math.round(dollars / 1e6).toLocaleString("en-US")}M`;
  if (dollars > 0) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  return "$0";
}

export const dynamicParams = false;

type CodeRow = { hts_code: string; total_duties: string | number };
type DescRow = { hts_code: string; description: string | null };
type CountryDutyRow = { country_code: string; total_duties: string | number };

// ---- Static params + metadata ----------------------------------------------
export async function generateStaticParams() {
  const { data, error } = await supabase
    .from("chapter_duties_monthly")
    .select("chapter");
  if (error || !data) return [];
  const chapters = new Set<string>();
  for (const row of data as { chapter: string }[]) {
    if (row.chapter) chapters.add(row.chapter);
  }
  return Array.from(chapters).map((chapter) => ({ chapter }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chapter: string }>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const name = getChapterName(chapter);
  return {
    title: `Chapter ${chapter}: ${name} — U.S. Tariffs & Duties`,
    description: `U.S. customs duties on HTS Chapter ${chapter} (${name}) imports since January 2025, the top product codes driving them, and the top source countries. Sourced from U.S. Census Bureau trade data.`,
  };
}

// ---- Data fetch -------------------------------------------------------------
type ChapterData = {
  cumulativeDuties: number;
  topCodes: { code: string; description: string; duties: number }[];
  topCountries: { code: string; name: string; slug: string; duties: number }[];
};

async function getChapterData(chapter: string): Promise<ChapterData> {
  const [dutiesResp, codesResp, countriesResp] = await Promise.all([
    supabase
      .from("chapter_duties_monthly")
      .select("total_duties")
      .eq("chapter", chapter),
    supabase
      .from("hts_total_duties")
      .select("hts_code, total_duties")
      .like("hts_code", `${chapter}%`)
      .order("total_duties", { ascending: false })
      .limit(TOP_CODES),
    supabase
      .from("country_chapter_duties")
      .select("country_code, total_duties")
      .eq("chapter", chapter)
      .order("total_duties", { ascending: false })
      .limit(TOP_COUNTRIES),
  ]);

  // Cumulative: sum the chapter's monthly rows.
  let cumulativeDuties = 0;
  if (dutiesResp.error) {
    console.error("ChapterProfile duties error:", {
      message: dutiesResp.error.message,
      code: dutiesResp.error.code,
    });
  } else {
    for (const r of (dutiesResp.data ?? []) as { total_duties: string | number }[]) {
      cumulativeDuties += Number(r.total_duties ?? 0);
    }
  }

  // Top codes + descriptions.
  let topCodes: ChapterData["topCodes"] = [];
  if (codesResp.error) {
    console.error("ChapterProfile codes error:", {
      message: codesResp.error.message,
      code: codesResp.error.code,
    });
  } else {
    const codes = (codesResp.data ?? []) as CodeRow[];
    const descMap = new Map<string, string>();
    if (codes.length > 0) {
      const dotted = codes.map((r) => plainToDottedHts(r.hts_code));
      const descResp = await supabase
        .from("hts_codes")
        .select("hts_code, description")
        .in("hts_code", dotted);
      if (!descResp.error) {
        for (const r of (descResp.data ?? []) as DescRow[]) {
          descMap.set(stripDots(r.hts_code), r.description ?? "");
        }
      }
    }
    topCodes = codes.map((r) => ({
      code: r.hts_code,
      description: descMap.get(r.hts_code) ?? "",
      duties: Number(r.total_duties ?? 0),
    }));
  }

  // Top source countries (linked to their profiles).
  let topCountries: ChapterData["topCountries"] = [];
  if (countriesResp.error) {
    console.error("ChapterProfile countries error:", {
      message: countriesResp.error.message,
      code: countriesResp.error.code,
    });
  } else {
    topCountries = ((countriesResp.data ?? []) as CountryDutyRow[]).map((r) => ({
      code: r.country_code,
      name: getCountryName(r.country_code),
      slug: getCountrySlug(r.country_code),
      duties: Number(r.total_duties ?? 0),
    }));
  }

  return { cumulativeDuties, topCodes, topCountries };
}

// ---- Render helpers ---------------------------------------------------------
const SECTION_CLASS = "border border-border bg-bg mb-5";
const SECTION_HEAD =
  "flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap";
const SECTION_TITLE = "text-sm font-semibold m-0";
const TH_BASE = "text-[11px] uppercase tracking-wide text-fg-muted font-semibold px-4 py-2";
const TD_BASE = "px-4 py-2 text-[13px] border-t border-border";
const LINK_CLASS = "text-orange underline hover:text-orange-bright transition-colors";

// ---- Page -------------------------------------------------------------------
export default async function ChapterProfile({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  if (!/^\d{2}$/.test(chapter)) notFound();

  const name = getChapterName(chapter);
  const { cumulativeDuties, topCodes, topCountries } = await getChapterData(chapter);
  const hasActivity = cumulativeDuties > 0;

  return (
    <MainContent
      title={`Chapter ${chapter} — ${name}`}
      subtitle={`U.S. customs duties, top product codes, and top source countries for HTS Chapter ${chapter} imports, since January 2025.`}
    >
      {/* Header — cumulative duties */}
      <section className={SECTION_CLASS}>
        <header className={SECTION_HEAD}>
          <h2 className={SECTION_TITLE}>Cumulative Customs Duties</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Source: U.S. Census Bureau · Since January 2025
          </span>
        </header>
        <div className="px-4 py-5">
          <div className="text-3xl font-bold tabular-nums">
            {hasActivity ? formatDuties(cumulativeDuties) : "—"}
          </div>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">
            {hasActivity
              ? `Estimated customs duties on Chapter ${chapter} imports since January 1, 2025, calculated from Census Bureau trade data.`
              : `No recorded customs duties on Chapter ${chapter} imports since January 2025.`}
          </p>
          {hasActivity && (
            <div>
              <CiteButton
                figureLabel={`Cumulative U.S. Customs Duties on HTS Chapter ${chapter} (${name}) Imports, since January 2025`}
                value={formatDuties(cumulativeDuties)}
                sourceName="U.S. Census Bureau, International Trade data (calculated duties)"
                dataThrough="January 2025 to present"
                url={`${SITE_URL}chapter/${chapter}`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Top HTS codes */}
      <section className={SECTION_CLASS}>
        <header className={SECTION_HEAD}>
          <h2 className={SECTION_TITLE}>Top HTS Codes by Duties</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Cumulative since January 2025
          </span>
        </header>
        {topCodes.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
            No code-level duty data recorded for this chapter yet.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH_BASE} text-left`}>HTS Code</th>
                <th className={`${TH_BASE} text-left`}>Description</th>
                <th className={`${TH_BASE} text-right`}>Duties</th>
              </tr>
            </thead>
            <tbody>
              {topCodes.map((row) => (
                <tr key={row.code} className="hover:bg-bg-alt">
                  <td className={`${TD_BASE} tabular-nums`}>
                    <Link href={`/itemized-duties?code=${row.code}`} className={LINK_CLASS}>
                      {plainToDottedHts(row.code)}
                    </Link>
                  </td>
                  <td className={TD_BASE}>{row.description || "—"}</td>
                  <td className={`${TD_BASE} text-right tabular-nums`}>
                    {formatDuties(row.duties)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Top source countries */}
      <section className={SECTION_CLASS}>
        <header className={SECTION_HEAD}>
          <h2 className={SECTION_TITLE}>Top Source Countries by Duties</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Cumulative since January 2025
          </span>
        </header>
        {topCountries.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
            No country-level duty data recorded for this chapter yet.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH_BASE} text-left`}>Country</th>
                <th className={`${TH_BASE} text-right`}>Duties</th>
              </tr>
            </thead>
            <tbody>
              {topCountries.map((row) => (
                <tr key={row.code} className="hover:bg-bg-alt">
                  <td className={TD_BASE}>
                    {row.name.startsWith("Country ") ? (
                      row.name
                    ) : (
                      <Link href={`/country/${row.slug}`} className={LINK_CLASS}>
                        {row.name}
                      </Link>
                    )}
                  </td>
                  <td className={`${TD_BASE} text-right tabular-nums`}>
                    {formatDuties(row.duties)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-[13px] text-fg-muted">
        <Link href="/historical-archive" className={LINK_CLASS}>
          ← All chapters and source countries
        </Link>
      </p>
    </MainContent>
  );
}
