// app/api/rate/route.ts
//
// Rate lookup API: GET /api/rate?hts10=<6-10 digits>&country=<census code>&date=<YYYY-MM-DD>
// Returns the effective tariff-rate breakdown for that HTS-10 × country on that
// date (date defaults to today), from the merged Yale rate panel in Storage.
// Thin wrapper over app/lib/rate-panel.ts.
//
// Caching: a (hts10, country, date) answer is IMMUTABLE for a given vintage, so
// successful responses carry a long s-maxage — Vercel's edge CDN then serves
// repeat lookups without invoking the function, which is what removes the
// ~0.5s warm-lookup latency for anything queried more than once.

import { NextRequest, NextResponse } from "next/server";
import { lookupRate } from "../../lib/rate-panel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HTS_RE = /^\d{6,10}$/;
const COUNTRY_RE = /^\d{3,4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Edge-cache successful answers: immutable per vintage. s-maxage = CDN TTL;
// stale-while-revalidate lets the edge serve a slightly-stale answer instantly
// while refreshing in the background. Vintages update infrequently (~weekly),
// so an hour of hard TTL + a day of SWR is safe and keeps repeats instant.
const CACHE_OK = "public, s-maxage=3600, stale-while-revalidate=86400";
const CACHE_NONE = "no-store";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const hts10 = (sp.get("hts10") || "").replace(/\./g, "");
  const country = sp.get("country") || "";
  const date = sp.get("date") || undefined;

  if (!HTS_RE.test(hts10)) {
    return NextResponse.json(
      { error: "hts10 must be 6-10 digits (dots allowed)" },
      { status: 400, headers: { "Cache-Control": CACHE_NONE } });
  }
  if (!COUNTRY_RE.test(country)) {
    return NextResponse.json(
      { error: "country must be a 3-4 digit Census code" },
      { status: 400, headers: { "Cache-Control": CACHE_NONE } });
  }
  if (date !== undefined && !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400, headers: { "Cache-Control": CACHE_NONE } });
  }

  try {
    const result = await lookupRate(hts10, country, date);
    // Both found and not-found are immutable per vintage → cacheable.
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": CACHE_OK },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "lookup failed", detail: String((e as Error).message) },
      { status: 500, headers: { "Cache-Control": CACHE_NONE } });
  }
}
