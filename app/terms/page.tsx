import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";

// Terms of service (route: "/terms"). Written 2026-10-23, alongside the
// privacy policy written 2026-10-18 -- deliberately AFTER the gating and
// lead-capture model was locked, for the same reason that policy was: terms
// describing a thing that is still changing are wrong on arrival.
//
// THIS PAGE MUST DESCRIBE WHAT THE SITE ACTUALLY DOES. If the reuse posture,
// the unlock model, or the data sources change, change this page in the same
// commit. In particular, the reuse section below deliberately distinguishes
// what Tariff Tracker can license (its own writing and presentation) from
// what it cannot (public-domain federal data, and Yale Budget Lab's
// MIT-licensed figures). Do not collapse that distinction into a blanket
// copyright claim -- it would be false.
//
// Three decisions were made explicitly and should not be quietly reversed:
//
//   1. The operator is not named, consistent with the anonymous stance on
//      /about, but Tennessee law IS specified. The reasoning: naming a state
//      costs almost no anonymity and gives the disclaimers a jurisdiction.
//      This is weaker than conventional terms naming an entity. If the
//      project ever takes sponsorship money -- which /privacy already
//      contemplates -- revisit this, because at that point it is a business
//      and an LLC stops being optional.
//
//   2. Reuse is permitted with attribution, matching the site's purpose and
//      its existing citation buttons.
//
//   3. Automated access is permitted at a reasonable rate rather than
//      prohibited outright. A blanket scraping ban would contradict decision
//      2 in the same document, and terms that contradict themselves are
//      worse than no terms.
//
// EFFECTIVE_DATE is intentionally a hardcoded literal, for the same reason as
// the one in app/privacy/page.tsx: a document version, not a freshness
// signal. Bump it by hand, only when the substance changes.
const EFFECTIVE_DATE = "October 23, 2026";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using Tariff Tracker — what you may do with the data, what the site does and does not promise about accuracy, and the limits of its liability.",
};

const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-xl font-semibold mt-10 mb-3">{children}</h2>
  );
}

export default function TermsPage() {
  return (
    <MainContent title="Terms">
      <div className="max-w-3xl leading-relaxed">
        <p className="text-fg-muted text-sm mb-8">Effective {EFFECTIVE_DATE}</p>

        <p className="mb-6">
          <strong>The short version:</strong> use the data, credit us if you
          publish it, and check the official source before you file anything
          with it. What we promise is fidelity: every figure is reproduced as
          its source published it, and the{" "}
          <Link href="/methodology" className={linkClass}>
            methodology page
          </Link>{" "}
          names that source. What we can&apos;t promise is that the source is
          right, that it hasn&apos;t been revised since, or that we have never
          made a mistake.
        </p>

        <H2>What this site is</H2>
        <p className="mb-4">
          Tariff Tracker collects published U.S. tariff and customs-revenue
          data in one place and presents it as the government publishes it.
          It is a reference tool. It is not a government service, it is not
          affiliated with any agency, and nothing on it is an official record.
          Where the official record matters, the{" "}
          <Link href="/methodology" className={linkClass}>
            methodology page
          </Link>{" "}
          names the primary source for every figure, and you should use it.
        </p>
        <p className="mb-4">
          By using the site you accept these terms. If you don&apos;t accept
          them, don&apos;t use it.
        </p>

        <H2>What we promise, and what we don&apos;t</H2>
        <p className="mb-4">
          The claim this site makes is a narrow one, and we hold to it: the
          figures are presented as the government published them, and you are
          always told which source and which release a number came from. That
          is the whole point of the project, and it is a promise we can keep.
        </p>
        <p className="mb-4">
          What we cannot promise is that the published figure is correct. The
          data comes from third parties — chiefly Treasury, the Census
          Bureau, the USITC, the Federal Register, and Yale Budget Lab. We do
          not independently audit them, and an error upstream of us is not one
          we can fix.
        </p>
        <p className="mb-4">Specifically, and not as boilerplate:</p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            <strong>Sources revise their own numbers.</strong> Treasury
            restates figures in later statements. A number that was right when
            we fetched it can be superseded.
          </li>
          <li>
            <strong>Some figures are provisional.</strong> Anything labelled
            provisional on this site is an estimate built from daily data that
            has not yet been confirmed by a monthly statement. It will change.
          </li>
          <li>
            <strong>Data arrives late.</strong> Each source has its own
            schedule and each one occasionally slips. A panel can be showing
            the most recent data that exists and still be weeks behind today.
          </li>
          <li>
            <strong>We make mistakes.</strong> This is a small project. If you
            find an error, tell us and we will fix it.
          </li>
        </ul>
        <p className="mb-4">
          So: the site is provided as it is, without any warranty that it is
          accurate, complete, current, or fit for a particular purpose.
        </p>

        <H2>Not professional advice</H2>
        <p className="mb-4">
          Nothing here is legal, customs, tax, accounting, or investment
          advice, and using the site does not create any professional
          relationship between us.
        </p>
        <p className="mb-4">
          The rate calculator tells you which tariff programs are in force for
          a given HTS-10 code, country of origin, and date, and what each one
          adds — the base rate plus Section 232, 301, IEEPA and the rest,
          broken out by authority. That is a real answer to a question that is
          genuinely hard to assemble by hand, and it is enough to plan, quote,
          or sanity-check what someone else has told you.
        </p>
        <p className="mb-4">
          What it is not is the duty you will owe, and the gap is not a
          shortcoming in the tool. Your final liability turns on things only
          your entry documents settle: the classification you declare, which
          is your legal responsibility and is the hard part; customs value,
          which is not the invoice total; origin in the substantial-transformation sense rather than where the container sailed from;
          any exclusion or ruling specific to your product; and AD/CVD rates,
          which attach to a producer rather than to a code. Specific and
          compound duty lines are not computed in dollars at all — only
          plain ad-valorem ones are.
        </p>
        <p className="mb-4">
          So: use it to understand the rate landscape, not to fill in a form.
          For an actual filing, use{" "}
          <a
            href="https://hts.usitc.gov/"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            the official HTS
          </a>{" "}
          and a licensed customs broker.
        </p>

        <H2>Limitation of liability</H2>
        <p className="mb-4">
          To the fullest extent the law allows, Tariff Tracker is not liable
          for any loss arising from your use of the site or from reliance on
          anything published here — including lost profits, penalties,
          interest, or any indirect or consequential loss.
        </p>
        <p className="mb-4">
          This is a free public resource with no subscription revenue. The
          disclaimer above is what makes it possible to publish at all.
        </p>

        <H2>Using what you find here</H2>
        <p className="mb-4">
          You may reproduce the figures, tables, and charts from this site —
          in journalism, research, filings, classrooms, or anywhere else —
          provided you credit Tariff Tracker and, where the underlying source
          matters, name it too. Most pages have a <strong>Cite</strong> button
          that produces a correctly formatted reference. You do not need to
          ask permission.
        </p>
        <p className="mb-4">
          Three distinctions worth being precise about, because they are not
          all ours to license:
        </p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            <strong>Federal data is in the public domain.</strong> Treasury,
            Census, USITC and Federal Register figures were never ours. Use
            them however you like; our terms cannot restrict them and do not
            try to.
          </li>
          <li>
            <strong>Yale Budget Lab&apos;s data is MIT-licensed</strong> and
            carries its own terms, which travel with it.
          </li>
          <li>
            <strong>Our own writing, analysis, and presentation</strong> — the
            explanatory text, the methodology notes, the design of the charts —
            is the part these terms actually cover, and it is the part the
            attribution request applies to.
          </li>
        </ul>
        <p className="mb-4">
          What you may not do is present the material in a way that suggests
          Tariff Tracker endorses you, your product, or your conclusions, or
          republish it altered in a way that changes what the numbers say
          while still crediting us for them.
        </p>

        <H2>Automated access</H2>
        <p className="mb-4">
          Scraping is allowed, within reason. The pages are public and most of
          the data is public; pretending otherwise would be posturing. Pull
          what you need at a rate that doesn&apos;t degrade the site for
          anyone else, and identify your bot honestly if it has a user agent.
        </p>
        <p className="mb-4">What is not allowed:</p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            Requests at a volume or rate that interferes with the service, or
            any attempt to disrupt it
          </li>
          <li>
            Circumventing the sign-up gate, or sharing a mechanism for doing so
          </li>
          <li>Harvesting email addresses, or submitting addresses that aren&apos;t yours</li>
          <li>Attempting to reach data or systems not published on the site</li>
          <li>Using the site to break the law</li>
        </ul>
        <p className="mb-4">
          If you need bulk access and the polite version isn&apos;t working for
          you, email us. A sensible request is likelier to get help than a
          workaround.
        </p>

        <H2>Unlocking the gated tools</H2>
        <p className="mb-4">
          Some tools ask for an email address and three short questions before
          they open. What happens to that address is covered in the{" "}
          <Link href="/privacy" className={linkClass}>
            privacy policy
          </Link>
          , and it is short: we do not sell, rent, or give it to anyone.
        </p>
        <p className="mb-4">
          Give an address that is actually yours. Access is for you rather than
          for redistribution, though we are not going to audit that. We may end
          an unlock that is being used to attack or abuse the site, and we will
          say why if you ask.
        </p>
        <p className="mb-4">
          Unlocking is free and always has been. If that ever changes, existing
          sign-ups will not be charged retroactively.
        </p>

        <H2>Availability</H2>
        <p className="mb-4">
          There is no uptime commitment. The site may be unavailable for
          maintenance, because a dependency failed, or because something broke.
          Pages, tools, and data series may be changed or withdrawn. We will
          not delete the project quietly if we can help it, but we are not
          promising it runs forever.
        </p>

        <H2>Links to other sites</H2>
        <p className="mb-4">
          We link out constantly, because naming the primary source is the
          point. We don&apos;t control those sites and aren&apos;t responsible
          for what they publish or do.
        </p>

        <H2>Changes to these terms</H2>
        <p className="mb-4">
          If anything here changes materially, the effective date at the top
          changes with it. Continuing to use the site after that means you
          accept the revised terms.
        </p>

        <H2>Governing law</H2>
        <p className="mb-4">
          These terms are governed by the laws of the State of Tennessee,
          without regard to its conflict-of-laws rules, and any dispute
          arising from them belongs in the state or federal courts located in
          Tennessee.
        </p>
        <p className="mb-4">
          If any part of these terms turns out to be unenforceable, the rest
          still stands.
        </p>

        <H2>Contact</H2>
        <p className="mb-4">
          Questions, corrections, or a bulk-access request:{" "}
          <a href="mailto:contact@tarifftracker.org" className={linkClass}>
            contact@tarifftracker.org
          </a>
          . For where the data itself comes from, see the{" "}
          <Link href="/methodology" className={linkClass}>
            methodology page
          </Link>
          .
        </p>
      </div>
    </MainContent>
  );
}
