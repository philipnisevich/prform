// Witness — run the attribution engine and assemble the cited response.
//
// This is the only place confirm_attributions() gets called from outside the
// database. Pipeline-internal: bearer auth with the project admin key.
//
// POST /functions/confirm
// { "run_id": "<uuid>" }
//
// Response shape matches PRD §7 exactly: run_id, enabled_sources, degraded,
// people[] with visible/invisible counts and cited findings. divergence
// itself is never included — PRD §9's "never render the number."

import { createAdminClient } from "npm:@insforge/sdk";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export default async function (req: Request): Promise<Response> {
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const apiKey = Deno.env.get("API_KEY");
  if (!baseUrl || !apiKey) return json({ error: "backend not configured" }, 500);
  if (req.headers.get("Authorization") !== `Bearer ${apiKey}`) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const runId: string | undefined = body?.run_id;
  if (!runId) return json({ error: "run_id is required" }, 400);

  const admin = createAdminClient({ baseUrl, apiKey });

  const { data: run, error: runErr } = await admin.database
    .from("run")
    .select("id, enabled_sources")
    .eq("id", runId)
    .maybeSingle();
  if (runErr || !run) return json({ error: runErr?.message ?? "run not found" }, 404);

  const { error: confirmErr } = await admin.database.rpc("confirm_attributions", { p_run_id: runId });
  if (confirmErr) {
    await admin.database.from("run").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", runId);
    return json({ error: confirmErr.message }, 500);
  }

  const { data: degraded, error: degradedErr } = await admin.database.rpc("run_degradation", { p_run_id: runId });
  if (degradedErr) return json({ error: degradedErr.message }, 500);

  // Deliberately rank_divergence, not top_divergence: the evidence floor
  // (>=2 confirmed attributions) in PRD §9 governs who's *rankable* against
  // others, not whether a finding is shown at all. Gating display on it broke
  // the single-example case (live-tested: one confirmed attribution
  // legitimately returned zero people until this was fixed) — PRD §5
  // criterion 2 only requires >=1 confirmed finding with >=2 citations, no
  // minimum finding count per person.
  const { data: ranked, error: rankErr } = await admin.database.rpc("rank_divergence", { p_run_id: runId });
  if (rankErr) return json({ error: rankErr.message }, 500);

  const { data: ledger } = await admin.database.rpc("person_ledger", { p_run_id: runId });
  const ledgerByPerson = new Map((ledger ?? []).map((l: any) => [l.person_id, l]));

  // Every person with any visible or invisible signal — the demo's "here's
  // the dashboard, here's what it's missing" contrast needs the full roster,
  // not just people who happen to have confirmed ghost work. Findings is
  // simply empty for anyone with confirmed_count 0. divergence itself is
  // still never included in the response (PRD §9's "never render the number").
  const personIds = (ranked ?? []).map((r: any) => r.person_id);
  let people: any[] = [];

  if (personIds.length > 0) {
    const { data: persons } = await admin.database.from("person").select("id, display_name").in("id", personIds);
    const personById = new Map((persons ?? []).map((p: any) => [p.id, p]));

    const { data: attributions } = await admin.database
      .from("attribution")
      .select("person_id, source_event_id, ticket_key, ticket_source, rule, reason, lag")
      .eq("run_id", runId)
      .eq("confirmed", true)
      .in("person_id", personIds);

    const eventIds = Array.from(new Set((attributions ?? []).map((a: any) => a.source_event_id)));
    const { data: events } = eventIds.length
      ? await admin.database.from("source_event").select("id, source, external_id, url").in("id", eventIds)
      : { data: [] };
    const eventById = new Map((events ?? []).map((e: any) => [e.id, e]));

    const { data: tickets } = await admin.database
      .from("ticket_state")
      .select("source, ticket_key, url, assignee_person_id")
      .eq("run_id", runId);
    const ticketByKey = new Map((tickets ?? []).map((t: any) => [`${t.source}:${t.ticket_key}`, t]));

    // Rule (b)'s "second citation" is the commit event the reference resolved
    // to, not a ticket_state row — fetch those github commit events too.
    const { data: commitEvents } = await admin.database
      .from("source_event")
      .select("external_id, url")
      .eq("run_id", runId)
      .eq("source", "github")
      .eq("kind", "commit");
    const commitByExternalId = new Map((commitEvents ?? []).map((c: any) => [c.external_id, c]));

    function buildEvidence(a: any): Array<{ source: string; ref: string; url: string | null; note: string }> {
      const event = eventById.get(a.source_event_id);
      const evidence: Array<{ source: string; ref: string; url: string | null; note: string }> = [];
      if (event) {
        evidence.push({ source: event.source, ref: event.external_id, url: event.url, note: "message containing the reference" });
      }
      if (a.rule === "a") {
        const ticket = ticketByKey.get(`${a.ticket_source}:${a.ticket_key}`);
        evidence.push({
          source: a.ticket_source,
          ref: a.ticket_key,
          url: ticket?.url ?? null,
          note: "assigned to someone else, closed after the message",
        });
      } else {
        const commit = commitByExternalId.get(a.ticket_key);
        evidence.push({
          source: "github",
          ref: a.ticket_key,
          url: commit?.url ?? null,
          note: "committed by someone else after the message",
        });
      }
      return evidence;
    }

    people = personIds.map((personId: string) => {
      const person = personById.get(personId);
      const led = ledgerByPerson.get(personId);
      const personAttribs = (attributions ?? []).filter((a: any) => a.person_id === personId);

      const findings = personAttribs.map((a: any) => ({ claim: a.reason, rule: a.rule, evidence: buildEvidence(a) }));

      // The flip side of findings: confirmed instances where someone ELSE
      // unblocked this person (rule (a)'s ticket assignee is the
      // beneficiary). This is real, already-confirmed data — just never
      // queried from the beneficiary's side before. Matters most for
      // someone with zero outbound findings: they may still have been
      // helped, and that's a citable fact, not something to leave the AI
      // to invent when asked about them.
      const helpedBy = (attributions ?? [])
        .filter((a: any) => {
          if (a.rule !== "a" || a.person_id === personId) return false;
          const ticket = ticketByKey.get(`${a.ticket_source}:${a.ticket_key}`);
          return ticket?.assignee_person_id === personId;
        })
        .map((a: any) => {
          const helperName = personById.get(a.person_id)?.display_name ?? "a teammate";
          return { claim: `${helperName}: ${a.reason}`, rule: a.rule, evidence: buildEvidence(a) };
        });

      return {
        person: { id: personId, display_name: person?.display_name ?? "unknown" },
        visible: { prs: led?.prs ?? 0, tickets_closed: led?.tickets_closed ?? 0, commits: led?.commits ?? 0 },
        invisible: {
          confirmed_unblocks: personAttribs.filter((a: any) => a.rule === "a").length,
          reviews: personAttribs.filter((a: any) => a.rule === "b").length,
          triage: 0, // no message classifier in this build — see PRD P1/Pipeshift
        },
        findings,
        helped_by: helpedBy,
      };
    });
  }

  await admin.database
    .from("run")
    .update({ status: "completed", finished_at: new Date().toISOString() })
    .eq("id", runId);

  return json({
    run_id: runId,
    enabled_sources: run.enabled_sources,
    degraded: {
      rules_available: (degraded ?? []).filter((r: any) => r.available).map((r: any) => r.rule),
      rules_unavailable: (degraded ?? []).filter((r: any) => !r.available).map((r: any) => r.rule),
      note: (degraded ?? []).some((r: any) => !r.available)
        ? "One or more confirmation rules cannot run with the current source list. Findings below are limited to what could still be confirmed."
        : null,
    },
    people,
  });
}
