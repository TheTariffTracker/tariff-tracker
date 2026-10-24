import Link from "next/link";

// Footer — site-wide bottom strip. Warm-tint background, 1px top border,
// sources line on the left (ending with the Methodology link) and the
// support link on the right. Flex-wraps when the viewport gets narrow.
//
// Mockup spec (.footer):
//   border-top: 1px solid var(--border)
//   padding: 16px 24px
//   margin-top: 32px
//   background: var(--bg-warm) — theme-responsive warm tint
//   font-size: 12px, color: var(--text-muted)
//
// A site-wide "last data refresh" line was REMOVED 2026-10-17. It had been
// hardcoded to "May 13, 2026" and sat five months stale directly beneath
// live data. Do not re-add it: no single date can honestly describe this
// site, because DTS updates daily, MTS twice monthly, and Census lags ~2
// months. Per-panel source lines carry real derived dates instead (e.g.
// the dashboard chart's "Data through <date>").

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-warm text-fg-muted text-xs px-6 py-4 mt-8">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          Sources: USITC HTS · Treasury (DTS, MTS) · Census Bureau · Federal
          Register ·{" "}
          <Link
            href="/methodology"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            Methodology
          </Link>
          {" · "}
          <Link
            href="/about"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            About
          </Link>
          {" \u00b7 "}
          <Link
            href="/privacy"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            Privacy
          </Link>
          {" \u00b7 "}
          <Link
            href="/terms"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            Terms
          </Link>
        </div>
        {/* Support — center item of the row (individual project, not a
            501(c)(3); see project memory: "Donate Button"). */}
        <div>
          <a
            href="https://ko-fi.com/tarifftracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange underline hover:text-orange-bright transition-colors"
          >
            Support Tariff Tracker
          </a>{" "}
          — tips welcome, not tax-deductible.
        </div>
      </div>
    </footer>
  );
}
