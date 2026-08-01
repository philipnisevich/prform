// Witness — AI-generated manager insight for a single person's report.
// Public, read-only in effect: takes the report data the browser already
// has (from /functions/confirm) and asks OpenRouter for a short, grounded
// summary. No DB access, no admin key — the model only ever sees the exact
// numbers and findings passed in, so it can't invent activity that isn't
// already a confirmed, cited attribution.
//
// POST /functions/insight
// { "display_name": "Ars Ray",
//   "visible": { "prs": 0, "tickets_closed": 2, "commits": 2 },
//   "invisible": { "confirmed_unblocks": 4, "reviews": 0, "triage": 0 },
//   "findings": [{ "claim": "...", "rule": "a" }, ...],
//   "helped_by": [{ "claim": "Ars Ray: Unblocked ... on WIT-11 ..." }, ...] }
//
// findings = confirmed things this person did for someone else. helped_by =
// the flip side: confirmed instances where a teammate unblocked *them* —
// real, already-cited attribution rows (functions/confirm.ts), not
// something invented here. Someone with zero findings (e.g. they mostly
// work solo) may still have real helped_by data, and that's the citable
// fact for them — never fabricate one when both are empty.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not configured" }, 500);

  const body = await req.json().catch(() => null);
  if (!body?.display_name || !body?.visible || !body?.invisible) {
    return json({ error: "display_name, visible, and invisible are required" }, 400);
  }

  const prompt = `Person: ${body.display_name}
Dashboard-visible activity: ${body.visible.tickets_closed} tickets closed, ${body.visible.commits} commits, ${body.visible.prs} PRs.
Confirmed but otherwise invisible work: ${body.invisible.confirmed_unblocks} confirmed unblocks of teammates, ${body.invisible.reviews} reviews.
Confirmed findings — things this person did for someone else (each already verified against a second source):
${(body.findings ?? []).map((f: { claim: string }) => `- ${f.claim}`).join("\n") || "- none"}
Confirmed instances where a teammate unblocked THIS person (also verified against a second source):
${(body.helped_by ?? []).map((f: { claim: string }) => `- ${f.claim}`).join("\n") || "- none"}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENROUTER_CHAT_MODEL") ?? "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write a short, factual note for a manager reviewing one engineer. Use ONLY the numbers, findings, and helped_by entries given — never invent activity, names, or tickets that aren't listed. Findings name who THIS person helped (e.g. \"Unblocked Philip Nisevich on WIT-19\") — lead with that relationship, not the raw counts. helped_by is the flip side: confirmed cases where a teammate unblocked THIS person — cite that too when present (e.g. \"Ars Ray unblocked them on WIT-11\"), since it's still a real, second-source-confirmed fact worth a manager knowing, distinct from the dashboard's raw ticket count. If findings is empty but helped_by has entries, lead with the helped_by fact instead of implying there's nothing to say. If both are empty, just describe the visible dashboard activity plainly — do not imply hidden work exists when there's none to cite. 2-3 sentences, plain prose, no bullet points, no headers.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 200,
      temperature: 0.4,
    }),
  });

  if (!res.ok) return json({ error: `OpenRouter request failed: ${res.status} ${await res.text()}` }, 502);
  const data = await res.json();
  const insight = data.choices?.[0]?.message?.content?.trim();
  if (!insight) return json({ error: "no completion returned" }, 502);

  return json({ insight });
}
