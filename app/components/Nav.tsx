// Top navigation strip. Sits below the Masthead and is theme-responsive
// (the background and border colors flip light↔dark with the theme; the
// 3px orange top border stays orange always). The active nav item gets a
// 2px orange underline + foreground text color.
//
// **Search bar removed 2026-05-19**: previously a non-functional placeholder
// sat on the right side, hidden below 950px via globals.css's .nav-search
// rule. Removed because (a) it didn't actually search anything and (b) it
// was taking nav real estate as we hit 10 nav items. When real search lands
// (full-text across HTS / FR / receipts / etc.), it goes in the **masthead**,
// not the nav. The .nav-search media-query rule in globals.css is now dead;
// safe to clean up next time we're in that file.
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
  { label: "Tariff Browser", href: "/tariff-browser" },
  { label: "Revenue Tracker", href: "/revenue-tracker" },
  { label: "Itemized Duties", href: "/itemized-duties" },
  { label: "Incoming Tariffs", href: "/incoming-tariffs" },
  { label: "Tariff Calendar", href: "/calendar" },
  { label: "AD/CVD Orders", href: "/ad-cvd-orders" },
  { label: "Historical Archive", href: "/historical-archive" },
  { label: "Tariffs & Taxes", href: "/tariffs-and-taxes" },
  { label: "Tariff Trends", href: "/tariff-trends" },
  { label: "Rate Calculator", href: "/calculator" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-stretch bg-bg border-t-[3px] border-t-orange border-b border-b-border">
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
    </nav>
  );
}
