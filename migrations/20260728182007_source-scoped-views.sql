-- Witness — the degradation guarantee
--
-- Restricting `run.enabled_sources` must degrade attribution for real, not
-- fake the output. Plain views can't take the run id as a parameter safely
-- over PostgREST/RPC, so this uses SQL functions returning SETOF the base
-- table instead — same structural guarantee (the predicate lives in the
-- function body, not in application code), but explicit and inspectable.
--
-- Everything downstream (confirm_attributions, the ledger, the ranker) reads
-- through these functions and never touches source_event / ticket_state
-- directly. Disable a source on a run and rows from it are absent from every
-- query built on top of these — not skipped by a branch, absent from the result.

CREATE OR REPLACE FUNCTION public.visible_source_event(p_run_id UUID)
RETURNS SETOF public.source_event
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT e.*
  FROM public.source_event e
  JOIN public.run r ON r.id = p_run_id
  WHERE e.run_id = p_run_id
    AND e.source = ANY (r.enabled_sources);
$$;

CREATE OR REPLACE FUNCTION public.visible_ticket_state(p_run_id UUID)
RETURNS SETOF public.ticket_state
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT t.*
  FROM public.ticket_state t
  JOIN public.run r ON r.id = p_run_id
  WHERE t.run_id = p_run_id
    AND t.source = ANY (r.enabled_sources);
$$;

-- What confirmation rules can even run given the current source list. This is
-- surfaced directly in the API response's `degraded` block — a tool that
-- reports what it cannot see, instead of silently returning less.
CREATE OR REPLACE FUNCTION public.run_degradation(p_run_id UUID)
RETURNS TABLE (rule TEXT, available BOOLEAN, requires TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    'a' AS rule,
    ('slack' = ANY (r.enabled_sources))
      AND ('linear' = ANY (r.enabled_sources) OR 'github' = ANY (r.enabled_sources)) AS available,
    'slack, plus linear or github' AS requires
  FROM public.run r
  WHERE r.id = p_run_id
  UNION ALL
  SELECT
    'b' AS rule,
    ('github' = ANY (r.enabled_sources)) AS available,
    'github' AS requires
  FROM public.run r
  WHERE r.id = p_run_id;
$$;

REVOKE ALL ON FUNCTION public.visible_source_event(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_ticket_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_degradation(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.visible_source_event(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_ticket_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_degradation(UUID) TO authenticated;
