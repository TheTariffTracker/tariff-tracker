import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Serif, Inter } from "next/font/google";
import "./globals.css";
import Masthead from "./components/Masthead";
import Nav from "./components/Nav";
import CounterStrip from "./components/CounterStrip";
import StatStrip from "./components/StatStrip";
import Footer from "./components/Footer";

// Hourly ISR applied at the layout level — every page in the app inherits
// this cache window unless it sets its own. Individual pages can still opt
// for a shorter revalidate or go fully dynamic if they need to.
//
// Was 300 (five minutes) until 2026-11-07, which was 288 regenerations per
// page per day to surface data that changes at most once. Nothing on this
// site updates faster than once a business day: DTS lands weekdays at 22:47
// UTC, MTS twice monthly, Census monthly on a ~2-month lag, the Federal
// Register on weekdays. See reference_data_cadence_and_dates.
//
// Measured over the 8 days to 2026-11-07: 168,370 ISR writes, the single
// largest line on the Vercel bill at 39% of infrastructure spend. An hour
// still leaves the site far inside the "updated each business day" promise
// on the masthead, and it does not weaken the provisional date range's role
// as the passive signal that the DTS cron has stopped, since that is
// measured in business days rather than minutes.
//
// This value is a CEILING for the whole app, not just a default. Where a
// layout and a page both export revalidate, Next uses the LOWER of the two,
// so a page cannot opt into a longer window than this one -- only a shorter
// one. An attempt to give the 319 country and chapter profiles a daily
// window was made and reverted the same day: the pages exported 86400, the
// build reported them at 1h, and the export was doing nothing.
//
// Do not "fix" that by raising this number. CounterStrip and StatStrip are
// rendered HERE, in the layout, so the revenue counter is baked into every
// page's cached HTML. A longer window on the profile pages would leave 222
// country pages showing a counter up to a day behind the dashboard's -- the
// same figure, two values, same site. The prerequisite for genuinely daily
// profiles is moving those two strips out of the layout first.
export const revalidate = 3600;

// DM Serif Display — used only in the masthead hero tagline. Single weight (400).
const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

// IBM Plex Serif — section titles, card headings. Bold weights only.
const ibmPlexSerif = IBM_Plex_Serif({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-serif",
  display: "swap",
});

// Inter — body text, UI, navigation, tables. Multiple weights.
const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tarifftracker.org"),
  title: {
    template: "%s | Tariff Tracker",
    default: "Tariff Tracker — U.S. Tariffs and Customs Revenue",
  },
  description:
    "An independent, nonpartisan record of every U.S. tariff and the revenue it generates. Real-time customs receipts, Federal Register alerts, AD/CVD orders, and the full HTS code reference — sourced from Treasury, Census, USITC, and the Federal Register.",
  applicationName: "Tariff Tracker",
  authors: [{ name: "Tariff Tracker" }],
  creator: "Tariff Tracker",
  publisher: "Tariff Tracker",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://tarifftracker.org",
    siteName: "Tariff Tracker",
    title: "Tariff Tracker — U.S. Tariffs and Customs Revenue",
    description:
      "An independent, nonpartisan record of every U.S. tariff and the revenue it generates — sourced from Treasury, Census, USITC, and the Federal Register.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Tariff Tracker",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tariff Tracker — U.S. Tariffs and Customs Revenue",
    description:
      "An independent, nonpartisan record of every U.S. tariff and the revenue it generates — sourced from Treasury, Census, USITC, and the Federal Register.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSerifDisplay.variable} ${ibmPlexSerif.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Theme init: runs synchronously before paint so reloading into dark
            mode doesn't flash light first. Reads `theme` from localStorage and
            sets data-theme on <html>. Default (no stored value) = light.

            suppressHydrationWarning on the <script> itself silences the
            mismatch warning that fires when a browser extension (location
            spoofers, Grammarly, etc.) rewrites this tag's attributes between
            SSR and hydration. The script still runs correctly. */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <Masthead />
        <Nav />
        <CounterStrip />
        <StatStrip />
        {children}
        <Footer />
      </body>
    </html>
  );
}
