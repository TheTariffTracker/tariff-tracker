import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";
import { supabase } from "../lib/supabase";

// CIT Decisions — /cit-decisions (Phase 3.65, tool #5).
//
// Slip opinions of the U.S. Court of International Trade, scraped daily into
// cit_slip_opinions (see scripts/fetch_cit_slip_opinions.py). Reverse-chrono
// list with a plain-language jurisdiction filter. Confidential opinions (no
// public PDF yet) are shown, marked pending. By the CIT's jurisdiction every
// opinion is trade/tariff-relevant.

export const metadata: Metadata = {
  title: "CIT Decisions",
  description:
    "Recent slip opinions of the U.S. Court of International Trade — antidumping/countervailing, customs classification, and other trade rulings, updated daily.",
};

const ROW_LIMIT = 300;

// Plain-language labels for the CIT's 28 U.S.C. § 1581 jurisdiction codes.
const JURISDICTION_LABELS: Record<string, string> = {
  "1581(a)": "Customs classification & valuation",
  "1581(c)": "Antidumping / countervailing duty",
  "1581(i)": "Residual trade jurisdiction",
  "1582": "Government enforcement & collection",
};

function jurisdictionLabel(j: string | null): string {
  if (!j) return "Other";
  if (JURISDICTION_LABELS[j]) return JURISDICTION_LABELS[j];
  for (const code of Object.keys(JURISDICTION_LABELS)) {
    if (j.includes(code)) return JURISDICTION_LABELS[code];
  }
  return "Other";
}

// Filter chips. Each (except "all") matches rows whose jurisdiction string
// contains the code — so "1581(a) & (i)" correctly appears under both.
const FILTERS: { key: string; label: string; code?: string }[] = [
  { key: "all", label: "All" },
  { key: "adcvd", label: "AD/CVD", code: "1581(c)" },
  { key: "customs", label: "Customs", code: "1581(a)" },
  { key: "residual", label: "Residual", code: "1581(i)" },
  { key: "collection", label: "Gov't Collection", code: "1582" },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[Math.max(0, Math.min(11, m - 1))]} ${d}, ${y}`;
}

type Opinion = {
  opinion_number: string;
  decision_date: string | null;
  caption: string | null;
  court_number: string | null;
  judge: string | null;
  jurisdiction: string | null;
  pdf_url: string | null;
  editorial_note: string | null;
  is_confidential: boolean;
};

export default async function CitDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const activeKey =
    FILTERS.find((f) => f.key === params?.type)?.key ?? "all";
  const activeFilter = FILTERS.find((f) => f.key === activeKey)!;

  const { data, error } = await supabase
    .from("cit_slip_opinions")
    .select(
      "opinion_number, decision_date, caption, court_number, judge, jurisdiction, pdf_url, editorial_note, is_confidential",
    )
    .order("decision_date", { ascending: false })
    .order("opinion_number", { ascending: false })
    .limit(ROW_LIMIT);

  if (error) {
    console.error("CIT decisions fetch error:", {
      message: error.message,
      code: error.code,
    });
  }

  const all = (data ?? []) as Opinion[];
  const rows =
    activeFilter.code === undefined
      ? all
      : all.filter((r) => (r.jurisdiction ?? "").includes(activeFilter.code!));

  return (
    <MainContent
      title="CIT Decisions"
      subtitle="Slip opinions of the U.S. Court of International Trade — the federal court for tariff, customs, and trade-remedy disputes. Updated daily; opinions since January 2025."
    >
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => {
          const isActive = f.key === activeKey;
          const href = f.key === "all" ? "/cit-decisions" : `/cit-decisions?type=${f.key}`;
          return (
            <Link
              key={f.key}
              href={href}
              className={
                isActive
                  ? "px-3 py-1.5 text-[12px] font-semibold rounded border border-orange text-orange"
                  : "px-3 py-1.5 text-[12px] font-medium rounded border border-border text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {error ? (
        <section className="border border-border bg-bg p-6 text-[13px] text-fg-muted">
          Unable to load decisions right now. Please refresh.
        </section>
      ) : rows.length === 0 ? (
        <section className="border border-border bg-bg p-6 text-[13px] text-fg-muted">
          No opinions match this filter yet.
        </section>
      ) : (
        <ul className="m-0 p-0 list-none space-y-3">
          {rows.map((op) => (
            <li
              key={op.opinion_number}
              className="border border-border bg-bg px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[12px] font-mono text-fg-muted">
                  Slip Op. {op.opinion_number}
                  {op.court_number ? ` · Ct. No. ${op.court_number}` : ""}
                </span>
                <span className="text-[12px] text-fg-muted tabular-nums">
                  {formatDate(op.decision_date)}
                </span>
              </div>

              <div className="mt-1">
                {op.pdf_url ? (
                  <a
                    href={op.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] font-medium text-orange underline hover:text-orange-bright transition-colors"
                  >
                    {op.caption ?? op.opinion_number}
                  </a>
                ) : (
                  <span className="text-[14px] font-medium text-fg">
                    {op.caption ?? op.opinion_number}
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center gap-2 flex-wrap text-[12px] text-fg-muted">
                <span className="inline-block px-1.5 py-0.5 rounded-sm bg-[rgba(113,113,122,0.15)] text-fg-muted">
                  {jurisdictionLabel(op.jurisdiction)}
                  {op.jurisdiction ? ` (§ ${op.jurisdiction})` : ""}
                </span>
                {op.judge ? <span>Judge: {op.judge}</span> : null}
              </div>

              {op.is_confidential ? (
                <div className="mt-1 text-[12px] italic text-fg-muted">
                  Confidential — public version pending.
                </div>
              ) : op.editorial_note ? (
                <div className="mt-1 text-[12px] italic text-fg-muted">
                  {op.editorial_note}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[12px] text-fg-muted mt-5">
        Source: U.S. Court of International Trade{" "}
        <a
          href="https://www.cit.uscourts.gov/slip-opinions-year"
          target="_blank"
          rel="noopener noreferrer"
          className="text-orange underline hover:text-orange-bright transition-colors"
        >
          slip opinions
        </a>
        . Only final opinions appear here — not pending cases. Always verify
        against the court&apos;s official record.
      </p>
    </MainContent>
  );
}
