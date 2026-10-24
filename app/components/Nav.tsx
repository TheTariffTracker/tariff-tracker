// Top navigation strip. Theme-responsive (bg/border flip light↔dark; the 3px
// orange top border stays). Active item gets a 2px orange underline.
//
// Phase 3.65 / Tool #6 nav restructure: 9 highest-value tools live on the
// visible strip, ordered thematically (home → revenue → revenue composition →
// forward-looking → lookups → utilities); 4 secondary/reference tools live
// behind a "More Tools" dropdown. The new
// page *types* (Country and HTS Chapter profiles) are intentionally NOT in the
// nav — they're hundreds of pages reached via in-page links and search.
//
// Client component: usePathname() for active-state highlighting + React state
// for the dropdown (click-outside / ESC close), mirroring InfoMenu.tsx.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SearchBar from "./SearchBar";

type NavItem = { label: string; href: string };

const VISIBLE_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Revenue Tracker", href: "/revenue-tracker" },
  { label: "Tariffs & Taxes", href: "/tariffs-and-taxes" },
  { label: "1912 vs Today", href: "/1912-vs-today" },
  { label: "Incoming Tariffs", href: "/incoming-tariffs" },
  { label: "Tariff Calendar", href: "/calendar" },
  { label: "CIT Decisions", href: "/cit-decisions" },
  { label: "Tariff Browser", href: "/tariff-browser" },
  { label: "Rate Calculator", href: "/calculator" },
];

const MORE_TOOLS_ITEMS: NavItem[] = [
  { label: "Itemized Duties", href: "/itemized-duties" },
  { label: "AD/CVD Orders", href: "/ad-cvd-orders" },
  { label: "Historical Archive", href: "/historical-archive" },
  { label: "Tariff Trends", href: "/tariff-trends" },
];

const ITEM_BASE =
  "px-4 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors";
const ACTIVE = `${ITEM_BASE} border-b-orange text-fg`;
const INACTIVE = `${ITEM_BASE} border-b-transparent text-fg-muted hover:text-fg`;

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click + ESC (only while open).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Show the active indicator on the More Tools button when the current route
  // lives inside the dropdown, so the user isn't visually stranded.
  const moreActive = MORE_TOOLS_ITEMS.some((i) => i.href === pathname);

  return (
    <nav className="flex items-stretch bg-bg border-t-[3px] border-t-orange border-b border-b-border">
      {/* Hidden below 700px. This scroller has min-w-0 + overflow-x-auto, so
          when the three shrink-0 siblings need room it is the one that gives,
          and on a 375px phone it collapsed to a 39px keyhole — mechanically
          correct, and useless as navigation: nine of the site's thirteen
          pages were unreachable in portrait. Below 700px those nine links
          move into the More Tools menu instead (see below), which is why the
          search field also narrows in SearchBar.tsx: with this scroller gone
          the remaining three children measure 358px inside 375px, where a
          130px search field would have put them at 392px. */}
      <div className="nav-items flex min-w-0 overflow-x-auto pl-6 max-[700px]:hidden">
        {VISIBLE_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={pathname === item.href ? ACTIVE : INACTIVE}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* More Tools — sits OUTSIDE the overflow-x-auto strip so the dropdown
          isn't clipped. On desktop it sits to the right of the scrolling link
          strip; below 700px that strip is hidden, so this becomes the first
          element in the nav and carries every page. border-l is dropped there
          because it would otherwise draw a stray rule at x=0. */}
      <div
        ref={containerRef}
        className="relative shrink-0 flex items-stretch border-l border-border max-[700px]:border-l-0"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`${moreActive ? ACTIVE : INACTIVE} flex items-center gap-1 cursor-pointer max-[700px]:px-3`}
        >
          More Tools
          <span aria-hidden className="text-[10px]">
            ▾
          </span>
        </button>
        {open && (
          /* Anchoring: right-0 aligns the panel's right edge with the button,
             which is correct on desktop where the button sits at the far
             right. Below 700px the button is at the far LEFT instead (the
             link scroller is hidden), so right-0 put the panel's left edge at
             x=-34 and clipped the start of every label. max-[700px]:left-0
             flips it to open rightward from the button, where there is 336px
             of room for the full names. */
          <div
            role="menu"
            className="absolute right-0 top-full min-w-[180px] max-[700px]:right-auto max-[700px]:left-0 max-[700px]:min-w-[210px] bg-bg border border-border rounded-b shadow-lg z-50 overflow-hidden"
          >
            {/* Below 700px this menu carries the whole site: the nine links
                from the hidden scroller first, then the four that live here
                at every width. They are rendered as a separate list rather
                than merged so desktop markup is unchanged, at the cost of
                nine duplicated anchors in the DOM on every page. */}
            <div className="min-[701px]:hidden">
              {VISIBLE_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-2.5 text-[13px] transition-colors hover:bg-bg-alt ${
                    pathname === item.href
                      ? "text-orange"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-border" aria-hidden />
            </div>
            {MORE_TOOLS_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-[13px] transition-colors hover:bg-bg-alt ${
                  pathname === item.href
                    ? "text-orange"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Search — pinned to the far right of the strip (ml-auto absorbs the
          space after More Tools). Moved here from the masthead in the nav
          restructure. shrink-0 so it keeps its width while the items scroll. */}
      <div className="flex items-center shrink-0 ml-auto px-3 max-[700px]:px-2">
        <SearchBar />
      </div>

      {/* Support — soft-orange pill linking to Ko-fi. Outermost-right element;
          deliberately the only filled control in the strip so it reads as the
          one call-to-action without shouting. */}
      <div className="flex items-center shrink-0 pr-4 max-[700px]:pr-3">
        <a
          href="https://ko-fi.com/tarifftracker"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1 rounded-full text-[13px] font-medium whitespace-nowrap bg-orange-soft text-orange hover:bg-orange-soft-hover transition-colors"
        >
          Support
        </a>
      </div>
    </nav>
  );
}
