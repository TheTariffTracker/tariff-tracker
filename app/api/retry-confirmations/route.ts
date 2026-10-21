// app/api/retry-confirmations/route.ts
//
// GET /api/retry-confirmations -- drains the confirmation-email backlog.
//
// A row with verified = false AND confirm_sent_at IS NULL is someone who
// signed up but never received their confirmation link: either Resend failed,
// or the global 80/day send cap was already spent when they submitted. Until
// this job existed, those rows sat there forever and the person simply never
// got in. Nothing surfaced it, because /api/unlock deliberately returns 200 in
// that case -- the row is captured and the site is soft-unlocked either way.
//
// Triggered daily by Vercel Cron (vercel.json). Hobby plans allow one run per
// day with up to an hour of timing drift, which is fine for a backlog drain.
//
// AUTH: requires CRON_SECRET. Vercel Cron sends it as a Bearer token
// automatically when the env var is set. Without this the endpoint would let
// anyone burn the Resend quota and re-mail people at will.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import { rateLimitHit } from "../../lib/rate-limit";
import { RATE_LIMITS } from "../../lib/unlock-config";
import {
  newToken,
  sendConfirmation,
  sha256,
} from "../../lib/confirmation-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Three independent brakes, because the ceiling that matters is whichever is
// hit first:
//   BATCH_MAX     -- never work through an unbounded backlog in one request
//   TIME_BUDGET   -- stop well inside maxDuration whatever the batch costs
//   the quota     -- the same global cap /api/unlock respects
const BATCH_MAX = 25;
const TIME_BUDGET_MS = 9_000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("retry-confirmations: CRON_SECRET not set; refusing to run");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from("lead_capture")
    .select("email")
    .eq("verified", false)
    .is("confirm_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_MAX);

  if (error) {
    console.error("retry-confirmations: backlog query failed", error);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }

  const backlog = rows ?? [];
  let attempted = 0;
  let sent = 0;
  let stoppedBy: "none" | "quota" | "time" = "none";

  for (const row of backlog) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      stoppedBy = "time";
      break;
    }

    // Consumes a unit of the same daily allowance /api/unlock draws from, so
    // a retry run can never crowd out live signups past the cap. Fails CLOSED
    // on a null (limiter unreachable): burning the Resend quota is worse than
    // a backlog waiting another day.
    const hits = await rateLimitHit(
      "unlock:send:global:day",
      RATE_LIMITS.globalSendDay.windowSeconds,
    );
    if (hits === null || hits > RATE_LIMITS.globalSendDay.max) {
      stoppedBy = "quota";
      break;
    }

    attempted += 1;

    // A fresh token every time: the original raw token only ever existed in
    // memory during the request that failed, and the table holds its hash.
    // Writing the hash BEFORE sending means a link that arrives always has a
    // row that will accept it.
    const token = newToken();
    const { error: hashError } = await admin
      .from("lead_capture")
      .update({ confirm_token_hash: sha256(token) })
      .eq("email", row.email);
    if (hashError) {
      console.error("retry-confirmations: token update failed", hashError);
      continue;
    }

    const ok = await sendConfirmation(row.email, token);
    if (!ok) {
      // Leave confirm_sent_at null so the row stays in the backlog.
      continue;
    }

    const { error: stampError } = await admin
      .from("lead_capture")
      .update({ confirm_sent_at: new Date().toISOString() })
      .eq("email", row.email);
    if (stampError) {
      // Sent but unstamped: the person gets a duplicate next run. Annoying,
      // and strictly better than never getting one at all.
      console.error("retry-confirmations: confirm_sent_at stamp failed", stampError);
    }
    sent += 1;
  }

  // Remaining backlog AFTER this run. Logged every time -- a backlog that is
  // not shrinking is the failure mode nobody would otherwise notice, and
  // console output ships to Sentry.
  const { count: remaining } = await admin
    .from("lead_capture")
    .select("id", { count: "exact", head: true })
    .eq("verified", false)
    .is("confirm_sent_at", null);

  const summary = {
    attempted,
    sent,
    remaining: remaining ?? null,
    stoppedBy,
    ms: Date.now() - started,
  };
  console.log("retry-confirmations:", JSON.stringify(summary));
  return NextResponse.json({ ok: true, ...summary });
}
