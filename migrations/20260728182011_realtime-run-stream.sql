-- Witness — live pipeline progress
--
-- Every run_stage_event insert publishes to a per-run realtime channel, so
-- the stage-by-stage progress (RESOLVE -> LEDGER -> HARVEST -> CLASSIFY ->
-- ATTRIBUTE -> RANK -> REPORT) can be shown live while a run executes,
-- instead of only appearing once the whole pipeline finishes.

INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('run:%', 'Per-run pipeline stage progress', true)
ON CONFLICT (pattern) DO UPDATE
SET description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.notify_run_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM realtime.publish(
    'run:' || NEW.run_id::text,
    'stage_event',
    jsonb_build_object(
      'stage', NEW.stage,
      'status', NEW.status,
      'counts', NEW.counts,
      'ts', NEW.ts
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER run_stage_event_notify
AFTER INSERT ON public.run_stage_event
FOR EACH ROW
EXECUTE FUNCTION public.notify_run_stage();

-- Stage progress carries no PII (stage name, status, counts), so any
-- authenticated user may subscribe to any run's channel. Findings themselves
-- stay behind the person/attribution RLS from the previous migration.
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can subscribe to run channels"
ON realtime.channels FOR SELECT
TO authenticated
USING (pattern = 'run:%');
