-- ===========================================================================
-- country_chapter_duties — per-country, per-HTS-chapter cumulative calculated
-- duties since Jan 2025. Powers the "Top Product Categories" panel on the
-- /country/[slug] profile pages (Phase 3.65, tool #2).
--
-- Mirrors the existing trade_imports-derived materialized views
-- (chapter_duties_monthly, country_total_duties, code_monthly_duties).
-- Run this once in the Supabase SQL editor.
-- ===========================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS country_chapter_duties AS
SELECT
  country_code,
  substring(hts_code, 1, 2) AS chapter,
  SUM(calculated_duties)    AS total_duties
FROM trade_imports
GROUP BY country_code, substring(hts_code, 1, 2);

-- Unique index is REQUIRED for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS country_chapter_duties_pk
  ON country_chapter_duties (country_code, chapter);

-- Supports the per-country lookup + "ORDER BY total_duties DESC LIMIT 10".
CREATE INDEX IF NOT EXISTS country_chapter_duties_country
  ON country_chapter_duties (country_code, total_duties DESC);

-- Materialized views don't support security_invoker; rely on the grant.
GRANT SELECT ON country_chapter_duties TO anon, authenticated;


-- ===========================================================================
-- Add the new view to the refresh function that runs after each Census ingest
-- (scripts/fetch_census_trade.py calls this via RPC). This REPLACES the
-- existing function with the same body plus the new CONCURRENTLY refresh.
--
-- NOTE: the service_role statement_timeout was already raised to 15min for the
-- existing 4-view refresh; a 5th view stays well under that. If a future
-- timeout (Postgres error 57014) appears, re-apply:
--   ALTER ROLE service_role SET statement_timeout = '15min';
--   NOTIFY pgrst, 'reload config';
-- ===========================================================================

CREATE OR REPLACE FUNCTION refresh_trade_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY chapter_duties_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY hts_total_duties;
  REFRESH MATERIALIZED VIEW CONCURRENTLY country_total_duties;
  REFRESH MATERIALIZED VIEW CONCURRENTLY code_monthly_duties;
  REFRESH MATERIALIZED VIEW CONCURRENTLY country_chapter_duties;
END;
$$;
