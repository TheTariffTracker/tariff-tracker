import { supabase } from "../lib/supabase";
import InfoIcon from "./InfoIcon";

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
    .select("customs_revenue_today")
    .gte("record_date", cutoffDate);

  let dtsProvisionalDollars: number | null = null;
  if (dtsError) {
    console.error("CounterStrip: dts_daily fetch error", dtsError);
  } else {
    // DTS amounts are in MILLIONS of dollars. Convert to dollars.
    const dtsMillions = (dtsRows ?? []).reduce(
      (sum, r) => sum + Number(r.customs_revenue_today ?? 0),
      0,
    );
    dtsProvisionalDollars = dtsMillions * 1_000_000;
  }

  return { mtsTotalDollars, latestMonthLabel, dtsProvisionalDollars };
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
            +{formatBillions(data.dtsProvisionalDollars!)} since{" "}
            {data.latestMonthLabel} (provisional · all customs receipts)
            <InfoIcon
              variant="counter"
              tooltip="From the Daily Treasury Statement. Bundles Customs Duties with Merchandise Processing Fee and Harbor Maintenance Tax, so this figure is slightly broader than the MTS number above. Updates each business day."
              ariaLabel="Source info"
            />
          </div>
        )}
      </div>
    </section>
  );
}
