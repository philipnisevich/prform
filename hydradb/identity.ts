// Cross-source identity rosters, fetched directly from each provider (not
// through HydraDB — connector syncs land message/ticket content, not user
// directories). Callers index these by external_id per source and match
// people across sources by email; InsForge's ingest function performs the
// actual person/identity_claim upsert so there is one place identity
// resolution decisions get made, not two.

export interface RosterEntry {
  external_id: string;
  handle: string;
  email: string | null;
  display_name: string;
}

export async function fetchSlackUsers(token: string): Promise<RosterEntry[]> {
  const res = await fetch("https://slack.com/api/users.list", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack users.list failed: ${data.error}`);
  return (data.members ?? [])
    .filter((m: any) => !m.is_bot && !m.deleted && m.id !== "USLACKBOT")
    .map((m: any) => ({
      external_id: m.id,
      handle: m.name,
      email: m.profile?.email ?? null,
      display_name: m.real_name || m.profile?.real_name || m.name,
    }));
}

export async function fetchGithubUsers(token: string, org: string): Promise<RosterEntry[]> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const members: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`https://api.github.com/orgs/${org}/members?per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`GitHub org members failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    members.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  const roster: RosterEntry[] = [];
  for (const m of members) {
    const profileRes = await fetch(`https://api.github.com/users/${m.login}`, { headers });
    const profile = profileRes.ok ? await profileRes.json() : {};
    roster.push({
      external_id: String(m.id),
      handle: m.login,
      email: profile.email ?? null,
      display_name: profile.name || m.login,
    });
  }
  return roster;
}

export async function fetchLinearUsers(apiKey: string): Promise<RosterEntry[]> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query { users(filter: { active: { eq: true } }) { nodes { id email displayName name } } }`,
    }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(`Linear users query failed: ${JSON.stringify(data.errors)}`);
  return (data.data?.users?.nodes ?? []).map((u: any) => ({
    external_id: u.id,
    handle: u.displayName || u.name,
    email: u.email ?? null,
    display_name: u.name || u.displayName,
  }));
}

export function indexByExternalId(roster: RosterEntry[]): Map<string, RosterEntry> {
  return new Map(roster.map((r) => [r.external_id, r]));
}
