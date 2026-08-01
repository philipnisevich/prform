// Witness — natural-language query over the current team report. Lets the
// search box handle a free-text question ("who's my worst performer?") in
// addition to exact-name matches, without ever inventing a person or fact
// not present in the data passed in. Same trust model as insight.ts: no DB
// access, no admin key, model only sees the exact report data the browser
// already fetched from /functions/confirm.
//
// POST /functions/ask
// { "query": "who's my worst performer",
//   "people": [{ "display_name", "visible", "invisible", "findings" }, ...],
//   "history": [{ "question", "answer" }, ...] }   // optional, recent turns
//
// Returns { person_name: string | null, answer: string }. person_name is one
// of the exact display_name values passed in (or null if the question isn't
// about a specific person), so the caller can select that person's card.
// history lets a follow-up like "why doesn't he get credit for it" resolve
// against what was just discussed, via real multi-turn messages rather than
// a flattened text block.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

interface PersonSummary {
  display_name: string;
  visible: { prs: number; tickets_closed: number; commits: number };
  invisible: { confirmed_unblocks: number; reviews: number; triage: number };
  findings: { claim: string }[];
  helped_by: { claim: string }[];
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not configured" }, 500);

  const body = await req.json().catch(() => null);
  const query: string | undefined = body?.query;
  const people: PersonSummary[] = body?.people ?? [];
  const history: { question: string; answer: string | null }[] = body?.history ?? [];
  if (!query || people.length === 0) return json({ error: "query and people are required" }, 400);

  const names = people.map((p) => p.display_name);
  const dataBlock = people
    .map(
      (p) =>
        `${p.display_name}: ${p.visible.tickets_closed} tickets closed, ${p.visible.commits} commits, ${p.visible.prs} PRs visible on dashboards; ${p.invisible.confirmed_unblocks} confirmed unblocks, ${p.invisible.reviews} reviews confirmed against a second source but invisible to those same dashboards.${
          p.findings.length ? " Findings (things they did for someone else): " + p.findings.map((f) => f.claim).join("; ") : ""
        }${
          p.helped_by?.length ? " Helped by (confirmed instances where a teammate unblocked them): " + p.helped_by.map((f) => f.claim).join("; ") : ""
        }`,
    )
    .join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENROUTER_CHAT_MODEL") ?? "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You answer a manager's natural-language question about their team, using ONLY the data given — never invent people, tickets, or numbers. The team's names, exactly as given, are: ${names.join(", ")}.

If the question asks to identify one specific person by some criterion (e.g. "worst performer", "who closed the most tickets"), pick the single best-matching name from that exact list, judging strictly by the naive dashboard numbers (tickets/commits/PRs) — that's what the question is literally asking for.

Then, MANDATORY second step: check that person's findings and helped_by. If they have findings (things THEY did for someone else), your answer MUST do all three of: (1) state the dashboard-based answer, (2) name every person they're recorded as having helped and on which ticket, using the findings text, (3) explicitly say this contradicts the dashboard-only read — a real one-line example of the shape required: "By raw ticket count, Ars Ray looks like the weakest performer — but findings show Ars personally unblocked Philip Nisevich on WIT-19 and benjamin nisevich on WIT-11, work no dashboard credits them for." If they have zero findings but DO have helped_by entries (they were unblocked by teammates, rather than unblocking others), cite that instead — name who helped them and on what, e.g. "benjamin nisevich has the strongest dashboard numbers, but that's partly because Ars Ray and Philip Nisevich each unblocked him on tickets he was stuck on — help the dashboard doesn't show either." Only fall back to a plain dashboard-only answer when both findings and helped_by are empty for that person. If the question isn't about a specific person, leave person_name null and just answer normally.

Respond with strict JSON only, no markdown: {"person_name": "<exact name or null>", "answer": "<2-4 sentence answer, plain prose>"}

Team data:
${dataBlock}`,
        },
        ...history.flatMap((turn) =>
          turn.answer !== null
            ? [
                { role: "user" as const, content: turn.question },
                { role: "assistant" as const, content: turn.answer },
              ]
            : [],
        ),
        { role: "user", content: query },
      ],
      max_completion_tokens: 320,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return json({ error: `OpenRouter request failed: ${res.status} ${await res.text()}` }, 502);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return json({ error: "no completion returned" }, 502);

  let parsed: { person_name: string | null; answer: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: "model did not return valid JSON", raw }, 502);
  }

  // Guard against a hallucinated name even though the prompt constrains to
  // the exact list — never let a made-up name leak into the UI as if real.
  if (parsed.person_name && !names.includes(parsed.person_name)) {
    parsed.person_name = null;
  }

  return json(parsed);
}
