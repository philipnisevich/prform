// Witness — the harvest stage (PRD §10, 10:15-12:00 in the build schedule).
//
// Slack, GitHub, and Linear are all pulled directly from their own APIs —
// there's no HydraDB connector/sync system (see client.ts's header comment
// for how that was confirmed). Slack messages are additionally mirrored into
// HydraDB as knowledge (best-effort; failures here never block the InsForge
// write, which is the actual system of record for the attribution engine).
// Linear/GitHub ticket ground truth (assignee, closed_at) comes straight from
// their own APIs, whose schemas are exact, rather than round-tripped through
// HydraDB. Identities are resolved by email across all three, and normalized
// batches are POSTed to InsForge's run/ingest/confirm functions. This is also
// a complete, RocketRide-independent reference implementation of the run
// flow — usable as a fallback if RocketRide Cloud access or self-hosting
// isn't ready in time (see PRD's own fallback tiers: attribution never
// depended on the orchestration layer).
//
// Usage:
//   npm install
//   npm run sync -- --sources=slack,github,linear --window-days=30 --confirm-window-hours=48
//   npm run sync -- --sources=slack --clone-from=<run_id>   # fast re-run, no re-harvest

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });
import { HydraDBClient } from "./client.ts";
import { fetchSlackUsers, fetchGithubUsers, fetchLinearUsers, indexByExternalId, type RosterEntry } from "./identity.ts";

function env(name: string, required = true): string {
  const v = process.env[name] ?? "";
  if (required && !v) throw new Error(`missing env var ${name}`);
  return v;
}

function arg(name: string, fallback?: string): string | undefined {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split("=").slice(1).join("=") : fallback;
}

const INSFORGE_URL = env("INSFORGE_URL");
const INSFORGE_API_KEY = env("INSFORGE_API_KEY");

async function callFunction(slug: string, payload: unknown): Promise<any> {
  const res = await fetch(`${INSFORGE_URL}/functions/${slug}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${INSFORGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${slug} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

function identityFrom(
  source: "slack" | "github" | "linear",
  externalId: string | undefined,
  roster: Map<string, RosterEntry>,
): { source: string; external_id: string; handle: string | null; email: string | null; display_name: string | null } | null {
  if (!externalId) return null;
  const entry = roster.get(externalId);
  return {
    source,
    external_id: externalId,
    handle: entry?.handle ?? null,
    email: entry?.email ?? null,
    display_name: entry?.display_name ?? null,
  };
}

async function slackChannelIds(token: string): Promise<string[]> {
  const explicit = process.env.SLACK_CHANNEL_IDS;
  if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean);

  const res = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=200", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack conversations.list failed: ${data.error}`);
  return (data.channels ?? []).filter((c: any) => c.is_member).map((c: any) => c.id);
}

async function harvestSlack(token: string, windowStart: Date, roster: Map<string, RosterEntry>, hydra: HydraDBClient) {
  const channels = await slackChannelIds(token);
  const oldest = String(windowStart.getTime() / 1000);
  const events: Array<{ external_id: string; kind: string; author: ReturnType<typeof identityFrom>; ts: string; body: string; url: string | null; channel: string }> = [];

  for (const channelId of channels) {
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ channel: channelId, oldest, limit: "200" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(`Slack conversations.history(${channelId}) failed: ${data.error}`);
      for (const msg of data.messages ?? []) {
        if (msg.subtype) continue; // skip joins/leaves/system messages, keep real user messages
        events.push({
          external_id: msg.ts,
          kind: "message",
          author: identityFrom("slack", msg.user, roster),
          ts: new Date(Number(msg.ts) * 1000).toISOString(),
          body: msg.text ?? "",
          url: null, // resolved via chat.getPermalink below, kept null on failure
          channel: channelId,
        });
      }
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
  }

  // Permalinks are a second call per message — worth it for citation quality
  // (PRD §4: "≥2 evidence links naming their source"), fetched concurrently.
  await Promise.all(
    events.map(async (e) => {
      try {
        const res = await fetch(
          `https://slack.com/api/chat.getPermalink?channel=${e.channel}&message_ts=${e.external_id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (data.ok) e.url = data.permalink;
      } catch {
        /* best-effort — a missing permalink doesn't block the finding, just weakens its citation */
      }
    }),
  );

  // Mirror into HydraDB as knowledge — the sponsor-story showcase layer
  // (semantic recall over the same messages, per client.ts). Best-effort:
  // InsForge's ingest (called by the caller) is the actual system of record,
  // so a HydraDB hiccup here is logged and swallowed, never thrown.
  try {
    await hydra.ensureDatabase();
    await hydra.waitForDatabaseReady();
    if (events.length > 0) {
      await hydra.ingestKnowledge(
        events.map((e) => ({
          id: `slack-${e.channel}-${e.external_id}`,
          title: `#${e.channel} message`,
          type: "slack",
          description: e.body,
          url: e.url ?? undefined,
          timestamp: e.ts,
          additional_metadata: { source: "slack", channel: e.channel, external_id: e.external_id, author_id: e.author?.external_id ?? null },
        })),
      );
    }
  } catch (err) {
    console.warn(`[slack] HydraDB mirror failed (non-fatal, InsForge write is unaffected): ${err instanceof Error ? err.message : err}`);
  }

  return events.map(({ channel, ...e }) => e);
}

async function harvestGithub(org: string, repo: string, token: string, windowStart: Date, roster: Map<string, RosterEntry>) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const since = windowStart.toISOString();

  const prs: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${org}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub PRs failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    const inWindow = batch.filter((pr: any) => new Date(pr.created_at) >= windowStart);
    prs.push(...inWindow);
    if (inWindow.length < batch.length || batch.length < 100) break;
    page += 1;
  }

  const commitsRes = await fetch(`https://api.github.com/repos/${org}/${repo}/commits?since=${since}&per_page=100`, { headers });
  if (!commitsRes.ok) throw new Error(`GitHub commits failed: ${commitsRes.status} ${await commitsRes.text()}`);
  const commits = await commitsRes.json();

  const events = [
    ...prs.map((pr: any) => ({
      external_id: String(pr.number),
      kind: "pr_opened",
      author: identityFrom("github", pr.user?.id ? String(pr.user.id) : undefined, roster),
      ts: pr.created_at,
      body: pr.body ?? pr.title,
      url: pr.html_url,
    })),
    ...commits.map((c: any) => ({
      external_id: c.sha,
      kind: "commit",
      // Always resolve by the raw git commit email, not the linked GitHub
      // account's org-roster lookup: two people in this demo have their
      // commit email linked to a real (non-org-member) GitHub account,
      // which made `identityFrom` return email:null and silently create
      // duplicate person rows instead of matching the existing ones. The
      // commit's own author.email is the authoritative "who made this"
      // signal regardless of whether GitHub could link it to an account.
      author: (() => {
        const email: string | undefined = c.commit?.author?.email;
        const name: string | undefined = c.commit?.author?.name;
        const externalId = c.author?.id ? String(c.author.id) : email ? `email:${email}` : undefined;
        if (!externalId) return null;
        return { source: "github", external_id: externalId, handle: c.author?.login ?? null, email: email ?? null, display_name: name ?? null };
      })(),
      ts: c.commit.author.date,
      body: c.commit.message,
      url: c.html_url,
    })),
  ];

  const tickets = prs
    .filter((pr) => pr.state === "closed")
    .map((pr: any) => ({
      ticket_key: String(pr.number),
      assignee: identityFrom("github", pr.assignee?.id ? String(pr.assignee.id) : undefined, roster),
      status: pr.merged_at ? "merged" : "closed",
      closed_at: pr.merged_at ?? pr.closed_at,
      url: pr.html_url,
    }));

  return { events, tickets };
}

async function harvestLinear(apiKey: string, teamKey: string | undefined, windowStart: Date, roster: Map<string, RosterEntry>) {
  const filter = teamKey ? `, filter: { team: { key: { eq: "${teamKey}" } }, updatedAt: { gte: "${windowStart.toISOString()}" } }` : `, filter: { updatedAt: { gte: "${windowStart.toISOString()}" } }`;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query { issues(first: 250${filter}) { nodes {
        identifier state { name type } completedAt canceledAt url
        assignee { id }
      } } }`,
    }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Linear issues query failed: ${JSON.stringify(data.errors)}`);

  const issues = data.data?.issues?.nodes ?? [];
  const tickets = issues.map((issue: any) => ({
    ticket_key: issue.identifier,
    assignee: identityFrom("linear", issue.assignee?.id, roster),
    status: issue.state?.name ?? null,
    closed_at: issue.completedAt ?? issue.canceledAt ?? null,
    url: issue.url,
  }));

  // person_ledger's visible "tickets_closed" count reads source_event(kind =
  // 'ticket_closed'), not ticket_state — ticket_state alone only feeds the
  // temporal join. Without this, every visible ledger shows 0 tickets closed
  // regardless of how much Linear activity actually happened.
  const events = issues
    .filter((issue: any) => issue.completedAt)
    .map((issue: any) => ({
      external_id: issue.identifier,
      kind: "ticket_closed",
      author: identityFrom("linear", issue.assignee?.id, roster),
      ts: issue.completedAt,
      body: null,
      url: issue.url,
    }));

  return { events, tickets };
}

export interface HarvestOptions {
  sources: string[];
  windowDays: number;
  confirmWindowHours: number;
  cloneFrom?: string;
}

// The whole run flow, callable from the CLI (below) or from server.ts, which
// is what RocketRide's webhook node actually forwards to (see rocketride/README.md
// for why the harvest logic lives here in plain, testable TS rather than in
// pipeline-node config whose exact schema this build couldn't fully verify).
export async function runHarvest(opts: HarvestOptions): Promise<unknown> {
  const { sources, windowDays, confirmWindowHours, cloneFrom } = opts;
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const run = await callFunction("run", {
    sources,
    window_days: windowDays,
    confirm_window_hours: confirmWindowHours,
    clone_from_run_id: cloneFrom,
  });
  console.log(`run created: ${run.run_id}${cloneFrom ? ` (cloned from ${cloneFrom})` : ""}`);

  if (cloneFrom) {
    return callFunction("confirm", { run_id: run.run_id });
  }

  const hydra = new HydraDBClient(env("HYDRA_DB_API_KEY"), env("HYDRA_DB_DATABASE"));

  const [slackRoster, githubRoster, linearRoster] = await Promise.all([
    sources.includes("slack") && env("SLACK_BOT_TOKEN", false) ? fetchSlackUsers(env("SLACK_BOT_TOKEN")) : Promise.resolve([]),
    sources.includes("github") && env("GITHUB_TOKEN", false) ? fetchGithubUsers(env("GITHUB_TOKEN"), env("GITHUB_ORG")) : Promise.resolve([]),
    sources.includes("linear") && env("LINEAR_API_KEY", false) ? fetchLinearUsers(env("LINEAR_API_KEY")) : Promise.resolve([]),
  ]);

  // Bounded fan-out: the three sources harvest concurrently rather than in
  // sequence — this is the "real pipeline work" PRD §6 assigns to RocketRide,
  // now expressed as plain concurrent promises now that there's no Pipeshift
  // classification step left to fan out over.
  //
  // allSettled, not all: one source failing (bad token, repo the token can't
  // see, rate limit) must not discard the other two sources' work. This was
  // a real bug, caught live — a GitHub 404 killed a run whose Slack and
  // Linear harvests were otherwise in flight and would have succeeded.
  const results = await Promise.allSettled([
    sources.includes("slack") && env("SLACK_BOT_TOKEN", false)
      ? harvestSlack(env("SLACK_BOT_TOKEN"), windowStart, indexByExternalId(slackRoster), hydra).then((events) =>
          callFunction("ingest", { run_id: run.run_id, source: "slack", events, tickets: [] }).then((r) =>
            console.log(`[slack] ${r.events_ingested} events, ${r.references_found} references`),
          ),
        )
      : Promise.resolve(),
    sources.includes("github") && env("GITHUB_TOKEN", false)
      ? harvestGithub(env("GITHUB_ORG"), env("GITHUB_REPO"), env("GITHUB_TOKEN"), windowStart, indexByExternalId(githubRoster)).then(
          ({ events, tickets }) =>
            callFunction("ingest", { run_id: run.run_id, source: "github", events, tickets }).then((r) =>
              console.log(`[github] ${r.events_ingested} events, ${r.tickets_ingested} tickets`),
            ),
        )
      : Promise.resolve(),
    sources.includes("linear") && env("LINEAR_API_KEY", false)
      ? harvestLinear(env("LINEAR_API_KEY"), env("LINEAR_TEAM_KEY", false), windowStart, indexByExternalId(linearRoster)).then(
          ({ events, tickets }) =>
            callFunction("ingest", { run_id: run.run_id, source: "linear", events, tickets }).then((r) =>
              console.log(`[linear] ${r.events_ingested} ticket-closed events, ${r.tickets_ingested} tickets`),
            ),
        )
      : Promise.resolve(),
  ]);

  const labels = ["slack", "github", "linear"];
  const failures = results
    .map((r, i) => ({ label: labels[i], result: r }))
    .filter((x) => x.result.status === "rejected");
  for (const f of failures) {
    console.error(`[${f.label}] harvest failed (other sources still ingested): ${(f.result as PromiseRejectedResult).reason}`);
  }

  return callFunction("confirm", { run_id: run.run_id });
}

async function main() {
  const sources = (arg("sources", "slack,github,linear") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const result = await runHarvest({
    sources,
    windowDays: Number(arg("window-days", "30")),
    confirmWindowHours: Number(arg("confirm-window-hours", "48")),
    cloneFrom: arg("clone-from"),
  });
  console.log(JSON.stringify(result, null, 2));
}

// Only run the CLI when invoked directly (`npm run sync`), not when imported by server.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
