-- Witness — access control
--
-- The ethics answer as a database guarantee, not a UI promise: an engineer
-- sees their own ghost work, a manager sees their direct reports, nobody
-- sees the org. Pipeline-internal tables (identity_claim, ticket_state,
-- reference, classification, run, run_stage_event) get RLS enabled with no
-- policies at all — default-deny for anon/authenticated, reachable only by
-- project_admin (migrations, CLI, and edge functions holding the service key).

CREATE OR REPLACE FUNCTION public.current_person_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT id FROM public.person WHERE user_id = auth.uid();
$$;

-- True if the caller is p_person_id, or is p_person_id's manager.
-- SECURITY DEFINER because it queries public.person, which has RLS enabled
-- below — without this it would recurse into its own policy.
CREATE OR REPLACE FUNCTION public.can_view_person(p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_person_id = public.current_person_id()
    OR EXISTS (
      SELECT 1 FROM public.person p
      WHERE p.id = p_person_id
        AND p.manager_id = public.current_person_id()
    );
$$;

REVOKE ALL ON FUNCTION public.current_person_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_person(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_person_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_person(UUID) TO authenticated;

-- person: self and direct reports only
ALTER TABLE public.person ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self and reports can be read"
ON public.person
FOR SELECT TO authenticated
USING (public.can_view_person(id));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.person TO authenticated;

-- attribution: the cited findings themselves — same visibility rule
ALTER TABLE public.attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self and reports attributions can be read"
ON public.attribution
FOR SELECT TO authenticated
USING (public.can_view_person(person_id));

GRANT SELECT ON public.attribution TO authenticated;

-- source_event: the raw evidence (Slack ts, PR url, etc.) — visible only to
-- the person who authored it and their manager, same as the finding it backs
ALTER TABLE public.source_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self and reports events can be read"
ON public.source_event
FOR SELECT TO authenticated
USING (author_person_id IS NOT NULL AND public.can_view_person(author_person_id));

GRANT SELECT ON public.source_event TO authenticated;

-- run / run_stage_event: progress metadata carries no PII, readable by any
-- authenticated user so the realtime stage stream (next migration) has
-- something to show without a per-run ACL
ALTER TABLE public.run ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read run metadata"
ON public.run
FOR SELECT TO authenticated
USING (true);

GRANT SELECT ON public.run TO authenticated;

ALTER TABLE public.run_stage_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read run stage events"
ON public.run_stage_event
FOR SELECT TO authenticated
USING (true);

GRANT SELECT ON public.run_stage_event TO authenticated;

-- Pipeline-internal tables: RLS enabled, zero policies. anon/authenticated
-- get nothing; project_admin (migrations, CLI, service-key edge functions)
-- is unaffected by RLS and keeps full access.
ALTER TABLE public.identity_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification ENABLE ROW LEVEL SECURITY;
