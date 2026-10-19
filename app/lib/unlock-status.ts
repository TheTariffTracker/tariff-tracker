// app/lib/unlock-status.ts
//
// Server-side answer to "what is this visitor allowed to see?"
//
// Decision 1d has two tiers behind one modal:
//   - submit  -> tt_unlock cookie set, row written. Soft unlock, SITE-WIDE.
//   - confirm -> verified = true. Releases the calculator's Yale block.
//
// So cookie presence alone is NOT sufficient for gated content; the row's
// verified flag has to be read. The cookie is HttpOnly and server-set, but it
// is still a value the client holds, so it is treated as a lookup key and
// never as a claim about its own permissions.
//
// This must use getSupabaseAdmin(): lead_capture has RLS enabled with zero policies
// and no anon grants (it is the one private table on the site), so the anon
// client cannot read it. That is deliberate, not an oversight.

import "server-only";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { COOKIE_NAME } from "./unlock-config";

export type UnlockStatus = {
  // Row found and confirmed -> show gated content.
  verified: boolean;
  // Row found but not confirmed -> show the "check your email" state.
  awaitingConfirmation: boolean;
  // Lookup itself failed. Callers should render a neutral "temporarily
  // unavailable" state rather than the gate: telling an already-confirmed
  // person to go check their email during a database hiccup is worse than
  // saying nothing, and it would push them into a pointless resend.
  error: boolean;
};

const ANONYMOUS: UnlockStatus = {
  verified: false,
  awaitingConfirmation: false,
  error: false,
};

const LOOKUP_FAILED: UnlockStatus = {
  verified: false,
  awaitingConfirmation: false,
  error: true,
};

export async function getUnlockStatus(): Promise<UnlockStatus> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return ANONYMOUS;

  // Everything below is wrapped because getSupabaseAdmin() THROWS when the
  // service-role env var is missing. Without this catch, a misconfigured
  // environment would take down the entire calculator page instead of just
  // the one panel this gate controls.
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("lead_capture")
      .select("verified")
      .eq("unlock_token", token)
      .maybeSingle();

    if (error) {
      console.error("unlock-status: lookup failed", {
        message: (error as { message?: string })?.message,
        code: (error as { code?: string })?.code,
      });
      return LOOKUP_FAILED;
    }

    // No row for this token: a stale cookie from a deleted row, or a forged
    // one. Either way the visitor is anonymous, not "awaiting confirmation".
    if (!data) return ANONYMOUS;

    const verified = data.verified === true;
    return { verified, awaitingConfirmation: !verified, error: false };
  } catch (e) {
    // Logged, not swallowed: console output ships to Sentry, so a missing key
    // or an unreachable database still surfaces rather than going quiet.
    console.error("unlock-status: client unavailable", (e as Error).message);
    return LOOKUP_FAILED;
  }
}
