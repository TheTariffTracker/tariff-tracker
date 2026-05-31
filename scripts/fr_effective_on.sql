-- ===========================================================================
-- Tariff Calendar (Phase 3.65, tool #4) — expose Federal Register effective
-- dates for querying.
--
-- The fetcher now writes a decoupled `effective_on` value (see
-- scripts/fetch_federal_register.py, fetch_effective_dates). This DDL adds the
-- column it writes to, indexes it, and recreates the agency-filtered view so
-- the calendar can read it. Run once in the Supabase SQL editor BEFORE the
-- backfill (the upsert writes the column, so it must exist first).
-- ===========================================================================

-- 1. Additive, nullable column — safe, no impact on existing rows/queries.
ALTER TABLE federal_register_alerts
  ADD COLUMN IF NOT EXISTS effective_on DATE;

-- 2. Index for the calendar's date-range / ordering queries.
CREATE INDEX IF NOT EXISTS fr_alerts_effective_on
  ON federal_register_alerts (effective_on);

-- 3. Recreate the agency-filtered view with effective_on appended at the END
--    of the column list (existing columns unchanged, so the dependent
--    adcvd_fr_alerts view stays valid). security_invoker=true preserved.
CREATE OR REPLACE VIEW tariff_fr_alerts WITH (security_invoker = true) AS
 SELECT document_number,
    title,
    publication_date,
    document_type,
    abstract,
    html_url,
    keywords_matched,
    raw_data,
    is_active_tariff,
    effective_on
   FROM federal_register_alerts
  WHERE (EXISTS ( SELECT 1
           FROM jsonb_array_elements(federal_register_alerts.raw_data -> 'agencies'::text) agency(value)
          WHERE (agency.value ->> 'slug'::text) = ANY (ARRAY['trade-representative-office-of-united-states'::text, 'international-trade-administration'::text, 'international-trade-commission'::text, 'u-s-customs-and-border-protection'::text, 'foreign-trade-zones-board'::text, 'bureau-of-industry-and-security'::text])));

-- 4. Reload PostgREST's schema cache so the new column is queryable via the API.
NOTIFY pgrst, 'reload schema';
