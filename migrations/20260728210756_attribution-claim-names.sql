-- Witness — name the person who was actually helped.
--
-- confirm_attributions() built its `reason` string as "referenced X
-- (assigned to someone else)" — technically correct, but it never says WHO.
-- The whole thesis is "Ars Ray helped Philip close his ticket," not "Ars Ray
-- referenced a ticket assigned to someone else." Every downstream consumer —
-- the report API, the AI insight/ask functions, the demo UI — only has
-- whatever text lives in this column, so the fix belongs here, not in a
-- prompt telling the AI to talk around a vague sentence.

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
    format('Unblocked %s on %s — the message landed %s before %s closed it',
           COALESCE(assignee.display_name, 'a teammate'), t.ticket_key, age(t.closed_at, e.ts),
           COALESCE(assignee.display_name, 'they')),
    age(t.closed_at, e.ts)
  FROM public.reference ref
  JOIN public.visible_source_event(p_run_id) e ON e.id = ref.source_event_id
  JOIN public.visible_ticket_state(p_run_id) t
    ON t.ticket_key = ref.resolved_ticket_key
   AND t.source = ref.resolved_source
  LEFT JOIN public.person assignee ON assignee.id = t.assignee_person_id
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
    format('Flagged %s, which %s committed a fix for %s after the message',
           ref.ref_value, COALESCE(committer.display_name, 'someone else'), age(commit_evt.ts, e.ts)),
    age(commit_evt.ts, e.ts)
  FROM public.reference ref
  JOIN public.visible_source_event(p_run_id) e ON e.id = ref.source_event_id
  JOIN public.visible_source_event(p_run_id) commit_evt
    ON commit_evt.source = 'github'
   AND commit_evt.kind = 'commit'
   AND commit_evt.external_id = ref.ref_value
  LEFT JOIN public.person committer ON committer.id = commit_evt.author_person_id
  WHERE ref.ref_type IN ('pr', 'file')
    AND e.author_person_id IS NOT NULL
    AND commit_evt.author_person_id IS NOT NULL
    AND commit_evt.author_person_id <> e.author_person_id
    AND commit_evt.ts BETWEEN e.ts AND e.ts + interval '24 hours';

  RETURN QUERY SELECT * FROM public.attribution WHERE run_id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_attributions(UUID) FROM PUBLIC;
