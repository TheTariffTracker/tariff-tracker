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
