import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";

// Tool FAQ page (route: "/tool-faq"). Static content page describing how to
// use each tool on the site. JSX translation of the approved Tool FAQ draft
// (workspace: tool-faq-draft.md, then Aaron's edited "TOOL FAQ.docx").
//
// VERSION-SENSITIVE convention: some tools ship in a limited "v1"/"lite" state
// and their "Current limits" copy will need rewriting when a fuller version
// lands (Rate Calculator lite -> full is the clearest case; Tariff Browser,
// Historical Archive, Tariff Trends, Country Profiles, and the Tariffs & Taxes
// per-capita figure also have pending changes). Each such block is preceded by
// a JS comment of the form:
//     /* VERSION-SENSITIVE: <tool> - <what changes> */
// To update after a tool changes, search this file for
// "VERSION-SENSITIVE: <tool name>" and you'll land on the exact part to rewrite.
//
// Each tool entry uses the same five labeled parts: What it does / Who it's
// for / How to use it / How to read results / Current limits.

export const metadata: Metadata = {
  title: "Tool FAQ",
  description:
    "How to use each tool on Tariff Tracker - the Dashboard, Revenue Tracker, Tariff Calendar, Rate Calculator, Country and HTS Chapter profiles, and more.",
};

// Site-wide link convention: orange + underline, brightens on hover.
const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";

type Part = { label: string; body: string };
type Section = { id: string; title: string; parts: Part[] };

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    parts: [
      {
        label: "What it does.",
        body: `The Dashboard is the site's at-a-glance home page. It shows where U.S. customs revenue stands right now and what tariff actions are moving through the pipeline. It is refreshed each business day.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who wants the headline picture in one screen before drilling into a specific tool; a daily check-in rather than a deep dive.`,
      },
      {
        label: "How to use it.",
        body: `Just read it. At the very top of every page (the Dashboard included) sits the live revenue counter, showing cumulative customs duties collected, with the current month's provisional figure layered on top. Below the counter, a strip of key statistics scrolls across. The Dashboard's own content is a 90-day chart of daily customs receipts (with a faint line showing the same days a year earlier for comparison), followed by two cards: recent Federal Register tariff filings, and the top product categories by duties for the most recent month.`,
      },
      {
        label: "How to read results.",
        body: `The cumulative counter is the cent-accurate total from finalized Treasury monthly statements; the current-month number is provisional and updates daily until that month closes. On the 90-day chart, the comparison line is calendar-aligned so weekends and holidays line up. The product-categories card shows a year-over-year change column; a dash means there's no comparable figure from the prior year.`,
      },
      {
        label: "Current limits.",
        body: `The Dashboard is a summary surface; each card is a doorway to a fuller tool (Revenue Tracker, Incoming Tariffs, Historical Archive). If a number here raises a question, the dedicated tool is where you answer it.`,
      },
    ],
  },
  {
    id: "revenue-tracker",
    title: "Revenue Tracker",
    parts: [
      {
        label: "What it does.",
        body: `Shows U.S. customs revenue over time, at two resolutions: a daily view and a monthly view, both running from January 2025 to the present.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone tracking the trajectory of collections - is revenue rising, flat, seasonal? - rather than a single product or country.`,
      },
      {
        label: "How to use it.",
        body: `Read the two stacked charts. The top one is daily customs receipts over the last 90 days, with a prior-year comparison line. The bottom one is monthly customs duties as bars, one per month since January 2025.`,
      },
      {
        label: "How to read results.",
        body: `Daily figures come from the Treasury's Daily Treasury Statement and are provisional; monthly figures come from the Monthly Treasury Statement and are the settled, authoritative totals. Where they overlap, trust the monthly number as the daily series is an early indicator, not the final count.`,
      },
      {
        label: "Current limits.",
        body: `Daily customs receipts are lumpy: large single-day swings usually reflect the timing of when importers settle duties, not a real change in tariff policy. Read the trend across weeks, not day to day.`,
      },
    ],
  },
  {
    id: "tariffs-and-taxes",
    title: "Tariffs & Taxes",
    parts: [
      {
        label: "What it does.",
        body: `Puts customs duty revenue in context by comparing it to the other ways the federal government raises money (individual income tax, corporate income tax, social insurance (payroll), excise, estate and gift, and miscellaneous receipts) since January 2025.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone trying to gauge how large tariff revenue actually is relative to the federal government's other income sources.`,
      },
      {
        label: "How to use it.",
        body: `Read the composition table and the fiscal-year summary cards. The table breaks revenue down by category; the cards summarize fiscal-year-to-date totals.`,
      },
      {
        label: "How to read results.",
        body: `All figures come from the Treasury's Monthly Treasury Statement. Customs duties are typically a small slice of total federal receipts; the comparison is there to make that scale concrete rather than to argue a point.`,
      },
      /* VERSION-SENSITIVE: Tariffs & Taxes - per-capita figure uses a hardcoded ~340M U.S. population estimate; update when Census ACS revises it */
      {
        label: "Current limits.",
        body: `Per-capita figures use a fixed U.S. population estimate of roughly 340 million; treat them as approximate context, not a precise per-person tax bill.`,
      },
    ],
  },
  {
    id: "1912-vs-today",
    title: "1912 vs Today",
    parts: [
      {
        label: "What it does.",
        body: `Answers a single historical thought experiment: if the federal government funded itself today on the revenue mix it used in 1912 (before the income tax existed) what would tariffs have to be? It applies the 1912 composition of federal revenue to current federal spending.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone interested in the historical role of tariffs in funding the government, and in seeing the pre-income-tax world expressed in today's dollars.`,
      },
      {
        label: "How to use it.",
        body: `Read the three stacked panels. The first sets the historical context with the 1912 revenue mix (shown as a pie) and what that money funded. The second applies the exercise to the most recent finalized fiscal year. The third does the same over a trailing 12-month window.`,
      },
      {
        label: "How to read results.",
        body: `The headline figure is a mathematical answer - the 1912 mix scaled to today's spending - not a forecast and not a policy recommendation. The page is written to keep that stance explicit; it describes a hypothetical balance, never a profit. A "Cite" button is attached so you can quote the figure with its source and data vintage intact.`,
      },
      {
        label: "Current limits.",
        body: `Today's spending is far larger and more diversified than in 1912, so the implied tariff rates are extreme by design; that's the point of the comparison, not a flaw in it. The fiscal-year panel and the trailing-12-month panel can differ because they cover different windows.`,
      },
    ],
  },
  {
    id: "incoming-tariffs",
    title: "Incoming Tariffs",
    parts: [
      {
        label: "What it does.",
        body: `A running feed of every tariff-relevant filing in the Federal Register from the agencies that set and enforce tariff policy; USTR, the International Trade Commission, Customs and Border Protection, the Bureau of Industry and Security, and the International Trade Administration.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who needs to know what's officially in motion: proposed rules, final rules, and notices, straight from the government's record.`,
      },
      {
        label: "How to use it.",
        body: `Browse the list, or narrow it with the filter buttons: All, Final Rule, Proposed, or Notice. The list is paginated at 50 entries per page. The filter and page you choose are stored in the URL, so you can bookmark or share a specific view, and the browser's back button works as expected.`,
      },
      {
        label: "How to read results.",
        body: `Each entry shows the document's title, type, and publication date, and links out to the full text on the Federal Register. "Proposed" means it's open for comment and not yet in force; "Final Rule" means it's been issued.`,
      },
      {
        label: "Current limits.",
        body: `This is the complete filings feed, including procedural and minor notices; it's a record of activity, not a list of rate changes. To see only what takes effect and when, use the Tariff Calendar; to see only antidumping/countervailing actions, use AD/CVD Orders.`,
      },
    ],
  },
  {
    id: "tariff-calendar",
    title: "Tariff Calendar",
    parts: [
      {
        label: "What it does.",
        body: `A timeline of when tariff actions actually take effect; upcoming effective dates, plus a roughly 60-day trailing window of actions that recently took effect for context.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who needs to plan around dates: when a tariff starts, when a change lands.`,
      },
      {
        label: "How to use it.",
        body: `Read the timeline top to bottom. Entries are grouped by effective date. A "Cite" button lets you quote a dated action with its source.`,
      },
      {
        label: "How to read results.",
        body: `Each entry carries the action's title, document type, and the Federal Register link. The key field is the effective date, which is what the calendar is organized around, distinct from the publication date a filing first appeared.`,
      },
      {
        label: "Current limits.",
        body: `Only actions that have a defined effective date appear here. Procedural filings such as investigations, sunset reviews, and hearings have no effective date and are naturally left out, which is intended: the calendar is about what changes and when, not everything that gets filed.`,
      },
    ],
  },
  {
    id: "cit-decisions",
    title: "CIT Decisions",
    parts: [
      {
        label: "What it does.",
        body: `A feed of recent slip opinions from the U.S. Court of International Trade, which is the federal court that hears trade and customs cases; updated daily.`,
      },
      {
        label: "Who it's for.",
        body: `Lawyers, importers, and researchers tracking how tariff and trade disputes are being decided.`,
      },
      {
        label: "How to use it.",
        body: `Browse the reverse-chronological list, or filter by subject using the plain-language chips: All, AD/CVD (antidumping/countervailing), Customs (classification and valuation), Residual (the court's catch-all trade jurisdiction), or Gov't Collection (enforcement and collection cases).`,
      },
      {
        label: "How to read results.",
        body: `Every opinion the court publishes is trade- or tariff-relevant by virtue of the court's jurisdiction, so there's no off-topic noise to filter out. The plain-language filter labels translate the court's statutory jurisdiction codes into subjects.`,
      },
      {
        label: "Current limits.",
        body: `Some opinions are issued confidentially and don't yet have a public PDF; these still appear in the list but are marked pending until the public version is released.`,
      },
    ],
  },
  {
    id: "tariff-browser",
    title: "Tariff Browser",
    parts: [
      {
        label: "What it does.",
        body: `A searchable, browsable view of the entire active U.S. tariff schedule; roughly 29,583 Harmonized Tariff Schedule (HTS) codes with their descriptions.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who needs to find the right HTS code for a product, or explore what's in a given chapter of the schedule.`,
      },
      {
        label: "How to use it.",
        body: `Type a keyword to search descriptions, and/or pick a 2-digit chapter to narrow to one section of the schedule. Results are paginated at 50 per page. As with the feeds, your search and page are kept in the URL so a view can be bookmarked or shared.`,
      },
      {
        label: "How to read results.",
        body: `Each row is one HTS code and its official description. From here you can carry a code into the Rate Calculator or look up what it actually collected in Itemized Duties.`,
      },
      /* VERSION-SENSITIVE: Tariff Browser - v1 has no filters by tariff program (301/232/surcharge), country applicability, or rate range; these depend on Yale Budget Lab effective-rate data not yet loaded */
      {
        label: "Current limits.",
        body: `This first version filters by keyword and chapter only. Filtering by tariff program (Section 301, Section 232, executive surcharges), by country applicability, or by rate range isn't available yet - those depend on per-code effective-rate data the project hasn't loaded. The page is built to add those filters later without changing how you use it today.`,
      },
    ],
  },
  {
    id: "rate-calculator",
    title: "Rate Calculator",
    parts: [
      {
        label: "What it does.",
        body: `Looks up the duty-rate picture for a single product: its baseline (Most-Favored-Nation, or MFN) rate, any free-trade-agreement preferential rate, and the additional tariff programs likely to apply for a given country of origin.`,
      },
      {
        label: "Who it's for.",
        body: `Importers pricing a shipment, journalists checking a claim, and anyone asking "what's the tariff on X from Y."`,
      },
      {
        label: "How to use it.",
        body: `Enter an HTS code in any format (such as 8703230140, 8703.23.01.40, or just the chapter 8703) then pick a country of origin from the dropdown and submit. If the exact code you enter has no rate of its own, the tool walks up to the nearest parent code that does and tells you which code the rate came from.`,
      },
      {
        label: "How to read results.",
        body: `You'll get the MFN base rate, any applicable preferential rate, and a list of special programs (Section 232, Section 301, IEEPA, USMCA) flagged as relevant to your code and country. These are identified from the schedule's own cross-references.`,
      },
      /* VERSION-SENSITIVE: Rate Calculator - currently the "lite" build; rewrite this part in full when the version that computes a final stacked rate / dollar amount ships (depends on Yale rate_timeseries data) */
      {
        label: "Current limits.",
        body: `This is the lite version. It tells you which rates apply but does not add them into a single combined percentage or a final dollar amount - you stack and apply them yourself. The country dropdown covers a fixed set of top trading partners plus an "Any country" option; countries outside that list aren't supported yet. Any special-program reference the tool doesn't recognize is shown verbatim with a link to the USITC for manual lookup. When the full version lands, this section will be rewritten to cover the end-to-end calculation.`,
      },
    ],
  },
  {
    id: "country-profiles",
    title: "Country Profiles",
    parts: [
      {
        label: "What it does.",
        body: `A dedicated page for each source country that has recorded U.S. import duties since January 2025, summarizing what the U.S. has collected on goods from that country and which tariff actions apply to it.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone researching a specific trading partner.`,
      },
      {
        label: "How to use it.",
        body: `These pages aren't in the top navigation; you reach a country profile by clicking a country name inside another tool (Historical Archive, an HTS Chapter Profile) or through search. Each page has a header with cumulative duties, the country's tariff-column status, and a "Cite" button; below that, the top HTS chapters by duties and the tariff actions that apply.`,
      },
      {
        label: "How to read results.",
        body: `The tariff-column status tells you whether the country gets standard (MFN) treatment or falls under the higher Column 2 rates. The chapter breakdown shows where its duties concentrate; each chapter links onward to its own profile.`,
      },
      /* VERSION-SENSITIVE: Country Profiles - v1 deliberately omits AD/CVD and Federal Register "mentions" panels because the underlying tables have no country field; revisit if/when country attribution becomes available */
      {
        label: "Current limits.",
        body: `This first version intentionally leaves out antidumping/countervailing and Federal Register "mentions" panels - the underlying records don't have a reliable country field, so including them would mean noisy text matches rather than real attribution. Only countries with recorded duties have a page; any other address returns "not found."`,
      },
    ],
  },
  {
    id: "hts-chapter-profiles",
    title: "HTS Chapter Profiles",
    parts: [
      {
        label: "What it does.",
        body: `A dedicated page for each 2-digit HTS chapter (a broad product category, like "vehicles" or "electrical machinery") that has recorded duties since January 2025.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone researching a product category rather than a single code or country.`,
      },
      {
        label: "How to use it.",
        body: `Like Country Profiles, these aren't in the nav, you arrive via a chapter link in another tool or through search. Each page has a header with the chapter name, cumulative duties, and a "Cite" button, followed by the top HTS codes in that chapter by duties and the top source countries.`,
      },
      {
        label: "How to read results.",
        body: `The top-codes panel shows which specific products drive the chapter's duties; the top-countries panel shows where those goods come from, and each country links to its own profile. Together with Country Profiles, these pages let you move freely between "what" and "where."`,
      },
      {
        label: "Current limits.",
        body: `Only chapters with recorded duties have a page. The panels are capped at the top 10 codes and top 10 countries to stay readable; smaller contributors aren't listed.`,
      },
    ],
  },
  {
    id: "itemized-duties",
    title: "Itemized Duties",
    parts: [
      {
        label: "What it does.",
        body: `Shows how much customs duty each individual HTS code has actually collected, with month-by-month detail, drawn from U.S. Census Bureau imports data.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who needs the real collected dollars for a specific product code, not just its rate.`,
      },
      {
        label: "How to use it.",
        body: `The tool has two modes. By default you get the list view: search by keyword, filter by chapter, and page through every code ranked by cumulative duties. Click any code to open its detail view, which shows that code's description, cumulative total, and a month-by-month breakdown.`,
      },
      {
        label: "How to read results.",
        body: `Figures are actual dollars collected, summed from monthly Census trade data; this is what was paid, distinct from the Rate Calculator's "what rate applies." The list is ranked so the highest-revenue codes surface first.`,
      },
      {
        label: "Current limits.",
        body: `Census import data lands on a lag, so the most recent month or two may be incomplete or absent. Treat the latest month as provisional until later months confirm it.`,
      },
    ],
  },
  {
    id: "ad-cvd-orders",
    title: "AD/CVD Orders",
    parts: [
      {
        label: "What it does.",
        body: `A focused feed of antidumping and countervailing duty orders published in the Federal Register; the trade-remedy actions aimed at specific products and countries that are found to be dumped or unfairly subsidized.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone tracking trade-remedy cases specifically, separate from the broader tariff-filings stream.`,
      },
      {
        label: "How to use it.",
        body: `It works exactly like Incoming Tariffs: browse the list or filter by All, Final Rule, Proposed, or Notice, paginated at 50 per page, with the filter and page kept in the URL.`,
      },
      {
        label: "How to read results.",
        body: `This is a filtered slice of the full Federal Register feed, narrowed to filings about antidumping and countervailing duties. Each entry links to the full document.`,
      },
      {
        label: "Current limits.",
        body: `Entries are identified by keyword match on the filings, so this is the published-action record; it tells you an order exists and links you to it, rather than computing the resulting duty rate. For court rulings on these cases, see CIT Decisions.`,
      },
    ],
  },
  {
    id: "historical-archive",
    title: "Historical Archive",
    parts: [
      {
        label: "What it does.",
        body: `Aggregates the cumulative customs revenue since January 2025 and breaks it down three ways: by product code, by chapter, and by source country.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who wants the big-picture answer to "where has the tariff revenue actually come from."`,
      },
      {
        label: "How to use it.",
        body: `Read the three ranked panels: the top 25 HTS product codes, the top 25 chapters, and the top 25 source countries, each by cumulative duties. Country and chapter entries link onward to their profile pages.`,
      },
      {
        label: "How to read results.",
        body: `All figures are actual dollars collected, from Census trade data, summed across every month ingested since January 2025. The lists are capped at 25 because entries beyond that are rounding error in dollar terms.`,
      },
      /* VERSION-SENSITIVE: Historical Archive - v1 lacks a "Revenue by Tariff Action" breakdown (Section 232/301/IEEPA attribution); depends on Yale Budget Lab effective-rate parsing not yet built */
      {
        label: "Current limits.",
        body: `This version can't yet attribute revenue to specific tariff actions - there's no "how much came from Section 232 vs. Section 301 vs. IEEPA" breakdown, because that requires per-code effective-rate data the project hasn't built. A panel for it is planned and will slot in without disturbing the rest of the page.`,
      },
    ],
  },
  {
    id: "tariff-trends",
    title: "Tariff Trends",
    parts: [
      {
        label: "What it does.",
        body: `Charts the effective U.S. tariff rate over time (the average rate actually applied) broken out by the legal authority behind it (Section 232, Section 301, IEEPA), by country group, and by economic sector.`,
      },
      {
        label: "Who it's for.",
        body: `Researchers and analysts who want the rate story rather than the dollar story: how the effective tariff burden has shifted and what's driving it.`,
      },
      {
        label: "How to use it.",
        body: `Read the six panels of charts. They cover the effective rate trend, the contribution of each authority, and breakdowns across country groups and sectors, with a timeline of policy events at the bottom for reference.`,
      },
      {
        label: "How to read results.",
        body: `"Effective tariff rate" is the average duty actually collected as a share of import value; lower than headline rates because not all goods are subject to every tariff. The authority breakdown shows which legal mechanism is contributing what.`,
      },
      /* VERSION-SENSITIVE: Tariff Trends - built on a one-time Yale Budget Lab snapshot (dated 2026-04-01); rewrite cadence/recency language if Yale ships a maintained time-series feed and the page moves to it */
      {
        label: "Current limits.",
        body: `This panel is built on a single snapshot of Yale Budget Lab's effective-rate data, dated April 1, 2026, rather than a continuously updated feed. The series covers daily values across 2025-2026, but it reflects that snapshot's vintage instead of live data until a refreshed snapshot is loaded. When Yale begins publishing a maintained feed, this tool will move to it and this note will change.`,
      },
    ],
  },
  {
    id: "search",
    title: "Search",
    parts: [
      {
        label: "What it does.",
        body: `A single search box (top-right of the navigation strip) that looks across both the tariff schedule and the Federal Register at once.`,
      },
      {
        label: "Who it's for.",
        body: `Anyone who wants to jump straight to a code, a product, or a filing without picking the right tool first.`,
      },
      {
        label: "How to use it.",
        body: `Type a query and submit. Results come back in two groups: matching HTS codes and product descriptions, and matching Federal Register tariff filings.`,
      },
      {
        label: "How to read results.",
        body: `Results are ranked by relevance. HTS results link into the schedule and onward tools; filing results link to the Federal Register document.`,
      },
      {
        label: "Current limits.",
        body: `Search covers HTS codes/descriptions and the agency-filtered Federal Register tariff feed. It is not a site-wide search of every page's prose; for revenue figures or court opinions, go to the relevant tool.`,
      },
    ],
  },
  {
    id: "cite-button",
    title: `"Cite" button (site-wide)`,
    parts: [
      {
        label: "What it does.",
        body: `A small "Cite" control attached to cite-worthy figures around the site (the revenue counter, the 1912 comparison, country and chapter profiles, the calendar, and more). It generates a ready-to-use citation for that specific figure.`,
      },
      {
        label: "Who it's for.",
        body: `Journalists, researchers, lawyers, and students who need to quote a number with a proper source.`,
      },
      {
        label: "How to use it.",
        body: `Click "Cite" next to a figure. A dialog opens offering the citation in four formats (Chicago, APA, BibTeX, and plain text) each with a copy button.`,
      },
      {
        label: "How to read results.",
        body: `Each citation embeds the figure's value, its data vintage, and attribution to both Tariff Tracker and the underlying primary source. The "accessed" date is captured at the moment you open the dialog, so it reflects your actual access date.`,
      },
      {
        label: "Current limits.",
        body: `Cite buttons appear only on figures we consider individually quotable; not every number on every page has one.`,
      },
    ],
  },
];

export default function ToolFaqPage() {
  return (
    <MainContent
      title="Tool FAQ"
      subtitle="How to use each tool on Tariff Tracker."
    >
      <div className="max-w-3xl space-y-6 leading-relaxed">
        <p>
          Tariff Tracker is a set of tools that all draw from the same
          primary-source data; Treasury statements, the Federal Register, U.S.
          Census trade data, the USITC Harmonized Tariff Schedule, and the U.S.
          Court of International Trade. This page explains what each tool does
          and how to get the most out of it. For where the numbers come from and
          how they&apos;re compiled, see the{" "}
          <Link href="/methodology" className={linkClass}>
            Methodology page
          </Link>
          .
        </p>
        <p>
          The tools below appear roughly in the order they sit in the
          site&apos;s navigation. A handful of pages (Country Profiles and HTS
          Chapter Profiles) aren&apos;t in the nav at all; you reach them by
          clicking links inside other tools or through search. Those are covered
          here too.
        </p>

        <nav
          aria-label="Jump to a tool"
          className="rounded border border-border bg-bg-strip p-4"
        >
          <p className="font-semibold mb-2">Jump to a tool</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 list-disc list-outside ml-5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={linkClass}>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {SECTIONS.map((s) => (
          <section key={s.id}>
            <h2
              id={s.id}
              className="text-2xl font-bold mt-10 mb-3 font-serif scroll-mt-24"
            >
              {s.title}
            </h2>
            <div className="space-y-3">
              {s.parts.map((p, i) => (
                <p key={i}>
                  <strong>{p.label}</strong> {p.body}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MainContent>
  );
}
