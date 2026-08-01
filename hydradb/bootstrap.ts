// Provisions the HydraDB database this project uses. Run once per workspace:
//
//   npm install && npm run bootstrap
//
// There is no connector/OAuth-sync system to configure here — Slack/GitHub/
// Linear are pulled directly (see identity.ts, sync.ts) and pushed into
// HydraDB as knowledge via client.ingestKnowledge(). See client.ts's header
// comment for how this was determined (two wrong turns, both live-tested).

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });
import { HydraDBClient } from "./client.ts";

async function main() {
  const apiKey = process.env.HYDRA_DB_API_KEY;
  const database = process.env.HYDRA_DB_DATABASE;
  if (!apiKey || !database) throw new Error("HYDRA_DB_API_KEY and HYDRA_DB_DATABASE must be set");

  const client = new HydraDBClient(apiKey, database);
  console.log(`ensuring database "${database}"...`);
  await client.ensureDatabase();
  console.log("waiting for infra to be ready for ingestion...");
  await client.waitForDatabaseReady();
  console.log(`database "${database}" is ready. Run \`npm run sync\` to harvest and populate InsForge.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
