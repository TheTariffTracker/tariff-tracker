-- ===========================================================================
-- rate_limit -- counters protecting /api/unlock (Phase 3.7).
--
-- One row per (what is being limited) x (time window). The API route composes
-- bucket keys like:
--     unlock:ip:203.0.113.7:hour     window 3600
--     unlock:ip:203.0.113.7:day      window 86400
--     unlock:send:global:day         window 86400
--
-- ** PRIVATE, like lead_capture. ** RLS on, no policies, no anon/authenticated
-- grants. Bucket keys contain IP addresses, so this is not public data.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS rate_limit (
  bucket      TEXT PRIMARY KEY,
  hits        INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL
);

ALTER TABLE rate_limit ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limit TO service_role;

-- Supabase still auto-grants Data API access to new public tables until
-- 2026-10-30, so omitting a GRANT is NOT enough -- revoke explicitly.
REVOKE ALL ON public.rate_limit FROM anon, authenticated;

-- Supports the housekeeping sweep below.
CREATE INDEX IF NOT EXISTS rate_limit_expires ON rate_limit (expires_at);

-- ---------------------------------------------------------------------------
-- rate_limit_hit(bucket, window_seconds) -> the count INCLUDING this hit.
--
-- Must be atomic: the API route runs in serverless functions that can execute
-- concurrently, and a read-then-write would race itself under exactly the load
-- a rate limiter exists to handle. INSERT ... ON CONFLICT DO UPDATE is a single
-- atomic statement, so two simultaneous calls return 1 and 2, never 1 and 1.
--
-- FIXED window, not sliding: expires_at is set on first hit and left alone, so
-- a bucket under sustained load still resets on schedule rather than being
-- pushed forward forever. The CASE handles an expired-but-not-yet-swept row by
-- restarting the window instead of incrementing a stale count.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rate_limit_hit(
  p_bucket TEXT,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits INTEGER;
BEGIN
  -- Housekeeping: keeps the table from growing without a cron job to forget
  -- about. O(n) in principle; at this site's volume it is nothing.
  DELETE FROM rate_limit WHERE expires_at < now();

  INSERT INTO rate_limit (bucket, hits, expires_at)
  VALUES (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (bucket) DO UPDATE
    SET hits = CASE
          WHEN rate_limit.expires_at < now() THEN 1
          ELSE rate_limit.hits + 1
        END,
        expires_at = CASE
          WHEN rate_limit.expires_at < now() THEN EXCLUDED.expires_at
          ELSE rate_limit.expires_at
        END
  RETURNING hits INTO v_hits;

  RETURN v_hits;
END;
$$;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- let anyone call this over PostgREST with the public anon key -- inflating a
-- victim's counter to lock them out, or filling the table. Revoke, then grant
-- only to service_role.
REVOKE EXECUTE ON FUNCTION rate_limit_hit(TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rate_limit_hit(TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_hit(TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
