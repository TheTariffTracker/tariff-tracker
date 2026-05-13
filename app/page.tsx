import Masthead from "./components/Masthead";
import Nav from "./components/Nav";

// Top-level page. Right now: masthead, nav strip, then a placeholder body
// section. The placeholder lets us visually confirm the theme toggle still
// flips the body content while the masthead and nav top border stay put.
// It will be replaced as we build out the counter strip → stat strip → main
// content → footer.

export default function Home() {
  return (
    <>
      <Masthead />
      <Nav />

      <section className="flex-1 bg-bg text-fg px-8 py-10">
        <h2 className="font-serif text-2xl font-bold mb-2">
          Body content goes here
        </h2>
        <p className="text-sm text-fg-muted">
          Click the toggle in the masthead — this section and the nav strip
          flip theme while the cream brand zone stays put. Counter strip,
          stat strip, and the rest of the layout will land here next.
        </p>
      </section>
    </>
  );
}
