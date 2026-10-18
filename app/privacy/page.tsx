import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";

// Privacy policy (route: "/privacy"). Written 2026-10-18 against the Phase 3.7
// collection model once every decision was locked -- deliberately NOT written
// earlier, because a policy describing a collection model that was still
// changing would have been wrong on arrival.
//
// THIS PAGE MUST DESCRIBE WHAT THE SITE ACTUALLY DOES. Before changing any
// data handling -- a new third-party script, an analytics product, a Sentry
// setting, a new stored field -- change this page in the same commit. Writing
// it required auditing the Sentry config, which turned out to be recording 10%
// of all browsing sessions; that was switched off rather than disclosed.
//
// EFFECTIVE_DATE is intentionally a hardcoded literal. That is the opposite of
// the footer rule (see app/components/Footer.tsx): a policy's effective date is
// a document version, not a freshness signal, and it must NOT auto-update --
// readers rely on it to know which version they agreed to. Bump it by hand,
// only when the substance changes.
const EFFECTIVE_DATE = "October 18, 2026";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Tariff Tracker collects, what it doesn't, and what happens to your email address if you choose to give it.",
};

const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-xl font-semibold mt-10 mb-3">{children}</h2>
  );
}

export default function PrivacyPage() {
  return (
    <MainContent title="Privacy">
      <div className="max-w-3xl leading-relaxed">
        <p className="text-fg-muted text-sm mb-8">
          Effective {EFFECTIVE_DATE}
        </p>

        <p className="mb-6">
          <strong>The short version:</strong> you can read all free content on
          this site without telling us who you are. If you choose to unlock the
          gated tools, we ask for an email address and three short questions.
          We do not sell, rent, or give that address to anyone.
        </p>

        <H2>When you&apos;re just reading</H2>
        <p className="mb-4">
          We don&apos;t ask who you are and we don&apos;t try to work it out.
          There is no advertising, no analytics product, and no third-party
          tracker following you between sites. Fonts are served from this site
          rather than from Google, so loading a page doesn&apos;t tell anyone
          else that you were here.
        </p>
        <p className="mb-4">Two things happen automatically:</p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            <strong>Our host keeps server logs.</strong> Like every web host,
            Vercel records requests — IP address, time, page, browser — for
            operational and security purposes.
          </li>
          <li>
            <strong>Your theme choice is saved in your browser.</strong> If you
            switch between light and dark mode, that preference is stored
            locally on your device. It never reaches us.
          </li>
        </ul>

        <H2>When something breaks</H2>
        <p className="mb-4">
          We use Sentry to find out when the site has an error. Those reports
          are configured not to attach your IP address.
        </p>
        <p className="mb-4">
          <strong>We do not record browsing sessions.</strong> Sentry can
          replay what a visitor saw and did; that is switched off for normal
          visits. A recording is captured only when an error actually occurs,
          so the fault can be diagnosed. Diagnostic data can incidentally
          include information from the request that failed.
        </p>

        <H2>If you unlock the tools</H2>
        <p className="mb-4">
          Much of this site is free to everyone, with no sign-up. Some of the
          more detailed tools ask for an email address and three short
          questions first. That is the price of the work, in place of
          advertising or a subscription.
        </p>
        <p className="mb-4">
          <strong>What we store:</strong> your email address, your three
          answers, the date you signed up, and a token that remembers this
          browser is unlocked.
        </p>
        <p className="mb-4">
          <strong>What we use it for:</strong> to understand who uses the site,
          to contact you about the project, and to describe our audience in
          aggregate — never individually — to potential sponsors, funders, or
          partners.
        </p>
        <p className="mb-4">
          <strong>What we never do:</strong> we do not sell, rent, or give your
          email address to anyone.
        </p>

        <H2>Partner messages, only if you ask</H2>
        <p className="mb-4">
          If you tick the optional box when you sign up, we may occasionally
          send you a message on behalf of a relevant organization.{" "}
          <strong>We send it ourselves — they never receive your address.</strong>{" "}
          Every such message has a one-click unsubscribe, and unsubscribing
          does not cost you access to the site. If you leave the box unticked,
          this never happens.
        </p>

        <H2>Project updates</H2>
        <p className="mb-4">
          We may email you about significant changes to the project — a few
          times a year at most. You can opt out of those at any time without
          losing access to the site. We do not send newsletters or digests.
        </p>

        <H2>Cookies</H2>
        <p className="mb-4">
          We set one cookie, <code>tt_unlock</code>. It records that this
          browser has unlocked the site. It is set by our server, cannot be
          read by JavaScript, lasts a year, and refreshes when you visit. It is
          not used for advertising and does not follow you to other sites.
        </p>
        <p className="mb-4">
          There is no cookie banner because there is nothing else to consent
          to.
        </p>

        <H2>Abuse protection</H2>
        <p className="mb-4">
          To stop the sign-up form being abused, we briefly keep a counter
          linked to the IP address making the request. Those counters expire
          within 24 hours and are deleted automatically.
        </p>

        <H2>Where your data goes</H2>
        <p className="mb-4">
          We use a small number of services, each receiving only what it needs:
        </p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            <strong>Supabase</strong> — the database holding sign-up records
          </li>
          <li>
            <strong>Resend</strong> — sends the confirmation email
          </li>
          <li>
            <strong>Vercel</strong> — hosts the site
          </li>
          <li>
            <strong>Cloudflare</strong> — DNS, and forwarding for our contact
            address
          </li>
          <li>
            <strong>Sentry</strong> — error reports
          </li>
        </ul>

        <H2>How long we keep it</H2>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>
            <strong>Confirmed sign-ups:</strong> for as long as the project
            runs, or until you ask us to delete them.
          </li>
          <li>
            <strong>Unconfirmed sign-ups:</strong> if an address never
            confirms, we delete the record after 90 days.
          </li>
          <li>
            <strong>Abuse counters:</strong> under 24 hours.
          </li>
        </ul>

        <H2>Getting your data deleted</H2>
        <p className="mb-4">
          Email{" "}
          <a href="mailto:contact@tarifftracker.org" className={linkClass}>
            contact@tarifftracker.org
          </a>{" "}
          and we will delete your record. We will do it within 30 days and
          usually much sooner. You do not need to explain why, and you do not
          need to be in any particular country to ask — we are not going to
          make you prove a jurisdiction to get your own data removed.
        </p>

        <H2>If the project changes hands</H2>
        <p className="mb-4">
          If Tariff Tracker is ever transferred to someone else, this data
          transfers with it and remains subject to this policy.
        </p>

        <H2>Changes to this policy</H2>
        <p className="mb-4">
          If anything here changes materially, the effective date at the top
          changes with it.
        </p>

        <H2>Contact</H2>
        <p className="mb-4">
          Questions about any of this:{" "}
          <a href="mailto:contact@tarifftracker.org" className={linkClass}>
            contact@tarifftracker.org
          </a>
          . For where the tariff data itself comes from, see the{" "}
          <Link href="/methodology" className={linkClass}>
            methodology page
          </Link>
          .
        </p>
      </div>
    </MainContent>
  );
}
