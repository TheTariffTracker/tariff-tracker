// MainContent — the body region below the stat strip. Holds the "Dashboard"
// section title + subtitle and acts as the container for every card we add
// below (90-day chart, FR alerts table, product categories table, etc.).
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
  children?: ReactNode;
};

export default function MainContent({ children }: MainContentProps) {
  return (
    <main className="bg-bg text-fg max-w-[1400px] p-6">
      <h1 className="font-serif text-2xl font-bold tracking-[-0.02em] m-0 mb-1">
        Dashboard
      </h1>
      <p className="text-[13px] text-fg-muted m-0 mb-5">
        Real-time customs revenue and incoming tariff actions, updated each
        business day.
      </p>

      {children}
    </main>
  );
}
