-- Witness — the attribution engine
--
-- Attribution isn't intelligence, it's a temporal join. confirm_attributions()
-- is Stage 5 of the pipeline, executing entirely in Postgres: it reads only
-- through visible_source_event / visible_ticket_state, so a source disabled
-- on the run cannot produce a confirmation no matter what the caller wants.
--
-- Idempotent: re-running it for the same run_id clears and rewrites that
-- run's attributions, so a live source-toggle re-run is just a fresh call.

CREATE OR REPLACE FUNCTION public.confirm_attributions(p_run_id UUID)
RETURNS SETOF public.attribution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_confirm_hours INTEGER;
BEGIN
  SELECT confirm_window_hours INTO v_confirm_hours
  FROM public.run
  WHERE id = p_run_id;

  IF v_confirm_hours IS NULL THEN
    RAISE EXCEPTION 'unknown run %', p_run_id;
  END IF;

  DELETE FROM public.attribution WHERE run_id = p_run_id;

  -- Rule (a): referenced ticket is assigned to someone else, and closed
  -- within confirm_window_hours after the message that referenced it.
  INSERT INTO public.attribution (run_id, person_id, source_event_id, ticket_key, ticket_source, rule, confirmed, reason, lag)
  SELECT
    p_run_id,
    e.author_person_id,
    e.id,
    t.ticket_key,
    t.source,
    'a',
    true,
    format('referenced %s (assigned to someone else), which closed %s after the message', t.ticket_key, age(t.closed_at, e.ts)),
    age(t.closed_at, e.ts)
  FROM public.reference ref
  JOIN public.visible_source_event(p_run_id) e ON e.id = ref.source_event_id
  JOIN public.visible_ticket_state(p_run_id) t
    ON t.ticket_key = ref.resolved_ticket_key
   AND t.source = ref.resolved_source
  WHERE ref.resolved_ticket_key IS NOT NULL
    AND e.author_person_id IS NOT NULL
    AND t.assignee_person_id IS NOT NULL
    AND t.assignee_person_id <> e.author_person_id
    AND t.closed_at IS NOT NULL
    AND t.closed_at BETWEEN e.ts AND e.ts + make_interval(hours => v_confirm_hours);

  -- Rule (b): referenced PR/file was committed by someone else within 24h.
  -- MVP simplification: matches a github commit event whose external_id
  -- equals the referenced PR/file value.
  INSERT INTO public.attribution (run_id, person_id, source_event_id, ticket_key, ticket_source, rule, confirmed, reason, lag)
  SELECT
    p_run_id,
    e.author_person_id,
    e.id,
    ref.ref_value,
    'github',
    'b',
    true,
    format('referenced %s, committed by someone else %s after the message', ref.ref_value, age(commit_evt.ts, e.ts)),
    age(commit_evt.ts, e.ts)
  FROM public.reference ref
  JOIN public.visible_source_event(p_run_id) e ON e.id = ref.source_event_id
  JOIN public.visible_source_event(p_run_id) commit_evt
    ON commit_evt.source = 'github'
   AND commit_evt.kind = 'commit'
   AND commit_evt.external_id = ref.ref_value
  WHERE ref.ref_type IN ('pr', 'file')
    AND e.author_person_id IS NOT NULL
    AND commit_evt.author_person_id IS NOT NULL
    AND commit_evt.author_person_id <> e.author_person_id
    AND commit_evt.ts BETWEEN e.ts AND e.ts + interval '24 hours';

  RETURN QUERY SELECT * FROM public.attribution WHERE run_id = p_run_id;
END;
$$;

-- The "visible" baseline (Stage 2, LEDGER) — no LLM, plain counts.
CREATE OR REPLACE FUNCTION public.person_ledger(p_run_id UUID)
RETURNS TABLE (person_id UUID, prs INTEGER, tickets_closed INTEGER, commits INTEGER)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    e.author_person_id,
    COUNT(*) FILTER (WHERE e.source = 'github' AND e.kind = 'pr_opened')::INTEGER,
    COUNT(*) FILTER (WHERE e.kind = 'ticket_closed')::INTEGER,
    COUNT(*) FILTER (WHERE e.source = 'github' AND e.kind = 'commit')::INTEGER
  FROM public.visible_source_event(p_run_id) e
  WHERE e.author_person_id IS NOT NULL
  GROUP BY e.author_person_id;
$$;

-- visible + invisible + divergence (Stage 6, RANK), evidence floor applied by
-- top_divergence below rather than baked in here so the raw numbers stay
-- inspectable during debugging.
CREATE OR REPLACE FUNCTION public.rank_divergence(p_run_id UUID)
RETURNS TABLE (
  person_id UUID,
  visible_score DOUBLE PRECISION,
  invisible_score DOUBLE PRECISION,
  divergence DOUBLE PRECISION,
  confirmed_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH ledger AS (
    SELECT * FROM public.person_ledger(p_run_id)
  ),
  attrib AS (
    SELECT
      a.person_id,
      COUNT(*) FILTER (WHERE a.confirmed AND a.rule = 'a') AS confirmed_unblocks,
      COUNT(*) FILTER (WHERE a.confirmed AND a.rule = 'b') AS reviews,
      COUNT(*) FILTER (WHERE a.confirmed) AS confirmed_count
    FROM public.attribution a
    WHERE a.run_id = p_run_id
    GROUP BY a.person_id
  ),
  combined AS (
    SELECT
      COALESCE(l.person_id, a.person_id) AS person_id,
      (COALESCE(l.prs, 0) * 1.0 + COALESCE(l.tickets_closed, 0) * 1.0 + COALESCE(l.commits, 0) * 0.3) AS visible_score,
      (COALESCE(a.confirmed_unblocks, 0) * 1.0 + COALESCE(a.reviews, 0) * 0.7) AS invisible_score,
      COALESCE(a.confirmed_count, 0)::INTEGER AS confirmed_count
    FROM ledger l
    FULL OUTER JOIN attrib a ON a.person_id = l.person_id
  )
  SELECT
    person_id,
    visible_score,
    invisible_score,
    CASE
      WHEN (visible_score + invisible_score) = 0 THEN 0
      ELSE invisible_score / (visible_score + invisible_score)
    END AS divergence,
    confirmed_count
  FROM combined;
$$;

-- The ranking the API actually returns. Two corrections vs. the naive
-- formula: (1) an evidence floor of 2+ confirmed attributions, so a new hire
-- with two Slack messages and zero PRs can't score 1.0 and top the list; (2)
-- divergence is available here for sorting but the API layer never renders
-- the number — "findings, not scores" is a product promise this function
-- makes possible, not one it enforces by itself.
CREATE OR REPLACE FUNCTION public.top_divergence(p_run_id UUID, p_limit INTEGER DEFAULT 3)
RETURNS TABLE (
  person_id UUID,
  visible_score DOUBLE PRECISION,
  invisible_score DOUBLE PRECISION,
  divergence DOUBLE PRECISION,
  confirmed_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT *
  FROM public.rank_divergence(p_run_id)
  WHERE confirmed_count >= 2
  ORDER BY divergence DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.confirm_attributions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_ledger(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rank_divergence(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.top_divergence(UUID, INTEGER) FROM PUBLIC;

-- confirm_attributions mutates run data; it is pipeline-internal and is not
-- granted to anon/authenticated. Invoke it with project-admin credentials
-- (the CLI, or an edge function holding the service-level API key).
GRANT EXECUTE ON FUNCTION public.person_ledger(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rank_divergence(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.top_divergence(UUID, INTEGER) TO authenticated;
