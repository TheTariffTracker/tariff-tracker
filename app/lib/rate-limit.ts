// app/lib/rate-limit.ts
//
// Thin wrapper over the rate_limit_hit() Postgres function (scripts/rate_limit.sql).
//
// The counting lives in the database on purpose: this runs in serverless
// functions that can execute concurrently, and a read-then-write in JS would
// race itself under exactly the load a rate limiter exists to handle.

import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Record one hit against `bucket` and return the count INCLUDING it.
 * Returns null if the limiter itself is unavailable -- callers decide whether
 * that means allow or deny, because the right answer differs per call site.
 */
export async function rateLimitHit(
  bucket: string,
  windowSeconds: number,
): Promise<number | null> {
  const { data, error } = await supabaseAdmin.rpc("rate_limit_hit", {
    p_bucket: bucket,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("rate-limit: rpc failed", bucket, error);
    return null;
  }
  return typeof data === "number" ? data : null;
}
