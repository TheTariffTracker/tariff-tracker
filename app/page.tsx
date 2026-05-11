"use client";

// TEMPORARY smoke-test page. Verifies that all design tokens, fonts, and the
// theme toggle wire up correctly. Will be replaced with the real homepage
// once we start building the masthead/nav/counter strip.

export default function Home() {
  const toggleTheme = () => {
    const html = document.documentElement;
    const current = html.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
  };

  return (
    <main className="flex flex-col min-h-screen">
      {/* Cream brand header — fixed across themes */}
      <header className="bg-bill-cream px-8 py-10">
        <h1 className="font-display text-3xl text-bill-green-deep leading-tight max-w-4xl">
          An independent, nonpartisan record of every U.S. tariff and the
          revenue it generates.
        </h1>
        <p className="font-sans text-sm text-bill-brown mt-3 max-w-3xl">
          Tariff Tracker pulls live customs and trade data from Treasury,
          Census, and the Federal Register, presented exactly as the
          government publishes it; daily, with full historical context back to
          January 2025.
        </p>
      </header>

      {/* Body section — theme-responsive */}
      <section className="flex-1 bg-bg text-fg px-8 py-10 border-t border-border">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-2xl font-bold">
            Design system smoke test
          </h2>
          <button
            onClick={toggleTheme}
            className="px-4 py-2 bg-orange text-white hover:bg-orange-bright rounded font-sans text-sm font-medium transition-colors"
          >
            Toggle theme
          </button>
        </div>

        <h3 className="font-sans text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
          Brand accents (flip in dark mode)
        </h3>
        <div className="flex gap-3 mb-8 flex-wrap">
          <ColorSwatch className="bg-orange" label="orange" />
          <ColorSwatch className="bg-orange-bright" label="orange-bright" />
          <ColorSwatch className="bg-blue" label="blue" />
          <ColorSwatch className="bg-green" label="green" />
          <ColorSwatch className="bg-red" label="red" />
        </div>

        <h3 className="font-sans text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
          Dollar-bill palette (fixed, no theme flip)
        </h3>
        <div className="flex gap-3 mb-8 flex-wrap">
          <ColorSwatch
            className="bg-bill-cream border border-border"
            label="bill-cream"
          />
          <ColorSwatch
            className="bg-bill-green-deep"
            label="bill-green-deep"
          />
          <ColorSwatch
            className="bg-bill-green-mid"
            label="bill-green-mid"
          />
          <ColorSwatch className="bg-bill-brown" label="bill-brown" />
          <ColorSwatch
            className="bg-bill-text-muted"
            label="bill-text-muted"
          />
        </div>

        <h3 className="font-sans text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
          Typography
        </h3>
        <div className="space-y-3">
          <p className="font-display text-3xl text-fg">
            DM Serif Display — hero tagline
          </p>
          <p className="font-serif text-xl font-bold text-fg">
            IBM Plex Serif — section titles, card headings
          </p>
          <p className="font-sans text-base text-fg">
            Inter — body text, UI, navigation, tables
          </p>
          <p className="font-sans tabular-nums text-lg text-fg">
            $104,872,415,892.37 — tabular-nums (each digit same width)
          </p>
        </div>
      </section>
    </main>
  );
}

function ColorSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-20 h-20 rounded ${className}`} />
      <span className="font-sans text-xs text-fg-muted mt-2">{label}</span>
    </div>
  );
}
