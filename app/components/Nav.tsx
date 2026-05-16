// Top navigation strip. Sits below the Masthead and is theme-responsive
// (the background and border colors flip light↔dark with the theme; the
// 3px orange top border stays orange always). The active nav item gets a
// 2px orange underline + foreground text color. The search bar on the
// right is a non-functional placeholder until we wire up a search backend.
//
// Client component because we use usePathname() to highlight the active
// nav item. usePathname requires React state from the App Router runtime,
// which is only available client-side.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Each nav item has a label and either a real route (`href: "/..."`) or
// `null` for routes that don't exist yet. Items with null `href` render as
// non-functional `<a href="#">` placeholders that don't 404. As we build
// each nav page, swap its `null` for the route path.
type NavItem = { label: string; href: string | null };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Tariff Browser", href: null },
  { label: "Revenue Tracker", href: null },
  { label: "Itemized Duties", href: null },
  { label: "Incoming Tariffs", href: "/incoming-tariffs" },
  { label: "AD/CVD Orders", href: "/ad-cvd-orders" },
  { label: "Historical Archive", href: null },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-stretch justify-between bg-bg border-t-[3px] border-t-orange border-b border-b-border">
      {/* Left: scrollable list of nav items */}
      <div className="nav-items flex flex-1 overflow-x-auto pl-6">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href !== null && pathname === item.href;
          const className = isActive
            ? "px-4 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 border-b-orange text-fg transition-colors"
            : "px-4 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 border-b-transparent text-fg-muted hover:text-fg transition-colors";
          if (item.href === null) {
            // Unbuilt route — non-functional placeholder so it doesn't 404.
            return (
              <a key={item.label} href="#" className={className}>
                {item.label}
              </a>
            );
          }
          return (
            <Link key={item.label} href={item.href} className={className}>
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Right: pinned search bar. Hidden below 950px via globals.css. */}
      <div className="nav-search flex items-center px-4 py-1.5 border-l border-l-border shrink-0">
        <div className="flex items-center bg-bg border border-border-strong rounded px-2.5 py-1.5 w-[260px] focus-within:border-orange">
          <span className="text-fg-muted mr-2 text-sm" aria-hidden="true">
            ⌕
          </span>
          <input
            type="text"
            placeholder="Search tariffs, products, codes…"
            aria-label="Search tariffs, products, codes"
            className="bg-transparent border-none text-fg text-[13px] w-full outline-none placeholder:text-fg-muted"
          />
        </div>
      </div>
    </nav>
  );
}
