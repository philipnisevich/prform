// Witness — normalize harvested events/tickets into a run.
//
// This is where identity resolution and reference extraction actually
// happen — the one place, so hydradb/sync.ts and the RocketRide pipeline
// don't each make their own merge decisions. Pipeline-internal: bearer
// auth with the project admin key, same as run.ts.
//
// POST /functions/ingest
// {
//   "run_id": "<uuid>",
//   "source": "slack" | "github" | "linear",
//   "events": [{ external_id, kind, author: Identity | null, ts, body, url }],
//   "tickets": [{ ticket_key, assignee: Identity | null, status, closed_at, url }]
// }
// Identity = { source, external_id, handle, email, display_name }

import { createAdminClient } from "npm:@insforge/sdk";

type AdminClient = ReturnType<typeof createAdminClient>;

interface Identity {
  source: string;
  external_id: string;
  handle?: string | null;
  email?: string | null;
  display_name?: string | null;
}

// PRD §4: "regex: ENG-\d+, #\d+, file paths". The ticket pattern is kept
// generic ([A-Z][A-Z0-9]*-\d+) rather than hardcoded to ENG- so it matches
// whatever Linear team key the connected workspace actually uses.
const TICKET_REF = /\b([A-Z][A-Z0-9]*-\d+)\b/g;
const PR_REF = /#(\d+)\b/g;
const FILE_REF = /\b([\w.-]+\/)*[\w-]+\.(ts|tsx|js|jsx|py|go|rb|java|sql|md|json|yaml|yml)\b/g;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const personCache = new Map<string, string>(); // `${source}:${external_id}` -> person_id

async function resolvePerson(admin: AdminClient, identity: Identity | null | undefined): Promise<string | null> {
  if (!identity?.external_id) return null;
  const cacheKey = `${identity.source}:${identity.external_id}`;
  if (personCache.has(cacheKey)) return personCache.get(cacheKey)!;

  const { data: existingClaim } = await admin.database
    .from("identity_claim")
    .select("person_id")
    .eq("source", identity.source)
    .eq("external_id", identity.external_id)
    .maybeSingle();
  if (existingClaim) {
    personCache.set(cacheKey, existingClaim.person_id);
    return existingClaim.person_id;
  }

  let personId: string | null = null;
  if (identity.email) {
    const { data: existingPerson } = await admin.database
      .from("person")
      .select("id")
      .eq("primary_email", identity.email)
      .maybeSingle();
    if (existingPerson) personId = existingPerson.id;
  }

  if (!personId) {
    const { data: inserted, error } = await admin.database
      .from("person")
      .insert([
        {
          display_name: identity.display_name || identity.handle || identity.external_id,
          primary_email: identity.email ?? null,
        },
      ])
      .select("id");
    if (error || !inserted?.[0]) throw new Error(`person insert failed: ${error?.message}`);
    personId = inserted[0].id;
  }

  await admin.database.from("identity_claim").insert([
    {
      person_id: personId,
      source: identity.source,
      external_id: identity.external_id,
      handle: identity.handle ?? null,
      confidence: identity.email ? 1.0 : 0.6,
      evidence: { method: identity.email ? "email_match" : "first_seen" },
    },
  ]);
  personCache.set(cacheKey, personId);
  return personId;
}

function extractReferences(body: string | null | undefined): Array<{
  ref_type: "ticket" | "pr" | "file";
  ref_value: string;
  resolved_ticket_key: string | null;
  resolved_source: "linear" | "github" | null;
}> {
  if (!body) return [];
  const refs: ReturnType<typeof extractReferences> = [];
  for (const m of body.matchAll(TICKET_REF)) {
    refs.push({ ref_type: "ticket", ref_value: m[1], resolved_ticket_key: m[1], resolved_source: "linear" });
  }
  for (const m of body.matchAll(PR_REF)) {
    // Best-effort: could be a PR or a plain issue. Either way it may match a
    // github ticket_state row by number, which is what rule (a) needs.
    refs.push({ ref_type: "pr", ref_value: m[1], resolved_ticket_key: m[1], resolved_source: "github" });
  }
  for (const m of body.matchAll(FILE_REF)) {
    refs.push({ ref_type: "file", ref_value: m[0], resolved_ticket_key: null, resolved_source: null });
  }
  return refs;
}

async function upsertSourceEvent(
  admin: AdminClient,
  runId: string,
  source: string,
  event: { external_id: string; kind: string; author: Identity | null; ts: string; body: string | null; url: string | null },
): Promise<string> {
  const author_person_id = await resolvePerson(admin, event.author);
  const { data: existing } = await admin.database
    .from("source_event")
    .select("id")
    .eq("run_id", runId)
    .eq("source", source)
    .eq("external_id", event.external_id)
    .maybeSingle();

  const row = {
    run_id: runId,
    source,
    kind: event.kind,
    external_id: event.external_id,
    author_person_id,
    ts: event.ts,
    body: event.body ?? null,
    url: event.url ?? null,
  };

  if (existing) {
    await admin.database.from("source_event").update(row).eq("id", existing.id);
    await admin.database.from("reference").delete().eq("source_event_id", existing.id);
    return existing.id;
  }
  const { data: inserted, error } = await admin.database.from("source_event").insert([row]).select("id");
  if (error || !inserted?.[0]) throw new Error(`source_event insert failed: ${error?.message}`);
  return inserted[0].id;
}

async function upsertTicketState(
  admin: AdminClient,
  runId: string,
  source: string,
  ticket: { ticket_key: string; assignee: Identity | null; status: string | null; closed_at: string | null; url: string | null },
): Promise<void> {
  const assignee_person_id = await resolvePerson(admin, ticket.assignee);
  const { data: existing } = await admin.database
    .from("ticket_state")
    .select("run_id")
    .eq("run_id", runId)
    .eq("source", source)
    .eq("ticket_key", ticket.ticket_key)
    .maybeSingle();

  const row = {
    run_id: runId,
    source,
    ticket_key: ticket.ticket_key,
    assignee_person_id,
    status: ticket.status,
    closed_at: ticket.closed_at,
    url: ticket.url,
  };

  if (existing) {
    await admin.database.from("ticket_state").update(row).eq("run_id", runId).eq("source", source).eq("ticket_key", ticket.ticket_key);
  } else {
    const { error } = await admin.database.from("ticket_state").insert([row]);
    if (error) throw new Error(`ticket_state insert failed: ${error.message}`);
  }
}

export default async function (req: Request): Promise<Response> {
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) return json({ error: "backend not configured" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${apiKey}`) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const { run_id, source, events = [], tickets = [] } = body ?? {};
  if (!run_id || !source) return json({ error: "run_id and source are required" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey });
  let referencesFound = 0;

  try {
    for (const event of events) {
      const sourceEventId = await upsertSourceEvent(admin, run_id, source, event);
      const refs = extractReferences(event.body);
      referencesFound += refs.length;
      if (refs.length > 0) {
        await admin.database.from("reference").insert(
          refs.map((r) => ({ ...r, source_event_id: sourceEventId, method: "regex" as const })),
        );
      }
    }
    for (const ticket of tickets) {
      await upsertTicketState(admin, run_id, source, ticket);
    }
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }

  return json({
    run_id,
    source,
    events_ingested: events.length,
    tickets_ingested: tickets.length,
    references_found: referencesFound,
  });
}
