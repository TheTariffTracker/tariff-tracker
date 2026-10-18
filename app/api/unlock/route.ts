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
import { randomBytes, createHash } from "node:crypto";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { validateEmail } from "../../lib/email-validation";
import {
  COOKIE_NAME,
  COOKIE_MAX_AGE,
  CONSENT_TEXT_VERSION,
  MAX_NOTE_LENGTH,
  SEGMENTS,
  SITE_URL,
  SURVEY_VERSION,
  USE_CASES,
} from "../../lib/unlock-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4096;
const FROM = "Tariff Tracker <confirm@send.tarifftracker.org>";
const REPLY_TO = "contact@tarifftracker.org";

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Best-effort send. Returns true only on a confirmed 2xx.
 *
 * A failure here must NOT fail the request: the row is already captured and
 * the soft unlock already granted. confirm_sent_at stays null, which is the
 * queryable backlog a retry job drains -- important because Resend's free tier
 * caps at 100/day and that cap bites hardest on a traffic-spike day.
 */
async function sendConfirmation(email: string, token: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("unlock: RESEND_API_KEY missing");
    return false;
  }

  const url = `${SITE_URL}/api/confirm?token=${encodeURIComponent(token)}`;
  const html = [
    "<p>Thanks for signing up to Tariff Tracker.</p>",
    `<p><a href="${url}">Confirm your email address</a> to unlock the full effective-rate breakdown on the rate calculator.</p>`,
    `<p>If the link doesn't work, paste this into your browser:<br>${url}</p>`,
    "<p>If you didn't request this, you can ignore this message and nothing further will happen.</p>",
  ].join("");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject: "Confirm your email - Tariff Tracker",
        html,
      }),
    });
    if (!res.ok) {
      console.error("unlock: resend returned", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("unlock: resend request failed", e);
    return false;
  }
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

  const { error: insertError } = await supabaseAdmin
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
    const { data: existing, error: selectError } = await supabaseAdmin
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

    const { error: updateError } = await supabaseAdmin
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
  if (sendTo) {
    const sent = await sendConfirmation(sendTo, sendToken);
    if (sent) {
      await supabaseAdmin
        .from("lead_capture")
        .update({ confirm_sent_at: new Date().toISOString() })
        .eq("email", email);
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
