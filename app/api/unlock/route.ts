// app/api/unlock/route.ts
//
// POST /api/unlock -- the Phase 3.7 gate. Takes an email plus three survey
// answers, writes one lead_capture row, and sets the HttpOnly unlock cookie
// that soft-unlocks the whole site immediately (Decision 1).
//
// The browser never touches lead_capture directly: that table has no anon
// grants, and only a server route can set an HttpOnly cookie anyway.
//
// A confirmation email is sent best-effort. Its click is what sets
// verified = true, which is what unlocks the calculator's Yale decomposition.
//
// ** KILL SWITCH: disabled unless UNLOCK_ENABLED=1. ** This endpoint is public
// and unauthenticated, and every accepted request makes OUR domain send mail to
// an address the caller chose. Unthrottled, that burns the 100/day Resend quota
// in seconds and parks spam complaints on send.tarifftracker.org -- which, with
// DMARC p=reject and DKIM as the single point of failure, takes all sending
// down. Leave it off until rate limiting exists. Being unlinked is not
// protection; endpoints get found.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import {
  newToken,
  sendConfirmation,
  sha256,
} from "../../lib/confirmation-email";
import { validateEmail } from "../../lib/email-validation";
import { rateLimitHit } from "../../lib/rate-limit";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  CONSENT_TEXT_VERSION,
  MAX_NOTE_LENGTH,
  RATE_LIMITS,
  SEGMENTS,
  SITE_URL,
  SURVEY_VERSION,
  USE_CASES,
} from "../../lib/unlock-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4096;

/**
 * Client IP as Vercel's edge reports it. x-forwarded-for is a header and so is
 * spoofable in principle; the global send cap is the backstop that does not
 * depend on getting this right. Requests with no usable header share one
 * "unknown" bucket, which is the conservative behaviour.
 */
function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  // ---- kill switch (see header) -----------------------------------------
  // Checked before any work, so a disabled endpoint costs nothing. Note that
  // /api/confirm is deliberately NOT gated: it already requires a 32-byte
  // token that must exist in the table, and gating it would break links
  // sitting in people's inboxes if this flag were ever switched back off.
  if (process.env.UNLOCK_ENABLED !== "1") {
    return NextResponse.json({ error: "unlock is not enabled" }, { status: 503 });
  }

  // ---- per-IP rate limit ------------------------------------------------
  // Checked before parsing or validating, so a flood costs one DB call each
  // rather than an MX lookup each. FAILS OPEN if the limiter is unreachable:
  // a Supabase hiccup must not block real signups, and the global send cap
  // below still protects the quota.
  const ip = clientIp(req);
  const [perHour, perDay] = await Promise.all([
    rateLimitHit(`unlock:ip:${ip}:hour`, RATE_LIMITS.ipHour.windowSeconds),
    rateLimitHit(`unlock:ip:${ip}:day`, RATE_LIMITS.ipDay.windowSeconds),
  ]);
  const overHour = perHour !== null && perHour > RATE_LIMITS.ipHour.max;
  const overDay = perDay !== null && perDay > RATE_LIMITS.ipDay.max;
  if (overHour || overDay) {
    return NextResponse.json(
      { error: "too many attempts" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  // ---- parse + bound the body -------------------------------------------
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // ---- validate ----------------------------------------------------------
  const check = await validateEmail(String(body.email ?? ""));
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: 400 });
  }
  const email = check.email;

  // Survey answers are bounded to known slugs so a public write endpoint
  // cannot fill the table with arbitrary strings.
  const segment = SEGMENTS.includes(body.segment as never)
    ? (body.segment as string)
    : null;
  const useCase = USE_CASES.includes(body.use_case as never)
    ? (body.use_case as string)
    : null;
  const note =
    typeof body.improvement_note === "string" && body.improvement_note.trim()
      ? body.improvement_note.trim().slice(0, MAX_NOTE_LENGTH)
      : null;
  const partnerOptIn = body.partner_opt_in === true;
  const now = new Date().toISOString();

  // ---- insert, or reconcile with an existing row -------------------------
  const unlockToken = newToken();
  const confirmToken = newToken();

  let finalUnlockToken = unlockToken;
  let verified = false;
  let sendTo: string | null = email;
  let sendToken = confirmToken;

  const { error: insertError } = await getSupabaseAdmin()
    .from("lead_capture")
    .insert({
      email,
      survey_version: SURVEY_VERSION,
      segment,
      use_case: useCase,
      improvement_note: note,
      unlock_token: unlockToken,
      confirm_token_hash: sha256(confirmToken),
      partner_opt_in: partnerOptIn,
      partner_consent_at: partnerOptIn ? now : null,
      consent_text_version: partnerOptIn ? CONSENT_TEXT_VERSION : null,
    });

  if (insertError && insertError.code === "23505") {
    // Already known. Decision 1: one row per person, survey asked once, never
    // re-prompt. So refresh their session WITHOUT overwriting earlier answers.
    const { data: existing, error: selectError } = await getSupabaseAdmin()
      .from("lead_capture")
      .select("unlock_token, verified")
      .eq("email", email)
      .single();

    if (selectError || !existing) {
      console.error("unlock: conflict but no row found", selectError);
      return NextResponse.json({ error: "server error" }, { status: 500 });
    }

    finalUnlockToken = existing.unlock_token;
    verified = existing.verified === true;

    const patch: Record<string, unknown> = { last_seen_at: now };
    if (verified) {
      // Nothing to confirm; don't send another email.
      sendTo = null;
    } else {
      // Still unconfirmed -- issue a fresh token so the new link works.
      patch.confirm_token_hash = sha256(confirmToken);
      sendToken = confirmToken;
    }

    const { error: updateError } = await getSupabaseAdmin()
      .from("lead_capture")
      .update(patch)
      .eq("email", email);
    if (updateError) {
      console.error("unlock: last_seen_at update failed", updateError);
    }
  } else if (insertError) {
    console.error("unlock: insert failed", insertError);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }

  // ---- confirmation email (best effort, never fails the request) ---------
  // Unlike the per-IP check, the global cap FAILS CLOSED: if we cannot confirm
  // we are under 80 sends today, we don't send. The cost of being wrong in the
  // other direction is a burned quota and spam complaints against the sending
  // domain, which under DMARC p=reject takes all mail down.
  //
  // Either way the visitor is already unlocked and their row is already saved;
  // confirm_sent_at simply stays null for the retry job to pick up.
  if (sendTo) {
    const sendsToday = await rateLimitHit(
      "unlock:send:global:day",
      RATE_LIMITS.globalSendDay.windowSeconds,
    );
    const underCap =
      sendsToday !== null && sendsToday <= RATE_LIMITS.globalSendDay.max;

    if (!underCap) {
      console.warn(
        "unlock: global daily send cap reached or limiter unavailable; row captured, confirmation deferred",
        { sendsToday },
      );
    } else {
      const sent = await sendConfirmation(sendTo, sendToken);
      if (sent) {
        await getSupabaseAdmin()
          .from("lead_capture")
          .update({ confirm_sent_at: new Date().toISOString() })
          .eq("email", email);
      }
    }
  }

  // ---- soft unlock -------------------------------------------------------
  const res = NextResponse.json({ ok: true, verified });
  res.cookies.set({
    name: COOKIE_NAME,
    value: finalUnlockToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
