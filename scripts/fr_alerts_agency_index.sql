-- fr_alerts_agency_index.sql
--
-- Fixes a sequential scan on federal_register_alerts that was causing
-- statement timeouts (SQLSTATE 57014) on the Dashboard, country profiles and
-- chapter profiles in production, 2026-10-22.
--
-- WHAT WAS WRONG
-- --------------
-- tariff_fr_alerts filtered by agency with a per-row subquery:
--
--   WHERE EXISTS (SELECT 1
--                 FROM jsonb_array_elements(raw_data -> 'agencies') agency(value)
--                 WHERE (agency.value ->> 'slug') = ANY (ARRAY[...6 slugs...]))
--
-- jsonb_array_elements is a set-returning function, so Postgres had to run it
-- once per row. EXPLAIN ANALYZE on the StatStrip query:
--
--   Seq Scan on federal_register_alerts (actual time=0.764..549.129 rows=3212)
--     SubPlan 1 -> Function Scan on jsonb_array_elements agency ... loops=12036
--   Execution Time: 550.868 ms
--
-- No index could help that shape: there is nothing to look up, only a function
-- to evaluate 12,036 times. Idle it cost 550ms; under the crawl burst that
-- followed submitting the sitemap to Google it exceeded the 3s statement
-- timeout and the queries were cancelled outright.
--
-- It also degrades linearly -- fetch_federal_register runs every weekday, so
-- the table only grows.
--
-- THE FIX
-- -------
-- Rewrite the predicate as JSON containment, which a jsonb_path_ops GIN index
-- can answer directly. Six OR'd containment tests become a bitmap index scan.
--
-- EQUIVALENCE VERIFIED before applying: both predicates returned exactly 3212
-- rows against the live table. The containment form also behaves identically
-- when raw_data->'agencies' is absent (NULL yields no match either way).
--
-- adcvd_fr_alerts is defined ON TOP of tariff_fr_alerts, so it inherits this
-- fix with no change of its own. The column list below is unchanged and in the
-- original order, which is what keeps that dependent view valid through
-- CREATE OR REPLACE.

-- 1. The index. jsonb_path_ops is smaller and faster than the default
--    jsonb_ops for the @> operator, which is all this needs.
CREATE INDEX IF NOT EXISTS fr_alerts_agencies_gin
  ON public.federal_register_alerts
  USING GIN ((raw_data -> 'agencies') jsonb_path_ops);

-- 2. Rewrite the view to the indexable predicate. security_invoker = true is
--    preserved from the original definition -- do not drop it.
CREATE OR REPLACE VIEW public.tariff_fr_alerts WITH (security_invoker = true) AS
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
   FROM public.federal_register_alerts
  WHERE (raw_data -> 'agencies') @> '[{"slug":"trade-representative-office-of-united-states"}]'
     OR (raw_data -> 'agencies') @> '[{"slug":"international-trade-administration"}]'
     OR (raw_data -> 'agencies') @> '[{"slug":"international-trade-commission"}]'
     OR (raw_data -> 'agencies') @> '[{"slug":"u-s-customs-and-border-protection"}]'
     OR (raw_data -> 'agencies') @> '[{"slug":"foreign-trade-zones-board"}]'
     OR (raw_data -> 'agencies') @> '[{"slug":"bureau-of-industry-and-security"}]';

-- 3. Refresh planner statistics so it uses the new index immediately rather
--    than after autovacuum next runs.
ANALYZE public.federal_register_alerts;

-- 4. PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

-- Verification (run separately):
--   EXPLAIN ANALYZE
--   SELECT title, publication_date, document_type, html_url
--   FROM public.tariff_fr_alerts
--   WHERE document_type IN ('Rule','Proposed Rule','Notice')
--   ORDER BY publication_date DESC
--   LIMIT 1;
--
-- Expect a Bitmap Index Scan on fr_alerts_agencies_gin and an execution time
-- in single-digit milliseconds. Also confirm the row count is still 3212:
--   SELECT count(*) FROM public.tariff_fr_alerts;
