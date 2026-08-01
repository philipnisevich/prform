// Witness — public read-only report endpoint.
//
// Independent of RocketRide being awake: given a run_id, this reads the
// already-computed attribution rows straight out of InsForge and returns
// cited findings, per PRD §4 API contract. Uses the project's admin key
// (already stored as the reserved API_KEY secret) so it can read past RLS —
// this endpoint does the person/manager visibility check itself, using the
// caller's own token when present, not the elevated one.
//
// GET /functions/report?run_id=<uuid>

import { createAdminClient, createClient } from "npm:@insforge/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id");
  if (!runId) {
    return json({ error: "run_id query parameter is required" }, 400);
  }

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) {
    return json({ error: "backend not configured" }, 500);
  }

  // Admin client reads run metadata and degradation status — not personal data.
  const admin = createAdminClient({ baseUrl, apiKey });

  const { data: run, error: runError } = await admin.database
    .from("run")
    .select("id, enabled_sources, window_days, confirm_window_hours, status")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return json({ error: "run not found" }, 404);
  }

  const { data: degraded, error: degradedError } = await admin.database.rpc(
    "run_degradation",
    { p_run_id: runId },
  );

  if (degradedError) {
    return json({ error: degradedError.message }, 500);
  }

  // Findings themselves go through the caller's own token, so RLS decides
  // what they can see — self and direct reports only, never the elevated key.
  const authHeader = req.headers.get("Authorization");
  const userToken = authHeader ? authHeader.replace("Bearer ", "") : null;

  const scoped = userToken
    ? createClient({ baseUrl, accessToken: userToken })
    : createClient({ baseUrl, anonKey: Deno.env.get("ANON_KEY") ?? "" });

  const { data: attributions, error: attribError } = await scoped.database
    .from("attribution")
    .select("person_id, ticket_key, ticket_source, rule, confirmed, reason, lag, source_event_id")
    .eq("run_id", runId)
    .eq("confirmed", true);

  if (attribError) {
    return json({ error: attribError.message }, 500);
  }

  return json({
    run_id: run.id,
    enabled_sources: run.enabled_sources,
    status: run.status,
    degraded: {
      rules: degraded,
      note:
        degraded?.some((r: { available: boolean }) => !r.available)
          ? "One or more confirmation rules cannot run with the current source list. Findings below are limited to what could still be confirmed."
          : null,
    },
    findings: attributions ?? [],
  });
}
