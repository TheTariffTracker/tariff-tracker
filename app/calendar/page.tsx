import type { Metadata } from "next";
import MainContent from "../components/MainContent";
import CiteButton from "../components/CiteButton";
import { supabase } from "../lib/supabase";
import { FR_DOC_TYPES, mapDocType, badgeClasses, formatPubDate } from "../lib/fr-badges";

// Tariff Calendar — /calendar (Phase 3.65, tool #4).
//
// Forward-looking timeline of tariff-action effective dates, plus a ~60-day
// trailing window of recently-effective actions for context. Data comes from
// the agency-filtered tariff_fr_alerts view; the effective_on column is
// populated by the decoupled second pass in scripts/fetch_federal_register.py.
//
// Procedural notices (investigations, sunset reviews, hearings) have a null
// effective_on and so are naturally excluded — no editorial filtering needed.

export const metadata: Metadata = {
  title: "Tariff Calendar",
  description:
    "Upcoming and recently-effective U.S. tariff actions by effective date, sourced from the Federal Register.",
};

const SITE_URL = "https://tarifftracker.org/";
const PAST_WINDOW_DAYS = 60;
const ROW_LIMIT = 500;

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Local YYYY-MM-DD (no UTC shift).
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "June 1, 2026" from "2026-06-01", parsed manually to avoid timezone drift.
function formatFullDate(iso: string): string {
  const [yyyy, mm, dd] = iso.split("-").map(Number);
  return `${MONTHS_FULL[Math.max(0, Math.min(11, mm - 1))]} ${dd}, ${yyyy}`;
}

type CalRow = {
  document_number: string;
  title: string;
  document_type: string;
  html_url: string;
  publication_date: string;
  effective_on: string;
};

type DateGroup = { date: string; items: CalRow[] };

function groupByDate(rows: CalRow[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let current: DateGroup | null = null;
  for (const r of rows) {
    if (!current || current.date !== r.effective_on) {
      current = { date: r.effective_on, items: [] };
      groups.push(current);
    }
    current.items.push(r);
  }
  return groups;
}

async function getCalendarData(): Promise<{
  upcoming: DateGroup[];
  recent: DateGroup[];
  error: boolean;
}> {
  const now = new Date();
  const todayStr = isoDate(now);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PAST_WINDOW_DAYS);
  const cutoffStr = isoDate(cutoff);

  const { data, error } = await supabase
    .from("tariff_fr_alerts")
    .select("document_number, title, document_type, html_url, publication_date, effective_on")
    .in("document_type", FR_DOC_TYPES)
    .not("effective_on", "is", null)
    .gte("effective_on", cutoffStr)
    .order("effective_on", { ascending: true })
    .limit(ROW_LIMIT);

  if (error) {
    console.error("Calendar fetch error:", { message: error.message, code: error.code });
    return { upcoming: [], recent: [], error: true };
  }

  const rows = (data ?? []) as CalRow[];
  const upcomingRows = rows.filter((r) => r.effective_on >= todayStr);
  // Recently effective: within the trailing window, most-recent first.
  const recentRows = rows
    .filter((r) => r.effective_on < todayStr)
    .reverse();

  return {
    upcoming: groupByDate(upcomingRows),
    recent: groupByDate(recentRows),
    error: false,
  };
}

function Row({ item }: { item: CalRow }) {
  const badge = mapDocType(item.document_type);
  return (
    <li className="border-l-2 border-orange pl-3 py-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={badgeClasses(badge.tone)}>{badge.label}</span>
        <a
          href={item.html_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-medium text-orange underline hover:text-orange-bright transition-colors"
        >
          {item.title}
        </a>
      </div>
      <div className="text-[11px] text-fg-muted mt-0.5">
        Published {formatPubDate(item.publication_date)}
      </div>
    </li>
  );
}

function DateSection({ groups }: { groups: DateGroup[] }) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.date}>
          <h3 className="text-[13px] font-semibold border-b border-border pb-1 mb-2 tabular-nums">
            {formatFullDate(g.date)}
          </h3>
          <ul className="m-0 p-0 list-none space-y-2.5">
            {g.items.map((item) => (
              <Row key={item.document_number} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const SECTION_CLASS = "border border-border bg-bg mb-5";
const SECTION_HEAD =
  "flex justify-between items-center px-4 py-3 border-b border-border gap-4 flex-wrap";
const SECTION_TITLE = "text-sm font-semibold m-0";

export default async function CalendarPage() {
  const { upcoming, recent, error } = await getCalendarData();

  return (
    <MainContent
      title="Tariff Calendar"
      subtitle="Upcoming and recently-effective tariff actions, by the date they take effect. Sourced from Federal Register effective dates."
    >
      {error ? (
        <section className="border border-border bg-bg p-6 text-[13px] text-fg-muted">
          Unable to load the calendar right now. Please refresh.
        </section>
      ) : (
        <>
          {/* Upcoming */}
          <section className={SECTION_CLASS}>
            <header className={SECTION_HEAD}>
              <h2 className={SECTION_TITLE}>Upcoming Effective Dates</h2>
              <span className="text-[11px] text-fg-muted whitespace-nowrap">
                Source: Federal Register
              </span>
            </header>
            <div className="px-4 py-4">
              {upcoming.length === 0 ? (
                <p className="m-0 text-[13px] text-fg-muted">
                  No upcoming tariff-action effective dates are currently on
                  record. Newly published actions appear here as the Federal
                  Register posts them.
                </p>
              ) : (
                <DateSection groups={upcoming} />
              )}
            </div>
          </section>

          {/* Recently effective */}
          <section className={SECTION_CLASS}>
            <header className={SECTION_HEAD}>
              <h2 className={SECTION_TITLE}>Recently Effective</h2>
              <span className="text-[11px] text-fg-muted whitespace-nowrap">
                Past {PAST_WINDOW_DAYS} days
              </span>
            </header>
            <div className="px-4 py-4">
              {recent.length === 0 ? (
                <p className="m-0 text-[13px] text-fg-muted">
                  No tariff actions took effect in the past {PAST_WINDOW_DAYS} days.
                </p>
              ) : (
                <DateSection groups={recent} />
              )}
            </div>
          </section>

          <div className="mb-5">
            <CiteButton
              figureLabel="U.S. Tariff-Action Effective Dates"
              sourceName="U.S. Federal Register (document effective dates)"
              dataThrough="January 2025 to present"
              url={`${SITE_URL}calendar`}
            />
          </div>

          <p className="text-[12px] text-fg-muted">
            Each entry shows the primary effective date reported by the Federal
            Register. A document with multiple effective dates lists only its
            primary one here; procedural notices without an effective date are
            not shown. See the{" "}
            <a
              href="/methodology"
              className="text-orange underline hover:text-orange-bright transition-colors"
            >
              methodology
            </a>{" "}
            for details.
          </p>
        </>
      )}
    </MainContent>
  );
}
