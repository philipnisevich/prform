-- Witness — core schema
-- People, resolved identities, raw pulled events, and run bookkeeping.
-- Attribution logic and access control live in later migrations.

CREATE TABLE public.person (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.person(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  primary_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX person_manager_id_idx ON public.person (manager_id);
CREATE INDEX person_user_id_idx ON public.person (user_id);

-- Entity resolution is never clean. Keep every claim and its evidence,
-- not just the winning merge, so a bad resolution is inspectable.
CREATE TABLE public.identity_claim (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.person(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('slack', 'github', 'linear', 'gmail')),
  external_id TEXT NOT NULL,
  handle TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX identity_claim_person_id_idx ON public.identity_claim (person_id);

-- A run is one pipeline execution: which sources are enabled, the window,
-- and the confirmation lag rule (a)/(b) apply. Tunable per run, not hardcoded,
-- so windows can be widened live instead of redeployed.
CREATE TABLE public.run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled_sources TEXT[] NOT NULL DEFAULT ARRAY['slack', 'github', 'linear', 'gmail'],
  window_days INTEGER NOT NULL DEFAULT 30,
  confirm_window_hours INTEGER NOT NULL DEFAULT 48,
  snapshot_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Harvest pulls every enabled-at-harvest-time source into this table regardless
-- of what a later run's enabled_sources says — visibility filtering happens at
-- query time (see visible_source_event in the next migration), which is what
-- lets a re-run with a narrower source list return in seconds instead of
-- re-pulling HydraDB.
CREATE TABLE public.source_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.run(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('slack', 'github', 'linear', 'gmail')),
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  author_person_id UUID REFERENCES public.person(id) ON DELETE SET NULL,
  ts TIMESTAMPTZ NOT NULL,
  body TEXT,
  url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, source, external_id)
);

CREATE INDEX source_event_run_id_idx ON public.source_event (run_id);
CREATE INDEX source_event_author_person_id_idx ON public.source_event (author_person_id);
CREATE INDEX source_event_source_idx ON public.source_event (source);
CREATE INDEX source_event_ts_idx ON public.source_event (ts);

-- The second source that makes confirmation possible: who a ticket is
-- actually assigned to, and when it closed.
CREATE TABLE public.ticket_state (
  run_id UUID NOT NULL REFERENCES public.run(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('linear', 'github')),
  ticket_key TEXT NOT NULL,
  assignee_person_id UUID REFERENCES public.person(id) ON DELETE SET NULL,
  status TEXT,
  closed_at TIMESTAMPTZ,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, source, ticket_key)
);

CREATE INDEX ticket_state_assignee_idx ON public.ticket_state (assignee_person_id);
CREATE INDEX ticket_state_closed_at_idx ON public.ticket_state (closed_at);

-- Keyed by message content hash, not by message id: identical text classifies
-- once and the result is reused across every run and every source-toggle
-- change. This is what makes a live re-run fast enough to demo.
CREATE TABLE public.classification (
  content_hash TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('unblock', 'review', 'triage', 'decision', 'noise')),
  substantive BOOLEAN NOT NULL DEFAULT false,
  helps_person_id UUID REFERENCES public.person(id) ON DELETE SET NULL,
  confidence DOUBLE PRECISION,
  model TEXT NOT NULL,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A ticket/PR/file mention extracted from a message. `method` records how it
-- was resolved (regex vs. vector) so a citation can say how it was found.
CREATE TABLE public.reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id UUID NOT NULL REFERENCES public.source_event(id) ON DELETE CASCADE,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('ticket', 'pr', 'file')),
  ref_value TEXT NOT NULL,
  resolved_ticket_key TEXT,
  resolved_source TEXT CHECK (resolved_source IN ('linear', 'github')),
  method TEXT NOT NULL CHECK (method IN ('regex', 'vector')),
  similarity DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reference_source_event_id_idx ON public.reference (source_event_id);
CREATE INDEX reference_resolved_ticket_key_idx ON public.reference (resolved_ticket_key);

-- The output of confirm_attributions() (next migration). Append-only per run:
-- confirm_attributions() clears and rewrites a run's rows rather than mutating them.
CREATE TABLE public.attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.run(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.person(id) ON DELETE CASCADE,
  source_event_id UUID NOT NULL REFERENCES public.source_event(id) ON DELETE CASCADE,
  ticket_key TEXT,
  ticket_source TEXT,
  rule TEXT NOT NULL CHECK (rule IN ('a', 'b')),
  confirmed BOOLEAN NOT NULL,
  reason TEXT,
  lag INTERVAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX attribution_run_id_idx ON public.attribution (run_id);
CREATE INDEX attribution_person_id_idx ON public.attribution (person_id);

-- Stage-by-stage progress, published to realtime in a later migration.
CREATE TABLE public.run_stage_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.run(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('resolve', 'ledger', 'harvest', 'classify', 'attribute', 'rank', 'report')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX run_stage_event_run_id_idx ON public.run_stage_event (run_id, ts);
