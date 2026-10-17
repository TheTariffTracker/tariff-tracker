-- ===========================================================================
-- lead_capture -- Phase 3.7 gated-access signups (email + 3-question survey).
-- Written ONLY by the Next.js API route using the service_role key.
--
-- ** THIS TABLE IS NOT PUBLICLY READABLE. **
-- Every other table in this project is public-read. This one holds email
-- addresses, so RLS is enabled with NO policies and there are NO grants to
-- anon/authenticated. Do not add a "Public read" policy here.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS lead_capture (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT NOT NULL UNIQUE,
  email_domain             TEXT GENERATED ALWAYS AS (split_part(email, '@', 2)) STORED,

  -- Survey (Decision 2, locked 2026-10-17). survey_version MUST be bumped
  -- whenever a question or option list changes, or old rows become
  -- un-aggregatable with new ones.
  survey_version           INTEGER NOT NULL DEFAULT 1,
  segment                  TEXT,          -- Q1 "Which best describes you?"
  use_case                 TEXT,          -- Q2 "What brings you to Tariff Tracker?"
  improvement_note         TEXT,          -- Q3 optional free text

  -- Unlock state (Decision 1). Submitting soft-unlocks the whole site;
  -- clicking the emailed confirm link sets verified=true, which is what
  -- unlocks the calculator's Yale decomposition panel.
  unlock_token             TEXT NOT NULL UNIQUE,  -- value carried in the HttpOnly cookie
  verified                 BOOLEAN NOT NULL DEFAULT false,
  verified_at              TIMESTAMPTZ,
  confirm_token_hash       TEXT UNIQUE,           -- sha256 of the emailed token, never the token
  confirm_sent_at          TIMESTAMPTZ,

  -- Consent. partner_opt_in is a separate UNCHECKED checkbox at signup.
  -- project_updates_opt_out defaults false because US CAN-SPAM is an
  -- opt-out regime -- everyone is reachable for project notices until
  -- they opt out, per the 2026-10-17 no-broadcast resolution.
  partner_opt_in           BOOLEAN NOT NULL DEFAULT false,
  partner_consent_at       TIMESTAMPTZ,
  consent_text_version     TEXT,          -- id of the exact checkbox wording shown
  project_updates_opt_out  BOOLEAN NOT NULL DEFAULT false,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now()  -- slides the cookie window
);

-- RLS on, deliberately with NO policies: anon and authenticated get nothing.
-- service_role bypasses RLS entirely, which is how the API route writes.
ALTER TABLE lead_capture ENABLE ROW LEVEL SECURITY;

-- No grants to anon/authenticated -- intentional, see header.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_capture TO service_role;

-- Supabase auto-granted anon/authenticated access to new public-schema
-- tables until 2026-10-30. Granting nothing is NOT enough on its own --
-- the platform adds it anyway. Revoke explicitly so this script
-- reproduces a locked-down table on any database, before or after the
-- cutoff. Verified 2026-10-17 on the live project: the auto-grant DID
-- fire -- anon came back with SELECT and INSERT despite no grant here.
REVOKE ALL ON public.lead_capture FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS lead_capture_created
  ON lead_capture (created_at DESC);
CREATE INDEX IF NOT EXISTS lead_capture_verified
  ON lead_capture (verified);
CREATE INDEX IF NOT EXISTS lead_capture_partner_optin
  ON lead_capture (partner_opt_in) WHERE partner_opt_in = true;

NOTIFY pgrst, 'reload schema';
