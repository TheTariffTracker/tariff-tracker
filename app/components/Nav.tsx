// Top navigation strip. Sits below the Masthead and is theme-responsive
// (the background and border colors flip light↔dark with the theme; the
// 3px orange top border stays orange always). The active nav item gets a
// 2px orange underline + foreground text color. The search bar on the
// right is a non-functional placeholder until we wire up a search backend.

// Hardcoded for now — Dashboard is always "active" because no other routes
// exist yet. Once we build /tariff-browser, /revenue-tracker, etc., swap
// this constant for `usePathname()` from `next/navigation` (which would
// also turn this into a client component).
const ACTIVE_LABEL = "Dashboard";

const NAV_ITEMS = [
  { label: "Dashboard", href: "#" },
  { label: "Tariff Browser", href: "#" },
  { label: "Revenue Tracker", href: "#" },
  { label: "Itemized Duties", href: "#" },
  { label: "Incoming Tariffs", href: "#" },
  { label: "AD/CVD Orders", href: "#" },
  { label: "Historical Archive", href: "#" },
];

export default function Nav() {
  return (
    <nav className="flex items-stretch justify-between bg-bg border-t-[3px] border-t-orange border-b border-b-border">
      {/* Left: scrollable list of nav items */}
      <div className="nav-items flex flex-1 overflow-x-auto pl-6">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === ACTIVE_LABEL;
          return (
            <a
              key={item.label}
              href={item.href}
              className={
                isActive
                  ? "px-4 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 border-b-orange text-fg transition-colors"
                  : "px-4 py-[11px] text-[13px] font-medium whitespace-nowrap border-b-2 border-b-transparent text-fg-muted hover:text-fg transition-colors"
              }
            >
              {item.label}
            </a>
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
