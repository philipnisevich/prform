// Receipts — the whole pipeline for one open prompt: trigger, ingest,
// cluster, map, render. Runs against the warm-cache fixture (fixture.ts)
// standing in for a live Slack/Linear/GitHub/CRM pull — same shape of data,
// same pipeline, no venue-wifi dependency.
//
// The one rule that isn't negotiable: a drafted sentence with no matching
// citation never reaches the response. That check happens here, in code,
// not as a prompt instruction the model could ignore.

import { NextResponse } from "next/server";
import { CLUSTER_LABELS, PEOPLE, eventsForPerson, personByQuery, type EventSource } from "./fixture";

export const runtime = "nodejs";

const VERDICT_WORDS =
  /\b(best|worst|rank|ranking|compare|versus|\bvs\b|fire|promote|score|worth|better than|top performer|underperform|weakest|strongest|should (?:i|we) (?:fire|promote|let .* go))\b/i;

const WINDOW_PATTERNS: Array<[RegExp, number, string]> = [
  [/\btoday\b/i, 1, "today"],
  [/\byesterday\b/i, 2, "the last two days"],
  [/\bthis week\b|\bpast week\b|\blast 7 days\b/i, 7, "this week"],
  [/\btwo weeks\b|\bpast two weeks\b|\blast 14 days\b/i, 14, "the last two weeks"],
  [/\bthis month\b|\bpast month\b|\blast 30 days\b|\bthis quarter\b/i, 30, "the last 30 days"],
];

function parseWindow(prompt: string): { days: number; label: string } {
  for (const [re, days, label] of WINDOW_PATTERNS) {
    if (re.test(prompt)) return { days, label };
  }
  return { days: 14, label: "the last two weeks" };
}

interface Citation {
  source: EventSource;
  url: string;
  ts: string;
  summary: string;
}

interface Section {
  cluster: string;
  theme: string;
  sentence: string;
  citations: Citation[];
}

function draftDeterministic(clusterEvents: ReturnType<typeof eventsForPerson>): string {
  const sorted = [...clusterEvents].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const latest = sorted[0];
  const n = sorted.length;
  return n > 1
    ? `${n} related updates, most recently: ${latest.summary}.`
    : `${latest.summary}.`;
}

async function draftWithModel(
  personName: string,
  clusters: Array<{ cluster: string; events: ReturnType<typeof eventsForPerson> }>,
): Promise<Map<string, { sentence: string; citedIds: string[] }> | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const payload = clusters.map((c) => ({
    cluster: c.cluster,
    events: c.events.map((e) => ({ id: e.id, source: e.source, ts: e.ts, summary: e.summary })),
  }));

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENROUTER_CHAT_MODEL ?? "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You draft 1-2 sentence summaries of ${personName}'s work, one per cluster of events. Rules: (1) every sentence must be fully supported by the events in that cluster, no outside knowledge, no speculation; (2) you must list which event ids the sentence draws from in citedIds; (3) never mention a ticket, PR, or claim that isn't in the events given; (4) plain factual prose, no adjectives about performance or quality. Respond with strict JSON only: {"clusters": [{"cluster": "<id>", "sentence": "<text>", "citedIds": ["<id>", ...]}]}`,
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        max_completion_tokens: 500,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { clusters: Array<{ cluster: string; sentence: string; citedIds: string[] }> };
    return new Map(parsed.clusters.map((c) => [c.cluster, { sentence: c.sentence, citedIds: c.citedIds ?? [] }]));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const prompt: string | undefined = body?.prompt;
  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // --- Trigger: is this in the one lane the agent covers? -----------------
  const person = personByQuery(prompt);
  if (!person) {
    return NextResponse.json({
      outOfScope: true,
      prompt,
      reason: "unknown-person",
      message: `That's not a person I can pull a packet for. This workspace has ${PEOPLE.map((p) => p.name).join(", ")}. Try "Status check on ${PEOPLE[0].name.split(" ")[0]}."`,
    });
  }
  if (VERDICT_WORDS.test(prompt)) {
    return NextResponse.json({
      outOfScope: true,
      prompt,
      person: person.name,
      reason: "verdict-request",
      message: `That's a judgment call, not an evidence question — out of scope on purpose. I can assemble what ${person.name.split(" ")[0]} actually did, cited, but I don't rank or rate people. Try "Status check on ${person.name.split(" ")[0]}" instead.`,
    });
  }

  const { days, label: windowLabel } = parseWindow(prompt);

  // --- Ingest: normalize everything for this person into one stream -------
  const all = eventsForPerson(person.id);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = all.filter((e) => +new Date(e.ts) >= cutoff);
  const substantive = inWindow.filter((e) => e.cluster !== "noise");
  const noiseDropped = inWindow.length - substantive.length;

  if (substantive.length === 0) {
    return NextResponse.json({
      outOfScope: false,
      empty: true,
      prompt,
      person: person.name,
      windowDays: days,
      windowLabel,
      message: `No substantive activity for ${person.name} in ${windowLabel}. ${noiseDropped} low-signal event${noiseDropped === 1 ? "" : "s"} seen and dropped — nothing worth a citation.`,
    });
  }

  // --- Cluster: group the noisy stream into the themes that mattered ------
  const byCluster = new Map<string, typeof substantive>();
  for (const e of substantive) {
    const list = byCluster.get(e.cluster) ?? [];
    list.push(e);
    byCluster.set(e.cluster, list);
  }
  const clusters = Array.from(byCluster.entries())
    .map(([cluster, events]) => ({ cluster, events }))
    .sort((a, b) => Math.max(...b.events.map((e) => +new Date(e.ts))) - Math.max(...a.events.map((e) => +new Date(e.ts))))
    .slice(0, 6);

  // --- Map: draft a sentence per cluster, welded to its evidence ----------
  const drafted = await draftWithModel(person.name, clusters);
  let usedModel = false;

  const sections: Section[] = [];
  for (const { cluster, events } of clusters) {
    const validIds = new Set(events.map((e) => e.id));
    let sentence: string;
    let citedEvents = events;

    const modelDraft = drafted?.get(cluster);
    if (modelDraft) {
      const citedIds = modelDraft.citedIds.filter((id) => validIds.has(id));
      // The firewall: a sentence with zero valid citations never renders,
      // no matter what the model wrote. Fall back to the deterministic
      // draft instead of dropping the theme silently.
      if (citedIds.length === 0) {
        sentence = draftDeterministic(events);
      } else {
        sentence = modelDraft.sentence;
        citedEvents = events.filter((e) => citedIds.includes(e.id));
        usedModel = true;
      }
    } else {
      sentence = draftDeterministic(events);
    }

    sections.push({
      cluster,
      theme: CLUSTER_LABELS[cluster] ?? cluster,
      sentence,
      citations: citedEvents
        .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))
        .map((e) => ({ source: e.source, url: e.url, ts: e.ts, summary: e.summary })),
    });
  }

  return NextResponse.json({
    outOfScope: false,
    empty: false,
    prompt,
    person: person.name,
    role: person.role,
    windowDays: days,
    windowLabel,
    ingestedCount: inWindow.length,
    noiseDropped,
    clusterCount: clusters.length,
    usedModel,
    generatedAt: new Date().toISOString(),
    sections,
  });
}
