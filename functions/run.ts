// Witness — create (or clone) a run. Pipeline-internal: called by the
// RocketRide orchestration (or hydradb/sync.ts locally), never by a browser.
// Requires the project admin key as a bearer token, same secret every
// function already holds as API_KEY (see report.ts).
//
// POST /functions/run
// { "sources": ["slack","github","linear"], "window_days": 30,
//   "confirm_window_hours": 48, "clone_from_run_id": "<uuid>" }
//
// clone_from_run_id copies a prior run's source_event/ticket_state/reference
// rows forward under the new run id instead of re-harvesting — this is what
// makes the source-toggle re-run (PRD §5 criteria 3 & 5) fast: only the
// enabled_sources column differs, so confirm_attributions() re-derives a
// different (possibly empty) result from data that's already there.

import { createAdminClient } from "npm:@insforge/sdk";

const VALID_SOURCES = ["slack", "github", "linear", "gmail"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function (req: Request): Promise<Response> {
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) return json({ error: "backend not configured" }, 500);

  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${apiKey}`) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const sources: string[] = body?.sources ?? [];
  if (!Array.isArray(sources) || sources.length === 0 || sources.some((s) => !VALID_SOURCES.includes(s))) {
    return json({ error: `sources must be a non-empty subset of ${VALID_SOURCES.join(", ")}` }, 400);
  }

  const admin = createAdminClient({ baseUrl, apiKey });

  const { data: created, error: createError } = await admin.database
    .from("run")
    .insert([
      {
        enabled_sources: sources,
        window_days: body?.window_days ?? 30,
        confirm_window_hours: body?.confirm_window_hours ?? 48,
        status: "running",
        started_at: new Date().toISOString(),
      },
    ])
    .select();

  if (createError || !created?.[0]) {
    return json({ error: createError?.message ?? "failed to create run" }, 500);
  }
  const run = created[0];

  if (body?.clone_from_run_id) {
    const cloneError = await cloneRunData(admin, body.clone_from_run_id, run.id);
    if (cloneError) return json({ error: cloneError }, 500);
  }

  return json({
    run_id: run.id,
    enabled_sources: run.enabled_sources,
    window_days: run.window_days,
    confirm_window_hours: run.confirm_window_hours,
    status: run.status,
    cloned_from: body?.clone_from_run_id ?? null,
  });
}

async function cloneRunData(admin: ReturnType<typeof createAdminClient>, fromRunId: string, toRunId: string): Promise<string | null> {
  const { data: oldEvents, error: eventsErr } = await admin.database
    .from("source_event")
    .select("source, kind, external_id, author_person_id, ts, body, url, raw")
    .eq("run_id", fromRunId);
  if (eventsErr) return eventsErr.message;

  const oldToNewEventId = new Map<string, string>();
  if (oldEvents && oldEvents.length > 0) {
    // Re-select the source rows (with their old ids) so references can be remapped.
    const { data: oldEventsWithId } = await admin.database
      .from("source_event")
      .select("id, source, external_id")
      .eq("run_id", fromRunId);

    const { data: newEvents, error: insertErr } = await admin.database
      .from("source_event")
      .insert(oldEvents.map((e) => ({ ...e, run_id: toRunId })))
      .select("id, source, external_id");
    if (insertErr) return insertErr.message;

    for (const oldE of oldEventsWithId ?? []) {
      const match = newEvents?.find((n) => n.source === oldE.source && n.external_id === oldE.external_id);
      if (match) oldToNewEventId.set(oldE.id, match.id);
    }

    const { data: oldRefs, error: refsErr } = await admin.database
      .from("reference")
      .select("source_event_id, ref_type, ref_value, resolved_ticket_key, resolved_source, method, similarity")
      .in("source_event_id", Array.from(oldToNewEventId.keys()));
    if (refsErr) return refsErr.message;

    if (oldRefs && oldRefs.length > 0) {
      const { error: refInsertErr } = await admin.database.from("reference").insert(
        oldRefs
          .map((r) => ({ ...r, source_event_id: oldToNewEventId.get(r.source_event_id) }))
          .filter((r) => r.source_event_id),
      );
      if (refInsertErr) return refInsertErr.message;
    }
  }

  const { data: oldTickets, error: ticketsErr } = await admin.database
    .from("ticket_state")
    .select("source, ticket_key, assignee_person_id, status, closed_at, url")
    .eq("run_id", fromRunId);
  if (ticketsErr) return ticketsErr.message;
  if (oldTickets && oldTickets.length > 0) {
    const { error: ticketInsertErr } = await admin.database
      .from("ticket_state")
      .insert(oldTickets.map((t) => ({ ...t, run_id: toRunId })));
    if (ticketInsertErr) return ticketInsertErr.message;
  }

  return null;
}
