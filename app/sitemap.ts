import type { MetadataRoute } from "next";

// Generates /sitemap.xml at build time. Next.js auto-serves the output of
// this file at the /sitemap.xml route.
//
// Lists the 10 nav routes only. Dynamic URLs (e.g., /itemized-duties?code=
// XXXX detail pages) are intentionally excluded — there are ~29,583 HTS
// codes plus filter combinations, which would balloon the sitemap with
// minimal SEO benefit. Revisit if detail-page indexing becomes a goal.
//
// `lastModified: new Date()` reports build time — inaccurate for static
// content pages but harmless (Google treats it as a hint, not gospel).
// `changeFrequency` and `priority` are advisory only.

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://tarifftracker.org";
  const lastModified = new Date();

  return [
    { url: `${baseUrl}/`,                    lastModified, changeFrequency: "daily",   priority: 1.0 },
    { url: `${baseUrl}/incoming-tariffs`,    lastModified, changeFrequency: "daily",   priority: 0.9 },
    { url: `${baseUrl}/ad-cvd-orders`,       lastModified, changeFrequency: "daily",   priority: 0.8 },
    { url: `${baseUrl}/revenue-tracker`,     lastModified, changeFrequency: "daily",   priority: 0.9 },
    { url: `${baseUrl}/historical-archive`,  lastModified, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${baseUrl}/tariff-browser`,      lastModified, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${baseUrl}/itemized-duties`,     lastModified, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${baseUrl}/tariffs-and-taxes`,   lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/tariff-trends`,       lastModified, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/calculator`,          lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/methodology`,         lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/about`,               lastModified, changeFrequency: "monthly", priority: 0.6 },
  ];
}
