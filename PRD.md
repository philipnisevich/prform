# Witness — PRD / MVP

**Status:** in progress — backend schema live · **Companion doc:** [PIVOT.md](PIVOT.md) (the why) · This doc is the what and the when.
**Renamed** from Ghost Work — same project, see [PIVOT.md § Name](PIVOT.md#name).

---

## 1. Problem

Managers evaluate engineers on what the system of record credits them for: commits, PRs authored, tickets closed. The highest-leverage work — unblocking a teammate, catching a bug in review, triaging an incident — happens in Slack and gets credited to whoever closed the ticket afterward. It is invisible to every dashboard, and it is invisible at review time.

## 2. What we're building

A service that, for each engineer, finds work they did that helped tickets or PRs credited to **someone else**, and returns cited artifacts — never a score.

Each finding is confirmed against a second source. A Slack message alone is not evidence. A Slack message that references ENG-412, where ENG-412 is assigned to someone else and closed two hours later, is.

**The thesis we are demonstrating:** restrict the tool to one connector and the output doesn't go blank — it becomes a confident, wrong performance review. The MVP must make that *provable*, not merely observable.

## 3. Users

| User | Sees | Why |
|---|---|---|
| Engineer | Their own ghost work | Evidence to bring to a review |
| Manager | Their direct reports only | Correct a lagging credit model |
| Nobody | The whole org | Ranking everyone is the failure mode, not the feature |

Enforced by RLS, not by UI. See §8.

---

## 4. MVP scope

### P0 — ships or we have no demo

- Person resolution across Slack + GitHub + Linear via HydraDB
- Normalized landing tables in InsForge for events, tickets, identities
- Reference extraction (regex: `ENG-\d+`, `#\d+`, file paths)
- **Attribution rule (a)** in Postgres: referenced ticket's assignee ≠ message author, and ticket closed within `confirm_window_hours` after the message
- Source-scoped views — the degradation guarantee
- Public `POST /run` endpoint on RocketRide accepting `sources[]`, live-changeable, no redeploy
- Cited findings in the response: person, claim, ≥2 evidence links naming their source
- `degraded` block in the response declaring which rules could not run

### P1 — ships if on schedule

- Pipeshift classification (`unblock | review | triage | decision | noise`) with content-hash cache
- Attribution rule (b): referenced file/PR committed by someone else within 24h
- RLS + auth
- Storage snapshot + replay
- Ranking with the evidence floor (§9)

### P2 — nice, cut without regret

- pgvector fuzzy reference resolution
- Realtime run stream + one-page live view
- Scheduled nightly run
- Gmail as a real source (stays in the toggle array regardless — see §11)

### Explicit non-goals

No dashboard. No auth/UI polish. No fine-tuning. **No score presented as objective truth.** No write-back to Slack/Linear/GitHub. No historical trending. No multi-org tenancy.

---

## 5. Success criteria

The MVP is done when all five pass:

| # | Criterion | How we verify |
|---|---|---|
| 1 | Public URL responds | `curl` the RocketRide endpoint from a phone on cell data |
| 2 | ≥1 confirmed finding with 2+ citations, all four sources enabled | Response JSON contains a finding with a Slack ts **and** a Linear ticket key |
| 3 | Same endpoint, `sources: ["slack"]` → **0 confirmed** findings | No deploy, no code edit between calls 2 and 3 |
| 4 | Degradation is structural | Print the view definition; the `enabled_sources` gate is visible in SQL |
| 5 | Re-run is fast enough to do live | Second call returns in < 5s (classification cache hit) |

Criterion 3 and 4 together are the submission. Everything else is support.

---

## 6. Architecture

```
                    POST /run { sources, window_days, confirm_window_hours }
                                        │
                            ┌───────────▼───────────┐
                            │   RocketRide Cloud    │  public endpoint
                            │   orchestration       │  stage checkpointing
                            │   bounded fan-out     │  retry on bad JSON
                            └─────┬──────────┬──────┘
                                  │          │
                    ┌─────────────▼───┐   ┌──▼──────────────┐
                    │    HydraDB      │   │   Pipeshift     │
                    │ entity resolve  │   │ classify (N||)  │
                    │ slack/gh/linear │   │ strict JSON     │
                    └─────────────┬───┘   └──┬──────────────┘
                                  │          │
                            ┌─────▼──────────▼──────┐
                            │      InsForge         │
                            │  ── the detector ──   │
                            │ confirm_attributions()│
                            │ source-scoped views   │
                            │ classification cache  │
                            │ RLS · Storage · RT    │
                            └───────────────────────┘
```

### Sponsor division of labor

| Sponsor | Owns | Load-bearing because |
|---|---|---|
| **HydraDB** | Cross-source identity resolution; raw event/ticket pulls | Confirmation is impossible without knowing the Slack handle and Linear assignee are different people. Nothing else can produce this. |
| **InsForge** | Attribution engine, degradation guarantee, classification cache, access control, snapshots | The detector itself. Also what makes the live re-run physically possible. |
| **RocketRide** | Public endpoint, stage orchestration, bounded-concurrency LLM fan-out, checkpoint/resume | The surface the judge touches, and the only component that can drive N concurrent classifications with retries and resume a crashed run mid-pipeline. |
| **Pipeshift** | Message classification, strict JSON | Turns "this message mentions ENG-412" into "this message *unblocked someone* on ENG-412". Rule (a) confirms the link; Pipeshift characterizes the help. |

**Note on RocketRide:** moving attribution into Postgres thinned its role. Restore the weight deliberately — bounded-parallelism fan-out over a few hundred messages, per-message retry on malformed LLM JSON, and stage-level checkpointing so a crashed run resumes rather than restarts. That is real pipeline work and it demos well against the realtime stage stream.

---

## 7. API contract

### Request

```http
POST /run
Content-Type: application/json

{
  "sources": ["slack", "github", "linear", "gmail"],
  "window_days": 30,
  "confirm_window_hours": 48,
  "replay_snapshot": null
}
```

`sources` is the toggle. Changing it requires no deploy. `replay_snapshot` reruns from a cached HydraDB pull for offline determinism.

### Response

```json
{
  "run_id": "018f...",
  "enabled_sources": ["slack", "github", "linear", "gmail"],
  "degraded": {
    "rules_available": ["a", "b"],
    "rules_unavailable": [],
    "note": null
  },
  "people": [
    {
      "person": { "id": "...", "display_name": "Maria Okonkwo" },
      "visible": { "prs": 3, "tickets_closed": 2, "commits": 14 },
      "invisible": { "confirmed_unblocks": 4, "reviews": 6, "triage": 1 },
      "findings": [
        {
          "claim": "Unblocked Chen on ENG-412 two hours before it closed.",
          "rule": "a",
          "confidence": 0.86,
          "evidence": [
            { "source": "slack",  "ref": "1721847293.004200", "url": "https://...", "note": "message referencing ENG-412" },
            { "source": "linear", "ref": "ENG-412", "url": "https://...", "note": "assigned to Chen, closed 2h14m later" }
          ]
        }
      ]
    }
  ]
}
```

**The `degraded` block is a product feature, not debug output.** Scoped to Slack only it returns:

```json
"degraded": {
  "rules_available": [],
  "rules_unavailable": ["a", "b"],
  "note": "No ticket or commit source enabled. Contributions cannot be confirmed against a second source; findings below are unverified."
}
```

A tool that reports what it cannot see is the opposite of the dashboards we're criticizing.

---

## 8. Data model

Full schema in [PIVOT.md](PIVOT.md) §Schema. MVP-critical tables:

```
run(id, enabled_sources text[], window_days, confirm_window_hours, snapshot_key, status, ...)
person(id, display_name, primary_email)
identity_claim(id, person_id, source, external_id, handle, confidence, evidence)
source_event(id, run_id, source, kind, external_id, author_person_id, ts, body, url)
ticket_state(ticket_key, source, assignee_person_id, status, closed_at)
reference(id, source_event_id, ref_type, ref_value, resolved_ticket_key, method, similarity)
classification(content_hash PK, type, substantive, helps_person_id, confidence, model)
attribution(id, run_id, person_id, source_event_id, ticket_key, rule, confirmed, reason, lag)
```

### The degradation mechanism

Every read in the attribution path goes through a view gated on the run's enabled sources:

```sql
CREATE VIEW visible_ticket_state WITH (security_invoker = true) AS
SELECT t.* FROM ticket_state t
JOIN run r ON r.id = current_run_id()
WHERE t.source = ANY(r.enabled_sources);
```

`confirm_attributions()` joins against `visible_ticket_state`, never `ticket_state`. Disable `linear` and rule (a) has nothing to join against. **There is no code path that could produce a confirmation anyway** — which is why criterion 4 in §5 is "print the view definition."

### Access control

- `person`, `attribution`, `source_event`: RLS on.
- Engineer sees rows where `person_id = current person for auth.uid()`.
- Manager sees rows for direct reports, via a `SECURITY DEFINER` helper (`public.reports_to(uuid)`) to avoid RLS recursion.
- No policy grants org-wide read. That absence is the point.

---

## 9. Ranking

```
visible    = 1.0*prs + 1.0*tickets_closed + 0.3*commits
invisible  = 1.0*confirmed_unblocks + 0.7*reviews + 0.5*triage
divergence = invisible / (visible + invisible)
```

Two corrections to the original formula, both mandatory:

**Evidence floor.** A person is not rankable below 2 *confirmed* attributions. Without this, a new hire with two Slack messages and zero PRs scores 1.0 and tops the list. The unfixed formula surfaces new hires and managers, not ghost work.

**Never render the number.** `divergence` is an internal sort key. It does not appear in the response, the report, or on screen. We promise "not a score" in the pitch; shipping a visible score contradicts it, and someone will screenshot it into a real performance review.

---

## 10. Build schedule

Anchored on the brief's 13:30 fallback checkpoint; assumes a ~09:00 start.

| Time | Task | Cut line |
|---|---|---|
| 09:00–09:20 | **Risk zero:** confirm one confirmable pair exists in HydraDB | If zero → widen window or seed fixture *now* |
| 09:20–10:15 | InsForge schema + migrations | — |
| 10:15–11:15 | `confirm_attributions()` + source-scoped views | **The MVP.** Nothing ships without this |
| 11:15–12:00 | RocketRide endpoint live, public URL responds end-to-end | Do not defer to the end |
| 12:00–12:45 | Verify degradation on the deployed endpoint (criteria 3 & 4) | Submission is safe from here |
| 12:45–13:30 | Pipeshift classification + content-hash cache | ← **13:30 checkpoint** |
| 13:30–14:15 | Storage snapshot + replay | Insurance |
| 14:15–15:00 | RLS + auth | The ethics beat |
| 15:00–16:00 | P2: realtime stream, pgvector, schedules | Take in that order |
| 16:00+ | Freeze. Rehearse the demo twice. Cache a known-good run. | — |

### Fallback tiers

| Behind at | Drop | Still true |
|---|---|---|
| 12:45 | Rule (b), keep rule (a) | Thesis intact — one rule proves it |
| 13:30 | Pipeshift entirely; regex-only references | Attribution engine and degradation guarantee never depended on the LLM |
| 15:00 | All P2 | §5 criteria all still pass |

The pivot's fallback is much softer than the original brief's, because the interesting part was never the classification.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **No confirmable case in HydraDB data** | Fatal | Risk zero at 09:00. Widen `confirm_window_hours`, or seed a fixture workspace |
| Confirmation windows too tight for small data | High | `confirm_window_hours` is a run parameter — tune live, no redeploy |
| Entity resolution merges two people or splits one | High | Keep `identity_claim` rows with evidence; a wrong merge is inspectable, not silent |
| Live LLM latency during demo | Medium | Content-hash cache; second run hits cache |
| Venue wifi / HydraDB rate limit at demo time | Medium | Storage snapshot replay |
| Judge reads it as a surveillance tool | Medium | RLS demo + no visible score + `degraded` block honesty |
| RocketRide reads as "just a deploy target" | Medium | Tell the fan-out/checkpoint story explicitly (§6) |

**Gmail:** expected to contribute nothing. It stays in the `sources` array because four toggleable sources makes the degradation demo richer, but no logic gets built for it. If asked, say so plainly — claiming otherwise is the exact dishonesty the project is about.

---

## 12. Demo script (4 minutes)

1. **The lie** (30s). "Here's what the dashboard says about Maria: 3 PRs, 2 tickets. Bottom third of the team."
2. **The find** (60s). `POST /run` with all four sources. Read one finding aloud with both citations — Slack ts and the Linear ticket, assignee and close time.
3. **The break** (60s). Same endpoint, `{"sources": ["slack"]}`. Maria drops to zero confirmed. **Show the generated summary paragraph that now describes her as a low contributor, side by side with the first.** Not an empty result — a wrong one.
4. **The proof** (45s). Print the view definition. "We didn't write code to degrade. There's no path that could cheat, because the ticket table is empty from the query's point of view."
5. **The ethics** (30s). Log in as an engineer, then as their manager. Different rows. Nobody sees the org. "This is a policy in the database, not a promise about our UI."
6. **Close** (15s). "Your dashboard isn't neutral. It's a measurement instrument with a blind spot, and people get promoted or not inside that blind spot."

---

## 13. Open questions

1. Does the HydraDB workspace contain real multi-person activity, or do we need a seeded fixture? **Blocks everything.**
2. Is Pipeshift a track we're judged on? If not, InsForge's AI gateway removes a dependency and deepens InsForge. If yes, it stays primary.
3. Do we have Slack/Linear permalink URLs from HydraDB, or only IDs? Citations are much weaker without clickable links.
4. Team/reporting structure for the manager RLS demo — real data or a two-row fixture?

---

*Backend: InsForge project `agents-love-you` (`7e8849fb-fae1-49ba-bcc7-8b4e0c3a635d`), org `6fb8937d…` (Pro through 2026-08-14), region us-east. Schema not yet applied.*
