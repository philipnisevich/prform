// One-off: populates the empty agents-love-you/test repo with commit
// history attributed to the same three personas already seeded in
// Slack/Linear (see the root README's "Demo environment" section), so the
// visible ledger (person_ledger's prs/commits) has real numbers instead of
// zeros. Not part of the regular harvest — run manually, once:
//
//   npm run seed-github
//
// Uses the Contents API (PUT /repos/{org}/{repo}/contents/{path}) rather
// than local git: it accepts an explicit `author` object per commit, which
// is how a commit ends up attributed to someone who has no real GitHub
// account (git allows any author identity; only the API token needs push
// access). Author emails match public.person.primary_email exactly, so
// ingest.ts's identity resolution attaches these commits to the existing
// Ars Ray / Philip Nisevich / benjamin nisevich person rows by email.

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

const ORG = process.env.GITHUB_ORG!;
const REPO = process.env.GITHUB_REPO!;
const TOKEN = process.env.GITHUB_TOKEN!;

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
};

interface Commit {
  path: string;
  content: string;
  message: string;
  authorName: string;
  authorEmail: string;
  hoursAgo: number;
}

// The Star (benjamin nisevich) ships the most — matches "closes 11 tickets."
// The Third (Philip Nisevich) owns payments — matches "owns payments."
// The Ghost (Ars Ray) has the fewest visible commits — their real
// contribution is the invisible Slack diagnosis work rule (a) surfaces.
const COMMITS: Commit[] = [
  { path: "src/auth.py", content: "def login(user):\n    return issue_token(user)\n", message: "Add basic login flow", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 20 },
  { path: "src/webhook_handler.py", content: "def handle(event):\n    return process(event)\n", message: "Add webhook handler skeleton", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 18 },
  { path: "src/payments.py", content: "def charge(amount, customer):\n    return gateway.charge(amount, customer)\n", message: "Add payment charge flow", authorName: "Philip Nisevich", authorEmail: "nisevichp@gmail.com", hoursAgo: 16 },
  { path: "src/auth.py", content: "def login(user):\n    if not user.is_active:\n        raise Unauthorized()\n    return issue_token(user)\n", message: "Reject inactive users on login", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 14 },
  { path: "src/payments.py", content: "def charge(amount, customer):\n    if amount <= 0:\n        raise ValueError('amount must be positive')\n    return gateway.charge(amount, customer)\n", message: "Validate charge amount", authorName: "Philip Nisevich", authorEmail: "nisevichp@gmail.com", hoursAgo: 12 },
  { path: "src/incident_triage.py", content: "def triage(alert):\n    return route_to_oncall(alert)\n", message: "Add incident triage stub", authorName: "Ars Ray", authorEmail: "rayevarss@gmail.com", hoursAgo: 10 },
  { path: "src/auth.py", content: "def login(user):\n    if not user.is_active:\n        raise Unauthorized()\n    log_login_attempt(user)\n    return issue_token(user)\n", message: "Log login attempts for audit", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 8 },
  { path: "src/webhook_handler.py", content: "def handle(event):\n    verify_signature(event)\n    return process(event)\n", message: "Verify webhook signature before processing", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 6 },
  { path: "src/payments.py", content: "def charge(amount, customer):\n    if amount <= 0:\n        raise ValueError('amount must be positive')\n    log_payment_event(customer, amount)\n    return gateway.charge(amount, customer)\n", message: "Log payment events for compliance", authorName: "Philip Nisevich", authorEmail: "nisevichp@gmail.com", hoursAgo: 4 },
  { path: "src/incident_triage.py", content: "def triage(alert):\n    if alert.severity == 'critical':\n        page_oncall(alert)\n    return route_to_oncall(alert)\n", message: "Page on-call for critical alerts", authorName: "Ars Ray", authorEmail: "rayevarss@gmail.com", hoursAgo: 2 },
  { path: "src/webhook_handler.py", content: "def handle(event):\n    verify_signature(event)\n    dedupe(event)\n    return process(event)\n", message: "Dedupe webhook retries", authorName: "benjamin nisevich", authorEmail: "bnisevich@gmail.com", hoursAgo: 1 },
];

async function getFileSha(filePath: string): Promise<string | undefined> {
  const res = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/contents/${filePath}`, { headers });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`get contents ${filePath} -> ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.sha;
}

async function commitFile(c: Commit): Promise<void> {
  const iso = new Date(Date.now() - c.hoursAgo * 60 * 60 * 1000).toISOString();
  const sha = await getFileSha(c.path);
  const res = await fetch(`https://api.github.com/repos/${ORG}/${REPO}/contents/${c.path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: c.message,
      content: Buffer.from(c.content, "utf8").toString("base64"),
      sha,
      author: { name: c.authorName, email: c.authorEmail, date: iso },
      committer: { name: c.authorName, email: c.authorEmail, date: iso },
    }),
  });
  if (!res.ok) throw new Error(`commit ${c.path} failed: ${res.status} ${await res.text()}`);
  console.log(`committed ${c.path} as ${c.authorName} (${c.hoursAgo}h ago): ${c.message}`);
}

async function main() {
  if (!ORG || !REPO || !TOKEN) throw new Error("GITHUB_ORG, GITHUB_REPO, and GITHUB_TOKEN must be set");
  for (const c of COMMITS) {
    await commitFile(c);
  }
  console.log(`\nDone. ${COMMITS.length} commits across ${new Set(COMMITS.map((c) => c.authorName)).size} authors.`);
  console.log("Run `npm run sync -- --sources=github` (or all three sources) to harvest them.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
