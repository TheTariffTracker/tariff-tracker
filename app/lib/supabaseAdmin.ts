// app/lib/supabaseAdmin.ts
//
// Server-only Supabase client using the SERVICE_ROLE key, which bypasses RLS.
// This exists for exactly one reason: `lead_capture` is the project's only
// private table (RLS on, zero policies, no anon/authenticated grants), so the
// ordinary anon client in ./supabase.ts cannot touch it.
//
// ** NEVER import this from a client component, and never rename the env var
// to NEXT_PUBLIC_*. ** Next.js inlines every NEXT_PUBLIC_* value into the
// browser bundle; this key bypasses RLS on every table, so leaking it would
// expose the full email list to anyone who views source.
//
// The `server-only` import below turns that mistake into a BUILD failure
// rather than a silent production leak.
//
// WHY THIS IS A FUNCTION AND NOT A MODULE-LEVEL CONST:
// it used to construct the client (and throw on missing env vars) at import
// time. That was fine while only API routes imported it -- a missing key meant
// a 500 on a route nobody had called yet. But app/calculator/page.tsx now
// imports it indirectly via ./unlock-status, and an import-time throw there
// takes down the WHOLE calculator page over one env var that only gates a
// single panel. Constructing on first use keeps the failure contained: the
// caller catches it and degrades that panel. The throw is NOT softened -- it
// still fires, still names the missing variable, and still reaches Sentry
// through console logging, so a misconfigured deploy is not silent.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env vars. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (local) and Vercel project settings (prod/preview). SUPABASE_SERVICE_ROLE_KEY must NOT carry a NEXT_PUBLIC_ prefix.",
    );
  }

  // No session persistence or token refresh: this client is used from
  // stateless route handlers and server components, never on behalf of an
  // end user.
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
