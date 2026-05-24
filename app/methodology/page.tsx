import type { Metadata } from "next";
import MainContent from "../components/MainContent";

// Methodology page (route: "/methodology"). Static content page describing
// data sources, how we compute headline figures, and known limitations.
// Approved markdown draft lives in workspace memory; this file is the JSX
// translation. Intended audience: journalists, researchers, and civic
// readers who want to cite or verify figures shown on Tariff Tracker.

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "Where Tariff Tracker's data comes from, how we compute the figures shown, and the limits of our data — sourced from USITC, Treasury, Census, Federal Register, and Yale Budget Lab.",
};

// Shared styling constants. Site-wide link convention: orange + underline,
// brightens on hover. Inline code: monospace, light gray strip background.
const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";
const codeClass =
  "font-mono text-sm bg-bg-strip px-1.5 py-0.5 rounded";
const extLinkProps = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

export default function MethodologyPage() {
  return (
    <MainContent
      title="Methodology"
      subtitle="How we source, compute, and verify the data on Tariff Tracker."
    >
      <div className="max-w-3xl space-y-6 leading-relaxed">
        <p>
          Tariff Tracker is an independent resource which presents publicly
          available U.S. tariff and customs revenue data, drawn directly from
          government sources. This page describes exactly where the data
          comes from, how we compute the figures shown on the site, and where
          the limits of our data are.
        </p>
        <p>
          If you&apos;re a journalist, researcher, or anyone planning to cite
          or rely on figures from Tariff Tracker, read this page. We&apos;ve
          endeavored to be specific enough for the user to independently
          verify any number on the site against its original source.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          Data sources
        </h2>
        <p>
          We pull from six sources. Five are federal government APIs published
          as part of normal public-data programs; the sixth is a research
          aggregate from the Yale Budget Lab.
        </p>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          USITC Harmonized Tariff Schedule (HTS)
        </h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> U.S. International Trade Commission,
            official HTS publication
          </li>
          <li>
            <strong>Endpoint:</strong>{" "}
            <code className={codeClass}>
              https://hts.usitc.gov/reststop/search
            </code>{" "}
            (also available via bulk download)
          </li>
          <li>
            <strong>What we pull:</strong> All ~29,583 HTS codes &mdash;
            10-digit statistical suffixes, 8-digit subheadings, and
            parent-chapter entries &mdash; with descriptions, MFN base rates
            (&quot;General&quot;), special program rates (FTA-specific),
            Column 2 rates (for the small set of non-MFN countries), and
            Chapter 99 cross-references that identify Section 232, Section
            301, IEEPA, and other special programs that apply.
          </li>
          <li>
            <strong>How often it updates:</strong> USITC publishes revisions
            periodically (39 revisions in calendar year 2025 alone, varying
            with policy actions). Our sync script compares the SHA-256 hash
            of the bulk download against the previous fetch and only re-syncs
            when the schedule changes.
          </li>
          <li>
            <strong>What&apos;s in our database:</strong> Every active HTS
            entry with its full hierarchy. The{" "}
            <code className={codeClass}>total_rate</code> (computed effective
            rate stacking base + special programs) is intentionally not
            computed by us: see Yale Budget Lab below for that.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          U.S. Treasury Daily Treasury Statement (DTS)
        </h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> U.S. Department of the Treasury, Bureau
            of the Fiscal Service
          </li>
          <li>
            <strong>Endpoint:</strong>{" "}
            <code className={codeClass}>
              https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/deposits_withdrawals_operating_cash/
            </code>
          </li>
          <li>
            <strong>What we pull:</strong> Daily customs revenue from the
            &quot;Deposits and Withdrawals of Operating Cash&quot; table,
            filtered to the customs line item.
          </li>
          <li>
            <strong>How often it updates:</strong> Daily on business days.
            Treasury publishes the previous business day&apos;s figures
            around 4 PM Eastern.
          </li>
          <li>
            <strong>Critical detail (units):</strong> DTS reports figures in
            millions of dollars. Our database stores the raw value; the
            frontend multiplies by 1,000,000 when displaying alongside MTS
            data, which uses different units (see below).
          </li>
          <li>
            <strong>Critical detail (label changes):</strong> In November
            2025, Treasury renamed the customs line from &quot;DHS - Customs
            and Certain Excise Taxes&quot; to &quot;DHS - Customs Duties,
            Taxes, and Fees.&quot; Our fetcher accepts both historical
            labels so backfill data and current data sit in the same table
            without gaps.
          </li>
          <li>
            <strong>Critical detail (timing):</strong> DTS records customs
            revenue by cash collection date, not import date. Most importers
            settle duties via the Periodic Monthly Statement (PMS), which
            falls on the fifteenth business day after each month. The
            result: daily figures typically show $200M&ndash;$500M, with one
            ~$5B+ spike each month on PMS day. Don&apos;t read low daily
            figures as a tariff slowdown; check the PMS calendar.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          U.S. Treasury Monthly Treasury Statement (MTS)
        </h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> U.S. Department of the Treasury
          </li>
          <li>
            <strong>Endpoint:</strong>{" "}
            <code className={codeClass}>
              https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/mts/
            </code>
          </li>
          <li>
            <strong>What we pull:</strong> Monthly customs duties from MTS
            Table 4, including gross receipts, refunds, net receipts, and
            fiscal-year-to-date totals. We also pull all federal receipt
            categories from MTS Table 4 to power our Tariffs and Taxes
            comparison page.
          </li>
          <li>
            <strong>How often it updates:</strong> Monthly. Treasury
            publishes around the third week of the following month (e.g.,
            May 2026 data publishes approximately mid-June 2026).
          </li>
          <li>
            <strong>Critical detail (units):</strong> MTS reports figures in
            actual dollars, including cents; different from DTS&apos;s
            units. This is the source of unit confusion that catches almost
            everyone reading Treasury data the first time. We handle the
            conversion in our code; you should be aware if comparing
            figures between our site and raw Treasury exports.
          </li>
          <li>
            <strong>Critical detail (table choice):</strong> The relevant
            customs detail lives in MTS Table 4, not Table 5 as some
            references suggest. Table 5 is agency outlays. Customs duties
            data appears in Tables 3, 4, and 7; Table 4 has the most
            granular breakdown.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          U.S. Census Bureau International Trade Imports
        </h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> U.S. Census Bureau, International Trade
            Division
          </li>
          <li>
            <strong>Endpoint:</strong>{" "}
            <code className={codeClass}>
              https://api.census.gov/data/timeseries/intltrade/imports/hs
            </code>
          </li>
          <li>
            <strong>What we pull:</strong> Per-HTS-10 import volumes and
            calculated duties, by country of origin. As of writing, our
            database contains roughly 1.86 million rows covering recent
            ingested months.
          </li>
          <li>
            <strong>How often it updates:</strong> Monthly. Census publishes
            import data with an approximately two-month lag: for example,
            April 2026 figures typically publish in early June 2026. This
            lag is inherent to the source and unrelated to our
            infrastructure.
          </li>
          <li>
            <strong>Critical detail (filtering):</strong> Census returns
            multiple aggregation levels (HS-2, HS-4, HS-6, HS-10) and
            multiple summary types (detailed, country group) in a single
            API response. We filter strictly to{" "}
            <code className={codeClass}>{"COMM_LVL='HS10'"}</code> AND{" "}
            <code className={codeClass}>{"SUMMARY_LVL='DET'"}</code> AND
            non-zero <code className={codeClass}>CAL_DUT_MO</code> AND a
            country code containing no <code className={codeClass}>{"'X'"}</code>{" "}
            characters. Without the{" "}
            <code className={codeClass}>SUMMARY_LVL</code> filter, regional
            aggregation rows would double-count on top of individual
            countries, inflating totals by roughly 3.6x.
          </li>
          <li>
            <strong>Critical detail (timing vs DTS/MTS):</strong> Census
            reports by import month, the month goods crossed the border.
            DTS and MTS report by cash collection date, the month duties
            were paid. These typically differ by one to two months.
            Per-month figures will not match between sources; cross-month
            sums converge.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">Federal Register</h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> Office of the Federal Register, National
            Archives and Records Administration
          </li>
          <li>
            <strong>Endpoint:</strong>{" "}
            <code className={codeClass}>
              https://www.federalregister.gov/api/v1/documents.json
            </code>
          </li>
          <li>
            <strong>What we pull:</strong> Rule, Proposed Rule, and Notice
            documents related to tariffs, trade remedies, and customs
            administration.
          </li>
          <li>
            <strong>How often it updates:</strong> Daily. The Federal
            Register publishes documents each business day; our sync picks
            up new entries within hours.
          </li>
          <li>
            <strong>Critical detail (filtering):</strong> The Federal
            Register&apos;s full-text search is loose; searching for
            &quot;Section 301&quot; returns FDA debarment orders,
            &quot;safeguard&quot; returns Medicare enrollment moratoriums,
            and so on. Roughly 75% of unfiltered results are non-tariff
            noise. We filter by the agency slug in each document&apos;s
            metadata, accepting only documents published by tariff-relevant
            agencies: the Office of the U.S. Trade Representative (USTR),
            the International Trade Administration (ITA), the U.S.
            International Trade Commission (ITC), U.S. Customs and Border
            Protection (CBP), the Foreign Trade Zones Board (FTZB), and the
            Bureau of Industry and Security (BIS). This filter drops the
            noise from approximately 75% to under 5%. Borderline cases that
            survive the filter include U.S. Customs cultural-property
            import restrictions (which are enforced by CBP but aren&apos;t
            strictly tariffs) and ITC Section 337 patent cases.
          </li>
          <li>
            <strong>AD/CVD orders specifically:</strong> No public API
            exposes antidumping and countervailing duty orders directly. We
            source these from Federal Register documents that match
            keywords <code className={codeClass}>antidumping</code> or{" "}
            <code className={codeClass}>countervailing duty</code> within
            our agency-filtered set.
          </li>
        </ul>

        <h3 className="text-lg font-semibold mt-6 mb-2">
          Yale Budget Lab Tariff Rate Tracker
        </h3>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Source:</strong> Yale Budget Lab, open-source research
            project (MIT-licensed)
          </li>
          <li>
            <strong>Repository:</strong>{" "}
            <a
              href="https://github.com/Budget-Lab-Yale/tariff-rate-tracker"
              className={linkClass}
              {...extLinkProps}
            >
              github.com/Budget-Lab-Yale/tariff-rate-tracker
            </a>
          </li>
          <li>
            <strong>Snapshot:</strong> As of writing, the most recent
            snapshot is dated April 1, 2026, published as an Excel
            workbook.
          </li>
          <li>
            <strong>What we pull:</strong> Yale&apos;s aggregate effective
            tariff rate (ETR) calculations across multiple cuts: overall
            daily ETR, ETR by tariff authority (Section 232, 301, IEEPA
            Reciprocal, IEEPA Fentanyl, Section 122, Base), ETR by partner
            region, ETR by GTAP economic sector, and a timeline of major
            policy events. Roughly 13,000 daily-resolution rows covering
            January 2025 through projections to December 2026.
          </li>
          <li>
            <strong>How often it updates:</strong> Yale publishes snapshots
            periodically rather than continuously. We load each new
            snapshot when it is published. Yale has indicated they may add
            a maintained time-series feed in the future.
          </li>
          <li>
            <strong>Important limitation:</strong> The published snapshot
            is aggregate-only. It does not include per-HTS-code or
            per-individual-country effective rates. This is the single
            biggest gap in our data layer right now. Without per-HTS data,
            our Rate Calculator can show only the legal rate components
            (MFN base + applicable special programs by Chapter 99
            cross-reference) - not a finished effective-rate computation.
          </li>
        </ul>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          Critical data caveats
        </h2>
        <p>
          A few quirks of the source data that you should understand before
          drawing conclusions from anything on Tariff Tracker.
        </p>

        <p>
          <strong>Unit conversion between DTS and MTS.</strong> DTS reports
          in millions of dollars; MTS reports in actual dollars with cents.
          When we display a cumulative figure that splices MTS through the
          most recent complete month and adds DTS for the current
          incomplete month, we multiply DTS by one million to put both on
          the same scale. If you&apos;re independently computing totals
          from raw Treasury exports, watch the units.
        </p>

        <p>
          <strong>Cash collection date versus import month.</strong> DTS
          and MTS report customs revenue when collected (typically one to
          two months after the goods entered the country). Census reports
          trade volumes and duties calculated by import month (when goods
          crossed the border). The same shipment shows up in different
          months across these sources. Don&apos;t expect month-by-month
          figures to match; expect them to converge over multi-month
          windows.
        </p>

        <p>
          <strong>Net versus gross customs revenue.</strong> MTS Table 4
          distinguishes gross receipts from net receipts (net = gross
          minus refunds and drawbacks). DTS publishes a single daily
          figure that is closer to gross. When citing &quot;monthly
          customs revenue&quot; we use the net figure from MTS for
          completed months because that is the figure that flows into
          the federal balance sheet; we use the DTS daily total for the
          current incomplete month as the best provisional approximation.
        </p>

        <p>
          <strong>The Treasury label change of November 2025.</strong>{" "}
          Treasury renamed the customs line item from &quot;DHS - Customs
          and Certain Excise Taxes&quot; to &quot;DHS - Customs Duties,
          Taxes, and Fees&quot; in November 2025. Older third-party
          charts that filter by the old label name will report zero
          customs revenue from late 2025 onward. We accept both labels.
        </p>

        <p>
          <strong>HTS code format.</strong> Within our database, Census
          import data stores HTS codes as plain ten-digit strings (e.g.,{" "}
          <code className={codeClass}>8703230140</code>). The USITC HTS
          schedule stores them in dotted format (e.g.,{" "}
          <code className={codeClass}>8703.23.01.40</code>). When you see
          cross-referenced data on the site (description of a code from
          USITC paired with import volume from Census), we translate
          between formats internally.
        </p>

        <p>
          <strong>
            The &quot;Tariffed Product Lines&quot; figure on the Dashboard.
          </strong>{" "}
          The hero stat showing &quot;8,217 / 29,583 product lines
          tariffed&quot; is currently a placeholder estimate, not a
          computed figure. Producing an accurate count requires
          per-HTS-code effective rate data from Yale, which the published
          snapshot does not yet include. We will replace the hardcoded
          figure with a computed one as soon as that data becomes
          available; the placeholder is flagged on the Dashboard.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          How we compute headline figures
        </h2>

        <p>
          <strong>Cumulative revenue since January 2025</strong> (shown on
          the Dashboard counter strip): sum of MTS Table 4 net customs
          receipts for every completed month from January 2025 through the
          most recent published MTS month, plus DTS daily customs receipts
          for every business day in the current incomplete month
          (multiplied by one million for unit alignment).
        </p>

        <p>
          <strong>Year-to-date 2026:</strong> sum of MTS Table 4 net
          customs receipts for January 2026 through the most recent
          published MTS month, plus DTS days in the current month.
        </p>

        <p>
          <strong>Top product categories by month</strong> (Dashboard
          right card): Census Bureau{" "}
          <code className={codeClass}>calculated_duties</code> aggregated
          by HTS chapter (first two digits of the HTS code) for the most
          recent month with published Census data. Year-over-year deltas
          compare each chapter&apos;s current-month value to the same
          chapter in the same month one year prior.
        </p>

        <p>
          <strong>Historical Archive cumulative totals</strong> (Itemized
          Duties detail view, Historical Archive page): sum of Census{" "}
          <code className={codeClass}>calculated_duties</code> since
          January 2025 for the relevant HTS code, chapter, or source
          country.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          Update cadence
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold">Source</th>
                <th className="text-left py-2 pr-4 font-semibold">Cadence</th>
                <th className="text-left py-2 font-semibold">
                  Our cron schedule (UTC)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">USITC HTS</td>
                <td className="py-2 pr-4">When USITC publishes</td>
                <td className="py-2">Daily check via hash compare</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">DTS</td>
                <td className="py-2 pr-4">Each business day at ~4 PM ET</td>
                <td className="py-2">Daily weekday</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">MTS</td>
                <td className="py-2 pr-4">
                  ~Third week of following month
                </td>
                <td className="py-2">Monthly</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">MTS Table 4 receipts</td>
                <td className="py-2 pr-4">Same as MTS</td>
                <td className="py-2">Twice monthly</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">Census imports</td>
                <td className="py-2 pr-4">
                  ~Two months after import month
                </td>
                <td className="py-2">Monthly</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4">Federal Register</td>
                <td className="py-2 pr-4">Each business day</td>
                <td className="py-2">Daily</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Yale Budget Lab</td>
                <td className="py-2 pr-4">
                  When Yale publishes a snapshot
                </td>
                <td className="py-2">Manual reload</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          Known gaps and limitations
        </h2>
        <p>
          We work in good faith with what&apos;s publicly available. Some
          things we cannot currently do, and we want you to know.
        </p>

        <p>
          <strong>No per-HTS-code effective rate breakdown.</strong>{" "}
          Without Yale&apos;s per-HTS data (currently aggregate-only), we
          cannot show &quot;this specific code has an effective rate of
          X% after Section 301 and IEEPA stacking&quot; for individual
          HTS entries. The Rate Calculator shows the legal rate
          components and the special programs that apply to a chosen
          country, but does not compute a final percentage.
        </p>

        <p>
          <strong>
            AD/CVD orders sourced via Federal Register filter, not
            authoritative API.
          </strong>{" "}
          No public API serves U.S. antidumping and countervailing duty
          orders directly. We source them by keyword-filtering the
          Federal Register feed (<code className={codeClass}>antidumping</code>{" "}
          or <code className={codeClass}>countervailing duty</code>{" "}
          within tariff-relevant agencies). For comprehensive AD/CVD
          research, also consult the ITA&apos;s Enforcement and
          Compliance site and Commerce Department dockets directly.
        </p>

        <p>
          <strong>Census two-month publication lag.</strong> Census
          Bureau international-trade data publishes approximately two
          months after the import month. Our Itemized Duties and
          Historical Archive pages reflect this lag, as the most recent
          month with import detail is roughly two months behind the
          calendar.
        </p>

        <p>
          <strong>No state-level revenue breakdown.</strong> Customs
          revenue is collected federally, not by state. Some research
          outlets estimate state-level burden by combining tariff data
          with state import-mix data; we currently do not.
        </p>

        <p>
          <strong>
            Daily Treasury Statement reflects collection patterns, not
            economic activity.
          </strong>{" "}
          The mid-month PMS spike pattern is a payment-processing
          artifact, not a signal about trade flows or policy effects.
          Daily figures should always be read in the context of the PMS
          calendar.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          How to verify our numbers
        </h2>
        <p>
          Every figure on Tariff Tracker can be checked against its
          underlying source.
        </p>

        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>Daily customs revenue:</strong>{" "}
            <a
              href="https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/"
              className={linkClass}
              {...extLinkProps}
            >
              Fiscal Service Daily Treasury Statement
            </a>
          </li>
          <li>
            <strong>Monthly customs revenue and FYTD totals:</strong>{" "}
            <a
              href="https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/"
              className={linkClass}
              {...extLinkProps}
            >
              Fiscal Service Monthly Treasury Statement
            </a>
          </li>
          <li>
            <strong>HTS code data:</strong>{" "}
            <a
              href="https://hts.usitc.gov/"
              className={linkClass}
              {...extLinkProps}
            >
              USITC HTS Online
            </a>
          </li>
          <li>
            <strong>Federal Register tariff documents:</strong>{" "}
            <a
              href="https://www.federalregister.gov/"
              className={linkClass}
              {...extLinkProps}
            >
              federalregister.gov
            </a>
          </li>
          <li>
            <strong>Import volume and calculated duties by HTS code:</strong>{" "}
            <a
              href="https://usatrade.census.gov/"
              className={linkClass}
              {...extLinkProps}
            >
              Census USA Trade Online
            </a>
          </li>
          <li>
            <strong>Yale Budget Lab effective rate research:</strong>{" "}
            <a
              href="https://budgetlab.yale.edu/research/introducing-tariff-rate-tracker-open-source-tool-daily-effective-tariff-rates"
              className={linkClass}
              {...extLinkProps}
            >
              budgetlab.yale.edu/research/tariff-rate-tracker
            </a>
          </li>
        </ul>

        <p>
          If you find a discrepancy between what Tariff Tracker shows and
          what the underlying source publishes, please tell us at the
          address below. We treat these as bugs.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">Glossary</h2>
        <ul className="list-disc list-outside ml-6 space-y-2">
          <li>
            <strong>HTS</strong> &mdash; Harmonized Tariff Schedule, the
            U.S. classification system for imported goods, organized into
            99 chapters
          </li>
          <li>
            <strong>DTS</strong> &mdash; Daily Treasury Statement
          </li>
          <li>
            <strong>MTS</strong> &mdash; Monthly Treasury Statement
          </li>
          <li>
            <strong>FYTD</strong> &mdash; Fiscal Year To Date (federal
            fiscal year runs October 1 to September 30)
          </li>
          <li>
            <strong>CYTD</strong> &mdash; Calendar Year To Date
          </li>
          <li>
            <strong>AD/CVD</strong> &mdash; Antidumping and Countervailing
            Duty: trade-remedy actions imposed when foreign goods are
            found to be sold below fair value (AD) or subsidized by
            foreign governments (CVD)
          </li>
          <li>
            <strong>Section 232</strong> &mdash; Tariffs imposed under
            Section 232 of the Trade Expansion Act of 1962 for national
            security reasons (e.g., steel and aluminum tariffs)
          </li>
          <li>
            <strong>Section 301</strong> &mdash; Tariffs imposed under
            Section 301 of the Trade Act of 1974 in response to unfair
            foreign trade practices (e.g., tariffs on China)
          </li>
          <li>
            <strong>IEEPA</strong> &mdash; International Emergency
            Economic Powers Act, the authority used for several recent
            tariff actions including the Reciprocal Tariffs and Fentanyl
            tariffs
          </li>
          <li>
            <strong>MFN</strong> &mdash; Most Favored Nation: the
            standard tariff rate that applies to imports from any
            country with which the U.S. has normal trade relations
          </li>
          <li>
            <strong>USTR</strong> &mdash; Office of the United States
            Trade Representative
          </li>
          <li>
            <strong>CBP</strong> &mdash; U.S. Customs and Border
            Protection (the agency that collects duties)
          </li>
          <li>
            <strong>ITC</strong> (or <strong>USITC</strong>) &mdash; U.S.
            International Trade Commission
          </li>
          <li>
            <strong>ITA</strong> &mdash; International Trade
            Administration (within the Department of Commerce)
          </li>
          <li>
            <strong>BIS</strong> &mdash; Bureau of Industry and Security
            (within the Department of Commerce)
          </li>
          <li>
            <strong>FTZB</strong> &mdash; Foreign Trade Zones Board
          </li>
          <li>
            <strong>PMS</strong> &mdash; Periodic Monthly Statement, the
            customs duty payment program most importers use; settles
            roughly 15 business days after each month
          </li>
        </ul>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">
          Citing Tariff Tracker
        </h2>
        <p>
          If you reference data from this site in a published article or
          research paper, please cite both Tariff Tracker and the
          underlying government source. Suggested format:
        </p>
        <blockquote className="border-l-4 border-orange pl-4 italic text-fg-muted">
          Tariff Tracker (tarifftracker.org), drawing on U.S. Treasury
          Daily Treasury Statement data, accessed [date].
        </blockquote>
        <p>
          The site is updated daily. Including the date you accessed a
          figure helps your readers reconcile any later revisions from
          upstream sources.
        </p>

        <h2 className="text-2xl font-bold mt-10 mb-3 font-serif">Contact</h2>
        <p>
          Methodology questions, corrections, or requests for additional
          documentation:{" "}
          <a href="mailto:privacy@tarifftracker.org" className={linkClass}>
            privacy@tarifftracker.org
          </a>
        </p>
      </div>
    </MainContent>
  );
}
