// Server-only proxy for the manager-review demo page. Holds the InsForge
// admin key (INSFORGE_API_KEY, no NEXT_PUBLIC_ prefix — never reaches the
// browser) and drives the real backend: clones the golden harvested run
// scoped to whichever sources the UI has toggled on, then runs
// confirm_attributions() for real. This is the actual pipeline, not a mock —
// toggling a source here re-derives real findings from already-harvested
// data (PRD §5 criterion 5: fast enough to demo live).

import { NextResponse } from "next/server";

const VALID_SOURCES = ["slack", "github", "linear"];

export async function POST(req: Request) {
  const baseUrl = process.env.INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;
  const goldenRunId = process.env.DEMO_GOLDEN_RUN_ID;
  if (!baseUrl || !apiKey || !goldenRunId) {
    return NextResponse.json({ error: "demo backend not configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const sources: string[] = body?.sources ?? [];
  if (!Array.isArray(sources) || sources.length === 0 || sources.some((s) => !VALID_SOURCES.includes(s))) {
    return NextResponse.json({ error: `sources must be a non-empty subset of ${VALID_SOURCES.join(", ")}` }, { status: 400 });
  }

  const runRes = await fetch(`${baseUrl}/functions/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sources, clone_from_run_id: goldenRunId }),
  });
  const run = await runRes.json();
  if (!runRes.ok) return NextResponse.json({ error: run.error ?? "failed to create run" }, { status: 500 });

  const confirmRes = await fetch(`${baseUrl}/functions/confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: run.run_id }),
  });
  const result = await confirmRes.json();
  if (!confirmRes.ok) return NextResponse.json({ error: result.error ?? "failed to confirm run" }, { status: 500 });

  return NextResponse.json(result);
}
