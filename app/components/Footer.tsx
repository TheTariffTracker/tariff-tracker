import Link from "next/link";

// Footer — site-wide bottom strip. Warm-tint background, 1px top border,
// sources line on the left (ending with the Methodology link), last-refresh
// timestamp on the right. Flex-wraps when the viewport gets narrow.
//
// Mockup spec (.footer):
//   border-top: 1px solid var(--border)
//   padding: 16px 24px
//   margin-top: 32px
//   background: var(--bg-warm) — theme-responsive warm tint
//   font-size: 12px, color: var(--text-muted)
//
// Last-refresh timestamp is hardcoded for v1. When the data pipeline
// publishes a single "last refresh" signal we can trust, swap this for a
// real value (see project memory: "Mock data still in place").

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
        </div>
        <div>Last data refresh: May 13, 2026</div>
      </div>
    </footer>
  );
}
