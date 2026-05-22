import type { MetadataRoute } from "next";

// Generates /robots.txt at build time. Next.js auto-serves the output of
// this file at the /robots.txt route — no static file needed.
//
// Policy: any crawler may index any page. Sitemap is at the URL below.
// Update the URLs if/when the canonical host changes.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://tarifftracker.org/sitemap.xml",
    host: "https://tarifftracker.org",
  };
}
