import { supabase } from "../lib/supabase";
import { FR_DOC_TYPES } from "../lib/fr-badges";
import StatStripScroller from "./StatStripScroller";
import InfoIcon from "./InfoIcon";
import CiteButton from "./CiteButton";

const SITE_URL = "https://tarifftracker.org/";
const DTS_SOURCE = "U.S. Department of the Treasury, Daily Treasury Statement";
const YTD_SOURCE =
  "U.S. Department of the Treasury, Monthly Treasury Statement (completed months) and Daily Treasury Statement (current month)";

// Month name lookups, 0-indexed for use with Date.getMonth().
const MONTH_NAMES_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Same FR_DOC_TYPES list shared with FrAlertsCard and the Incoming Tariffs
// page lives in app/lib/fr-badges.ts so all three surfaces stay consistent.

// Tariffed product lines: hardcoded placeholder until Yale Budget Lab
// effective-rate parsing is wired (Phase 3 follow-up). Numbers match
// design_mockup_v11.html.
const PRODUCT_LINES_COUNT = 8217;
const HTS_TOTAL_COUNT = 29583;

type FrAlert = {
  title: string;
  publication_date: string;
  document_type: string;
  html_url: string;
};

type StatData = {
  // Card 1: today + prior business day
  todayDollars: number | null;
  priorDayDollars: number | null;
  todayRecordDate: string | null;
  // Card 2: MTD
  mtdMillions: number | null;
  // Card 3: YTD
  ytdDollars: number | null;
  // Card 4: latest FR alert
  frAlert: FrAlert | null;
};

async function getStatData(): Promise<StatData> {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Three parallel queries. Top 250 dts_daily rows (~11 months of business
  // days) covers Cards 1, 2, and Card 3's DTS portion. mts_monthly for the
  // current year covers Card 3's pre-cutoff portion. The latest FR alert
  // filtered by document_type covers Card 4.
  const [dtsRecentResp, mtsYearResp, frResp] = await Promise.all([
    supabase
      .from("dts_daily")
      .select("record_date, customs_revenue_today, customs_revenue_mtd")
      .order("record_date", { ascending: false })
      .limit(250),
    supabase
      .from("mts_monthly")
      .select("year, month, customs_duties")
      .eq("year", currentYear),
    supabase
      // tariff_fr_alerts is the agency-filtered view of federal_register_alerts.
      .from("tariff_fr_alerts")
      .select("title, publication_date, document_type, html_url")
      .in("document_type", FR_DOC_TYPES)
      .order("publication_date", { ascending: false })
      .limit(1),
  ]);

  if (dtsRecentResp.error) {
    console.error("StatStrip dts_daily error:", dtsRecentResp.error);
  }
  if (mtsYearResp.error) {
    console.error("StatStrip mts_monthly error:", mtsYearResp.error);
  }
  if (frResp.error) {
    const e = frResp.error as unknown as Record<string, unknown>;
    console.error("StatStrip federal_register_alerts error:", {
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

  const dtsRows = dtsRecentResp.data ?? [];
  const mtsRows = mtsYearResp.data ?? [];
  const frRows = frResp.data ?? [];

  // ---- Cards 1 + 2 from the most recent DTS row ----
  let todayDollars: number | null = null;
  let priorDayDollars: number | null = null;
  let todayRecordDate: string | null = null;
  let mtdMillions: number | null = null;

  if (dtsRows.length > 0) {
    const latest = dtsRows[0];
    todayRecordDate = latest.record_date;
    // DTS is stored in millions; convert to dollars for the big number.
    todayDollars = Number(latest.customs_revenue_today ?? 0) * 1_000_000;
    // MTD stays in millions — that's what the card displays directly.
    mtdMillions = Number(latest.customs_revenue_mtd ?? 0);
    if (dtsRows.length > 1) {
      priorDayDollars =
        Number(dtsRows[1].customs_revenue_today ?? 0) * 1_000_000;
    }
  }

  // ---- Card 3 YTD: sum current-year MTS (dollars) + post-cutoff DTS (millions → dollars) ----
  let ytdDollars: number | null = null;
  if (mtsRows.length > 0 || dtsRows.length > 0) {
    const mtsYearSumDollars = mtsRows.reduce(
      (sum, r) => sum + Number(r.customs_duties ?? 0),
      0,
    );
    const latestMtsMonth =
      mtsRows.length > 0
        ? Math.max(...mtsRows.map((r) => Number(r.month)))
        : 0;
    let dtsAddDollars = 0;
    if (latestMtsMonth < 12) {
      const cutoffMonth = latestMtsMonth + 1;
      const cutoffStr = `${currentYear}-${String(cutoffMonth).padStart(2, "0")}-01`;
      const yearEndStr = `${currentYear}-12-31`;
      const dtsInRange = dtsRows.filter(
        (r) => r.record_date >= cutoffStr && r.record_date <= yearEndStr,
      );
      const dtsSumMillions = dtsInRange.reduce(
        (sum, r) => sum + Number(r.customs_revenue_today ?? 0),
        0,
      );
      dtsAddDollars = dtsSumMillions * 1_000_000;
    }
    ytdDollars = mtsYearSumDollars + dtsAddDollars;
  }

  // ---- Card 4 ----
  const frAlert: FrAlert | null =
    frRows.length > 0 ? (frRows[0] as FrAlert) : null;

  return {
    todayDollars,
    priorDayDollars,
    todayRecordDate,
    mtdMillions,
    ytdDollars,
    frAlert,
  };
}

// "$X,XXXM" given a dollar amount. Rounds to the nearest million.
function formatMillionsFromDollars(amountDollars: number): string {
  const millions = amountDollars / 1_000_000;
  return `$${Math.round(millions).toLocaleString("en-US")}M`;
}

// "$X,XXXM" given an amount already in millions.
function formatMillions(amountMillions: number): string {
  return `$${Math.round(amountMillions).toLocaleString("en-US")}M`;
}

// "May 10, 2026" from "2026-05-10". Parsed as UTC so the printed day doesn't
// shift by timezone.
function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTH_NAMES_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export default async function StatStrip() {
  const data = await getStatData();
  const now = new Date();

  // Vintage for the daily/MTD/YTD figures: the latest DTS record date.
  const asOf = data.todayRecordDate ? formatDate(data.todayRecordDate) : null;
  const currentMonthLabel = `${MONTH_NAMES_FULL[now.getMonth()]} ${now.getFullYear()}`;

  // Card 1 sub-line: delta vs prior business day if we have both values,
  // otherwise fall back to the latest record date as a neutral note.
  let card1Sub: { text: string; cls: string } | null = null;
  if (data.todayDollars !== null && data.priorDayDollars !== null) {
    const delta = data.todayDollars - data.priorDayDollars;
    const isUp = delta >= 0;
    const arrow = isUp ? "▲" : "▼";
    const sign = isUp ? "+" : "-";
    card1Sub = {
      text: `${arrow} ${sign}${formatMillionsFromDollars(Math.abs(delta))} vs prior business day`,
      cls: isUp ? "stat-delta-up" : "stat-delta-down",
    };
  } else if (data.todayRecordDate) {
    card1Sub = {
      text: formatDate(data.todayRecordDate),
      cls: "stat-delta-neutral",
    };
  }

  return (
    <StatStripScroller>
      {/* Card 1 — Today's Customs Receipts */}
      <div className="stat-item">
        <div className="stat-label">Today&apos;s Customs Receipts</div>
        <div className="stat-value">
          {data.todayDollars !== null
            ? formatMillionsFromDollars(data.todayDollars)
            : "—"}
        </div>
        {card1Sub && (
          <div className={`stat-delta ${card1Sub.cls}`}>{card1Sub.text}</div>
        )}
        {data.todayDollars !== null && asOf && (
          <CiteButton
            figureLabel={`Daily U.S. Customs Receipts, ${asOf}`}
            value={formatMillionsFromDollars(data.todayDollars)}
            sourceName={DTS_SOURCE}
            dataThrough={asOf}
            url={SITE_URL}
          />
        )}
      </div>

      {/* Card 2 — Month-to-Date Revenue */}
      <div className="stat-item">
        <div className="stat-label">Month-to-Date Revenue</div>
        <div className="stat-value">
          {data.mtdMillions !== null ? formatMillions(data.mtdMillions) : "—"}
        </div>
        <div className="stat-delta stat-delta-neutral">
          {currentMonthLabel}
        </div>
        {data.mtdMillions !== null && (
          <CiteButton
            figureLabel={`Month-to-Date U.S. Customs Receipts, ${currentMonthLabel}`}
            value={formatMillions(data.mtdMillions)}
            sourceName={DTS_SOURCE}
            dataThrough={asOf ?? currentMonthLabel}
            url={SITE_URL}
          />
        )}
      </div>

      {/* Card 3 — Calendar YTD Revenue */}
      <div className="stat-item">
        <div className="stat-label">Calendar YTD Revenue</div>
        <div className="stat-value">
          {data.ytdDollars !== null
            ? formatMillionsFromDollars(data.ytdDollars)
            : "—"}
        </div>
        <div className="stat-delta stat-delta-neutral">YTD {now.getFullYear()}</div>
        {data.ytdDollars !== null && (
          <CiteButton
            figureLabel={`Calendar Year-to-Date U.S. Customs Receipts, ${now.getFullYear()}`}
            value={formatMillionsFromDollars(data.ytdDollars)}
            sourceName={YTD_SOURCE}
            dataThrough={asOf ?? String(now.getFullYear())}
            url={SITE_URL}
          />
        )}
      </div>

      {/* Card 4 — Most Recent Federal Register Alert */}
      <div className="stat-item stat-item-wide">
        <div className="stat-label">Most Recent Federal Register Alert</div>
        {data.frAlert ? (
          <>
            <a
              href={data.frAlert.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="stat-fr-title"
            >
              {data.frAlert.title}
            </a>
            <div className="stat-delta stat-delta-neutral">
              {formatDate(data.frAlert.publication_date)} ·{" "}
              {data.frAlert.document_type}
            </div>
          </>
        ) : (
          <>
            <div className="stat-fr-title">No recent alerts</div>
            <div className="stat-delta stat-delta-neutral">—</div>
          </>
        )}
      </div>

      {/* Card 5 — Tariffed Product Lines (placeholder until Yale parsing lands) */}
      <div className="stat-item stat-item-medium">
        <div className="stat-label">
          Tariffed Product Lines
          <InfoIcon
            tooltip="Count of HTS codes carrying an active trade-action surcharge (Section 232, Section 301, executive surcharges, etc.). A 'product line' is one 10-digit HTS code. Placeholder figure pending Yale Budget Lab effective-rate parsing."
            ariaLabel="Source info"
          />
        </div>
        <div className="stat-value">
          {PRODUCT_LINES_COUNT.toLocaleString("en-US")}
        </div>
        <div className="stat-delta stat-delta-neutral">
          of {HTS_TOTAL_COUNT.toLocaleString("en-US")} total product lines
        </div>
      </div>
    </StatStripScroller>
  );
}
