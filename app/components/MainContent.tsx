// MainContent — the body region wrapper used by every nav page (Dashboard,
// Incoming Tariffs, etc.). Holds the page-level section title + subtitle
// and acts as the container for the page's cards or content.
//
// Layout notes from the v11 mockup (.main):
//   - padding: 24px on all sides
//   - max-width: 1400px (no horizontal auto-margin — content hugs the left
//     on wider screens; this is intentional in the mockup)
//
// Theme: this region flips with light/dark (it sits outside the cream
// brand zone). Uses `bg-bg` and `text-fg` so it picks up theme tokens.

import type { ReactNode } from "react";

type MainContentProps = {
  /** Page-level H1 — IBM Plex Serif 24px, bold. */
  title: string;
  /** Short muted-gray description below the title. Optional; pages that
   *  don't need a subtitle (e.g. /about) can omit it and the H1 absorbs
   *  the bottom margin so spacing to body content stays consistent. */
  subtitle?: string;
  /** Page body content (cards, tables, charts, etc.). */
  children?: ReactNode;
};

export default function MainContent({ title, subtitle, children }: MainContentProps) {
  return (
    <main className="bg-bg text-fg max-w-[1400px] p-6">
      <h1
        className={`font-serif text-2xl font-bold tracking-[-0.02em] m-0 ${
          subtitle ? "mb-1" : "mb-5"
        }`}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-[13px] text-fg-muted m-0 mb-5">{subtitle}</p>
      )}

      {children}
    </main>
  );
}
