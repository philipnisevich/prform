// Who the pipeline can currently answer for — the real connected workspace's
// roster when Slack/GitHub/Linear credentials are configured, otherwise the
// warm-cache fixture's three people. Purely for the UI (suggestion chips,
// the "this workspace" panel on /demo) — /api/packet re-derives this itself
// rather than trusting whatever the client sends back.

import { NextResponse } from "next/server";
import { PEOPLE } from "../fixture";
import { pullLiveWindow, liveConfigured } from "@/lib/liveSources";

export const runtime = "nodejs";

export async function GET() {
  if (liveConfigured()) {
    try {
      const { people } = await pullLiveWindow(30);
      if (people.length > 0) {
        return NextResponse.json({ live: true, people: people.map((p) => ({ name: p.name })) });
      }
    } catch (err) {
      console.warn(`[directory] live pull failed, falling back to the fixture: ${err instanceof Error ? err.message : err}`);
    }
  }
  return NextResponse.json({ live: false, people: PEOPLE.map((p) => ({ name: p.name, role: p.role })) });
}
