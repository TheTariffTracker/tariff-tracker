-- federal_outlays — total federal OUTLAYS time series from MTS Table 5.
--
-- One row per monthly MTS publication (record_date), holding the grand-total
-- "Total Outlays" line: current-month net outlays + current/prior fiscal-year-
-- to-date net outlays. Populated by scripts/fetch_mts_outlays.py.
--
-- This is the spending denominator for the "1912 vs Today" tool:
--   * Panel 3 (trailing 12 months) = SUM of last 12 current_month_net_outly_amt
--   * Panel 2 (fiscal year)        = current_fytd_net_outly_amt at FY close
--
-- Parallel in shape to federal_receipts. PK is record_date (the receipts table
-- needs a composite PK because it stores ~57 category rows per date; here we
-- keep only the single total line, so record_date alone is unique).
--
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS federal_outlays (
  record_date                     DATE PRIMARY KEY,
  classification_desc             TEXT,
  current_month_gross_outly_amt   NUMERIC,
  current_month_app_rcpt_amt      NUMERIC,
  current_month_net_outly_amt     NUMERIC,
  current_fytd_gross_outly_amt    NUMERIC,
  current_fytd_app_rcpt_amt       NUMERIC,
  current_fytd_net_outly_amt      NUMERIC,
  prior_fytd_gross_outly_amt      NUMERIC,
  prior_fytd_app_rcpt_amt         NUMERIC,
  prior_fytd_net_outly_amt        NUMERIC,
  raw_data                        JSONB,
  updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: anon key may read, nothing else. Service role (the fetcher) bypasses
-- RLS. Matches the policy on every other public data table in the project.
ALTER TABLE federal_outlays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON federal_outlays
  FOR SELECT USING (true);

GRANT SELECT ON federal_outlays TO anon, authenticated;

-- Supabase stops auto-granting Data API access to new public-schema tables
-- on 2026-10-30. Without this, a fresh run of this script produces a table
-- the Python fetcher cannot write to (PostgREST upserts fail with
-- permission denied). Added 2026-10-17.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.federal_outlays TO service_role;

-- Reload PostgREST's schema cache so the new table is queryable via the API
-- immediately. (Was missing from this script; added 2026-10-17.)
NOTIFY pgrst, 'reload schema';
