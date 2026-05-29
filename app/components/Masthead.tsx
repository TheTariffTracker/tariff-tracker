"use client";

// Masthead — the cream brand header that sits at the top of every page.
// Stays cream in both light and dark themes (only the body below flips).
// Layout: logo (left) · centered tagline + sub + 3 meta items · theme toggle (right).
// The few styles that don't fit cleanly in Tailwind utilities live in
// app/globals.css under the .masthead / .masthead-logo / .masthead-tagline /
// .masthead-text class names referenced below.

import Link from "next/link";
import { useState, useEffect } from "react";
import InfoMenu from "./InfoMenu";
import SearchBar from "./SearchBar";

const STORAGE_KEY = "theme";

export default function Masthead() {
  // SSR-safe initial state: server always renders "light". The inline script
  // in layout.tsx may have set <html data-theme="dark"> before hydration; the
  // mount effect below reads it and syncs state. `mounted` lets us render a
  // static button label during SSR + first client render (avoiding hydration
  // mismatch) and switch to the real label after mount.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") {
      setTheme(current);
    }
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode browsers may throw; the in-memory toggle still works.
    }
    setTheme(next);
  };

  return (
    <header className="masthead bg-bill-cream flex items-center gap-9 p-8">
      {/* Logo — clickable, returns to "/" (Dashboard). Universal web
          convention so users who don't recognize "Dashboard" in the nav still
          have an obvious way home. */}
      <div className="shrink-0">
        <Link href="/" aria-label="Tariff Tracker home" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tariff_tracker_logo.png"
            alt="Tariff Tracker emblem"
            className="masthead-logo"
          />
        </Link>
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

      {/* Right-side control stack — Info, theme toggle, and search spread
          across the full masthead height: Info pinned top, Light in the
          middle, Search pinned to the bottom edge, all right-aligned.
          `self-stretch` makes the column fill the masthead's height so
          `justify-between` can push Info/Search to the top/bottom edges;
          `items-end` + `-mr-5` line their right edges up near the far edge
          (~12px in, matching the original right-3 intent). gap-2.5 only
          matters on the stacked mobile layout where the column auto-sizes. */}
      <div className="masthead-controls shrink-0 self-stretch -my-5 -mr-5 flex flex-col justify-between items-end gap-2.5">
        <InfoMenu />
        {/* Light sits at the column's vertical midpoint (justify-between),
            then nudged with translate-y to rest between the "presented" and
            "January 2025" lines in the tagline copy. Transform-only so it
            doesn't disturb Info (top) or Search (bottom). */}
        <button
          onClick={toggleTheme}
          className="translate-y-[7px] bg-[rgba(255,252,245,0.4)] border border-bill-green-mid text-bill-green-deep px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors hover:border-orange hover:text-orange"
        >
          {mounted ? (theme === "light" ? "☀ Light" : "🌙 Dark") : "☀ Light"}
        </button>
        <SearchBar />
      </div>
    </header>
  );
}
