# Witness — the pivot

## The spark

The original brief ends with a claim:

> Scope it to one connector and the answer doesn't go blank — it becomes a confident, wrong performance review.

That is the whole project. Everything else is plumbing. And in the original architecture, **it's a claim we're asking the judge to take on faith.** If the source toggle is `if "linear" in sources:` somewhere in a Python file on RocketRide, then the degradation we demo is something we implemented on purpose. A skeptical judge is right to suspect we faked it, and we have no way to prove otherwise. The most important sentence in our pitch is the one we can least defend.

**The pivot: stop computing the answer and then storing it. Make the database the detector.**

Attribution isn't intelligence — it's a temporal join. "This Slack message referenced ENG-412, ENG-412 is assigned to someone else, and it closed two hours later" is:

```sql
JOIN ticket_state t ON t.assignee_person_id <> e.author_person_id
                   AND t.closed_at BETWEEN e.ts AND e.ts + interval '48 hours'
```

Once that join lives in Postgres, something falls out for free: **restricting sources stops being a code path and becomes a property of the schema.** Every read goes through a view gated on `run.enabled_sources`. Turn off `linear` and `ticket_state` is empty *from the query's point of view*. Rule (a) cannot fire — not because a branch skipped it, but because there is nothing to join against.

We can no longer cheat, even if we wanted to. That's the difference between a demo and a proof.

And there's a second thing only the database can hold. Witness produces performance-review-adjacent claims about named humans, which is one prompt away from a surveillance tool. The answer to "isn't this dangerous?" shouldn't be a promise about our UI. It should be RLS: an engineer sees their own findings, a manager sees their reports, nobody sees the org — enforced by `auth.uid()`, not by convention.

> **InsForge holds the two things this project cannot fake: what counts as proof, and who is allowed to see it.**

That's the pivot. Not "use more InsForge features." InsForge becomes the part of the system that carries the argument.

---

## What actually changed

| | Original brief | Pivot |
|---|---|---|
| **Stage 5 (attribution)** | Python on RocketRide | Postgres function inside InsForge |
| **Source toggle** | Conditional in pipeline code | Views gated on `run.enabled_sources` — structural |
| **InsForge's role** | Results table | Attribution engine + access control + run store |
| **Classification** | LLM call per message, every run | Content-hash cached in Postgres; re-runs are instant |
| **Demo dependency** | Live HydraDB + live LLM | Replayable from a Storage snapshot |
| **Ethics answer** | "We show artifacts, not scores" | RLS policy you can read |
| **Confirmation windows** | Hardcoded 48h / 24h | Run parameters, tunable live |

RocketRide still owns orchestration and the public endpoint. HydraDB still owns cross-source entity resolution. Pipeshift still classifies. Nothing gets demoted — the pipeline just stops carrying logic that belongs in a database.

---

## InsForge surface map

Being honest about which of these are load-bearing and which are cheap coverage, because the difference is exactly what a judge is probing for.

### Load-bearing — remove these and the project stops working

**Postgres functions — the attribution engine.** `confirm_attributions(run_id)` implements Stage 5 rules (a) and (b) as temporal joins. This is the core of the demo, executing inside InsForge. We can put it on screen.

**Views — the degradation guarantee.** `visible_source_event`, `visible_ticket_state`, etc., each filtered by the run's `enabled_sources`. The toggle requirement ("must degrade for real, not fake the output") is satisfied by construction rather than by discipline.

**Classification cache.** Keyed on `sha256(body)`. The toggle demo requires re-running the pipeline live; without the cache that means re-classifying hundreds of messages on stage while judges wait, and Pipeshift latency decides whether we pass. Classification is source-independent, so only attribution changes between runs — the second run returns in under a second. **InsForge is what makes the demo physically possible.**

**RLS + Auth.** Own-data / manager-of-reports visibility via `auth.uid()` and a `SECURITY DEFINER` team-membership helper. The ethics answer, as a database guarantee.

**Storage — run snapshots.** Raw HydraDB pull per run, dumped to a bucket. Runs replay from snapshot, so the toggle demo works deterministically with no live dependency. Covers the brief's own "cache one successful full run as demo fallback" and doubles as insurance against venue wifi.

### Genuine wins, in priority order after the above

**pgvector — fuzzy reference resolution.** When someone writes "the auth timeout thing" instead of "ENG-412", regex finds nothing. Embed messages and ticket titles, cosine-match, resolve the reference anyway. This meaningfully raises recall — most real Slack unblocks don't cite a ticket ID.

**Realtime — live run stream.** `run_stage_event` insert → trigger → `realtime.publish` → channel. Stages firing live on screen while the pipeline runs. The brief lists "no dashboard" as a non-goal, but that was a time-budget call, not a design one; this is the most watchable thing we can build for the cost.

### Cheap coverage — worth the minutes, not worth pretending they're deep

- **Schedules** — nightly run against the RocketRide endpoint. One command.
- **Secrets** — HydraDB / Pipeshift keys, referenced from edge functions. Correct practice regardless.
- **Edge function** — public read-only report endpoint, so the report is fetchable without RocketRide being awake.
- **Branch** — apply the risky RLS migration on a backend branch first, merge when green.

---

## Schema

```
person(id, display_name, primary_email)

identity_claim(id, person_id, source, external_id, handle, confidence, evidence jsonb)
    unique(source, external_id)
    -- entity resolution is never clean; keep the claims and their evidence,
    -- not just the winning merge

source_event(id, run_id, source, kind, external_id, author_person_id, ts, body, url, raw jsonb)
    -- normalized landing table for everything HydraDB returns

ticket_state(ticket_key, source, assignee_person_id, status, closed_at)
    -- the second source that makes confirmation possible

reference(id, source_event_id, ref_type, ref_value, resolved_ticket_key, method, similarity)
    -- method: 'regex' | 'vector'  — how we resolved it is itself evidence

classification(content_hash PK, type, substantive, helps_person_id, confidence, model, raw_json)
    -- keyed by content, not by message: survives re-runs

attribution(id, run_id, person_id, source_event_id, ticket_key, rule, confirmed, reason, lag)

run(id, enabled_sources text[], window_days, confirm_window_hours,
    snapshot_key, status, started_at, finished_at)

run_stage_event(run_id, stage, status, counts jsonb, ts)   -- realtime source
```

Two deliberate choices worth flagging:

`confirm_window_hours` lives on the run, not in the code. The brief's 48h/24h are guesses, and on a small dataset they may yield zero confirmations. Being able to widen the window live — without a redeploy — is the difference between a demo and an apology.

`reference.method` records whether a citation came from regex or vector match. When we claim an artifact is evidence, we can say how we found it.

---

## Bugs inherited from the original brief

**The divergence formula breaks on low-visible people.** `invisible / (visible + invisible)` → a new hire with two Slack messages and zero PRs scores 1.0 and tops the ranking. "Top 3 by divergence" will surface new hires and managers, not ghost work. **Fix:** minimum 2 confirmed attributions before a person is rankable.

**Stage 6 contradicts the pitch.** We promise "the result isn't a score" and then rank by a computed score. Keep divergence as an internal sort key; never render the number. If it appears on screen, someone screenshots it into a real performance review — and a judge will say so out loud.

**Gmail contributes nothing.** Keep it in the toggle array (four sources makes the degradation demo richer) but build no logic for it.

---

## Risk zero

**Does the HydraDB workspace contain a single confirmable case?**

The entire demo requires at least one Slack message that references a ticket assigned to someone else which closed inside the window. If that pair doesn't exist in the synced data, we have a pipeline that correctly outputs nothing.

This is not in the original build order and it belongs before everything. Query for one confirmable pair by hand, first thing. If the answer is zero, we need to know at 09:00 — while widening the window or seeding a fixture is still cheap — not at 13:30.

---

## Build order

| # | Task | Notes |
|---|---|---|
| 0 | **Verify one confirmable case exists in HydraDB** | Kills or confirms the project |
| 1 | Schema + migrations | Everything sits on this |
| 2 | `confirm_attributions()` + source-scoped views | Stage 5 and the toggle, same commit |
| 3 | RocketRide endpoint live, public URL responds | Sponsor requirement — do it early, not last |
| 4 | Classification cache + Storage snapshot | Makes the live re-run survivable |
| 5 | RLS + auth | The ethics beat |
| 6 | Realtime run stream + one page | If on schedule |
| 7 | pgvector fuzzy references | If on schedule |

**Fallback (if behind):** drop Pipeshift entirely. Regex-only reference extraction, rules (a) and (b) unchanged, everything else identical. The attribution engine and the degradation guarantee both survive — they never depended on the LLM. This is a much softer fallback than the original brief's, because the interesting part was never the classification.

---

## The demo

Run the deployed endpoint with all four sources:

> **Maria** — unblocked Chen on ENG-412.
> Evidence: Slack `1721847293.004200` → referenced ENG-412 → assigned to Chen → closed 2h14m later.

Then, live on the same endpoint, no redeploy:

```json
{ "sources": ["slack"] }
```

Maria now shows **zero confirmed contributions**.

Don't show an empty result — that's just a null. Show the generated summary paragraph that now describes her as a low-contributor, and put it next to the first one. Our own pitch line, made literal on stage:

> *your engineering dashboard is lying to you*

Then open the view definition and show why the second run couldn't have cheated.

---

## Name

Renamed from Ghost Work to **Witness**. Still short, still says what it does — a witness testifies, and a claim without corroboration isn't testimony, it's rumor. That's the whole confirm-against-a-second-source mechanic in one word, and it reads better next to "confirmed," "cited," and "evidence" than "ghost" ever did.

---

*Backend: InsForge project `agents-love-you` (`7e8849fb-fae1-49ba-bcc7-8b4e0c3a635d`), org `6fb8937d…` (Pro, active through 2026-08-14). Region us-east. Schema not yet applied — this document is the plan.*
