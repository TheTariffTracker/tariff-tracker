import type { Metadata } from "next";
import Link from "next/link";
import MainContent from "../components/MainContent";

// About page (route: "/about"). Static content page with project identity,
// motivation, editorial stance, funding posture, and contact CTA.
// Approved draft lives at `outputs/about-draft.md` in workspace scratch.
// Anonymous-on-identity by Aaron's explicit choice (skipped section 4 of
// the planned about structure); funding language reworded to be consistent
// with the anonymous stance.

export const metadata: Metadata = {
  title: "About",
  description:
    "An independent, nonpartisan civic resource for U.S. tariff data — who Tariff Tracker is for, why it exists, and how it's funded.",
};

// Site-wide link convention: orange + underline, brightens on hover.
const linkClass =
  "text-orange underline hover:text-orange-bright transition-colors";

export default function AboutPage() {
  return (
    <MainContent title="About">
      <div className="max-w-3xl space-y-6 leading-relaxed">
        <p>
          Tariff Tracker is an independent, nonpartisan resource designed to
          present its users, be they journalists, researchers, lawyers,
          importers or the average American citizen, with the economic facts
          about United States Tariffs and Tariff policy, straight from the
          source.
        </p>

        <p>
          This project started with a simple question: what is the reality
          about our current tariff revenue? Since tariffs are, and have
          increasingly become a political, as well as an economic issue,
          when various sides debate over the economic success or failure of
          tariffs, what is the truth and where can one go to find it? That
          is why Tariff Tracker exists. What started as a simple tool to
          show how much revenue the United States had collected since
          January 2025 has grown into a broader set of tools for the
          professional and the layman alike.
        </p>

        <p>
          Since the goal of this site is truth, you will not find editorials
          or arguments here; just the facts, from their sources. Tariff
          Tracker seeks to answer questions by giving you the data and
          allowing you to come to your own conclusions. For specifics on
          where the data comes from and how it&apos;s compiled, see our{" "}
          <Link href="/methodology" className={linkClass}>
            methodology page
          </Link>
          .
        </p>

        <p>
          This is a free resource and accepts no outside funding, nor does
          it have any special interests behind it; operational costs are
          covered privately, with any user donations going toward continued
          operation.
        </p>

        <p>
          Tariff Tracker will continue so long as tariffs are a part of
          United States economic policy; and while we are proud of this
          resource as is, we will always be on the lookout for ways to
          improve, including providing new features if the opportunity
          arises. If you have an idea for a feature or tariff-related
          information you would like to see, email us at{" "}
          <a href="mailto:contact@tarifftracker.org" className={linkClass}>
            contact@tarifftracker.org
          </a>
          .
        </p>
      </div>
    </MainContent>
  );
}
