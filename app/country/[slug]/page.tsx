import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import MainContent from "../../components/MainContent";
import CiteButton from "../../components/CiteButton";
import { supabase } from "../../lib/supabase";
import {
  getCountryName,
  getCountrySlug,
  getCodeFromSlug,
  COLUMN_2_CODES,
} from "../../lib/census-countries";
import { getChapterName } from "../../lib/hts-chapters";
import {
  getCountryActions,
  STATUS_AS_OF,
  type TariffAction,
} from "../../lib/tariff-actions";

// Country profile — /country/[slug] (Phase 3.65, tool #2).
//
// One page per source country with recorded U.S. import duties since Jan 2025.
// Panels: header (cumulative duties + tariff-column status + Cite button),
// top HTS chapters by duties, and applicable tariff actions. AD/CVD and FR
// "mentions" panels were deliberately omitted from v1 — the underlying tables
// have no country field, so they'd be noisy title-text matches.
//
// Pages are statically generated for the known set of data-bearing countries
// (generateStaticParams). dynamicParams=false → any other slug 404s rather
// than being rendered on demand.

const SITE_URL = "https://tarifftracker.org/";

export const dynamicParams = false;

type ChapterRow = { chapter: string; total_duties: string | number };

// ---- Formatting -------------------------------------------------------------
function formatDuties(dollars: number): string {
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${Math.round(dollars / 1e6).toLocaleString("en-US")}M`;
  if (dollars > 0) return `$${Math.round(dollars).toLocaleString("en-US")}`;
  return "$0";
}

// ---- Static params + metadata ----------------------------------------------
export async function generateStaticParams() {
  const { data, error } = await supabase
    .from("country_total_duties")
    .select("country_code");
  if (error || !data) return [];

  const slugs = new Set<string>();
  for (const row of data as { country_code: string }[]) {
    const code = row.country_code;
    // Only emit pages for recognized, named countries — skip unmapped codes
    // (which would render as "Country 1234" with an ugly slug).
    if (getCountryName(code).startsWith("Country ")) continue;
    slugs.add(getCountrySlug(code));
  }
  // Always include the Column 2 (non-NTR) countries even without duty data —
  // high-interest names we'd rather show as low-activity pages than 404.
  for (const code of COLUMN_2_CODES) slugs.add(getCountrySlug(code));
  return Array.from(slugs).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const code = getCodeFromSlug(slug);
  if (!code) return { title: "Country not found" };
  const name = getCountryName(code);
  return {
    title: `${name} — U.S. Tariffs & Customs Revenue`,
    description: `U.S. customs duties collected on imports from ${name} since January 2025, the top product categories driving them, and the tariff actions that apply. Sourced from U.S. Census Bureau trade data.`,
  };
}

// ---- Data fetch -------------------------------------------------------------
type CountryData = {
  cumulativeDuties: number;
  topChapters: { chapter: string; name: string; duties: number }[];
  chaptersUnavailable: boolean;
};

async function getCountryData(code: string): Promise<CountryData> {
  const [dutiesResp, chaptersResp] = await Promise.all([
    supabase
      .from("country_total_duties")
      .select("total_duties")
      .eq("country_code", code)
      .maybeSingle(),
    supabase
      .from("country_chapter_duties")
      .select("chapter, total_duties")
      .eq("country_code", code)
      .order("total_duties", { ascending: false })
      .limit(10),
  ]);

  if (dutiesResp.error) {
    console.error("CountryProfile duties error:", {
      message: dutiesResp.error.message,
      code: dutiesResp.error.code,
    });
  }

  const cumulativeDuties = Number(dutiesResp.data?.total_duties ?? 0);

  let topChapters: CountryData["topChapters"] = [];
  let chaptersUnavailable = false;
  if (chaptersResp.error) {
    // The country_chapter_duties materialized view may not exist yet (DDL is
    // applied separately in Supabase). Degrade gracefully rather than crash.
    chaptersUnavailable = true;
    console.error("CountryProfile chapters error:", {
      message: chaptersResp.error.message,
      code: chaptersResp.error.code,
    });
  } else {
    topChapters = ((chaptersResp.data ?? []) as ChapterRow[]).map((r) => ({
      chapter: r.chapter,
      name: getChapterName(r.chapter),
      duties: Number(r.total_duties ?? 0),
    }));
  }

  return { cumulativeDuties, topChapters, chaptersUnavailable };
}

// ---- Render helpers ---------------------------------------------------------
const SECTION_CLASS = "border border-border bg-bg mb-5";
const SECTION_HEAD =
  "flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap";
const SECTION_TITLE = "text-sm font-semibold m-0";
const TH_BASE = "text-[11px] uppercase tracking-wide text-fg-muted font-semibold px-4 py-2";
const TD_BASE = "px-4 py-2 text-[13px] border-t border-border";

// Badge styling per tariff-action status. Mirrors the lookup on the calculator.
const STATUS_BADGE: Record<
  string,
  { label: string; textClass: string; bg: string }
> = {
  active: { label: "Active", textClass: "text-green", bg: "rgba(21,128,61,0.12)" },
  pending: { label: "Pending", textClass: "text-orange", bg: "rgba(234,88,12,0.12)" },
  expired: { label: "Expired", textClass: "text-fg-muted", bg: "rgba(120,120,120,0.15)" },
  invalidated: { label: "Invalidated", textClass: "text-red", bg: "rgba(185,28,28,0.12)" },
};

function ActionRow({ action }: { action: TariffAction }) {
  const badge = STATUS_BADGE[action.status];
  return (
    <div className="px-4 py-3 border-t border-border">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold">{action.label}</span>
        <span
          className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${badge.textClass}`}
          style={{ background: badge.bg }}
        >
          {badge.label}
        </span>
      </div>
      <div className="text-[12px] text-fg-muted mt-0.5">
        {action.authority} · {action.scope}
      </div>
      <p className="text-[13px] mt-1.5 mb-0">
        {action.note}{" "}
        <a
          href={action.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange underline hover:text-orange-bright transition-colors"
        >
          Source
        </a>
      </p>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------
export default async function CountryProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const code = getCodeFromSlug(slug);
  if (!code) notFound();

  const name = getCountryName(code);
  const { cumulativeDuties, topChapters, chaptersUnavailable } =
    await getCountryData(code);
  const actions = getCountryActions(code);
  const isColumn2 = COLUMN_2_CODES.has(code);
  const hasActivity = cumulativeDuties > 0;

  return (
    <MainContent
      title={name}
      subtitle={`U.S. customs duties, top product categories, and applicable tariff actions for imports from ${name}, since January 2025.`}
    >
      {/* Header card — cumulative duties + tariff-column status */}
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
          {hasActivity ? (
            <p className="text-[13px] text-fg-muted mt-1 mb-0">
              Estimated customs duties on imports from {name} since January 1,
              2025, calculated from Census Bureau trade data.
            </p>
          ) : (
            <p className="text-[13px] text-fg-muted mt-1 mb-0">
              No recorded customs duties on imports from {name} since January
              2025. This country may have low U.S. import volume, duty-free
              trade, or limited reported data.
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-2">
            <span className="text-[12px] font-semibold">Tariff column:</span>
            <span className="text-[13px]">
              {isColumn2
                ? "Column 2 (non-NTR) — statutory rates apply"
                : "Column 1 (Normal Trade Relations / MFN)"}
            </span>
          </div>
          {hasActivity && (
            <div>
              <CiteButton
                figureLabel={`Cumulative U.S. Customs Duties on Imports from ${name}, since January 2025`}
                value={formatDuties(cumulativeDuties)}
                sourceName="U.S. Census Bureau, International Trade data (calculated duties)"
                dataThrough="January 2025 to present"
                url={`${SITE_URL}country/${slug}`}
              />
            </div>
          )}
        </div>
      </section>

      {/* Top HTS chapters */}
      <section className={SECTION_CLASS}>
        <header className={SECTION_HEAD}>
          <h2 className={SECTION_TITLE}>Top Product Categories by Duties</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            HTS chapters · cumulative since January 2025
          </span>
        </header>
        {chaptersUnavailable ? (
          <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
            Product-category breakdown is temporarily unavailable.
          </div>
        ) : topChapters.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
            No product-category duty data recorded for {name} yet.
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH_BASE} text-left`}>Chapter</th>
                <th className={`${TH_BASE} text-left`}>Category</th>
                <th className={`${TH_BASE} text-right`}>Duties</th>
              </tr>
            </thead>
            <tbody>
              {topChapters.map((row) => (
                <tr key={row.chapter} className="hover:bg-bg-alt">
                  <td className={`${TD_BASE} tabular-nums`}>{row.chapter}</td>
                  <td className={TD_BASE}>
                    <Link
                      href={`/chapter/${row.chapter}`}
                      className="text-orange underline hover:text-orange-bright transition-colors"
                    >
                      {row.name}
                    </Link>
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

      {/* Applicable tariff actions */}
      <section className={SECTION_CLASS}>
        <header className={SECTION_HEAD}>
          <h2 className={SECTION_TITLE}>Applicable Tariff Actions</h2>
          <span className="text-[11px] text-fg-muted whitespace-nowrap">
            Status as of {STATUS_AS_OF}
          </span>
        </header>
        <div>
          {actions.map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border text-[12px] text-fg-muted">
          This panel describes which U.S. tariff actions apply to imports from{" "}
          {name}; it does not attribute specific dollar amounts to each action.
          See the{" "}
          <Link
            href="/methodology"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            methodology
          </Link>{" "}
          for sourcing and limits.
        </div>
      </section>

      <p className="text-[13px] text-fg-muted">
        <Link
          href="/historical-archive"
          className="text-orange underline hover:text-orange-bright transition-colors"
        >
          ← All source countries
        </Link>
      </p>
    </MainContent>
  );
}
