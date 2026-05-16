import MainContent from "./components/MainContent";
import ChartCard from "./components/ChartCard";
import FrAlertsCard from "./components/FrAlertsCard";
import ProductCategoriesCard from "./components/ProductCategoriesCard";

// Dashboard page (route: "/"). Shared chrome (Masthead, Nav, CounterStrip,
// StatStrip, Footer) lives in app/layout.tsx so it renders on every nav
// page. This file just contributes the Dashboard's own content: section
// title + 90-day chart + two-column row (FR alerts + product categories).
//
// The 5-minute ISR is set on the layout, so this page inherits it. If we
// ever need a shorter or longer cache window for the Dashboard
// specifically, we can override `export const revalidate = N` here.

export default function Home() {
  return (
    <MainContent
      title="Dashboard"
      subtitle="Real-time customs revenue and incoming tariff actions, updated each business day."
    >
      <ChartCard />
      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-5 mb-5">
        <FrAlertsCard />
        <ProductCategoriesCard />
      </div>
    </MainContent>
  );
}
