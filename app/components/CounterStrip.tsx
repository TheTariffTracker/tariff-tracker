import { supabase } from "../lib/supabase";
import InfoIcon from "./InfoIcon";
import CiteButton from "./CiteButton";

const SITE_URL = "https://tarifftracker.org/";

const MONTH_NAMES = [
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

type CounterData = {
  mtsTotalDollars: number;
  latestMonthLabel: string;
  dtsProvisionalDollars: number | null;
  provisionalRangeLabel: string | null;
};

async function getCounterData(): Promise<CounterData | null> {
  // -------- MTS: cent-accurate cumulative customs duties --------
  // Pull every monthly row (~15 rows today, max ~12/year) and sum client-side.
  const { data: mtsRows, error: mtsError } = await supabase
    .from("mts_monthly")
    .select("year, month, customs_duties")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (mtsError) {
    console.error("CounterStrip: mts_monthly fetch error", mtsError);
    return null;
  }
  if (!mtsRows || mtsRows.length === 0) {
    return null;
  }

  const mtsTotalDollars = mtsRows.reduce(
    (sum, r) => sum + Number(r.customs_duties ?? 0),
    0,
  );

  const latest = mtsRows[0]; // already sorted desc by year, month
  const latestMonthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;

  // -------- DTS: provisional add-on since the latest MTS month --------
  // Compute the first day of the month AFTER the latest MTS month.
  let nextYear = latest.year;
  let nextMonth = latest.month + 1;
  if (nextMonth > 12) {
    nextYear += 1;
    nextMonth = 1;
  }
  const cutoffDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const { data: dtsRows, error: dtsError } = await supabase
    .from("dts_daily")
    .select("record_date, customs_revenue_today")
    .gte("record_date", cutoffDate);

  let dtsProvisionalDollars: number | null = null;
  let provisionalRangeLabel: string | null = null;
  if (dtsError) {
    console.error("CounterStrip: dts_daily fetch error", dtsError);
  } else {
    const rows = dtsRows ?? [];
    // DTS amounts are in MILLIONS of dollars. Convert to dollars.
    const dtsMillions = rows.reduce(
      (sum, r) => sum + Number(r.customs_revenue_today ?? 0),
      0,
    );
    dtsProvisionalDollars = dtsMillions * 1_000_000;

    // Latest DTS day we actually hold. Printed as the end of the provisional
    // range, which doubles as the site's freshness signal now that the
    // footer's hardcoded refresh date is gone. ISO date strings compare
    // lexicographically, so a plain string max is correct here.
    const maxDate = rows.reduce<string | null>(
      (max, r) =>
        !max || String(r.record_date) > max ? String(r.record_date) : max,
      null,
    );
    if (maxDate) {
      provisionalRangeLabel = formatRange(cutoffDate, maxDate);
    }
  }

  return {
    mtsTotalDollars,
    latestMonthLabel,
    dtsProvisionalDollars,
    provisionalRangeLabel,
  };
}

function formatCentAccurateDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatBillions(amount: number): string {
  const billions = amount / 1_000_000_000;
  return `$${billions.toFixed(1)}B`;
}

// "Sep 1 - Oct 15, 2026" from two ISO dates. The start date carries its year
// only when the range crosses a year boundary -- a November MTS month leaves
// "Dec 1, 2026 - Jan 15, 2027". Parsed as UTC so the printed day doesn't
// shift by timezone (same approach as StatStrip's formatDate).
function formatRange(startIso: string, endIso: string): string {
  const s = new Date(startIso + "T00:00:00Z");
  const e = new Date(endIso + "T00:00:00Z");
  const sy = s.getUTCFullYear();
  const ey = e.getUTCFullYear();
  const sm = MONTH_NAMES[s.getUTCMonth()].slice(0, 3);
  const em = MONTH_NAMES[e.getUTCMonth()].slice(0, 3);
  const start = `${sm} ${s.getUTCDate()}${sy !== ey ? `, ${sy}` : ""}`;
  return `${start} \u2013 ${em} ${e.getUTCDate()}, ${ey}`;
}

export default async function CounterStrip() {
  const data = await getCounterData();

  if (!data) {
    return (
      <section className="counter-strip" aria-label="Live total tariff revenue">
        <div className="counter-strip-inner">
          <div className="counter-label">Total Tariff Revenue</div>
          <div className="counter-big">—</div>
        </div>
      </section>
    );
  }

  const showProvisional =
    data.dtsProvisionalDollars !== null && data.dtsProvisionalDollars > 0;

  return (
    <section className="counter-strip" aria-label="Live total tariff revenue">
      <div className="counter-strip-inner">
        <div className="counter-label">
          Total Tariff Revenue · Jan 2025 – {data.latestMonthLabel}
          <InfoIcon
            variant="counter"
            tooltip="Cent-accurate cumulative figure from the U.S. Treasury's Monthly Treasury Statement (Table 4, Customs Duties line). Reflects net receipts after refunds and drawbacks."
            ariaLabel="Source info"
          />
        </div>
        <div className="counter-big">
          {formatCentAccurateDollars(data.mtsTotalDollars)}
        </div>
        {showProvisional && (
          <div className="counter-provisional">
            +{formatBillions(data.dtsProvisionalDollars!)}
            {data.provisionalRangeLabel
              ? ` · ${data.provisionalRangeLabel}`
              : ""}{" "}
            (provisional · all customs receipts)
            <InfoIcon
              variant="counter"
              tooltip="From the Daily Treasury Statement. Bundles Customs Duties with Merchandise Processing Fee and Harbor Maintenance Tax, so this figure is slightly broader than the MTS number above. Updates each business day."
              ariaLabel="Source info"
            />
          </div>
        )}
        <div className="counter-cite">
          <CiteButton
            variant="counter"
            figureLabel={`Total U.S. Tariff Revenue, January 2025 – ${data.latestMonthLabel}`}
            value={formatCentAccurateDollars(data.mtsTotalDollars)}
            sourceName="U.S. Department of the Treasury, Monthly Treasury Statement, Table 4 (Customs Duties)"
            dataThrough={data.latestMonthLabel}
            url={SITE_URL}
          />
        </div>
      </div>
    </section>
  );
}
