import Masthead from "./components/Masthead";
import Nav from "./components/Nav";
import CounterStrip from "./components/CounterStrip";

// Top-level page. Layout order: masthead → nav strip → counter strip → body
// placeholder. The placeholder will be replaced as we build out the stat
// strip → main content → footer.

export default function Home() {
  return (
    <>
      <Masthead />
      <Nav />
      <CounterStrip />

      <section className="flex-1 bg-bg text-fg px-8 py-10">
        <h2 className="font-serif text-2xl font-bold mb-2">
          Body content goes here
        </h2>
        <p className="text-sm text-fg-muted">
          Click the toggle in the masthead — this section and the nav strip
          flip theme while the cream brand zone (masthead + counter strip)
          stays put. Stat strip and main content land here next.
        </p>
      </section>
    </>
  );
}
