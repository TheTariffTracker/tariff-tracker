-- ===========================================================================
-- cit_slip_opinions — U.S. Court of International Trade slip opinions
-- (Phase 3.65, tool #5). Populated by scripts/fetch_cit_slip_opinions.py.
-- Run once in the Supabase SQL editor BEFORE the backfill.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS cit_slip_opinions (
  opinion_number   TEXT PRIMARY KEY,            -- "YY-NN", e.g. "26-56"
  decision_date    DATE,
  caption          TEXT,                         -- case name(s); "; "-joined if consolidated
  court_number     TEXT,                         -- e.g. "24-00212", "Consol. 23-00068"; "; "-joined
  judge            TEXT,                         -- last name(s); "; "-joined for panels
  jurisdiction     TEXT,                         -- "1581(c)", "1581(i)", "1581(a)", "1582", "1581(a) & (i)"
  pdf_url          TEXT,                         -- NULL when confidential / public version not yet posted
  editorial_note   TEXT,                         -- italic note: confidential / Public version / Errata / Amended
  is_confidential  BOOLEAN NOT NULL DEFAULT false,
  year             INTEGER,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cit_slip_opinions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cit_slip_opinions"
  ON cit_slip_opinions FOR SELECT USING (true);

GRANT SELECT ON cit_slip_opinions TO anon, authenticated;

CREATE INDEX IF NOT EXISTS cit_slip_opinions_date
  ON cit_slip_opinions (decision_date DESC);
CREATE INDEX IF NOT EXISTS cit_slip_opinions_jurisdiction
  ON cit_slip_opinions (jurisdiction);

-- Make the new table visible to the PostgREST API immediately.
NOTIFY pgrst, 'reload schema';
