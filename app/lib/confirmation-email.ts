// app/lib/confirmation-email.ts
//
// The confirmation email, in ONE place. Both the first send (/api/unlock) and
// the retry job (/api/retry-confirmations) import from here.
//
// Why it is shared rather than copied: the retry sends the same message to the
// same person, days later. Two copies of this template would drift, and the
// drift would be invisible -- nobody reads their own confirmation email twice.

import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { SITE_URL } from "./unlock-config";

const FROM = "Tariff Tracker <confirm@send.tarifftracker.org>";
const REPLY_TO = "contact@tarifftracker.org";

/** 32 random bytes, base64url. Only ever held in memory -- the table stores
 *  the sha256 hash, so a database leak cannot be used to verify addresses. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Best-effort send. Returns true only on a confirmed 2xx.
 *
 * A failure must NOT fail the caller: in /api/unlock the row is already
 * captured and the soft unlock already granted, and in the retry job a failure
 * simply leaves the row in the backlog for tomorrow. Either way confirm_sent_at
 * stays null, which is what makes the backlog queryable.
 */
export async function sendConfirmation(
  email: string,
  token: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("confirmation-email: RESEND_API_KEY missing");
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
      console.error("confirmation-email: resend returned", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("confirmation-email: resend request failed", e);
    return false;
  }
}
