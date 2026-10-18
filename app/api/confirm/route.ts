// app/api/confirm/route.ts
//
// GET /api/confirm?token=... -- the click target of the confirmation email.
// Sets verified = true, which is what unlocks the calculator's Yale
// decomposition panel (Decision 1), and (re)sets the unlock cookie on
// whatever device opened the link.
//
// KNOWN LIMITATION (v1): if someone submits on desktop and opens the link on
// their phone, only the phone ends up holding the cookie. The desktop tab has
// to be refreshed. Closing that gap needs a pending-token poll on the
// submitting device, which belongs with the modal work, not here.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { COOKIE_NAME, COOKIE_MAX_AGE } from "../../lib/unlock-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANDING = "/calculator";

function redirect(req: NextRequest, status: string) {
  return NextResponse.redirect(
    new URL(`${LANDING}?confirm=${status}`, req.nextUrl.origin),
  );
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return redirect(req, "invalid");

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: row, error } = await supabaseAdmin
    .from("lead_capture")
    .select("email, unlock_token, verified")
    .eq("confirm_token_hash", tokenHash)
    .single();

  if (error || !row) {
    // Already-used tokens land here too: confirm_token_hash is cleared on
    // success, so a second click on the same link is indistinguishable from
    // a bad one. Both get the same neutral answer.
    return redirect(req, "invalid");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("lead_capture")
    .update({
      verified: true,
      verified_at: row.verified ? undefined : now,
      confirm_token_hash: null, // single use
      last_seen_at: now,
    })
    .eq("email", row.email);

  if (updateError) {
    console.error("confirm: update failed", updateError);
    return redirect(req, "error");
  }

  const res = redirect(req, "ok");
  res.cookies.set({
    name: COOKIE_NAME,
    value: row.unlock_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
