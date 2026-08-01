// Receipts — the whole pipeline for one open prompt, and every follow-up
// after it: trigger, ingest, cluster, map, render.
//
// Two backends, same pipeline and same firewall. If Slack/GitHub/Linear
// credentials are configured (web/.env.local — see liveSources.ts's
// header), this pulls the real workspace and every citation is a real,
// clickable permalink. Otherwise it runs against the warm-cache fixture
// (fixture.ts) — same shape of data, so nothing else about the pipeline
// changes, just where the events came from.
//
// A conversation is stateless server-side: the client sends back `context`
// (the person/window it's currently on) and a short `history`, and this
// re-derives everything from the same source data each turn rather than
// keeping a session anywhere. A message either (a) names someone — new
// packet, full refresh, resets the window unless it also names one
// explicitly, or (b) doesn't, in which case it's read as a follow-up about
// whoever `context` says is currently in focus — a new packet if it names a
// window, otherwise a grounded question answered from that person's already
// -pulled events.
//
// Two rules that aren't negotiable in either backend or either kind of
// response: a drafted sentence or answer with no matching citation never
// reaches the response — checked here in code, not left to a prompt
// instruction — and a verdict ask ("who should I fire", "rank my team")
// gets declined before anything else runs, context or no context. The
// agent gathers; it never judges.

import { NextResponse } from "next/server";
import { CLUSTER_LABELS, PEOPLE, eventsForPerson, type EventSource, type Person } from "./fixture";
import { pullLiveWindow, liveConfigured, type LiveEvent, type LivePerson } from "@/lib/liveSources";

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

function parseWindow(prompt: string): { days: number; label: string; explicit: boolean } {
  for (const [re, days, label] of WINDOW_PATTERNS) {
    if (re.test(prompt)) return { days, label, explicit: true };
  }
  return { days: 14, label: "the last two weeks", explicit: false };
}

interface Citation {
  id: string;
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

interface DraftableEvent {
  id: string;
  source: EventSource;
  ts: string;
  summary: string;
  url: string;
}

interface Context {
  person: string;
  windowDays: number;
  windowLabel: string;
  live: boolean;
}

function withPeriod(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function toCitation(e: DraftableEvent): Citation {
  return { id: e.id, source: e.source, url: e.url, ts: e.ts, summary: e.summary };
}

function draftDeterministic(clusterEvents: DraftableEvent[]): string {
  const sorted = [...clusterEvents].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const latest = sorted[0];
  const n = sorted.length;
  return n > 1 ? `${n} related updates, most recently: ${withPeriod(latest.summary)}` : withPeriod(latest.summary);
}

async function draftWithModel(
  personName: string,
  clusters: Array<{ cluster: string; events: DraftableEvent[] }>,
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

// The map + render + firewall step, shared by both backends: draft a
// sentence per cluster, and if the model's citations don't check out
// against that cluster's real events, rebuild the sentence deterministically
// from the evidence instead of trusting it.
async function buildSections(
  personName: string,
  clusters: Array<{ cluster: string; theme: string; events: DraftableEvent[] }>,
): Promise<{ sections: Section[]; usedModel: boolean }> {
  const drafted = await draftWithModel(personName, clusters);
  let usedModel = false;
  const sections: Section[] = [];

  for (const { cluster, theme, events } of clusters) {
    const validIds = new Set(events.map((e) => e.id));
    let sentence: string;
    let citedEvents = events;

    const modelDraft = drafted?.get(cluster);
    if (modelDraft) {
      const citedIds = modelDraft.citedIds.filter((id) => validIds.has(id));
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
      theme,
      sentence,
      citations: citedEvents.sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).map(toCitation),
    });
  }

  return { sections, usedModel };
}

// A follow-up in the thread that doesn't name a window either — a grounded
// question against whoever `context` says is in focus, answered only from
// their already-pulled events. Same firewall as buildSections: a claim with
// no valid citation doesn't reach the client as a confident answer.
async function answerFollowUp(
  personName: string,
  events: DraftableEvent[],
  question: string,
  history: Array<{ question: string; answer: string }>,
): Promise<{ answer: string; citations: Citation[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && events.length > 0) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENROUTER_CHAT_MODEL ?? "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You answer a follow-up question about ${personName}'s recent work using ONLY the events listed in the final user message — no outside knowledge, no speculation, never invent a ticket/PR/person not present. If the events don't contain enough to answer, say so plainly. You never rank, score, or recommend anything about a person — if asked to, say that's out of scope. Respond with strict JSON only: {"answer": "<1-3 sentence answer, plain prose>", "citedIds": ["<id>", ...]}`,
            },
            ...history.slice(-4).flatMap((h) => [
              { role: "user" as const, content: h.question },
              { role: "assistant" as const, content: h.answer },
            ]),
            {
              role: "user",
              content: `Events:\n${JSON.stringify(events.map((e) => ({ id: e.id, source: e.source, ts: e.ts, summary: e.summary })))}\n\nQuestion: ${question}`,
            },
          ],
          max_completion_tokens: 300,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw) as { answer: string; citedIds?: string[] };
          const validIds = new Set(events.map((e) => e.id));
          const citedIds = (parsed.citedIds ?? []).filter((id) => validIds.has(id));
          if (citedIds.length > 0) {
            return { answer: parsed.answer, citations: events.filter((e) => citedIds.includes(e.id)).map(toCitation) };
          }
          // The firewall: no valid citation, so the free-text answer doesn't
          // get trusted as-is — fall through to the deterministic search
          // below instead of shipping an uncited claim.
        }
      }
    } catch {
      /* fall through to the deterministic path */
    }
  }

  const qWords = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const scored = events
    .map((e) => ({ e, score: qWords.filter((w) => e.summary.toLowerCase().includes(w)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || +new Date(b.e.ts) - +new Date(a.e.ts));

  if (scored.length === 0) {
    return {
      answer: `I don't see anything specific to that in what's pulled for ${personName} — try asking about a particular ticket, PR, or theme.`,
      citations: [],
    };
  }
  const top = scored.slice(0, 3).map((s) => s.e);
  return { answer: top.map((e) => withPeriod(e.summary)).join(" "), citations: top.map(toCitation) };
}

// Loose on purpose: a judge saying "ben" or "arsen" should still land on
// "benjamin nisevich" or "Ars Ray". Exact/substring match first, then a
// nickname pass — any query word of 3+ letters that's a prefix (either
// direction) of a word in the person's name, picking whichever match
// covers the most letters so short prefixes don't collide.
function matchPerson<T extends { name: string }>(query: string, people: T[]): T | null {
  const q = query.toLowerCase();
  const exact = people.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  const contained = people.find((p) => q.includes(p.name.toLowerCase()));
  if (contained) return contained;

  const queryWords = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  let best: T | null = null;
  let bestScore = 0;
  for (const p of people) {
    for (const nameWord of p.name.toLowerCase().split(/\s+/)) {
      for (const qw of queryWords) {
        if (nameWord === qw || nameWord.startsWith(qw) || qw.startsWith(nameWord)) {
          const score = Math.min(nameWord.length, qw.length);
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
      }
    }
  }
  return best;
}

function fixtureSubstantiveEvents(person: Person, days: number): DraftableEvent[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return eventsForPerson(person.id)
    .filter((e) => e.cluster !== "noise" && +new Date(e.ts) >= cutoff)
    .map((e) => ({ id: e.id, source: e.source, ts: e.ts, summary: e.summary, url: e.url }));
}

async function packetForFixturePerson(person: Person, days: number, windowLabel: string) {
  const all = eventsForPerson(person.id);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const inWindow = all.filter((e) => +new Date(e.ts) >= cutoff);
  const substantive = inWindow.filter((e) => e.cluster !== "noise");
  const noiseDropped = inWindow.length - substantive.length;
  const context: Context = { person: person.name, windowDays: days, windowLabel, live: false };

  if (substantive.length === 0) {
    return {
      kind: "empty" as const,
      outOfScope: false,
      empty: true,
      live: false,
      person: person.name,
      windowDays: days,
      windowLabel,
      message: `No substantive activity for ${person.name} in ${windowLabel}. ${noiseDropped} low-signal event${noiseDropped === 1 ? "" : "s"} seen and dropped — nothing worth a citation.`,
      context,
    };
  }

  const byCluster = new Map<string, typeof substantive>();
  for (const e of substantive) {
    const list = byCluster.get(e.cluster) ?? [];
    list.push(e);
    byCluster.set(e.cluster, list);
  }
  const clusters = Array.from(byCluster.entries())
    .map(([cluster, events]) => ({ cluster, theme: CLUSTER_LABELS[cluster] ?? cluster, events }))
    .sort((a, b) => Math.max(...b.events.map((e) => +new Date(e.ts))) - Math.max(...a.events.map((e) => +new Date(e.ts))))
    .slice(0, 6);

  const { sections, usedModel } = await buildSections(person.name, clusters);

  return {
    kind: "packet" as const,
    outOfScope: false,
    empty: false,
    live: false,
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
    context,
  };
}

const LIVE_FALLBACK_LABEL: Record<string, string> = {
  slack: "Slack activity",
  github: "GitHub activity",
  linear: "Linear activity",
};

function liveSubstantiveEvents(person: LivePerson, days: number, events: LiveEvent[]): DraftableEvent[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return events
    .filter((e) => e.authorId === person.id && +new Date(e.ts) >= cutoff)
    .map((e) => ({ id: e.id, source: e.source, ts: e.ts, summary: e.summary, url: e.url }));
}

async function packetForLivePerson(person: LivePerson, days: number, windowLabel: string, events: LiveEvent[]) {
  const personEvents = liveSubstantiveEvents(person, days, events);
  const context: Context = { person: person.name, windowDays: days, windowLabel, live: true };

  if (personEvents.length === 0) {
    return {
      kind: "empty" as const,
      outOfScope: false,
      empty: true,
      live: true,
      person: person.name,
      windowDays: days,
      windowLabel,
      message: `No activity attributable to ${person.name} in ${windowLabel} across the connected Slack/GitHub/Linear workspace.`,
      context,
    };
  }

  // Cluster: events that share an extracted ticket/PR reference are the
  // same theme almost by definition — the message, the ticket, and the PR
  // that closed it. Anything with no reference falls back to one bucket
  // per source rather than being dropped.
  const byRef = new Map<string, DraftableEvent[]>();
  const byFallback = new Map<string, DraftableEvent[]>();
  const refTitleByEventId = new Map(events.map((e) => [e.id, e.refTitle]));
  const refByEventId = new Map(events.map((e) => [e.id, e.ref]));
  for (const e of personEvents) {
    const ref = refByEventId.get(e.id);
    if (ref) {
      const list = byRef.get(ref) ?? [];
      list.push(e);
      byRef.set(ref, list);
    } else {
      const list = byFallback.get(e.source) ?? [];
      list.push(e);
      byFallback.set(e.source, list);
    }
  }
  const refClusters = Array.from(byRef.entries()).map(([ref, evs]) => {
    const title = evs.map((e) => refTitleByEventId.get(e.id)).find(Boolean);
    return { cluster: ref, theme: title ? `${ref} — ${title}` : ref, events: evs };
  });
  const fallbackClusters = Array.from(byFallback.entries()).map(([source, evs]) => ({
    cluster: `${source}-activity`,
    theme: LIVE_FALLBACK_LABEL[source] ?? source,
    events: evs,
  }));

  const clusters = [...refClusters, ...fallbackClusters]
    .sort((a, b) => Math.max(...b.events.map((e) => +new Date(e.ts))) - Math.max(...a.events.map((e) => +new Date(e.ts))))
    .slice(0, 6);

  const { sections, usedModel } = await buildSections(person.name, clusters);

  return {
    kind: "packet" as const,
    outOfScope: false,
    empty: false,
    live: true,
    person: person.name,
    windowDays: days,
    windowLabel,
    ingestedCount: personEvents.length,
    noiseDropped: 0,
    clusterCount: clusters.length,
    usedModel,
    generatedAt: new Date().toISOString(),
    sections,
    context,
  };
}

async function handleFixture(
  prompt: string,
  context: Context | null,
  history: Array<{ question: string; answer: string }>,
  days: number,
  windowLabel: string,
  windowExplicit: boolean,
) {
  const person = matchPerson<Person>(prompt, PEOPLE);
  if (person) return packetForFixturePerson(person, days, windowLabel);

  if (context?.person) {
    const contextPerson = PEOPLE.find((p) => p.name === context.person);
    if (contextPerson) {
      if (windowExplicit) return packetForFixturePerson(contextPerson, days, windowLabel);
      const events = fixtureSubstantiveEvents(contextPerson, days);
      const { answer, citations } = await answerFollowUp(contextPerson.name, events, prompt, history);
      return {
        kind: "answer" as const,
        outOfScope: false,
        live: false,
        prompt,
        person: contextPerson.name,
        windowDays: days,
        windowLabel,
        answer,
        citations,
        context: { person: contextPerson.name, windowDays: days, windowLabel, live: false },
      };
    }
  }

  return {
    kind: "declined" as const,
    outOfScope: true,
    prompt,
    reason: "unknown-person",
    live: false,
    context,
    message: `That's not a person I can pull a packet for. This workspace has ${PEOPLE.map((p) => p.name).join(", ")}. Try "Status check on ${PEOPLE[0].name.split(" ")[0]}."`,
  };
}

async function handleLive(
  prompt: string,
  context: Context | null,
  history: Array<{ question: string; answer: string }>,
  days: number,
  windowLabel: string,
  windowExplicit: boolean,
) {
  const { people, events } = await pullLiveWindow(days);
  if (people.length === 0 && events.length === 0) {
    throw new Error("live pull returned nothing usable — check Slack/GitHub/Linear credentials");
  }

  const person = matchPerson<LivePerson>(prompt, people);
  if (person) return packetForLivePerson(person, days, windowLabel, events);

  if (context?.person) {
    const contextPerson = matchPerson<LivePerson>(context.person, people);
    if (contextPerson) {
      if (windowExplicit) return packetForLivePerson(contextPerson, days, windowLabel, events);
      const substantive = liveSubstantiveEvents(contextPerson, days, events);
      const { answer, citations } = await answerFollowUp(contextPerson.name, substantive, prompt, history);
      return {
        kind: "answer" as const,
        outOfScope: false,
        live: true,
        prompt,
        person: contextPerson.name,
        windowDays: days,
        windowLabel,
        answer,
        citations,
        context: { person: contextPerson.name, windowDays: days, windowLabel, live: true },
      };
    }
  }

  return {
    kind: "declined" as const,
    outOfScope: true,
    prompt,
    reason: "unknown-person",
    live: true,
    context,
    message:
      people.length > 0
        ? `That's not a person I can find in the connected workspace. This workspace has ${people.map((p) => p.name).join(", ")}.`
        : `The connected workspace didn't return a directory to match against — check the Slack/GitHub/Linear credentials in web/.env.local.`,
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const prompt: string | undefined = body?.prompt;
  if (!prompt || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const context: Context | null = body?.context ?? null;
  const history: Array<{ question: string; answer: string }> = Array.isArray(body?.history) ? body.history : [];

  // Unconditional and first: no context, no phrasing, gets around this.
  if (VERDICT_WORDS.test(prompt)) {
    return NextResponse.json({
      kind: "declined",
      outOfScope: true,
      prompt,
      person: context?.person,
      reason: "verdict-request",
      live: context?.live ?? liveConfigured(),
      context,
      message: context?.person
        ? `That's a judgment call, not an evidence question — out of scope on purpose. I can keep pulling cited facts about ${context.person.split(" ")[0]}, but I won't rank or rate anyone.`
        : `That's a judgment call, not an evidence question — out of scope on purpose. I can assemble what someone actually did, cited, but I don't rank or rate people.`,
    });
  }

  const parsed = parseWindow(prompt);
  const days = parsed.explicit ? parsed.days : (context?.windowDays ?? parsed.days);
  const windowLabel = parsed.explicit ? parsed.label : (context?.windowLabel ?? parsed.label);

  if (liveConfigured()) {
    try {
      return NextResponse.json(await handleLive(prompt, context, history, days, windowLabel, parsed.explicit));
    } catch (err) {
      console.warn(`[packet] live pull failed, falling back to the fixture: ${err instanceof Error ? err.message : err}`);
    }
  }

  return NextResponse.json(await handleFixture(prompt, context, history, days, windowLabel, parsed.explicit));
}
