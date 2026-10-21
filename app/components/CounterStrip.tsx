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
  provisionalSinceLabel: string | null;
  mtsGrossDollars: number;
  mtsRefundsDollars: number;
};

async function getCounterData(): Promise<CounterData | null> {
  // -------- MTS: cent-accurate cumulative customs duties --------
  // Pull every monthly row (~15 rows today, max ~12/year) and sum client-side.
  const { data: mtsRows, error: mtsError } = await supabase
    .from("mts_monthly")
    .select("year, month, customs_duties, customs_gross, customs_refunds")
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
  // Components of the headline. customs_duties is net; these two are what it
  // is made of. Shown because refunds have run ~30% of gross since the IEEPA
  // ruling, which a single net figure hides completely.
  const mtsGrossDollars = mtsRows.reduce(
    (sum, r) => sum + Number(r.customs_gross ?? 0),
    0,
  );
  const mtsRefundsDollars = mtsRows.reduce(
    (sum, r) => sum + Number(r.customs_refunds ?? 0),
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
    .select("record_date, customs_revenue_today, cbp_withdrawals_today")
    .gte("record_date", cutoffDate);

  let dtsProvisionalDollars: number | null = null;
  let provisionalRangeLabel: string | null = null;
  let provisionalSinceLabel: string | null = null;
  if (dtsError) {
    console.error("CounterStrip: dts_daily fetch error", dtsError);
  } else {
    const rows = dtsRows ?? [];
    // DTS amounts are in MILLIONS of dollars. Convert to dollars.
    //
    // NET, not gross. customs_revenue_today is the deposits side only;
    // cbp_withdrawals_today is how tariff refunds surface in the daily data.
    // Using deposits alone was off by ~$50B with the sign inverted in June
    // 2026, when IEEPA refunds exceeded collections. Do not "simplify" this
    // back to a single column -- see scripts/dts_cbp_withdrawals.sql for the
    // measured comparison against the authoritative MTS figures.
    const dtsMillions = rows.reduce(
      (sum, r) =>
        sum +
        Number(r.customs_revenue_today ?? 0) -
        Number(r.cbp_withdrawals_today ?? 0),
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
      provisionalSinceLabel = formatSince(cutoffDate);
    }
  }

  return {
    mtsTotalDollars,
    latestMonthLabel,
    dtsProvisionalDollars,
    provisionalRangeLabel,
    provisionalSinceLabel,
    mtsGrossDollars,
    mtsRefundsDollars,
  };
}

// "Since Oct 1" from an ISO date. The full range stays available for the
// tooltip; this short form keeps the three counter cells roughly even in
// width, which spelling out "Provisional · Oct 1 - Oct 19, 2026" did not.
function formatSince(startIso: string): string {
  const d = new Date(startIso + "T00:00:00Z");
  return `Since ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

function formatCentAccurateDollars(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Unsigned compact dollars for the decomposition cells, which always carry
// their own sign via the label ("Refunded") and colour.
function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1_000_000_000) {
    return `$${(abs / 1_000_000).toFixed(0)}M`;
  }
  return `$${(abs / 1_000_000_000).toFixed(1)}B`;
}

// Signed, and falls back to millions below $1B so a near-zero net month
// prints "+$11M" rather than a meaningless "+$0.0B". Uses a true minus sign
// (U+2212) rather than a hyphen so the negative reads clearly at this size.
function formatSignedCompact(amount: number): string {
  const sign = amount < 0 ? "\u2212" : "+";
  const abs = Math.abs(amount);
  if (abs < 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(0)}M`;
  }
  return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
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

  // Deliberately NOT "> 0". The net provisional figure goes negative in a
  // month where refunds exceed collections, which is exactly when it is most
  // worth showing; the old positive-only guard would have hidden it.
  const showProvisional = data.dtsProvisionalDollars !== null;

  return (
    <section className="counter-strip" aria-label="Live total tariff revenue">
      <div className="counter-strip-inner">
        <div className="counter-label">
          Net Tariff Revenue · Jan 2025 – {data.latestMonthLabel}
          <InfoIcon
            variant="counter"
            tooltip="Cent-accurate cumulative figure from the U.S. Treasury's Monthly Treasury Statement (Table 4, Customs Duties line). Reflects net receipts after refunds and drawbacks."
            ariaLabel="Source info"
          />
        </div>
        <div className="counter-big">
          {formatCentAccurateDollars(data.mtsTotalDollars)}
        </div>
        <div className="counter-subrow">
          <span className="counter-cell">
            <span className="counter-cell-k">Gross collected</span>
            <span className="counter-cell-v">
              {formatCompact(data.mtsGrossDollars)}
            </span>
          </span>
          <span className="counter-cell counter-cell-neg">
            <span className="counter-cell-k">Refunded</span>
            <span className="counter-cell-v">
              {"\u2212"}
              {formatCompact(data.mtsRefundsDollars)}
            </span>
          </span>
          {showProvisional && (
            <span className="counter-cell">
              <span className="counter-cell-k">
                {data.provisionalSinceLabel
                  ? `${data.provisionalSinceLabel} · prov.`
                  : "Provisional"}
              </span>
              <span className="counter-cell-v">
                {formatSignedCompact(data.dtsProvisionalDollars!)}
                <InfoIcon
                  variant="counter"
                  tooltip={`Provisional total for ${data.provisionalRangeLabel ?? "the days since the last settled month"}, from the Daily Treasury Statement: customs deposits minus Customs and Border Protection withdrawals, which is how tariff refunds appear in the daily data. Treasury publishes no customs-refund line, so the withdrawals side also carries roughly $1-2B a month of CBP operating costs, making this a close proxy rather than an exact figure. It also bundles Customs Duties with Merchandise Processing Fee and Harbor Maintenance Tax. The monthly figures to the left are the authoritative ones. Updates each business day.`}
                  ariaLabel="Source info"
                />
              </span>
            </span>
          )}
        </div>
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
