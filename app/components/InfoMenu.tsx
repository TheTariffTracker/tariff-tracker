"use client";

// InfoMenu — secondary navigation dropdown that lives in the masthead next
// to the theme toggle. Surfaces project-information pages (About,
// Methodology) that don't belong in the main nav strip below.
//
// Behavior:
//   - Click the "Info" button → dropdown opens below, right-aligned
//   - Click a link → dropdown closes and navigates
//   - Click outside the menu → dropdown closes
//   - Press ESC → dropdown closes
//   - ARIA: aria-haspopup="menu" / aria-expanded / role="menu" / role="menuitem"
//
// Styling matches the theme toggle (same border, padding, hover behavior)
// so the two buttons read as a paired control set.

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

export default function InfoMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside + ESC. Only attach listeners while open to avoid
  // unnecessary work on every page load.
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bg-[rgba(255,252,245,0.4)] border border-bill-green-mid text-bill-green-deep px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors hover:border-orange hover:text-orange"
      >
        Info
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 min-w-[160px] bg-bill-cream border border-bill-green-mid rounded shadow-lg z-50 overflow-hidden"
        >
          <Link
            href="/about"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-xs text-bill-green-deep hover:bg-[rgba(0,0,0,0.04)] hover:text-orange transition-colors"
          >
            About
          </Link>
          <Link
            href="/methodology"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-xs text-bill-green-deep hover:bg-[rgba(0,0,0,0.04)] hover:text-orange transition-colors"
          >
            Methodology
          </Link>
        </div>
      )}
    </div>
  );
}
