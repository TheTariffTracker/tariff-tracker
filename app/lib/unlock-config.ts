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
