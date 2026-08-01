// Receipts — warm-cache fixture standing in for a live Slack / Linear /
// GitHub / CRM pull. The brief itself sanctions this: "have a warm cache
// path" if venue wifi can't carry four live connectors. Every event below
// carries a real-shaped permalink so citations render exactly like the live
// version would; only the source of the pull differs.
//
// `cluster` is what a real embedding pass would produce — events that are
// "the same theme" share a tag. The pipeline (route.ts) still does the
// grouping, ranking, and sentence-drafting live; this file only supplies the
// raw, noisy signal a harvest step would have handed it.

export type EventSource = "slack" | "linear" | "github" | "crm";

export interface RawEvent {
  id: string;
  personId: string;
  source: EventSource;
  cluster: string; // "noise" is filtered before clustering — never rendered
  daysAgo: number; // resolved to an absolute ts at request time
  summary: string;
  url: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
}

export const PEOPLE: Person[] = [
  { id: "daniel", name: "Daniel Cho", role: "Backend" },
  { id: "marcin", name: "Marcin Wozniak", role: "Platform" },
  { id: "priya", name: "Priya Anand", role: "Mobile" },
];

export const CLUSTER_LABELS: Record<string, string> = {
  "auth-migration": "Auth migration",
  "oncall-incident": "On-call incident response",
  "code-review": "Code review load",
  "customer-escalation": "Customer escalation",
  onboarding: "Onboarding a teammate",
  "billing-refactor": "Billing refactor",
  "design-review": "Design review",
  "bug-triage": "Bug triage",
  "mobile-release": "Mobile release",
  "customer-onboarding": "Customer onboarding calls",
  "perf-work": "Performance work",
};

const RAW_EVENTS: RawEvent[] = [
  // ---- Daniel Cho -------------------------------------------------------
  { id: "d1", personId: "daniel", source: "linear", cluster: "auth-migration", daysAgo: 6, summary: "Opened ENG-412: migrate session tokens off the legacy cookie format", url: "https://linear.app/acme/issue/ENG-412" },
  { id: "d2", personId: "daniel", source: "github", cluster: "auth-migration", daysAgo: 5, summary: "Opened PR #482: token migration, behind a feature flag", url: "https://github.com/acme/webapp/pull/482" },
  { id: "d3", personId: "daniel", source: "slack", cluster: "auth-migration", daysAgo: 5, summary: "\"Flagged this off by default — rollout plan in the PR description\" in #eng-auth", url: "https://acme.slack.com/archives/C01AUTH/p1690000001" },
  { id: "d4", personId: "daniel", source: "github", cluster: "auth-migration", daysAgo: 3, summary: "Merged PR #482 after two review rounds", url: "https://github.com/acme/webapp/pull/482#event-merge" },
  { id: "d5", personId: "daniel", source: "linear", cluster: "auth-migration", daysAgo: 2, summary: "Closed ENG-412, rollout at 100%", url: "https://linear.app/acme/issue/ENG-412" },
  { id: "d6", personId: "daniel", source: "slack", cluster: "oncall-incident", daysAgo: 4, summary: "\"Paging in — checkout 500s spiking\" in #incidents", url: "https://acme.slack.com/archives/C01INC/p1690000100" },
  { id: "d7", personId: "daniel", source: "linear", cluster: "oncall-incident", daysAgo: 4, summary: "Filed INC-88: checkout error rate, root-caused to a stale connection pool", url: "https://linear.app/acme/issue/INC-88" },
  { id: "d8", personId: "daniel", source: "github", cluster: "oncall-incident", daysAgo: 4, summary: "Merged hotfix PR #491: bump pool size, add circuit breaker", url: "https://github.com/acme/webapp/pull/491" },
  { id: "d9", personId: "daniel", source: "slack", cluster: "oncall-incident", daysAgo: 4, summary: "\"Resolved, error rate back to baseline\" in #incidents, 41 minutes after page", url: "https://acme.slack.com/archives/C01INC/p1690000180" },
  { id: "d10", personId: "daniel", source: "github", cluster: "code-review", daysAgo: 7, summary: "Reviewed PR #470 (Priya) — flagged a race condition before merge", url: "https://github.com/acme/webapp/pull/470#pullrequestreview-1" },
  { id: "d11", personId: "daniel", source: "github", cluster: "code-review", daysAgo: 3, summary: "Reviewed PR #488 (Marcin) — two rounds, approved", url: "https://github.com/acme/webapp/pull/488#pullrequestreview-2" },
  { id: "d12", personId: "daniel", source: "slack", cluster: "onboarding", daysAgo: 8, summary: "\"Here's the local setup doc, ping me if the seed script fails\" in #new-hires, to the new backend hire", url: "https://acme.slack.com/archives/C01NEW/p1690000300" },
  { id: "d13", personId: "daniel", source: "slack", cluster: "onboarding", daysAgo: 6, summary: "Paired for 40 minutes debugging the new hire's first PR locally", url: "https://acme.slack.com/archives/C01NEW/p1690000340" },
  { id: "d14", personId: "daniel", source: "crm", cluster: "customer-escalation", daysAgo: 9, summary: "Joined an escalation call for Meridian Corp — auth timeout complaint", url: "https://crm.acme.com/accounts/meridian-corp/activity/9931" },
  { id: "d15", personId: "daniel", source: "slack", cluster: "customer-escalation", daysAgo: 9, summary: "\"Confirmed it's the same session bug ENG-412 fixes — asked sales to hold\" in #customer-escalations", url: "https://acme.slack.com/archives/C01ESC/p1690000400" },
  { id: "d16", personId: "daniel", source: "slack", cluster: "noise", daysAgo: 1, summary: "🎉 reacted to the team lunch photo", url: "https://acme.slack.com/archives/C01GEN/p1690000500" },
  { id: "d17", personId: "daniel", source: "github", cluster: "noise", daysAgo: 2, summary: "Fixed a typo in README.md", url: "https://github.com/acme/webapp/commit/a1b2c3d" },
  { id: "d18", personId: "daniel", source: "slack", cluster: "noise", daysAgo: 1, summary: "\"anyone know if the printer on 3 is working\" in #random", url: "https://acme.slack.com/archives/C01RAND/p1690000550" },
  { id: "d19", personId: "daniel", source: "linear", cluster: "noise", daysAgo: 20, summary: "Commented on ENG-390, unrelated and outside the usual window", url: "https://linear.app/acme/issue/ENG-390" },

  // ---- Marcin Wozniak -----------------------------------------------------
  { id: "m1", personId: "marcin", source: "linear", cluster: "billing-refactor", daysAgo: 10, summary: "Opened ENG-355: replace the monolithic invoice generator with per-tenant jobs", url: "https://linear.app/acme/issue/ENG-355" },
  { id: "m2", personId: "marcin", source: "github", cluster: "billing-refactor", daysAgo: 8, summary: "Opened PR #488: new invoice job runner", url: "https://github.com/acme/webapp/pull/488" },
  { id: "m3", personId: "marcin", source: "slack", cluster: "billing-refactor", daysAgo: 6, summary: "\"Backfilled last quarter's invoices against the new runner, numbers match\" in #eng-billing", url: "https://acme.slack.com/archives/C01BILL/p1690001001" },
  { id: "m4", personId: "marcin", source: "github", cluster: "billing-refactor", daysAgo: 3, summary: "Merged PR #488 after Daniel's review", url: "https://github.com/acme/webapp/pull/488#event-merge" },
  { id: "m5", personId: "marcin", source: "linear", cluster: "billing-refactor", daysAgo: 3, summary: "Closed ENG-355", url: "https://linear.app/acme/issue/ENG-355" },
  { id: "m6", personId: "marcin", source: "slack", cluster: "design-review", daysAgo: 7, summary: "Ran the design review for the tenant-isolation RFC, three rounds of comments resolved", url: "https://acme.slack.com/archives/C01ARCH/p1690001100" },
  { id: "m7", personId: "marcin", source: "linear", cluster: "design-review", daysAgo: 5, summary: "Approved RFC-14 after requesting a rollback plan section", url: "https://linear.app/acme/document/RFC-14" },
  { id: "m8", personId: "marcin", source: "github", cluster: "bug-triage", daysAgo: 4, summary: "Triaged and labeled 14 open bugs in the platform repo backlog", url: "https://github.com/acme/platform/issues?q=is%3Aissue+triaged-by%3Amarcin" },
  { id: "m9", personId: "marcin", source: "linear", cluster: "bug-triage", daysAgo: 4, summary: "Filed ENG-401 for the webhook retry bug found while triaging", url: "https://linear.app/acme/issue/ENG-401" },
  { id: "m10", personId: "marcin", source: "github", cluster: "bug-triage", daysAgo: 2, summary: "Fixed ENG-401 in PR #493", url: "https://github.com/acme/platform/pull/493" },
  { id: "m11", personId: "marcin", source: "slack", cluster: "noise", daysAgo: 1, summary: "\"who's bringing snacks for standup\" in #random", url: "https://acme.slack.com/archives/C01RAND/p1690001500" },
  { id: "m12", personId: "marcin", source: "github", cluster: "noise", daysAgo: 5, summary: "Bumped a devDependency patch version", url: "https://github.com/acme/webapp/commit/f9e8d7c" },
  { id: "m13", personId: "marcin", source: "slack", cluster: "noise", daysAgo: 15, summary: "Out-of-window standup note", url: "https://acme.slack.com/archives/C01STAND/p1690001600" },

  // ---- Priya Anand ---------------------------------------------------------
  { id: "p1", personId: "priya", source: "linear", cluster: "mobile-release", daysAgo: 9, summary: "Opened ENG-370: ship offline mode for the mobile app, v4.2 target", url: "https://linear.app/acme/issue/ENG-370" },
  { id: "p2", personId: "priya", source: "github", cluster: "mobile-release", daysAgo: 7, summary: "Opened PR #470: local write queue for offline mode", url: "https://github.com/acme/mobile/pull/470" },
  { id: "p3", personId: "priya", source: "slack", cluster: "mobile-release", daysAgo: 6, summary: "\"Cutting the v4.2 release branch tonight, offline mode included\" in #mobile", url: "https://acme.slack.com/archives/C01MOB/p1690002001" },
  { id: "p4", personId: "priya", source: "github", cluster: "mobile-release", daysAgo: 5, summary: "Merged PR #470 after Daniel's race-condition fix", url: "https://github.com/acme/mobile/pull/470#event-merge" },
  { id: "p5", personId: "priya", source: "linear", cluster: "mobile-release", daysAgo: 4, summary: "Shipped v4.2 to 100% of the App Store rollout", url: "https://linear.app/acme/issue/ENG-370" },
  { id: "p6", personId: "priya", source: "crm", cluster: "customer-onboarding", daysAgo: 8, summary: "Ran the technical onboarding call for Blue Harbor Logistics", url: "https://crm.acme.com/accounts/blue-harbor/activity/7712" },
  { id: "p7", personId: "priya", source: "crm", cluster: "customer-onboarding", daysAgo: 3, summary: "Ran a follow-up onboarding call for Northwind Retail, walked through the mobile SDK", url: "https://crm.acme.com/accounts/northwind-retail/activity/7803" },
  { id: "p8", personId: "priya", source: "slack", cluster: "customer-onboarding", daysAgo: 3, summary: "\"Northwind's SDK integration is live, they're testing in staging\" in #customer-success", url: "https://acme.slack.com/archives/C01CS/p1690002200" },
  { id: "p9", personId: "priya", source: "github", cluster: "perf-work", daysAgo: 11, summary: "Opened PR #460: cut cold-start time by lazy-loading the analytics SDK", url: "https://github.com/acme/mobile/pull/460" },
  { id: "p10", personId: "priya", source: "linear", cluster: "perf-work", daysAgo: 10, summary: "Logged cold-start time improvement: 2.1s → 1.3s in ENG-360", url: "https://linear.app/acme/issue/ENG-360" },
  { id: "p11", personId: "priya", source: "slack", cluster: "noise", daysAgo: 2, summary: "\"has anyone seen my charger\" in #random", url: "https://acme.slack.com/archives/C01RAND/p1690002400" },
  { id: "p12", personId: "priya", source: "github", cluster: "noise", daysAgo: 1, summary: "Approved a one-line changelog PR", url: "https://github.com/acme/mobile/pull/475" },
  { id: "p13", personId: "priya", source: "linear", cluster: "noise", daysAgo: 22, summary: "Out-of-window ticket comment", url: "https://linear.app/acme/issue/ENG-201" },
];

export function eventsForPerson(personId: string): Array<Omit<RawEvent, "daysAgo"> & { ts: string }> {
  const now = Date.now();
  return RAW_EVENTS.filter((e) => e.personId === personId).map((e) => ({
    ...e,
    ts: new Date(now - e.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

export function personById(personId: string): Person | null {
  return PEOPLE.find((p) => p.id === personId) ?? null;
}

// Backs /evidence/[id] — the page a citation actually opens. Every citation
// a packet renders has to resolve to something real to click through to;
// this is that something, reconstructed from the same event the pipeline
// read rather than a dead link to a workspace that doesn't exist.
export function eventById(id: string): (Omit<RawEvent, "daysAgo"> & { ts: string; person: Person }) | null {
  const found = RAW_EVENTS.find((e) => e.id === id);
  if (!found) return null;
  const person = personById(found.personId);
  if (!person) return null;
  return {
    ...found,
    ts: new Date(Date.now() - found.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    person,
  };
}
