import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

// Next only auto-loads .env.local from this directory (web/), but the
// repo's Slack/GitHub/Linear credentials live in the repo-root .env.local
// — the same file hydradb/'s scripts load explicitly by path (see that
// package's README). Mirrored here, minimal (no dotenv dependency): only
// fills in keys not already set, so a real web/.env.local always wins.
function loadRootEnv() {
  const rootEnvPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(rootEnvPath)) return;
  for (const line of fs.readFileSync(rootEnvPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}
loadRootEnv();

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
