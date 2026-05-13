import Masthead from "./components/Masthead";

// Top-level page. For now: the masthead, then a placeholder body section.
// The placeholder is here only so you can see the theme toggle flip the body
// light↔dark while the masthead stays cream. It will be replaced as we build
// out the nav strip → counter strip → stat strip → main content → footer.

export default function Home() {
  return (
    <>
      <Masthead />

      <section className="flex-1 bg-bg text-fg border-t border-border px-8 py-10">
        <h2 className="font-serif text-2xl font-bold mb-2">
          Body content goes here
        </h2>
        <p className="text-sm text-fg-muted">
          Click the toggle in the masthead above — this section flips theme
          while the cream brand zone stays put. Nav strip, counter strip, and
          everything else will land here next.
        </p>
      </section>
    </>
  );
}
