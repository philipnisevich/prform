# RocketRide — public endpoint

## Status: not the critical path for the demo. Here's why, live-tested.

This took a full pass of actually connecting to RocketRide Cloud with real
credentials (not doc-reading), and it surfaced two real findings worth
recording so nobody re-walks them.

**1. `tool_http_request` cannot make a plain, deterministic outbound call.**
RocketRide's own node-schema docs (`docs/README-node-schema.md` in
[rocketride-org/rocketride-server](https://github.com/rocketride-org/rocketride-server))
say it plainly: *"Nodes with no `lanes` (most `tool` nodes) do not flow data,
they bind to an agent's tool channel instead."* `tool_http_request` has no
`lanes` — confirmed against the real engine by loading a pipeline that wired
it directly and getting `Component forward_1 input lane text not found in
service definition`, then the same for a dozen other candidate lane names.
The only real examples in RocketRide's own repo that make an outbound call in
a data lane (not an agent tool) use `tool_n8n`, which is n8n-specific. So
"webhook → call our server → response" with zero LLM involvement is not
expressible in RocketRide as it exists today — the only way to make an
arbitrary outbound HTTP call is to put an LLM agent (`agent_rocketride` +
`llm_openai`/`llm_anthropic` as its `llm` control, `tool_http_request` as its
`tool` control) in front of it.

**2. `api.rocketride.ai`'s actual REST surface doesn't match the pipeline
model the docs describe.** Its `/openapi.json` lists `/task`, `/task/fetch`,
`/task/process`, `/webhook`, `/chat`, `/dropper`, client-download endpoints,
third-party OAuth (Zitadel/Stripe/Google), and `/marketplace/apps` — not
`/run` or anything resembling per-pipeline REST routes. Meanwhile, the
`rocketride` npm SDK's WebSocket/DAP protocol against the same host *did*
work (`RocketRideClient.connect()` succeeded, and `use()` returned real,
pipeline-specific validation errors — proof the pipeline engine is genuinely
there). The likely explanation is that the REST surface and the WebSocket
pipeline protocol are different parts of the same platform, but this wasn't
confirmed within reasonable effort, and it means "curl a public URL for this
pipeline" doesn't have a verified answer.

## What this means for the demo

**The public endpoint the judge curls should be `hydradb/server.ts`
(already built, live-tested against InsForge, zero LLM in the critical
path), exposed via a tunnel** — ngrok, Cloudflare Tunnel, or a small
reverse-proxied VM. That satisfies PRD §5 criterion 1 today, with certainty,
using code that's already been run end-to-end against the real backend (see
the root README's "Running the pipeline end to end" — the `slack`-only vs.
all-sources degradation was verified live: one gets a confirmed finding with
two citations, the other gets zero and a `degraded` block, no redeploy in
between).

RocketRide is not required to make that work. If there's time left after the
demo is safe, two paths forward, in order of how much of the "real RocketRide
orchestration" sponsor story they preserve:

1. **Ask in RocketRide's [Discord](https://discord.gg/PMXrtenMsY)** what the
   actual public-URL mechanism is for a Cloud-hosted pipeline — the fastest
   way to resolve the `/openapi.json` mismatch above, and possibly a two-line
   fix once known.
2. **Chase the `publicToken` lead.** `client.use({filepath: './run.pipe'})`
   against real Cloud credentials returned both a `token` and a
   `publicToken` (e.g. `pk_...`). `POST https://api.rocketride.ai/webhook/<publicToken>`
   returns `401 Access denied` rather than `404` — meaning the route exists
   and is real, just needs an auth shape this pass didn't crack (tried a
   plain `Bearer <ROCKETRIDE_AUTH>` header without luck). This is the most
   promising concrete lead for "a real public URL per loaded pipeline" and is
   worth five minutes with RocketRide's own support before trying the
   agent-wrapped approach below.
3. **Build the agent-wrapped forward**: `webhook → agent_rocketride (single
   instruction: "POST the input JSON verbatim to
   ${HARVEST_SERVER_URL}/run, return the response body unmodified,
   do not summarize or alter it") → response_text`. This is a real,
   confirmed-compiling RocketRide pattern (mirrors
   [`examples/agent-workflow.pipe`](https://github.com/rocketride-org/rocketride-server/blob/develop/examples/agent-workflow.pipe)
   in their repo) — it puts a small LLM hop in the request path whose only
   job is byte-for-byte forwarding, which is a legitimate, disclosed
   tradeoff, not a hidden one.

`run.pipe` in this directory is left as the thin `webhook → response_text`
shell with the agent/tool wiring commented out as the next step, rather than
a guessed `tool_http_request` config that would fail the same way this one did.
