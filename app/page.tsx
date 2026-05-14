import Masthead from "./components/Masthead";
import Nav from "./components/Nav";
import CounterStrip from "./components/CounterStrip";
import StatStrip from "./components/StatStrip";
import MainContent from "./components/MainContent";
import ChartCard from "./components/ChartCard";
import FrAlertsCard from "./components/FrAlertsCard";
import ProductCategoriesCard from "./components/ProductCategoriesCard";
import Footer from "./components/Footer";

// Top-level page. Layout order: masthead → nav strip → counter strip →
// stat strip → main content (Dashboard heading + cards) → footer.

// ISR: regenerate the page at most once every 5 minutes. Each regeneration
// triggers ~6-8 Supabase queries (CounterStrip + StatStrip + ChartCard +
// FrAlertsCard + ProductCategoriesCard). Caching for 5 min caps Supabase
// hits at ~96/day per page regardless of traffic. Real data updates only
// land daily (DTS, FR) or monthly (MTS, Census), so a 5-minute stale window
// is invisible to users — they'd see the same numbers either way.
export const revalidate = 300;

export default function Home() {
  return (
    <>
      <Masthead />
      <Nav />
      <CounterStrip />
      <StatStrip />
      <MainContent>
        <ChartCard />
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-5 mb-5">
          <FrAlertsCard />
          <ProductCategoriesCard />
        </div>
      </MainContent>
      <Footer />
    </>
  );
}
