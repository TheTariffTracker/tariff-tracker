import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Serif, Inter } from "next/font/google";
import "./globals.css";
import Masthead from "./components/Masthead";
import Nav from "./components/Nav";
import CounterStrip from "./components/CounterStrip";
import StatStrip from "./components/StatStrip";
import Footer from "./components/Footer";

// 5-minute ISR applied at the layout level — every page in the app
// (Dashboard, Incoming Tariffs, future nav pages) inherits this cache
// window. Individual pages can still opt for a shorter revalidate or go
// fully dynamic if they need to.
export const revalidate = 300;

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
