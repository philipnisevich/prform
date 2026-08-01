# Witness

Managers evaluate engineers on what the system of record credits them for — commits, PRs authored, tickets closed. The highest-leverage work (unblocking a teammate, catching a bug in review, triaging an incident) happens in Slack and gets credited to whoever closed the ticket afterward. It's invisible to every dashboard, and invisible at review time.

Witness finds that work. For each engineer, it surfaces things they did that helped tickets or PRs credited to **someone else**, and returns cited artifacts — never a score. Every finding is confirmed against a second source: a Slack message alone isn't evidence, but a Slack message referencing a ticket that's assigned to someone else and closed two hours later is.

Restrict the tool to one connector and the point of the whole project is that the output doesn't go blank — it becomes a confident, wrong performance review. See [PIVOT.md](PIVOT.md) for why that has to be provable, not just claimed, and [PRD.md](PRD.md) for the full spec (API contract, data model, ranking, demo script).

## How it works

Attribution is a temporal join, not an LLM call: *"this Slack message referenced ENG-412, ENG-412 is assigned to someone else, and it closed within the confirmation window"* is a SQL predicate. That join runs entirely inside Postgres, and every read in the attribution path goes through a view/function gated on the run's `enabled_sources`. Disable a source and there's nothing to join against — not because a code branch skipped it, but because the row is structurally absent from the query. Access control works the same way: an engineer sees their own findings, a manager sees their direct reports, nobody sees the org, enforced by RLS rather than by UI convention.

```
POST /run { sources, window_days, confirm_window_hours }
        → harvest (HydraDB) + regex reference extraction
        → InsForge: confirm_attributions() over source-scoped views
        → cited findings, keyed to a run
```

LLM classification (Pipeshift, PRD P1) was evaluated but isn't wired into this build — reference extraction is regex-only today, and the attribution engine never depended on it (see [PIVOT.md](PIVOT.md)'s fallback tier).

## Repo layout

| Path | What |
|---|---|
| `migrations/` | InsForge/Postgres schema — core tables, source-scoped views, the attribution engine, RLS policies, realtime run stream, pgvector reference resolution |
| `functions/report.ts` | Public read-only edge function: `GET /functions/report?run_id=<uuid>` returns a run's degradation status and RLS-scoped findings, independent of the orchestration pipeline being awake |
| `functions/run.ts` | Pipeline-internal: creates a run, or clones a prior run's harvested data forward (the fast re-run path for the source-toggle demo) |
| `functions/ingest.ts` | Pipeline-internal: identity resolution, reference extraction, and normalized writes — the one place harvested data becomes `source_event`/`ticket_state`/`identity_claim` rows |
| `functions/confirm.ts` | Pipeline-internal: calls `confirm_attributions()`, assembles the cited response in the PRD §7 shape |
| `functions/ask.ts` | Public read-only edge function: natural-language query over a report the browser already fetched from `/functions/confirm` — no DB access of its own, can't invent a person or fact that wasn't passed in |
| `functions/insight.ts` | Public read-only edge function: AI-generated summary for one person's report, grounded the same way as `ask.ts` |
| `hydradb/` | HydraDB REST client (live-verified against the real API — see `hydradb/client.ts`'s header for two wrong turns worth not repeating) and the harvest logic: Slack/GitHub/Linear are all pulled directly from their own APIs, with Slack additionally mirrored into HydraDB as searchable knowledge |
| `rocketride/` | Not the public endpoint today — live-tested against a real Cloud account and found to have no data-lane path for a plain outbound call; `run.pipe` is left as a thin `webhook → response_text` shell rather than a guessed config. See `rocketride/README.md` for the two findings and the follow-up paths |
| `web/` | Next.js landing page for the project |
| `PRD.md` | MVP scope, API contract, data model, ranking formula, build schedule, demo script |
| `PIVOT.md` | The design rationale — why attribution and access control had to move into the database |
| `AGENTS.md` | InsForge backend setup notes for coding agents |

## Running the pipeline end to end

Fill in `.env.local` at the repo root (copy `.env.example` for the full list)
with InsForge, HydraDB, Slack/GitHub/Linear, and (optionally) RocketRide
credentials. The scripts in `hydradb/` load that file explicitly by path
regardless of working directory — no per-package `.env` needed.

```bash
cd hydradb
npm install
npm run bootstrap          # once per workspace — provisions the HydraDB database
npm run sync -- --sources=slack,github,linear
```

`sync.ts` is a complete, RocketRide-independent run of the pipeline — useful
for testing the harvest → ingest → confirm flow. `npm run serve` runs the
same logic as an HTTP server; that's the actual public endpoint for the demo
today, exposed via a tunnel (ngrok, Cloudflare Tunnel, etc.) rather than
fronted by RocketRide — see `rocketride/README.md` for why and what would
change that.

## Backend (InsForge)

Backend project `agents-love-you` (API base `https://sjcd8q6t.us-east.insforge.app`), Postgres-based BaaS providing the database, RLS, edge functions, and realtime used here.

Migrations apply in filename order via the `insforge` CLI:

```
migrations/
  20260728182006_core-schema.sql          -- person, identity_claim, source_event, ticket_state, run
  20260728182007_source-scoped-views.sql  -- the degradation guarantee
  20260728182009_attribution-engine.sql   -- confirm_attributions()
  20260728182010_rls-access-control.sql   -- own-data / manager-of-reports visibility
  20260728182011_realtime-run-stream.sql  -- live per-run stage progress
  20260728182013_vector-references.sql    -- fuzzy reference resolution via pgvector
  20260728210756_attribution-claim-names.sql -- confirm_attributions() names who was actually helped, not just "assigned to someone else"
```

`functions/report.ts` reads run metadata and degradation status with the admin key, then reads findings through the caller's own token so RLS — not the function — decides what's visible.

## Web (landing page)

```
cd web
npm install
npm run dev
```

Next.js 16 / React 19 / Tailwind 4, with GSAP + Lenis for scroll/animation.

### /demo — the manager-review skit

`web/app/demo` is a real, live view against the backend — not mocked, unlike
the landing page's `ToggleDemo` widget. It clones the golden harvested run
(`DEMO_GOLDEN_RUN_ID` in `web/.env.local`, produced by `npm run sync` in
`hydradb/`) and re-runs `confirm_attributions()` against whichever sources
are toggled on, via a server-only API route (`web/app/api/demo/route.ts`)
that holds the InsForge admin key so it never reaches the browser. Toggling
Slack/GitHub/Linear off live reproduces the PRD's degradation demo end to
end: turn off everything but Slack and every person's confirmed findings
drop to zero with a real `degraded` banner, in the same page, no redeploy.

## Demo environment

Witness needs a workspace where a real pattern exists: someone whose contribution is visible in Slack but invisible in the system of record. We couldn't use a real company's data, so we constructed a synthetic one.

**Setup.** Three team members took personas on a fictional payments startup:

| Persona | Linear identity | Slack identity | Role in the data |
|---|---|---|---|
| The Ghost | Ars Ray | @arsen | Closes 2 tickets. Answers everyone's questions. |
| The Star | benjamin nisevich | @ben | Closes 11 tickets. Asks for help when stuck. |
| The Third | Philip Nisevich | @philip | Owns payments. Closes 3 tickets. |

Each persona used a real account on both platforms, so HydraDB's entity resolution operates on genuinely distinct identifiers — a Slack user ID and a Linear user UUID with no shared key.

**Linear.** 24 issues (WIT-5 through WIT-28) created via the GraphQL API, assigned unevenly: 11 to the Star, 3 to the Third, 2 to the Ghost, plus 8 left open. The resulting ledger makes the Ghost the lowest performer on the team by every dashboard metric.

**Slack.** ~110 messages posted via `chat.postMessage` using per-user OAuth tokens, across #eng, #eng-help, and #incidents. Seven threads follow the same shape: the Ghost diagnoses a problem on a ticket assigned to someone else, and that ticket is subsequently closed by its assignee. The remaining ~90 messages are background noise generated from character briefs — standups, jokes, dead threads, a wrong answer that gets corrected.

**Ordering.** Slack's API stamps messages at post time; there is no backdating. So we posted every Slack message before transitioning any Linear issue to Done. The calendar spread is compressed into an hour, but the causal ordering — diagnosis precedes resolution — is real, and that ordering is what the pipeline detects.

**Blind generation.** The filler corpus was generated from behavioral descriptions of each persona, not from a specification of what the pipeline looks for. The generator was never shown the detection logic. The findings are whatever the pipeline surfaced when pointed at the connectors.
