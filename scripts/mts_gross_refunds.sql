-- mts_gross_refunds.sql
--
-- Stores the gross-receipts and refunds components of the MTS Customs Duties
-- line alongside the net figure already in mts_monthly.customs_duties.
--
-- WHY
-- ---
-- customs_duties holds current_month_net_rcpt_amt -- net receipts, i.e. gross
-- minus refunds. That is the correct headline number, but on its own it tells
-- a reader nothing about the scale of what has been refunded. As of
-- 2026-09-30, across Jan 2025 - Sep 2026:
--
--   gross    $497,452,729,570.26
--   refunds  $150,191,881,633.12   (30.2% of gross)
--   net      $347,260,847,937.14
--
-- A site whose headline is "tariff revenue" cannot leave a 30% refund rate
-- undisclosed, so the counter now shows all three.
--
-- NO REFETCH NEEDED
-- -----------------
-- fetch_mts.py has always stored the complete Treasury record in raw_data,
-- and that record carries current_month_gross_rcpt_amt and
-- current_month_refund_amt. The UPDATE below backfills every existing month
-- straight out of the JSON. Verified before writing this: all 21 stored
-- months have both keys, and gross - refunds equals the stored net to the
-- cent in every one.
--
-- GRANTS: none needed. mts_monthly already exists, so it keeps its
-- table-level grants and new columns inherit them.

ALTER TABLE public.mts_monthly
  ADD COLUMN IF NOT EXISTS customs_gross   numeric,
  ADD COLUMN IF NOT EXISTS customs_refunds numeric;

UPDATE public.mts_monthly
SET customs_gross   = (raw_data->>'current_month_gross_rcpt_amt')::numeric,
    customs_refunds = (raw_data->>'current_month_refund_amt')::numeric
WHERE raw_data ? 'current_month_gross_rcpt_amt'
  AND raw_data ? 'current_month_refund_amt';

COMMENT ON COLUMN public.mts_monthly.customs_gross IS
  'MTS Table 4 current_month_gross_rcpt_amt for the Customs Duties line, in dollars. Gross receipts before refunds. customs_duties = customs_gross - customs_refunds.';

COMMENT ON COLUMN public.mts_monthly.customs_refunds IS
  'MTS Table 4 current_month_refund_amt for the Customs Duties line, in dollars. Includes the IEEPA refunds ordered after the Supreme Court ruling.';

-- Required: PostgREST caches the schema and will not see the new columns
-- until told to reload.
NOTIFY pgrst, 'reload schema';

-- Verification (run separately):
--   SELECT year, month, customs_gross, customs_refunds, customs_duties,
--          customs_gross - customs_refunds - customs_duties AS should_be_zero
--   FROM public.mts_monthly
--   ORDER BY year, month;
