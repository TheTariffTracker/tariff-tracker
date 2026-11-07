-- fr_views.sql -- single source of truth for the Federal Register view stack.
--
-- Defines, in dependency order: the GIN index, public.tariff_fr_alerts, and
-- public.adcvd_fr_alerts. Running this file end to end reproduces the whole
-- stack on an empty database. Idempotent: safe to re-run.
--
-- WHY THIS FILE EXISTS (2026-11-07)
--
-- Three problems, fixed together because they are entangled.
--
-- 1. THE BIS BUG. The agency filter listed 'bureau-of-industry-and-security'.
--    The Federal Register's actual slug is 'industry-and-security-bureau'
--    (agency name "Industry and Security Bureau"). The predicate matched zero
--    rows, so every BIS document was silently dropped from tariff_fr_alerts
--    and therefore from Incoming Tariffs, the Tariff Calendar, the dashboard
--    alerts card, the stat strip, site search and AD/CVD Orders.
--
--    Measured against the live table on 2026-11-07, before the fix:
--      72 BIS documents present, spanning 2025-01-03 to 2026-11-06
--      0  of them carried any other in-filter agency, so all 72 were invisible
--      24 of them have an effective_on, against only 52 dated rows in the
--         whole view -- the Tariff Calendar was missing a third of its material
--      2  match the adcvd keyword filter (the March 2025 Section 232 steel and
--         aluminum implementation notices, which mention antidumping in
--         passing; they are keyword hits, not AD/CVD orders)
--
--    The other five slugs were checked at the same time and all match rows:
--    trade-representative-office-of-united-states 61, international-trade-
--    administration 1906, international-trade-commission 994, u-s-customs-and-
--    border-protection 155, foreign-trade-zones-board 192. BIS was the only
--    broken one.
--
--    This mattered more than the count suggests: BIS is the agency that
--    implements Section 232. The invisible documents included polysilicon
--    stockpiling restrictions, specialty-pharmaceutical tariff adjustments, a
--    proposed expansion of aluminium duties, and CBP guidance on assessing
--    "U.S. content". The methodology page has always listed BIS as an included
--    agency, so the page was making a false claim for as long as this ran.
--
-- 2. adcvd_fr_alerts WAS NEVER IN THE REPO. It existed only in the database,
--    described in a comment in app/ad-cvd-orders/page.tsx. A database rebuild
--    would have left /ad-cvd-orders broken with nothing to restore it from.
--    Its definition below was recovered with pg_get_viewdef from the live
--    database on 2026-11-07 and is reproduced exactly: NINE columns, with no
--    effective_on. Do not "improve" that by adding one. Changing the column
--    list of a view requires DROP rather than CREATE OR REPLACE, and dropping
--    this one means dropping tariff_fr_alerts under it.
--
-- 3. tariff_fr_alerts WAS DEFINED TWICE, in fr_alerts_agency_index.sql and
--    again in fr_effective_on.sql. Whichever ran last won. That is how a fix
--    applied to one file and not the other would quietly regress, which is the
--    exact trap this file is meant to remove. Both of those files now carry a
--    SUPERSEDED banner and should not be run.
--
-- CREATE OR REPLACE is safe for both views here because neither column list
-- changes -- only tariff_fr_alerts' WHERE clause does. adcvd_fr_alerts sits on
-- top of tariff_fr_alerts and inherits the agency fix with no change of its
-- own. security_invoker = true is set explicitly on both; it was verified
-- present on both in the live database and MUST be preserved, because these
-- views are read by the anon role and dropping it would run them with the
-- definer's privileges instead.

-- 1. The index. jsonb_path_ops is smaller and faster than the default
--    jsonb_ops for the @> operator, which is all this needs. Added 2026-10-23
--    after an EXISTS/jsonb_array_elements predicate was running 12,036 times
--    per query and tripping the statement timeout in production; that rewrite
--    took the query from ~550ms to ~55ms.
CREATE INDEX IF NOT EXISTS fr_alerts_agencies_gin
  ON public.federal_register_alerts
  USING GIN ((raw_data -> 'agencies') jsonb_path_ops);

-- 2. The agency-filtered view. Containment (@>) rather than a per-row
--    subquery, so the GIN index above can serve it. NULL raw_data->'agencies'
--    yields no match, which is the intended behaviour.
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
     -- Bureau of Industry and Security. This is the slug the Federal Register
     -- actually uses; see note 1 in the header.
     OR (raw_data -> 'agencies') @> '[{"slug":"industry-and-security-bureau"}]'
     -- Retained deliberately. This is the WRONG slug that caused the bug and
     -- it matches zero rows today. It costs one index probe and nothing else,
     -- and it keeps the stack working if the Federal Register ever publishes
     -- under this form. Delete it only with a count check either side.
     OR (raw_data -> 'agencies') @> '[{"slug":"bureau-of-industry-and-security"}]';

-- 3. The AD/CVD subset, layered on the view above. Keyword match, not a
--    classification: it tells you a document mentions these terms, not that it
--    is an AD/CVD order. The page copy and the methodology page both say so.
CREATE OR REPLACE VIEW public.adcvd_fr_alerts WITH (security_invoker = true) AS
 SELECT document_number,
    title,
    publication_date,
    document_type,
    abstract,
    html_url,
    keywords_matched,
    raw_data,
    is_active_tariff
   FROM public.tariff_fr_alerts
  WHERE keywords_matched && ARRAY['antidumping'::text, 'countervailing duty'::text];

-- 4. Refresh planner statistics so the index is used immediately rather than
--    after autovacuum next runs.
ANALYZE public.federal_register_alerts;

-- 5. PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

-- VERIFICATION (run separately). Counts taken on the live database
-- 2026-11-07 immediately before this file was first applied:
--
--   SELECT count(*) FROM public.tariff_fr_alerts;              -- 3304 -> 3376
--   SELECT count(*) FROM public.adcvd_fr_alerts;               -- 2338 -> 2340
--   SELECT count(*) FROM public.tariff_fr_alerts
--     WHERE effective_on IS NOT NULL;                          --   52 ->   76
--
-- A delta of exactly +72 / +2 / +24 means the BIS fix landed and nothing else
-- moved. Then confirm the index is still being used:
--
--   EXPLAIN ANALYZE
--   SELECT title, publication_date, document_type, html_url
--   FROM public.tariff_fr_alerts
--   WHERE document_type IN ('Rule','Proposed Rule','Notice')
--   ORDER BY publication_date DESC
--   LIMIT 1;
--
-- Expect a Bitmap Index Scan on fr_alerts_agencies_gin, single-digit ms.
