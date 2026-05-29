"use client";

// SearchBar — compact search control in the masthead's right-side control
// stack (sits below Info + the theme toggle). Submitting routes to the
// /search results page; there is no live dropdown by design (decided in the
// Phase 3.6 search build). Searches HTS codes/descriptions and Federal
// Register tariff alerts via the search_hts / search_fr Postgres functions
// that the results page calls.
//
// Kept intentionally narrow so the control column doesn't crowd the centered
// masthead tagline at mid-width viewports.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className="flex items-center bg-[rgba(255,252,245,0.4)] border border-bill-green-mid rounded transition-colors focus-within:border-orange"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search codes & tariffs"
        aria-label="Search HTS codes and tariff actions"
        className="w-[150px] bg-transparent px-2.5 py-1.5 text-xs text-bill-green-deep outline-none placeholder:text-bill-text-muted"
      />
      <button
        type="submit"
        aria-label="Search"
        className="px-2 py-1.5 text-bill-green-deep transition-colors hover:text-orange"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </button>
    </form>
  );
}
