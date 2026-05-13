"use client";

// Masthead — the cream brand header that sits at the top of every page.
// Stays cream in both light and dark themes (only the body below flips).
// Layout: logo (left) · centered tagline + sub + 3 meta items · theme toggle (right).
// The few styles that don't fit cleanly in Tailwind utilities live in
// app/globals.css under the .masthead / .masthead-logo / .masthead-tagline /
// .masthead-text class names referenced below.

import { useState } from "react";

export default function Masthead() {
  // Local-only theme state for now. No persistence — refresh resets to light.
  // We'll add localStorage (or a cookie) once the rest of the layout is in.
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
  };

  return (
    <header className="masthead bg-bill-cream flex items-center gap-9 p-8">
      {/* Logo */}
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tariff_tracker_logo.png"
          alt="Tariff Tracker emblem"
          className="masthead-logo"
        />
      </div>

      {/* Centered text block */}
      <div className="masthead-text flex-1 min-w-0 text-center">
        <h1 className="masthead-tagline font-display text-[32px] font-normal text-bill-green-deep tracking-[-0.015em] leading-[1.15] mb-3 whitespace-nowrap">
          An independent, nonpartisan record of every U.S. tariff and the
          revenue it generates.
        </h1>
        <p className="text-sm text-bill-brown leading-[1.55] mx-auto max-w-[720px]">
          Tariff Tracker pulls live customs and trade data from Treasury,
          Census, and the Federal Register, presented exactly as the government
          publishes it; daily, with full historical context back to January
          2025.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-[18px] text-xs text-bill-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-bill-green-mid rounded-full" />
            Updated each business day
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-bill-green-mid rounded-full" />
            Open data, public sources
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-bill-green-mid rounded-full" />
            No advertising, no tracking
          </span>
        </div>
      </div>

      {/* Theme toggle (right) */}
      <div className="shrink-0 flex items-center">
        <button
          onClick={toggleTheme}
          className="bg-[rgba(255,252,245,0.4)] border border-bill-green-mid text-bill-green-deep px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors hover:border-orange hover:text-orange"
        >
          {theme === "light" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>
    </header>
  );
}
