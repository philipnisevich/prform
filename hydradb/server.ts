// The thing RocketRide's public webhook actually forwards to. See
// rocketride/README.md for why the harvest logic lives here in plain,
// testable TypeScript instead of RocketRide-native node config.
//
//   npm run serve                # listens on PORT (default 8787)
//   curl -X POST localhost:8787/run \
//     -H 'Authorization: Bearer <ROCKETRIDE_AUTH>' \
//     -d '{"sources":["slack","github","linear"]}'

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });
import http from "node:http";
import { runHarvest } from "./sync.ts";

const PORT = Number(process.env.PORT ?? 8787);
const SHARED_SECRET = process.env.ROCKETRIDE_AUTH; // set the same value RocketRide is configured to send

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404).end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (SHARED_SECRET) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${SHARED_SECRET}`) {
      res.writeHead(401).end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  let body: any = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400).end(JSON.stringify({ error: "invalid JSON body" }));
    return;
  }

  const sources: string[] = body.sources ?? ["slack", "github", "linear"];
  try {
    const result = await runHarvest({
      sources,
      windowDays: body.window_days ?? 30,
      confirmWindowHours: body.confirm_window_hours ?? 48,
      cloneFrom: body.replay_snapshot ?? undefined, // PRD §7's replay_snapshot maps to our clone-from-run fast path
    });
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" }).end(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    );
  }
});

server.listen(PORT, () => console.log(`harvest server listening on :${PORT}`));
