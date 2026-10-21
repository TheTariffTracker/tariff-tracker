-- dts_cbp_withdrawals.sql
--
-- Adds the CBP withdrawals side of the Daily Treasury Statement to dts_daily,
-- so the site's provisional tariff figure can be reported NET of refunds
-- instead of gross.
--
-- WHY THIS EXISTS
-- ---------------
-- dts_daily has always stored only the DEPOSITS side of the DTS customs line
-- ("DHS - Customs Duties, Taxes, and Fees"). That was a sound simplification
-- while customs refunds ran $0.5-1.8B/month against $25-30B of deposits --
-- under 5%, genuine noise.
--
-- The IEEPA refund wave broke that assumption. Measured 2026-10-21:
--
--   month     DTS deposits      deposits - CBP wdr      MTS net (truth)
--   2026-06     24,831                 -26,183              -25,556
--   2026-07     26,133                  -4,886               -8,546
--   2026-08     24,999                  12,546               12,836
--   2026-09     26,611                   5,349                5,910
--   (millions)
--
-- Deposits alone were off by ~$50B with the sign inverted in June. Deposits
-- minus the CBP withdrawals line tracks the authoritative MTS net figure
-- within a few percent.
--
-- IMPORTANT CAVEAT, do not lose this
-- ----------------------------------
-- "DHS - Customs & Border Protection (CBP)" is the only withdrawal category
-- in the DTS that plausibly carries tariff refunds; the Treasury does not
-- publish a customs-refund line. It ALSO carries roughly $1-2B/month of CBP's
-- own operating spending. Measured against MTS refunds, the gap was a steady
-- $0.8-1.9B in both quiet months and refund-wave months, which is what you
-- would expect from "refunds plus operating costs."
--
-- So this is a PROXY, not a refund figure. It is good to a couple of percent,
-- not exact, and it will degrade silently if CBP's operating spending ever
-- moves sharply. The authoritative number remains the monthly MTS Table 4 net
-- receipts figure in mts_monthly; this exists only to make the few-week
-- provisional window honest.
--
-- GRANTS: none needed. dts_daily already exists, so it keeps its table-level
-- grants, and new columns inherit them (the grants are table-level, not
-- column-level). See decision_supabase_table_grants: that note's rules apply
-- to CREATE TABLE, not ALTER TABLE ... ADD COLUMN.

ALTER TABLE public.dts_daily
  ADD COLUMN IF NOT EXISTS cbp_withdrawals_today numeric,
  ADD COLUMN IF NOT EXISTS cbp_withdrawals_mtd   numeric;

COMMENT ON COLUMN public.dts_daily.cbp_withdrawals_today IS
  'DTS withdrawals, category "DHS - Customs & Border Protection (CBP)", daily amount in MILLIONS. Proxy for customs refunds; also includes ~$1-2B/month of CBP operating spending. Subtract from customs_revenue_today for a net provisional figure.';

COMMENT ON COLUMN public.dts_daily.cbp_withdrawals_mtd IS
  'Month-to-date counterpart of cbp_withdrawals_today, in MILLIONS.';

-- Required: PostgREST caches the schema. Without this the fetcher upserts
-- will fail with "column not found" even though the column exists.
NOTIFY pgrst, 'reload schema';

-- Verification (run separately after the above):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='dts_daily'
--   ORDER BY ordinal_position;
