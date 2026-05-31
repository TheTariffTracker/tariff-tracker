import type { MetadataRoute } from "next";
import { supabase } from "./lib/supabase";
import {
  getCountryName,
  getCountrySlug,
  COLUMN_2_CODES,
} from "./lib/census-countries";

// Generates /sitemap.xml at build time. Next.js auto-serves the output of
// this file at the /sitemap.xml route.
//
// Lists the nav routes plus every /country/[slug] profile that has data.
// Other dynamic URLs (e.g., /itemized-duties?code=XXXX detail pages) are
// intentionally excluded — there are ~29,583 HTS codes plus filter combos,
// which would balloon the sitemap with minimal SEO benefit.
//
// `lastModified: new Date()` reports build time — inaccurate for static
// content pages but harmless (Google treats it as a hint, not gospel).
// `changeFrequency` and `priority` are advisory only.

const baseUrl = "https://tarifftracker.org";

// Pull the data-bearing country codes, mapped to their slugs, mirroring the
// /country/[slug] generateStaticParams logic so the sitemap and the generated
// pages stay in lockstep. Unmapped codes are skipped.
async function getCountryUrls(
  lastModified: Date,
): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase
    .from("country_total_duties")
    .select("country_code");
  if (error || !data) return [];

  const slugs = new Set<string>();
  for (const row of data as { country_code: string }[]) {
    if (getCountryName(row.country_code).startsWith("Country ")) continue;
    slugs.add(getCountrySlug(row.country_code));
  }
  // Mirror the page's generateStaticParams: always include Column 2 countries.
  for (const code of COLUMN_2_CODES) slugs.add(getCountrySlug(code));
  return Array.from(slugs).map((slug) => ({
    url: `${baseUrl}/country/${slug}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}

// Every HTS chapter with recorded duties, mirroring the /chapter/[chapter]
// generateStaticParams.
async function getChapterUrls(
  lastModified: Date,
): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase
    .from("chapter_duties_monthly")
    .select("chapter");
  if (error || !data) return [];

  const chapters = new Set<string>();
  for (const row of data as { chapter: string }[]) {
    if (row.chapter) chapters.add(row.chapter);
  }
  return Array.from(chapters).map((chapter) => ({
    url: `${baseUrl}/chapter/${chapter}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`,                    lastModified, changeFrequency: "daily",   priority: 1.0 },
    { url: `${baseUrl}/incoming-tariffs`,    lastModified, changeFrequency: "daily",   priority: 0.9 },
    { url: `${baseUrl}/calendar`,            lastModified, changeFrequency: "daily",   priority: 0.8 },
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

  const [countryRoutes, chapterRoutes] = await Promise.all([
    getCountryUrls(lastModified),
    getChapterUrls(lastModified),
  ]);
  return [...staticRoutes, ...countryRoutes, ...chapterRoutes];
}
