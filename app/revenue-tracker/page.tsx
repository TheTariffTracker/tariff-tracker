import MainContent from "../components/MainContent";
import ChartCard from "../components/ChartCard";
import MtsBarChart from "../components/MtsBarChart";

// Revenue Tracker page (route: "/revenue-tracker"). Two charts stacked:
//
//   1. Daily customs receipts (last 90 days) — reuses ChartCard from the
//      Dashboard, sourced from dts_daily, with a calendar-aligned prior
//      year comparison line.
//   2. Monthly customs duties (since Jan 2025) — new MtsBarChart, sourced
//      from mts_monthly Table 4 figures.
//
// Optional range selector for the daily chart (?range=...) is deferred to
// a future iteration. Same ISR cache window as the rest of the app (5 min,
// from layout.tsx).

export default function RevenueTrackerPage() {
  return (
    <MainContent
      title="Revenue Tracker"
      subtitle="Daily and monthly customs revenue from the U.S. Treasury."
    >
      <ChartCard />
      <MtsBarChart />
    </MainContent>
  );
}
