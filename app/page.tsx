import Masthead from "./components/Masthead";
import Nav from "./components/Nav";
import CounterStrip from "./components/CounterStrip";
import StatStrip from "./components/StatStrip";

// Top-level page. Layout order: masthead → nav strip → counter strip →
// stat strip → body placeholder. The placeholder will be replaced as we
// build out main content → footer.

export default function Home() {
  return (
    <>
      <Masthead />
      <Nav />
      <CounterStrip />
      <StatStrip />

      <section className="flex-1 bg-bg text-fg px-8 py-10">
        <h2 className="font-serif text-2xl font-bold mb-2">
          Body content goes here
        </h2>
        <p className="text-sm text-fg-muted">
          Click the toggle in the masthead — this section and the nav strip +
          stat strip flip theme while the cream brand zone (masthead +
          counter strip) stays put. Main content lands here next.
        </p>
      </section>
    </>
  );
}
