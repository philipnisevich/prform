// Proxies to InsForge's insight function. No admin key needed — the
// function only ever sees the exact report data the browser already has —
// but proxying keeps INSFORGE_URL server-side and consistent with /api/demo.

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const baseUrl = process.env.INSFORGE_URL;
  if (!baseUrl) return NextResponse.json({ error: "backend not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const res = await fetch(`${baseUrl}/functions/insight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
