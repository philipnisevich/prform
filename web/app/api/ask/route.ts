// Proxies to InsForge's ask function — natural-language routing over the
// current team report (e.g. "who's my worst performer"). Same trust model
// as /api/insight: no admin key needed, proxied for consistency.

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const baseUrl = process.env.INSFORGE_URL;
  if (!baseUrl) return NextResponse.json({ error: "backend not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const res = await fetch(`${baseUrl}/functions/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
