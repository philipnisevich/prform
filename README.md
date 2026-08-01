# Receipts

*(Renamed from Witness. The pipeline below and everything under `web/` is the current build. Everything under "Prior iteration" is a different, previously-shipped design — real, working code, preserved as-is, but not wired to the demo that ships today.)*

A manager loses a full Sunday scrolling GitHub, Linear, and Slack to reconstruct what six people actually did, then reformats it into HR's template — a chase job, a format job, and a copy-paste job at once. Every company over ~20 people pays a human to run that loop.

Receipts is an agent that answers a spoken question about a person's recent work — *"Status check on Daniel," "What did Marcin ship this week"* — by assembling a cited evidence packet. Never a verdict: the agent gathers, the human judges. The one hard rule is the firewall — **no source link, no sentence** — enforced in code, not left to a prompt instruction.

## How it works

Open prompt on the surface, one narrow pipeline underneath — person, window, cited output. Anything outside that lane gets a graceful decline instead of a guess:

```
POST /api/packet { prompt }
        → Trigger  — parse the person + window from an open prompt, or decline (unknown person / asks for a verdict)
        → Ingest   — normalize Slack/Linear/GitHub/CRM events for that person into one stream (who, what, when, permalink)
        → Cluster  — group the noisy stream into the handful of themes that mattered
        → Map      — draft 1-2 sentences per theme, welded to the specific events it cites
        → Render   — the packet, every claim clickable back to its source
```

The firewall runs after the draft step, in `web/app/api/packet/route.ts`: any sentence whose citations don't resolve to real events in that cluster is dropped and rebuilt deterministically from the evidence instead of rendered as-is.

## Running it

```bash
cd web
npm install
npm run dev
```

Next.js 16 / React 19 / Tailwind 4, GSAP + Lenis for scroll/animation. No environment variables are required to run the demo end to end — `/api/packet` runs against a warm-cache fixture (`web/app/api/packet/fixture.ts`) standing in for a live Slack/Linear/GitHub/CRM pull, so the pipeline works with no external credentials and no wifi dependency. That fixture stands in for the sponsor brief's own recommended fallback: "have a warm cache path" if venue wifi can't carry four live connectors.

Optionally set `OPENROUTER_API_KEY` (see `web/.env.example`) to have `/api/packet` draft each cluster's sentence with a model instead of the deterministic template. The firewall check runs either way — a missing key changes the prose, never the citation guarantee.

- `/` — the landing page, including a compact version of the live demo under "The proof"
- `/demo` — the full judge-facing console: speak or type a prompt (voice input via the browser's native `SpeechRecognition` API where supported), watch the pipeline stages, get the cited packet

## Repo layout

| Path | What |
|---|---|
| `web/app/api/packet/route.ts` | The current pipeline: scope classification, ingest, cluster, map, render, and the citation firewall |
| `web/app/api/packet/fixture.ts` | Warm-cache fixture data — three people, dozens of events across Slack/Linear/GitHub/CRM, real-shaped permalinks |
| `web/app/components/PacketDemo.tsx` | The shared interactive widget (prompt bar, mic, pipeline-stage animation, packet + decline rendering) used on both `/` and `/demo` |
| `web/` | Next.js app — landing page, `/demo`, the API route above |
| `migrations/`, `functions/`, `hydradb/`, `rocketride/`, `PIVOT.md`, `PRD.md` | Prior iteration (Witness) — see below |
| `AGENTS.md` | InsForge backend setup notes for coding agents, written for the prior iteration |

## Prior iteration (Witness)

The repo also contains a fully different, previously-shipped design: engineers evaluated on "ghost work" confirmed by a Postgres attribution engine, with RLS-scoped access control, running against a real InsForge + HydraDB backend. That work is real (live-tested against InsForge, HydraDB, and the connectors' own APIs) and is left in place rather than deleted, but it is **not** what `web/app/demo` runs today.

<details>
<summary>Witness — design, backend, and seeded demo environment</summary>

Managers evaluate engineers on what the system of record credits them for — commits, PRs authored, tickets closed. The highest-leverage work (unblocking a teammate, catching a bug in review, triaging an incident) happens in Slack and gets credited to whoever closed the ticket afterward. It's invisible to every dashboard, and invisible at review time.

Witness found that work: for each engineer, it surfaced things they did that helped tickets or PRs credited to someone else, and returned cited artifacts — never a score. Every finding was confirmed against a second source: a Slack message alone isn't evidence, but a Slack message referencing a ticket that's assigned to someone else and closed two hours later is. Restrict the tool to one connector and the point of the project was that the output didn't go blank — it became a confident, wrong performance review. See [PIVOT.md](PIVOT.md) for the design rationale and [PRD.md](PRD.md) for the full spec (API contract, data model, ranking, demo script).

Attribution ran as a temporal join, not an LLM call, entirely inside Postgres, with every read gated on the run's `enabled_sources` — disable a source and there's nothing to join against, not because a code branch skipped it but because the row is structurally absent from the query. Access control worked the same way: RLS, not UI convention.

```
POST /run { sources, window_days, confirm_window_hours }
        → harvest (HydraDB) + regex reference extraction
        → InsForge: confirm_attributions() over source-scoped views
        → cited findings, keyed to a run
```

**Backend pieces:**

| Path | What |
|---|---|
| `migrations/` | InsForge/Postgres schema — core tables, source-scoped views, the attribution engine, RLS policies, realtime run stream, pgvector reference resolution |
| `functions/report.ts` | Public read-only edge function: `GET /functions/report?run_id=<uuid>` returns a run's degradation status and RLS-scoped findings |
| `functions/run.ts` | Pipeline-internal: creates a run, or clones a prior run's harvested data forward |
| `functions/ingest.ts` | Pipeline-internal: identity resolution, reference extraction, normalized writes |
| `functions/confirm.ts` | Pipeline-internal: calls `confirm_attributions()`, assembles the cited response |
| `functions/ask.ts` / `functions/insight.ts` | Public read-only edge functions: natural-language query and AI summary over a report the browser already fetched |
| `hydradb/` | HydraDB REST client and harvest logic — Slack/GitHub/Linear pulled directly from their own APIs |
| `rocketride/` | Not the public endpoint — see `rocketride/README.md` for why |

Backend project `agents-love-you` (API base `https://sjcd8q6t.us-east.insforge.app`). Migrations apply in filename order via the `insforge` CLI:

```
migrations/
  20260728182006_core-schema.sql
  20260728182007_source-scoped-views.sql
  20260728182009_attribution-engine.sql
  20260728182010_rls-access-control.sql
  20260728182011_realtime-run-stream.sql
  20260728182013_vector-references.sql
  20260728210756_attribution-claim-names.sql
```

To run the harvest pipeline: fill in `.env.local` at the repo root (copy `.env.example`) with InsForge, HydraDB, and Slack/GitHub/Linear credentials, then:

```bash
cd hydradb
npm install
npm run bootstrap
npm run sync -- --sources=slack,github,linear
```

**Seeded demo environment.** Witness needed a workspace where a real pattern exists: someone whose contribution is visible in Slack but invisible in the system of record. Three team members took personas on a fictional payments startup:

| Persona | Linear identity | Slack identity | Role in the data |
|---|---|---|---|
| The Ghost | Ars Ray | @arsen | Closes 2 tickets. Answers everyone's questions. |
| The Star | benjamin nisevich | @ben | Closes 11 tickets. Asks for help when stuck. |
| The Third | Philip Nisevich | @philip | Owns payments. Closes 3 tickets. |

Each persona used a real account on both platforms. 24 Linear issues (WIT-5–28) were assigned unevenly — 11 to the Star, 3 to the Third, 2 to the Ghost. ~110 Slack messages went out across #eng, #eng-help, and #incidents, seven threads following the same shape: the Ghost diagnoses a problem on a ticket assigned to someone else, and that ticket is closed by its assignee shortly after. The remaining ~90 messages are background noise generated from character briefs, blind to the detection logic — the findings were whatever the pipeline surfaced when pointed at the real connectors.

</details>

