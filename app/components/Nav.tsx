// Top navigation strip. Theme-responsive (bg/border flip light↔dark; the 3px
// orange top border stays). Active item gets a 2px orange underline.
//
// Phase 3.65 / Tool #6 nav restructure: the highest-value tools live on the
// visible strip, ordered thematically (revenue → revenue composition →
// forward-looking → trade remedies → lookups → utilities); secondary and
// reference tools live behind a "More Tools" dropdown. As of 2026-11-08 that
// is 9 items on the desktop strip and 3 in the dropdown; VISIBLE_ITEMS holds
// 10 because Dashboard is desktopHidden (see the note on that array). The
// page *types* (Country and HTS Chapter profiles) are intentionally NOT in
// the nav — they're hundreds of pages reached via in-page links and search.
//
// Client component: usePathname() for active-state highlighting + React state
// for the dropdown (click-outside / ESC close), mirroring InfoMenu.tsx.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SearchBar from "./SearchBar";

// desktopHidden: the item stays in VISIBLE_ITEMS so it keeps its place in the
// mobile dropdown, but is hidden from the desktop strip. Used only for
// Dashboard — see the note on VISIBLE_ITEMS below.
type NavItem = { label: string; href: string; desktopHidden?: boolean };

// Dashboard is desktopHidden rather than deleted. The masthead emblem is
// already a link to "/" on every page (Masthead.tsx, aria-label "Tariff
// Tracker home"), so a Dashboard entry in the desktop strip was a second home
// link sitting a few hundred pixels from the first. Removing it frees the
// slot AD/CVD Orders was promoted into. It is kept in this array because
// below 700px the strip is hidden entirely and this list becomes the mobile
// dropdown, where the logo is the ONLY other way home — dropping it outright
// would leave the phone menu with no explicit home link.
//
// AD/CVD moved up from More Tools 2026-11-08. The argument was internal
// rather than a response to any one request: CIT Decisions was in the strip
// while the orders feed that court largely rules on sat hidden, so the site
// showed the courtroom and hid the docket. It is placed immediately before
// CIT Decisions to make that pairing visible.
//
// LABEL IS "AD/CVD", not "AD/CVD Orders" — the page keeps its full title and
// subtitle, only the nav label is short. This strip has a hard width budget
// and the long form broke it: 9 items came to 1152px, and with More Tools
// (115) + search (186) + Support (90) the strip needs ~1545px to show
// everything. Most laptops are 1280-1512 CSS px, so the last item clips. The
// long label pushed it ~30px past where it had been just fitting and cut
// "Rate Calculator" in half on Aaron's own screen. "AD/CVD" gives ~48px back,
// leaving the strip narrower than before the promotion.
//
// Measured per-item widths, if a future item needs a budget: Revenue Tracker
// 136 · Incoming Tariffs 132 · AD/CVD Orders 129 (long form) · Rate
// Calculator 127 · Tariff Calendar 124 · Tariffs & Taxes 123 · Tariff Browser
// 120 · 1912 vs Today 118 · CIT Decisions 118.
//
// DO NOT shorten "Tariff Calendar" or "Tariff Browser" to "Calendar" and
// "Browser" to win space. It was proposed on 2026-11-08 and Aaron rejected it
// outright: the prefix is load-bearing for clarity, whatever the word count
// looks like on a site named Tariff Tracker. Take width from padding or from
// demoting an item instead.
const VISIBLE_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", desktopHidden: true },
  { label: "Revenue Tracker", href: "/revenue-tracker" },
  { label: "Tariffs & Taxes", href: "/tariffs-and-taxes" },
  { label: "1912 vs Today", href: "/1912-vs-today" },
  { label: "Incoming Tariffs", href: "/incoming-tariffs" },
  { label: "Tariff Calendar", href: "/calendar" },
  { label: "AD/CVD", href: "/ad-cvd-orders" },
  { label: "CIT Decisions", href: "/cit-decisions" },
  { label: "Tariff Browser", href: "/tariff-browser" },
  { label: "Rate Calculator", href: "/calculator" },
];

const MORE_TOOLS_ITEMS: NavItem[] = [
  { label: "Itemized Duties", href: "/itemized-duties" },
  { label: "Historical Archive", href: "/historical-archive" },
  { label: "Tariff Trends", href: "/tariff-trends" },
];

// px-3 rather than px-4. Measured 2026-11-08: the strip needed 1154px and
// only fits a viewport of ~1585+, so "Rate Calculator" was clipping on a
// 1520px screen. Trimming 4px a side off ten items gives 80px back, and the
// scroller's pl-3 below gives 12 more, bringing the need to ~1062 and the
// fit down to roughly 1455. Items keep ~24px of visual separation.
// This does NOT fix 1440, 1366 or 1280 — those still scroll the strip, which
// is what it is designed to do. Fixing those needs a structural change
// (fewer items, or collapsing search to an icon), not more trimming.
const ITEM_BASE =
  "px-3 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors";
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
      <div className="nav-items flex min-w-0 overflow-x-auto pl-3 max-[700px]:hidden">
        {/* Home. Replaces the "Dashboard" text item that used to open this
            strip: ~40px against its ~100px, which is most of the width the
            AD/CVD promotion needed. It is also what restores an active state
            on "/" — with Dashboard gone and no icon, no nav item highlighted
            on the home page at all.
            Desktop only, because this scroller is hidden below 700px; the
            mobile dropdown still renders "Dashboard" as text, so the phone
            menu keeps a labelled home link rather than an unlabelled glyph.
            aria-label and title are not optional here: there is no text for a
            screen reader or a hover to fall back on. Shares ITEM_BASE so it
            sits on the row baseline and takes the same orange underline as
            every other item. */}
        <Link
          href="/"
          aria-label="Home"
          title="Home"
          aria-current={pathname === "/" ? "page" : undefined}
          className={`${pathname === "/" ? ACTIVE : INACTIVE} flex items-center`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
          </svg>
        </Link>
        {VISIBLE_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`${pathname === item.href ? ACTIVE : INACTIVE}${
              item.desktopHidden ? " min-[701px]:hidden" : ""
            }`}
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
          className={`${moreActive ? ACTIVE : INACTIVE} flex items-center gap-1 cursor-pointer`}
        >
          More Tools
          <span aria-hidden className="text-[10px]">
            ▾
          </span>
        </button>
        {open && (
          /* DESKTOP: a dropdown hanging off the button. right-0 aligns the
             panel's right edge with the button, which is correct there
             because the button sits at the far right of the strip.

             BELOW 700px: a bottom sheet pinned to the viewport instead.
             Measured on /calculator at 375x812 before this change: the nav
             sits 568px down the page under the masthead, so an absolutely
             positioned menu opened at y=614, ran 516px tall, and put its
             bottom at 1130 against an 812px viewport -- only 4 of its 13
             items were on screen and 318px hung below the fold. Capping the
             height would not have helped, because the problem is where the
             menu STARTS, not how tall it is. Anchoring to the viewport is the
             only thing that fixes it, and it matches what the info tooltips
             already do at this width for the same reason.

             right-auto/left-auto are needed to cancel the desktop right-0,
             and top-auto to cancel top-full, or they fight the inset. */
          <div
            role="menu"
            className="absolute right-0 top-full min-w-[180px] bg-bg border border-border rounded-b shadow-lg z-50 overflow-hidden max-[700px]:fixed max-[700px]:right-auto max-[700px]:left-0 max-[700px]:top-auto max-[700px]:bottom-0 max-[700px]:w-full max-[700px]:min-w-0 max-[700px]:max-h-[70vh] max-[700px]:overflow-y-auto max-[700px]:rounded-none max-[700px]:border-x-0 max-[700px]:border-b-0 max-[700px]:shadow-[0_-8px_24px_rgba(0,0,0,0.18)]"
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
