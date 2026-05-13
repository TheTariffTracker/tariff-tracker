import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Serif, Inter } from "next/font/google";
import "./globals.css";

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
  title: "Tariff Tracker",
  description:
    "An independent, nonpartisan record of every U.S. tariff and the revenue it generates.",
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
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
