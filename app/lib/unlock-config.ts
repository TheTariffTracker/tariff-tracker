// app/lib/unlock-config.ts
//
// Shared constants for the Phase 3.7 unlock gate. Imported by the API routes
// and (later) by the signup modal, so the stored values and the rendered
// options can never drift apart.

export const SITE_URL = "https://tarifftracker.org";

// Server-set, HttpOnly. SameSite=Lax is REQUIRED, not a preference: clicking
// the confirmation link in an email is a cross-site navigation, and Strict
// withholds cookies on those, which would silently half-break the flow.
export const COOKIE_NAME = "tt_unlock";
export const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 365 days, Decision 3

// Bump whenever a question or option list changes, so older rows stay
// aggregatable rather than silently mixing with incompatible answers.
export const SURVEY_VERSION = 1;

// Identifies the exact partner-opt-in checkbox wording a person agreed to.
// Bump when that copy changes; the wording itself lives with the modal.
export const CONSENT_TEXT_VERSION = "partner-optin-v1";

export const MAX_NOTE_LENGTH = 500;

// IMPLEMENTS A PUBLISHED PROMISE. app/privacy/page.tsx states, under "How long
// we keep it": "Unconfirmed sign-ups: if an address never confirms, we delete
// the record after 90 days." Drained daily by /api/retry-confirmations.
// If this number changes, the privacy policy text must change with it --
// nothing enforces that link but this comment.
export const UNCONFIRMED_RETENTION_DAYS = 90;

// Two limits with DELIBERATELY DIFFERENT failure modes.
//
// Per-IP is abuse control: breaching it is rejected outright (429).
//
// The global cap protects the thing actually at risk -- the Resend quota and
// the sending reputation of send.tarifftracker.org, both of which are global
// and so are untouched by any per-IP limit when an attacker spreads across
// many addresses. Breaching it does NOT reject the visitor: the row and survey
// are still captured and the site still unlocks, only the confirmation email
// is deferred to the retry backlog (confirm_sent_at stays null). Rejecting
// signup #81 during a traffic spike would throw away the exact leads this
// system exists to collect.
//
// 80/day leaves ~20 of Resend's free 100 as headroom for that backlog.
export const RATE_LIMITS = {
  ipHour: { windowSeconds: 3600, max: 5 },
  ipDay: { windowSeconds: 86400, max: 15 },
  globalSendDay: { windowSeconds: 86400, max: 80 },
} as const;

// Stored values are stable slugs, never display text, so rewording a label
// does not change what is already in the table.
export const SEGMENTS = [
  "importer_business",
  "trade_attorney_broker",
  "journalist",
  "researcher_academic_student",
  "government_policy",
  "financial_analyst",
  "citizen",
  "other",
] as const;

export const USE_CASES = [
  "specific_product_rates",
  "research_writing",
  "professional_client_work",
  "following_policy",
  "general_interest",
  "other",
] as const;

export type Segment = (typeof SEGMENTS)[number];
export type UseCase = (typeof USE_CASES)[number];
