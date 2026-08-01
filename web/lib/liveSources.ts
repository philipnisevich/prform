// Live harvest — Slack, GitHub, and Linear pulled directly from their own
// APIs, the same call shapes already live-verified in hydradb/sync.ts and
// hydradb/identity.ts (see those files' headers for the two wrong turns
// already paid for: no HydraDB connector system, and GitHub commit authors
// must resolve by raw commit email, not the linked account). This module
// re-implements those same calls self-contained inside the Next app so
// /api/packet can call them directly — no HydraDB/InsForge round-trip
// needed for a person+window evidence pull.
//
// Configure via web/.env.local (or the repo-root .env.local — see
// next.config.ts, which loads it too): SLACK_BOT_TOKEN, SLACK_CHANNEL_IDS,
// GITHUB_TOKEN, GITHUB_ORG, GITHUB_REPO, LINEAR_API_KEY, LINEAR_TEAM_KEY.
// Any subset works — sources harvest independently and a missing/failing
// one just drops out, same resilience as sync.ts's allSettled fan-out.
// With none configured, /api/packet falls back to the fixture entirely.

export type LiveSourceId = "slack" | "github" | "linear";

export interface LivePerson {
  id: string;
  name: string;
}

export interface LiveEvent {
  id: string;
  source: LiveSourceId;
  ts: string;
  summary: string;
  url: string;
  authorId: string | null;
  ref: string | null; // extracted ticket/PR reference, e.g. "ENG-412" or "PR-482"
  refTitle: string | null;
}

const TICKET_REF = /\b([A-Z][A-Z0-9]*-\d+)\b/;
const PR_REF = /#(\d+)\b/;

function extractRef(body: string | null | undefined): string | null {
  if (!body) return null;
  const ticket = body.match(TICKET_REF);
  if (ticket) return ticket[1];
  const pr = body.match(PR_REF);
  if (pr) return `PR-${pr[1]}`;
  return null;
}

export function liveConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN || process.env.GITHUB_TOKEN || process.env.LINEAR_API_KEY);
}

interface RosterEntry {
  externalId: string;
  email: string | null;
  displayName: string;
}

// ---- External API response shapes (only the fields this file reads) -----

interface SlackUser {
  id: string;
  is_bot?: boolean;
  deleted?: boolean;
  real_name?: string;
  name: string;
  profile?: { email?: string | null; real_name?: string };
}
interface SlackUsersListResponse {
  ok: boolean;
  error?: string;
  members?: SlackUser[];
}
interface SlackChannel {
  id: string;
  is_member?: boolean;
}
interface SlackConversationsListResponse {
  ok: boolean;
  error?: string;
  channels?: SlackChannel[];
}
interface SlackMessage {
  ts: string;
  user: string;
  text?: string;
  subtype?: string;
}
interface SlackHistoryResponse {
  ok: boolean;
  error?: string;
  messages?: SlackMessage[];
  response_metadata?: { next_cursor?: string };
}
interface SlackPermalinkResponse {
  ok: boolean;
  permalink?: string;
}

interface GithubOrgMember {
  id: number;
  login: string;
}
interface GithubUserProfile {
  email?: string | null;
  name?: string | null;
}
interface GithubPull {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  user: { id: number } | null;
}
interface GithubCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string; email?: string; date: string } };
  author: { id: number } | null;
}

interface LinearUserNode {
  id: string;
  email?: string | null;
  displayName?: string;
  name?: string;
}
interface LinearUsersResponse {
  errors?: unknown;
  data?: { users?: { nodes: LinearUserNode[] } };
}
interface LinearIssueNode {
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  assignee: { id: string } | null;
  creator: { id: string } | null;
}
interface LinearIssuesResponse {
  errors?: unknown;
  data?: { issues?: { nodes: LinearIssueNode[] } };
}

async function fetchSlackRoster(token: string): Promise<RosterEntry[]> {
  const res = await fetch("https://slack.com/api/users.list", { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as SlackUsersListResponse;
  if (!data.ok) throw new Error(`Slack users.list failed: ${data.error}`);
  return (data.members ?? [])
    .filter((m) => !m.is_bot && !m.deleted && m.id !== "USLACKBOT")
    .map((m) => ({
      externalId: m.id,
      email: m.profile?.email ?? null,
      displayName: m.real_name || m.profile?.real_name || m.name,
    }));
}

async function fetchGithubRoster(token: string, org: string): Promise<RosterEntry[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const members: GithubOrgMember[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`https://api.github.com/orgs/${org}/members?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub org members failed: ${res.status}`);
    const batch = (await res.json()) as GithubOrgMember[];
    members.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  const roster: RosterEntry[] = [];
  for (const m of members) {
    const profileRes = await fetch(`https://api.github.com/users/${m.login}`, { headers });
    const profile = (profileRes.ok ? await profileRes.json() : {}) as GithubUserProfile;
    roster.push({ externalId: String(m.id), email: profile.email ?? null, displayName: profile.name || m.login });
  }
  return roster;
}

async function fetchLinearRoster(apiKey: string): Promise<RosterEntry[]> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `query { users(filter: { active: { eq: true } }) { nodes { id email displayName name } } }` }),
  });
  const data = (await res.json()) as LinearUsersResponse;
  if (data.errors) throw new Error(`Linear users query failed: ${JSON.stringify(data.errors)}`);
  return (data.data?.users?.nodes ?? [])
    // Linear's own workspace actor shows up in this list as a user named
    // exactly "Linear" (no email) — not a teammate, filter it like Slack
    // filters is_bot.
    .filter((u) => (u.name || u.displayName || "").toLowerCase() !== "linear")
    .map((u) => ({
      externalId: u.id,
      email: u.email ?? null,
      displayName: u.name || u.displayName || u.id,
    }));
}

interface Directory {
  people: LivePerson[];
  // Every identifier that resolves to a person: `slack:<id>`, `github:<id>`,
  // `linear:<id>`, and `email:<addr>` (the fallback GitHub commit authors
  // need — see this file's header and sync.ts's identical note on why that
  // can't go through the linked account id alone).
  resolve: Map<string, string>;
}

async function buildDirectory(): Promise<Directory> {
  const [slack, github, linear] = await Promise.allSettled([
    process.env.SLACK_BOT_TOKEN ? fetchSlackRoster(process.env.SLACK_BOT_TOKEN) : Promise.resolve([]),
    process.env.GITHUB_TOKEN && process.env.GITHUB_ORG
      ? fetchGithubRoster(process.env.GITHUB_TOKEN, process.env.GITHUB_ORG)
      : Promise.resolve([]),
    process.env.LINEAR_API_KEY ? fetchLinearRoster(process.env.LINEAR_API_KEY) : Promise.resolve([]),
  ]);

  const byEmail = new Map<string, LivePerson>();
  const byId = new Map<string, LivePerson>();
  const resolve = new Map<string, string>();
  let counter = 0;

  function upsert(entry: RosterEntry, source: LiveSourceId) {
    const emailKey = entry.email?.toLowerCase();
    let person = emailKey ? byEmail.get(emailKey) : undefined;
    if (!person) {
      person = { id: `p${counter++}`, name: entry.displayName };
      byId.set(person.id, person);
      if (emailKey) byEmail.set(emailKey, person);
    }
    resolve.set(`${source}:${entry.externalId}`, person.id);
    if (emailKey) resolve.set(`email:${emailKey}`, person.id);
  }

  const rosters: Array<[PromiseSettledResult<RosterEntry[]>, LiveSourceId]> = [
    [slack, "slack"],
    [github, "github"],
    [linear, "linear"],
  ];
  for (const [result, source] of rosters) {
    if (result.status === "fulfilled") for (const entry of result.value) upsert(entry, source);
  }

  return { people: Array.from(byId.values()), resolve };
}

async function harvestSlack(token: string, windowStart: Date, resolve: Map<string, string>): Promise<LiveEvent[]> {
  const explicit = process.env.SLACK_CHANNEL_IDS;
  let channels: string[];
  if (explicit) {
    channels = explicit.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    const res = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=200", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as SlackConversationsListResponse;
    if (!data.ok) throw new Error(`Slack conversations.list failed: ${data.error}`);
    channels = (data.channels ?? []).filter((c) => c.is_member).map((c) => c.id);
  }

  const oldest = String(windowStart.getTime() / 1000);
  const raw: Array<{ ts: string; user: string; text: string; channel: string }> = [];

  for (const channelId of channels) {
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ channel: channelId, oldest, limit: "200" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://slack.com/api/conversations.history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as SlackHistoryResponse;
      if (!data.ok) throw new Error(`Slack conversations.history(${channelId}) failed: ${data.error}`);
      for (const msg of data.messages ?? []) {
        if (msg.subtype) continue;
        raw.push({ ts: msg.ts, user: msg.user, text: msg.text ?? "", channel: channelId });
      }
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
  }

  const permalinks = new Map<string, string>();
  await Promise.all(
    raw.map(async (m) => {
      try {
        const res = await fetch(
          `https://slack.com/api/chat.getPermalink?channel=${m.channel}&message_ts=${m.ts}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = (await res.json()) as SlackPermalinkResponse;
        if (data.ok && data.permalink) permalinks.set(`${m.channel}:${m.ts}`, data.permalink);
      } catch {
        /* best-effort — see sync.ts's identical note */
      }
    }),
  );

  return raw.map((m) => ({
    id: `slack:${m.channel}:${m.ts}`,
    source: "slack" as const,
    ts: new Date(Number(m.ts) * 1000).toISOString(),
    summary: m.text.length > 220 ? `${m.text.slice(0, 220)}…` : m.text,
    url: permalinks.get(`${m.channel}:${m.ts}`) ?? `https://slack.com/archives/${m.channel}/p${m.ts.replace(".", "")}`,
    authorId: resolve.get(`slack:${m.user}`) ?? null,
    ref: extractRef(m.text),
    refTitle: null,
  }));
}

async function harvestGithub(org: string, repo: string, token: string, windowStart: Date, resolve: Map<string, string>): Promise<LiveEvent[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const since = windowStart.toISOString();

  const prs: GithubPull[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${org}/${repo}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
      { headers },
    );
    if (!res.ok) throw new Error(`GitHub PRs failed: ${res.status}`);
    const batch = (await res.json()) as GithubPull[];
    const inWindow = batch.filter((pr) => new Date(pr.created_at) >= windowStart);
    prs.push(...inWindow);
    if (inWindow.length < batch.length || batch.length < 100) break;
    page += 1;
  }

  const commitsRes = await fetch(`https://api.github.com/repos/${org}/${repo}/commits?since=${since}&per_page=100`, { headers });
  if (!commitsRes.ok) throw new Error(`GitHub commits failed: ${commitsRes.status}`);
  const commits = (await commitsRes.json()) as GithubCommit[];

  const events: LiveEvent[] = [];
  for (const pr of prs) {
    const ref = `PR-${pr.number}`;
    const authorId = pr.user?.id ? resolve.get(`github:${pr.user.id}`) ?? null : null;
    events.push({
      id: `github:pr:${pr.number}:opened`,
      source: "github",
      ts: pr.created_at,
      summary: `Opened PR #${pr.number}: ${pr.title}`,
      url: pr.html_url,
      authorId,
      ref: extractRef(pr.body) ?? ref,
      refTitle: pr.title,
    });
    if (pr.merged_at) {
      events.push({
        id: `github:pr:${pr.number}:merged`,
        source: "github",
        ts: pr.merged_at,
        summary: `Merged PR #${pr.number}: ${pr.title}`,
        url: pr.html_url,
        authorId,
        ref: extractRef(pr.body) ?? ref,
        refTitle: pr.title,
      });
    }
  }
  for (const c of commits) {
    const email = c.commit?.author?.email;
    // Resolve by raw commit email first — see this file's header and
    // sync.ts's identical note on why the linked-account id alone missed
    // real matches in the seeded workspace.
    const authorId = (email && resolve.get(`email:${email.toLowerCase()}`)) ?? (c.author?.id ? resolve.get(`github:${c.author.id}`) : undefined) ?? null;
    events.push({
      id: `github:commit:${c.sha}`,
      source: "github",
      ts: c.commit.author.date,
      summary: c.commit.message.split("\n")[0],
      url: c.html_url,
      authorId,
      ref: extractRef(c.commit.message),
      refTitle: null,
    });
  }
  return events;
}

async function harvestLinear(apiKey: string, teamKey: string | undefined, windowStart: Date, resolve: Map<string, string>): Promise<LiveEvent[]> {
  const filter = teamKey
    ? `, filter: { team: { key: { eq: "${teamKey}" } }, updatedAt: { gte: "${windowStart.toISOString()}" } }`
    : `, filter: { updatedAt: { gte: "${windowStart.toISOString()}" } }`;
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query { issues(first: 250${filter}) { nodes {
        identifier title url createdAt completedAt canceledAt
        assignee { id } creator { id }
      } } }`,
    }),
  });
  const data = (await res.json()) as LinearIssuesResponse;
  if (data.errors) throw new Error(`Linear issues query failed: ${JSON.stringify(data.errors)}`);
  const issues = data.data?.issues?.nodes ?? [];

  const events: LiveEvent[] = [];
  for (const issue of issues) {
    const assigneeId = issue.assignee?.id ? resolve.get(`linear:${issue.assignee.id}`) ?? null : null;
    const creatorId = issue.creator?.id ? resolve.get(`linear:${issue.creator.id}`) ?? null : null;
    if (new Date(issue.createdAt) >= windowStart) {
      events.push({
        id: `linear:${issue.identifier}:opened`,
        source: "linear",
        ts: issue.createdAt,
        summary: `Opened ${issue.identifier}: ${issue.title}`,
        url: issue.url,
        authorId: creatorId ?? assigneeId,
        ref: issue.identifier,
        refTitle: issue.title,
      });
    }
    const closedAt = issue.completedAt ?? issue.canceledAt;
    if (closedAt && new Date(closedAt) >= windowStart) {
      events.push({
        id: `linear:${issue.identifier}:closed`,
        source: "linear",
        ts: closedAt,
        summary: `Closed ${issue.identifier}: ${issue.title}`,
        url: issue.url,
        authorId: assigneeId,
        ref: issue.identifier,
        refTitle: issue.title,
      });
    }
  }
  return events;
}

interface LivePull {
  people: LivePerson[];
  events: LiveEvent[];
}

// Keyed by windowDays — a conversation that widens its window mid-thread
// ("what about this month") must not reuse a narrower pull's cache entry
// and silently miss the older events.
const cacheByWindow = new Map<number, { at: number; pull: Promise<LivePull> }>();
const CACHE_MS = 20_000;

// A person+window question always needs the whole recent window harvested
// (there's no per-person API filter worth the extra round trips), so this
// pulls everything once and callers filter/cluster in memory. Cached
// briefly so trying a suggestion chip right after another one doesn't
// re-hit four APIs for data that hasn't changed.
export async function pullLiveWindow(windowDays: number): Promise<LivePull> {
  const now = Date.now();
  const cached = cacheByWindow.get(windowDays);
  if (cached && now - cached.at < CACHE_MS) return cached.pull;

  const pull = (async (): Promise<LivePull> => {
    const windowStart = new Date(now - windowDays * 24 * 60 * 60 * 1000);
    const directory = await buildDirectory();

    const results = await Promise.allSettled([
      process.env.SLACK_BOT_TOKEN ? harvestSlack(process.env.SLACK_BOT_TOKEN, windowStart, directory.resolve) : Promise.resolve([]),
      process.env.GITHUB_TOKEN && process.env.GITHUB_ORG && process.env.GITHUB_REPO
        ? harvestGithub(process.env.GITHUB_ORG, process.env.GITHUB_REPO, process.env.GITHUB_TOKEN, windowStart, directory.resolve)
        : Promise.resolve([]),
      process.env.LINEAR_API_KEY
        ? harvestLinear(process.env.LINEAR_API_KEY, process.env.LINEAR_TEAM_KEY, windowStart, directory.resolve)
        : Promise.resolve([]),
    ]);

    const events: LiveEvent[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") events.push(...r.value);
      else console.warn(`[liveSources] a source failed (others unaffected): ${r.reason}`);
    }

    return { people: directory.people, events };
  })();

  cacheByWindow.set(windowDays, { at: now, pull });
  return pull;
}
