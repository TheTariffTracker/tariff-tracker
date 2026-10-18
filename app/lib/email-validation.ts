// app/lib/email-validation.ts
//
// Submit-time email validation for the Phase 3.7 unlock gate: syntax, a
// disposable-domain blocklist, and an MX check. Deliberately NOT a whitelist --
// a domain allowlist would block the best leads (.edu, newsrooms, corporate)
// and stops no determined faker.
//
// Server-only: depends on node:dns, which has no Edge-runtime equivalent.

import "server-only";
import { promises as dns } from "node:dns";

// Pragmatic, not RFC 5322. Rejects the obviously-malformed without failing
// legitimate-but-unusual addresses.
const SYNTAX_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const MAX_TOTAL = 254; // RFC 5321 path limit
const MAX_LOCAL = 64;

const MX_TIMEOUT_MS = 2500;

// Throwaway/self-destructing inbox providers. NOTE: aliasing/forwarding
// services (SimpleLogin, AnonAddy, Firefox Relay, Apple Hide My Email) are
// deliberately NOT here. Those are real people who read their mail and are
// disproportionately the privacy-conscious, technically literate audience this
// site wants. Blocking them would be self-defeating.
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "discard.email",
  "dispostable.com",
  "einrot.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "inboxkitten.com",
  "jetable.org",
  "mail-temporaire.fr",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.org",
  "tempmail.com",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export type EmailCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "syntax" | "disposable" | "no-mail-server" };

/**
 * Does this domain accept mail?
 *
 * FAIL-OPEN ON ERRORS, FAIL-CLOSED ON DEFINITIVE NEGATIVES. A DNS timeout or
 * SERVFAIL is our problem, not the user's, and must not cost a real signup --
 * the confirmation email is the actual verification anyway, so a bad address
 * simply never confirms. But ENOTFOUND means the domain does not exist, which
 * is a real answer and worth rejecting at submit time.
 *
 * ENODATA (domain exists, no MX record) is NOT conclusive: RFC 5321 allows an
 * implicit MX via the A/AAAA record, and small self-hosted domains rely on it.
 * So we fall back to an address lookup before rejecting.
 */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("dns-timeout")), MX_TIMEOUT_MS),
      ),
    ]);

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    return Array.isArray(mx) && mx.length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;

    if (code === "ENOTFOUND") return false; // domain does not exist

    if (code === "ENODATA") {
      // No MX, but an A/AAAA record still implies a mail host.
      try {
        const addrs = await withTimeout(dns.lookup(domain, { all: true }));
        return Array.isArray(addrs) && addrs.length > 0;
      } catch {
        return false;
      }
    }

    return true; // timeout, SERVFAIL, anything else -> fail open
  }
}

/** Trim + lowercase, then run syntax, blocklist and MX checks in that order. */
export async function validateEmail(raw: string): Promise<EmailCheck> {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (email.length > MAX_TOTAL || !SYNTAX_RE.test(email)) {
    return { ok: false, reason: "syntax" };
  }

  const atIndex = email.lastIndexOf("@");
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);

  if (local.length === 0 || local.length > MAX_LOCAL) {
    return { ok: false, reason: "syntax" };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "disposable" };
  }

  if (!(await domainAcceptsMail(domain))) {
    return { ok: false, reason: "no-mail-server" };
  }

  return { ok: true, email };
}
